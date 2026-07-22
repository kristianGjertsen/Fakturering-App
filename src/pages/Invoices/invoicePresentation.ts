import type { StatusTone } from "../../components/DocumentBrowser";
import type { InvoiceStatus, InvoiceWithDetails } from "../../types";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Utkast",
  sending: "Sendes",
  ready: "Klar",
  sent: "Sendt",
  reminded: "Purret",
  paid: "Betalt",
  cancelled: "Kansellert",
};

export function getVisibleInvoices(invoices: InvoiceWithDetails[]) {
  return invoices.filter((invoice) => {
    if (invoice.status === "sending") {
      return false;
    }

    return !(
      invoice.schedule_id
      && !invoice.paid
      && !["sent", "reminded", "paid"].includes(invoice.status)
    );
  });
}

export function getInvoiceStatusTone(
  status: InvoiceStatus,
  paid: boolean,
): StatusTone {
  if (paid || status === "paid") return "success";
  if (status === "sent") return "info";
  if (status === "ready") return "warning";
  if (status === "reminded") return "purple";
  if (status === "cancelled") return "danger";
  return "neutral";
}
