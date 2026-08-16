import type { InvoiceWithDetails, SupplierInvoiceWithDetails } from "../../types";
import { roundMoney } from "../../lib/accounting";

export const MONTH_NAMES = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export function availableAccountingYears(dates: Array<string | null | undefined>) {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>([currentYear]);
  dates.forEach((date) => {
    const year = Number(date?.slice(0, 4));
    if (year >= 2000 && year <= 2200) years.add(year);
  });
  return [...years].sort((left, right) => right - left);
}

export function supplierInvoiceStatus(invoice: SupplierInvoiceWithDetails) {
  if (invoice.status === "cancelled") return { label: "Annullert", tone: "danger" as const };
  if (invoice.status === "paid") return { label: "Betalt", tone: "success" as const };
  if (invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10)) {
    return { label: "Forfalt", tone: "danger" as const };
  }
  return { label: "Ubetalt", tone: "warning" as const };
}

export function openSalesInvoices(invoices: InvoiceWithDetails[]) {
  return invoices.filter((invoice) =>
    invoice.finalized_at
    && !invoice.paid
    && invoice.status !== "paid"
    && invoice.status !== "cancelled",
  );
}

export function openSupplierInvoices(invoices: SupplierInvoiceWithDetails[]) {
  return invoices.filter((invoice) => invoice.status === "posted");
}

export function sumInvoiceAmounts(invoices: Array<{ total: number }>) {
  return roundMoney(invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0));
}
