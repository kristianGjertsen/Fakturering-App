import type { DocumentBrowserItem } from "../../../../components/DocumentBrowser";
import { scheduleToPreviewInvoice } from "../../../../lib/schedulePreview";
import type {
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
} from "../../../../types";
import {
  getInvoiceStatusPresentation,
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
    invoiceNumber: "Tildeles ved utsendelse",
    title: previewInvoice.title,
    subtitle: previewInvoice.invoice_number ?? "Tildeles ved utsendelse",
    statusLabel: "Planlagt",
    statusTone: "purple",
    amount: Number(previewInvoice.total),
    date: schedule.next_run_at,
    createdAt: schedule.created_at,
    dueDate: previewInvoice.due_date,
    recurrence: schedule.schedule_type === "recurring" && schedule.frequency
      ? {
        frequency: schedule.frequency,
        intervalCount: schedule.interval_count,
        dayOfMonth: schedule.day_of_month,
      }
      : undefined,
  };
}

function invoiceToListItem(invoice: InvoiceWithDetails): DocumentBrowserItem {
  const status = getInvoiceStatusPresentation(invoice);

  return {
    id: invoice.id,
    companyId: invoice.company_id ?? `guest-${invoice.id}`,
    companyName: invoice.company_id
      ? invoice.company?.name ?? invoice.recipient_name
      : invoice.recipient_name,
    invoiceNumber: invoice.invoice_number ?? "Ikke tildelt",
    title: invoice.title || invoice.invoice_number || "Utkast",
    subtitle: invoice.invoice_number ?? "Fakturanummer tildeles ved utsendelse",
    statusLabel: status.label,
    statusTone: status.tone,
    amount: Number(invoice.total),
    date: invoice.issue_date,
    createdAt: invoice.created_at,
    dueDate: invoice.due_date,
    canMarkPaid: !invoice.paid
      && invoice.status !== "paid"
      && ["sent", "reminded"].includes(invoice.status),
  };
}
