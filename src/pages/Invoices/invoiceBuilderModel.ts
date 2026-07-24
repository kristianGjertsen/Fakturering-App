import type {
  Company,
  InvoiceDraftAttachment,
  InvoiceDraftLine,
  InvoiceWithDetails,
  PdfTemplate,
  RepeatDraft,
} from "../../types";
import { calculateLine, calculateTotals } from "../../lib/invoiceMath";
import { todayInputValue } from "../../lib/format";

export type InvoiceKind = "single" | "recurring";
export type RecipientMode = "company" | "guest";
export type InvoiceTotals = ReturnType<typeof calculateTotals>;

type CreateInvoicePreviewOptions = {
  companyId: string;
  dueDate: string;
  invoiceKind: InvoiceKind;
  invoiceTitle: string;
  issueDate: string;
  lines: InvoiceDraftLine[];
  notes: string;
  pdfTemplate: PdfTemplate;
  recipientEmail: string;
  recipientMode: RecipientMode;
  recipientName: string;
  repeat: RepeatDraft;
  scheduleOnce: boolean;
  selectedCompany: Company | null;
  totals: InvoiceTotals;
};

export function createEmptyInvoiceLine(): InvoiceDraftLine {
  return {
    localId: crypto.randomUUID(),
    productId: null,
    description: "",
    quantity: 1,
    unit: "stk",
    unitPrice: 0,
    vatRate: 25,
    attachments: [],
  };
}

export function createDraftAttachment(file: File): InvoiceDraftAttachment {
  return {
    localId: crypto.randomUUID(),
    file,
  };
}

export function createDefaultRepeatDraft(): RepeatDraft {
  const today = new Date();
  const dayOfWeek = today.getDay();

  return {
    enabled: false,
    frequency: "monthly",
    intervalCount: 1,
    dayOfWeek: dayOfWeek === 0 ? 7 : dayOfWeek,
    dayOfMonth: today.getDate(),
    startDate: todayInputValue(),
    autoSend: true,
    paymentTermsDays: 14,
  };
}

export function addDaysToDate(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getRepeatIntervalLabel(
  frequency: RepeatDraft["frequency"],
  intervalCount: number,
) {
  if (frequency === "daily") {
    return intervalCount === 1 ? "Hver dag" : `Hver ${intervalCount}. dag`;
  }

  if (frequency === "weekly") {
    if (intervalCount === 1) return "Hver uke";
    if (intervalCount === 2) return "Annenhver uke";
    return `Hver ${intervalCount}. uke`;
  }

  if (intervalCount === 1) return "Hver måned";
  if (intervalCount === 2) return "Annenhver måned";
  return `Hver ${intervalCount}. måned`;
}

export function getRepeatIntervalHint(frequency: RepeatDraft["frequency"]) {
  if (frequency === "daily") return "1 = hver dag, 2 = hver andre dag";
  if (frequency === "weekly") return "1 = hver uke, 2 = annenhver uke";
  return "1 = hver måned, 2 = annenhver måned";
}

export function getTotalAttachmentBytes(lines: InvoiceDraftLine[]) {
  return lines.reduce(
    (total, line) =>
      total + line.attachments.reduce(
        (lineTotal, attachment) => lineTotal + attachment.file.size,
        0,
      ),
    0,
  );
}

export function isSubmittableInvoiceLine(line: InvoiceDraftLine) {
  return Boolean(line.description.trim() && line.quantity > 0);
}

export function createInvoicePreview({
  companyId,
  dueDate,
  invoiceKind,
  invoiceTitle,
  issueDate,
  lines,
  notes,
  pdfTemplate,
  recipientEmail,
  recipientMode,
  recipientName,
  repeat,
  scheduleOnce,
  selectedCompany,
  totals,
}: CreateInvoicePreviewOptions): InvoiceWithDetails {
  const isScheduled = invoiceKind === "recurring" || scheduleOnce;
  const previewIssueDate = invoiceKind === "recurring" ? repeat.startDate : issueDate;
  const previewDueDate = invoiceKind === "recurring"
    ? addDaysToDate(repeat.startDate, repeat.paymentTermsDays)
    : dueDate;

  return {
    id: "preview",
    owner_user_id: "preview",
    company_id: companyId || null,
    recipient_name: selectedCompany?.name ?? (recipientName.trim() || recipientEmail.trim() || "Engangskunde"),
    recipient_org_number: selectedCompany?.org_number ?? null,
    recipient_email: selectedCompany?.email ?? (recipientEmail.trim() || null),
    recipient_country: selectedCompany?.country ?? null,
    schedule_id: null,
    scheduled_for: null,
    invoice_number: isScheduled ? "Opprettes ved utsending" : "Tildeles ved utsendelse",
    title: invoiceTitle.trim() || (isScheduled ? "Opprettes ved utsending" : "Utkast"),
    issue_date: previewIssueDate,
    due_date: previewDueDate,
    status: "draft",
    finalized_at: null,
    pdf_storage_path: null,
    pdf_locked_at: null,
    paid: false,
    pdf_template: pdfTemplate,
    notes: notes || null,
    subtotal: totals.subtotal,
    vat_total: totals.vatTotal,
    total: totals.total,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    company: selectedCompany ?? createGuestPreviewCompany(recipientMode, recipientName, recipientEmail),
    invoice_items: lines
      .filter((line) => line.description.trim())
      .map((line, index) => {
        const calculatedLine = calculateLine(line);

        return {
          id: `preview-${line.localId}`,
          invoice_id: "preview",
          product_id: line.productId,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          vat_rate: line.vatRate,
          line_subtotal: calculatedLine.line_subtotal,
          line_vat: calculatedLine.line_vat,
          line_total: calculatedLine.line_total,
          sort_order: index,
          created_at: new Date().toISOString(),
        };
      }),
    invoice_attachments: lines.flatMap((line) =>
      line.attachments.map((attachment) => ({
        id: `preview-attachment-${attachment.localId}`,
        invoice_id: "preview",
        invoice_item_id: `preview-${line.localId}`,
        storage_path: "",
        original_name: attachment.file.name,
        mime_type: attachment.file.type,
        size_bytes: attachment.file.size,
        created_at: new Date().toISOString(),
      })),
    ),
  };
}

function createGuestPreviewCompany(
  recipientMode: RecipientMode,
  recipientName: string,
  recipientEmail: string,
): Company | null {
  if (recipientMode !== "guest") return null;

  return {
    id: "guest",
    owner_user_id: "preview",
    name: recipientName.trim() || "Engangskunde",
    org_number: null,
    email: recipientEmail.trim() || null,
    address: null,
    postal_address: null,
    country: null,
    private_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
