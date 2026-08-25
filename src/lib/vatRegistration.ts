import type { InvoiceWithDetails } from "../types";
import { roundMoney } from "./accounting";
import { todayInputValue } from "./format";

export const VAT_REGISTRATION_THRESHOLD = 50_000;

export function calculateRollingInvoiceTurnover(
  invoices: InvoiceWithDetails[],
  today = todayInputValue(),
) {
  const startDate = subtractMonths(today, 12);
  return roundMoney(invoices.reduce((sum, invoice) => {
    if (!invoice.finalized_at || invoice.status === "cancelled") return sum;
    if (invoice.issue_date < startDate || invoice.issue_date > today) return sum;
    return sum + Number(invoice.subtotal);
  }, 0));
}

function subtractMonths(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 - months, day));
  return date.toISOString().slice(0, 10);
}
