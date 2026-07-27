import type { StatusTone } from "../../components/DocumentBrowser";
import type { Invoice, InvoiceStatus, InvoiceWithDetails } from "../../types";

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

export function isInvoiceOverdue(
  invoice: Pick<Invoice, "due_date" | "paid" | "status">,
  now = new Date(),
) {
  if (
    !invoice.due_date
    || invoice.paid
    || invoice.status === "paid"
    || invoice.status === "cancelled"
    || !["sent", "reminded"].includes(invoice.status)
  ) {
    return false;
  }

  const dueDate = new Date(`${invoice.due_date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return !Number.isNaN(dueDate.getTime()) && dueDate < today;
}
