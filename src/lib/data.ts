import { supabase } from "../supabaseClient";
import type {
  Company,
  InvoiceDraftLine,
  InvoiceStatus,
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
  Product,
  RepeatDraft,
} from "../types";
import { calculateLine, calculateTotals } from "./invoiceMath";
import { calculateNextRunAt, recurrenceFieldsForFrequency } from "./recurrence";

export type AppData = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  schedules: InvoiceScheduleWithDetails[];
};

export type CompanyInput = {
  name: string;
  org_number: string;
  email: string;
  city: string;
  country: string;
  private_notes: string;
};

export type ProductInput = {
  company_id: string;
  name: string;
  description: string;
  unit: string;
  unit_price: number;
  vat_rate: number;
};

export type InvoiceInput = {
  ownerUserId: string;
  companyId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: InvoiceDraftLine[];
  repeat: RepeatDraft;
};

export async function ensureProfile(userId: string, email: string | null | undefined, fullName?: string | null) {
  const normalizedName = fullName?.trim() || null;
  const normalizedEmail = email ?? null;

  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!existingProfile) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      email: normalizedEmail,
      full_name: normalizedName,
    });

    if (insertError) {
      throw insertError;
    }

    return;
  }

  const shouldUpdate =
    existingProfile.email !== normalizedEmail ||
    (normalizedName !== null && existingProfile.full_name !== normalizedName);

  if (!shouldUpdate) {
    return;
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      email: normalizedEmail,
      full_name: normalizedName ?? existingProfile.full_name,
    })
    .eq("id", userId);

  if (updateError) {
    throw updateError;
  }
}

export async function fetchAppData(): Promise<AppData> {
  const [companies, products, invoices, schedules] = await Promise.all([
    fetchCompanies(),
    fetchProducts(),
    fetchInvoices(),
    fetchSchedules(),
  ]);

  return { companies, products, invoices, schedules };
}

export async function fetchCompanies() {
  const { data, error } = await supabase.from("companies").select("*").order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Company[];
}

export async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Product[];
}

export async function fetchInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, company:companies(id,name,org_number,email,city,country), invoice_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as InvoiceWithDetails[];
}

export async function fetchSchedules() {
  const { data, error } = await supabase
    .from("invoice_schedules")
    .select("*, company:companies(id,name,org_number,email), invoice_schedule_lines(*)")
    .eq("is_active", true)
    .order("next_run_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as InvoiceScheduleWithDetails[];
}

export async function createCompany(ownerUserId: string, input: CompanyInput) {
  const { error } = await supabase.from("companies").insert({
    owner_user_id: ownerUserId,
    name: input.name.trim(),
    org_number: input.org_number.trim() || null,
    email: input.email.trim() || null,
    city: input.city.trim() || null,
    country: input.country.trim() || "Norway",
    private_notes: input.private_notes.trim() || null,
  });

  if (error) {
    throw error;
  }
}

export async function createProduct(input: ProductInput) {
  const { error } = await supabase.from("products").insert({
    company_id: input.company_id,
    name: input.name.trim(),
    description: input.description.trim() || null,
    unit: input.unit.trim() || "stk",
    unit_price: input.unit_price,
    vat_rate: input.vat_rate,
    is_active: true,
  });

  if (error) {
    throw error;
  }
}

export async function createInvoice(input: InvoiceInput) {
  if (input.repeat.enabled) {
    const recurrenceFields = recurrenceFieldsForFrequency(input.repeat);
    const company = await supabase
      .from("companies")
      .select("name")
      .eq("id", input.companyId)
      .single();

    if (company.error) {
      throw company.error;
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from("invoice_schedules")
      .insert({
        owner_user_id: input.ownerUserId,
        company_id: input.companyId,
        title: `Gjentakende faktura - ${company.data.name}`,
        frequency: input.repeat.frequency,
        interval_count: input.repeat.intervalCount,
        day_of_week: recurrenceFields.day_of_week,
        day_of_month: recurrenceFields.day_of_month,
        send_time: input.repeat.sendTime,
        timezone: "Europe/Oslo",
        start_date: input.repeat.startDate,
        next_run_at: calculateNextRunAt(input.repeat),
        auto_send: true,
        payment_terms_days: input.repeat.paymentTermsDays,
        invoice_notes: input.notes.trim() || null,
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

    const { error: scheduleLinesError } = await supabase
      .from("invoice_schedule_lines")
      .insert(scheduleLines);

    if (scheduleLinesError) {
      await supabase.from("invoice_schedules").delete().eq("id", schedule.id);
      throw scheduleLinesError;
    }

    return schedule.id as string;
  }

  const totals = calculateTotals(input.lines);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      owner_user_id: input.ownerUserId,
      company_id: input.companyId,
      schedule_id: null,
      invoice_number: input.invoiceNumber.trim(),
      issue_date: input.issueDate,
      due_date: input.dueDate || null,
      status: "ready",
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

  const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItems);

  if (itemsError) {
    throw itemsError;
  }

  return invoiceId;
}

export async function deleteInvoice(invoiceId: string) {
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);

  if (error) {
    throw error;
  }
}

export async function updateInvoicePaid(invoiceId: string, paid: boolean) {
  const { error } = await supabase.from("invoices").update({ paid }).eq("id", invoiceId);

  if (error) {
    throw error;
  }
}

type SendInvoiceEmailInput = {
  recipientEmail: string;
  subject: string;
  html: string;
  attachmentFilename: string;
  attachmentContent: string;
  markStatus?: {
    invoiceId: string;
    status: Extract<InvoiceStatus, "sent" | "reminded">;
  };
};

export async function sendInvoiceEmail(input: SendInvoiceEmailInput) {
  const { data, error } = await supabase.functions.invoke("send-invoice", {
    body: {
      to: input.recipientEmail,
      subject: input.subject,
      html: input.html,
      attachmentFilename: input.attachmentFilename,
      attachmentContent: input.attachmentContent,
    },
  });

  if (error) {
    throw error;
  }

  if (input.markStatus) {
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: input.markStatus.status })
      .eq("id", input.markStatus.invoiceId);

    if (updateError) {
      throw updateError;
    }
  }

  return data;
}

export async function deleteCurrentUser() {
  const { error } = await supabase.functions.invoke("delete-user", {
    body: {},
  });

  if (error) {
    throw error;
  }
}

export function createInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const suffix = String(Date.now()).slice(-5);
  return `F-${year}${month}${day}-${suffix}`;
}
