import { supabase } from "../supabaseClient";
import type {
  InvoiceDraftLine,
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
  PdfTemplate,
  RepeatDraft,
  SingleScheduleDraft,
} from "../types";
import {
  ATTACHMENT_BUCKET,
  validateAttachmentFiles,
} from "./attachments";
import { calculateLine, calculateTotals } from "./invoiceMath";
import {
  calculateNextRunAt,
  calculateScheduledRunAt,
  recurrenceFieldsForFrequency,
  SCHEDULE_RUN_TIME,
} from "./recurrence";

export type InvoiceInput = {
  ownerUserId: string;
  companyId: string | null;
  recipientName: string;
  recipientEmail: string;
  invoiceTitle: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: InvoiceDraftLine[];
  repeat: RepeatDraft;
  scheduleOnce: SingleScheduleDraft;
  pdfTemplate: PdfTemplate;
};

type PersistLineAttachmentsInput = {
  ownerUserId: string;
  scope: "invoices" | "schedules";
  parentId: string;
  lines: InvoiceDraftLine[];
  persistedLines: Array<{ id: string; sort_order: number }>;
};

export async function fetchInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, company:companies(id,name,org_number,email,address,postal_address,country), invoice_items(*), invoice_attachments(*)")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as InvoiceWithDetails[]).map((invoice) => ({
    ...invoice,
    company: {
      id: invoice.company_id ?? `recipient-${invoice.id}`,
      name: invoice.recipient_name,
      org_number: invoice.recipient_org_number,
      email: invoice.recipient_email,
      address: invoice.company?.address ?? null,
      postal_address: invoice.company?.postal_address ?? null,
      country: invoice.recipient_country,
    },
  }));
}

export async function fetchSchedules() {
  const { data, error } = await supabase
    .from("invoice_schedules")
    .select("*, company:companies(id,name,org_number,email,address,postal_address,country), invoice_schedule_lines(*), invoice_schedule_attachments(*)")
    .eq("is_active", true)
    .order("next_run_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as InvoiceScheduleWithDetails[];
}

export async function createInvoice(input: InvoiceInput) {
  if (input.repeat.enabled || input.scheduleOnce.enabled) {
    if (!input.companyId) {
      throw new Error("Planlagte og gjentakende fakturaer krever et registrert selskap.");
    }

    return createScheduledInvoice(input, input.companyId);
  }

  return createDraftInvoice(input);
}

async function createScheduledInvoice(input: InvoiceInput, companyId: string) {
  const isRecurring = input.repeat.enabled;
  const recurrenceFields = isRecurring
    ? recurrenceFieldsForFrequency(input.repeat)
    : { day_of_week: null, day_of_month: null };
  const company = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();

  if (company.error) {
    throw company.error;
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("invoice_schedules")
    .insert({
      owner_user_id: input.ownerUserId,
      company_id: companyId,
      title: `${isRecurring ? "Gjentakende" : "Planlagt"} faktura - ${company.data.name}`,
      invoice_title: input.invoiceTitle.trim() || null,
      schedule_type: isRecurring ? "recurring" : "once",
      frequency: isRecurring ? input.repeat.frequency : null,
      interval_count: isRecurring ? input.repeat.intervalCount : 1,
      day_of_week: recurrenceFields.day_of_week,
      day_of_month: recurrenceFields.day_of_month,
      send_time: SCHEDULE_RUN_TIME,
      timezone: "Europe/Oslo",
      start_date: isRecurring ? input.repeat.startDate : input.issueDate,
      next_run_at: isRecurring
        ? calculateNextRunAt(input.repeat)
        : calculateScheduledRunAt(input.issueDate),
      auto_send: true,
      payment_terms_days: isRecurring
        ? input.repeat.paymentTermsDays
        : daysBetween(input.issueDate, input.dueDate),
      invoice_notes: input.notes.trim() || null,
      pdf_template: input.pdfTemplate,
    })
    .select("id")
    .single();

  if (scheduleError) {
    throw scheduleError;
  }

  const scheduleLines = input.lines.map((line, index) => ({
    schedule_id: schedule.id,
    product_id: line.productId,
    description: line.description.trim(),
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unitPrice,
    vat_rate: line.vatRate,
    sort_order: index,
  }));

  const { data: createdScheduleLines, error: scheduleLinesError } = await supabase
    .from("invoice_schedule_lines")
    .insert(scheduleLines)
    .select("id,sort_order");

  if (scheduleLinesError || !createdScheduleLines) {
    await supabase.from("invoice_schedules").delete().eq("id", schedule.id);
    throw scheduleLinesError ?? new Error("Kunne ikke hente de opprettede fakturalinjene.");
  }

  try {
    await persistLineAttachments({
      ownerUserId: input.ownerUserId,
      scope: "schedules",
      parentId: schedule.id,
      lines: input.lines,
      persistedLines: createdScheduleLines,
    });
  } catch (error) {
    await supabase.from("invoice_schedules").delete().eq("id", schedule.id);
    throw error;
  }

  return schedule.id as string;
}

async function createDraftInvoice(input: InvoiceInput) {
  const totals = calculateTotals(input.lines);
  const company = input.companyId
    ? await supabase
      .from("companies")
      .select("name,org_number,email,address,postal_address,country")
      .eq("id", input.companyId)
      .single()
    : null;

  if (company?.error) {
    throw company.error;
  }

  const recipientName = company?.data.name
    ?? (input.recipientName.trim() || input.recipientEmail.trim());
  const recipientEmail = company?.data.email ?? (input.recipientEmail.trim() || null);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      owner_user_id: input.ownerUserId,
      company_id: input.companyId,
      recipient_name: recipientName,
      recipient_org_number: company?.data.org_number ?? null,
      recipient_email: recipientEmail,
      recipient_country: company?.data.country ?? null,
      schedule_id: null,
      invoice_number: null,
      title: input.invoiceTitle.trim() || "Utkast",
      issue_date: input.issueDate,
      due_date: input.dueDate || null,
      status: "draft",
      pdf_template: input.pdfTemplate,
      notes: input.notes.trim() || null,
      subtotal: totals.subtotal,
      vat_total: totals.vatTotal,
      total: totals.total,
    })
    .select("id")
    .single();

  if (invoiceError) {
    throw invoiceError;
  }

  const invoiceId = invoice.id as string;
  const invoiceItems = input.lines.map((line, index) => {
    const calculated = calculateLine(line);

    return {
      invoice_id: invoiceId,
      product_id: line.productId,
      description: line.description.trim(),
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unitPrice,
      vat_rate: line.vatRate,
      line_subtotal: calculated.line_subtotal,
      line_vat: calculated.line_vat,
      line_total: calculated.line_total,
      sort_order: index,
    };
  });

  const { data: createdInvoiceItems, error: itemsError } = await supabase
    .from("invoice_items")
    .insert(invoiceItems)
    .select("id,sort_order");

  if (itemsError || !createdInvoiceItems) {
    await supabase.from("invoices").delete().eq("id", invoiceId);
    throw itemsError ?? new Error("Kunne ikke hente de opprettede fakturalinjene.");
  }

  try {
    await persistLineAttachments({
      ownerUserId: input.ownerUserId,
      scope: "invoices",
      parentId: invoiceId,
      lines: input.lines,
      persistedLines: createdInvoiceItems,
    });
  } catch (error) {
    await supabase.from("invoices").delete().eq("id", invoiceId);
    throw error;
  }

  return invoiceId;
}

