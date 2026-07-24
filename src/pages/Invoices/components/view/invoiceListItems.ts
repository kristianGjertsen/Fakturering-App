import type { DocumentBrowserItem } from "../../../../components/DocumentBrowser";
import { scheduleToPreviewInvoice } from "../../../../lib/schedulePreview";
import type {
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
} from "../../../../types";
import {
  getInvoiceStatusTone,
  INVOICE_STATUS_LABELS,
} from "../../invoicePresentation";

export function buildInvoiceListItems(
  invoices: InvoiceWithDetails[],
  schedules: InvoiceScheduleWithDetails[],
): DocumentBrowserItem[] {
  return [
    ...schedules.map(scheduleToListItem),
    ...invoices.map(invoiceToListItem),
  ].sort((left, right) =>
    new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime()
  );
}

function scheduleToListItem(schedule: InvoiceScheduleWithDetails): DocumentBrowserItem {
  const previewInvoice = scheduleToPreviewInvoice(schedule);

  return {
    id: previewInvoice.id,
    companyId: schedule.company_id,
    companyName: schedule.company?.name ?? "Ukjent bedrift",
    title: previewInvoice.title,
    subtitle: previewInvoice.invoice_number ?? "Opprettes ved utsending",
    statusLabel: "Planlagt",
    statusTone: "purple",
    amount: Number(previewInvoice.total),
    date: schedule.next_run_at,
  };
}

function invoiceToListItem(invoice: InvoiceWithDetails): DocumentBrowserItem {
  return {
    id: invoice.id,
    companyId: invoice.company_id ?? `guest-${invoice.id}`,
    companyName: invoice.company?.name ?? invoice.recipient_name,
    title: invoice.title || invoice.invoice_number || "Utkast",
    subtitle: invoice.invoice_number ?? "Fakturanummer tildeles ved utsendelse",
    statusLabel: invoice.paid ? "Betalt" : INVOICE_STATUS_LABELS[invoice.status],
    statusTone: getInvoiceStatusTone(invoice.status, invoice.paid),
    amount: Number(invoice.total),
    date: invoice.issue_date,
  };
}