export async function deleteInvoice(invoiceId: string) {
  const { data: attachments } = await supabase
    .from("invoice_attachments")
    .select("storage_path")
    .eq("invoice_id", invoiceId);

  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);

  if (error) {
    throw error;
  }

  const invoicePaths = (attachments ?? [])
    .map((attachment) => attachment.storage_path as string)
    .filter((path) => path.includes(`/invoices/${invoiceId}/`));

  if (invoicePaths.length > 0) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove(invoicePaths);
  }
}

export async function finalizeInvoice(invoiceId: string) {
  const { data, error } = await supabase.rpc("finalize_invoice", {
    p_invoice_id: invoiceId,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export async function lockInvoicePdf(invoiceId: string, ownerUserId: string, pdf: Blob) {
  const storagePath = `${ownerUserId}/${invoiceId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("invoice-pdfs")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });

  if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) {
    throw uploadError;
  }

  const { error } = await supabase.rpc("lock_invoice_pdf", {
    p_invoice_id: invoiceId,
    p_storage_path: storagePath,
  });

  if (error && !error.message.toLowerCase().includes("already locked")) {
    throw error;
  }

  return storagePath;
}

export async function updateInvoicePaid(invoiceId: string, paid: boolean) {
  const { error } = await supabase.from("invoices").update({ paid }).eq("id", invoiceId);

  if (error) {
    throw error;
  }
}

async function persistLineAttachments({
  ownerUserId,
  scope,
  parentId,
  lines,
  persistedLines,
}: PersistLineAttachmentsInput) {
  const allFiles = lines.flatMap((line) =>
    line.attachments.map((attachment) => attachment.file));
  const validationError = validateAttachmentFiles(allFiles);

  if (validationError) {
    throw new Error(validationError);
  }

  if (allFiles.length === 0) {
    return;
  }

  const uploadedPaths: string[] = [];
  const metadataRows: Array<Record<string, string | number>> = [];

  try {
    for (const [sortOrder, line] of lines.entries()) {
      const persistedLine = persistedLines.find((item) => item.sort_order === sortOrder);

      if (!persistedLine && line.attachments.length > 0) {
        throw new Error("Kunne ikke koble vedlegget til fakturalinjen.");
      }

      for (const attachment of line.attachments) {
        const attachmentId = crypto.randomUUID();
        const storagePath = `${ownerUserId}/${scope}/${parentId}/${attachmentId}${fileExtension(attachment.file)}`;
        const { error } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(storagePath, attachment.file, {
            contentType: attachment.file.type,
            upsert: false,
          });

        if (error) {
          throw new Error(`Kunne ikke laste opp ${attachment.file.name}: ${error.message}`);
        }

        uploadedPaths.push(storagePath);
        metadataRows.push({
          id: attachmentId,
          [scope === "invoices" ? "invoice_id" : "schedule_id"]: parentId,
          [scope === "invoices" ? "invoice_item_id" : "schedule_line_id"]: persistedLine!.id,
          storage_path: storagePath,
          original_name: attachment.file.name,
          mime_type: attachment.file.type,
          size_bytes: attachment.file.size,
        });
      }
    }

    const table = scope === "invoices"
      ? "invoice_attachments"
      : "invoice_schedule_attachments";
    const { error } = await supabase.from(table).insert(metadataRows);

    if (error) {
      throw error;
    }
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove(uploadedPaths);
    }

    throw error;
  }
}

function fileExtension(file: File) {
  if (file.type === "application/pdf") return ".pdf";
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  return "";
}

function daysBetween(startValue: string, endValue: string) {
  const start = new Date(`${startValue}T00:00:00Z`).getTime();
  const end = new Date(`${endValue}T00:00:00Z`).getTime();
  return Math.max(
    0,
    Math.min(365, Math.round((end - start) / (24 * 60 * 60 * 1000))),
  );
}
