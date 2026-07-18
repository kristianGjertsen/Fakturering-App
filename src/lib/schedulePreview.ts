import type { InvoiceScheduleWithDetails, InvoiceWithDetails } from "../types";

export function calculateScheduleTotals(schedule: InvoiceScheduleWithDetails) {
  const totals = (schedule.invoice_schedule_lines ?? []).reduce(
    (result, line) => {
      const subtotal = Number(line.quantity) * Number(line.unit_price);
      const vat = subtotal * Number(line.vat_rate) / 100;
      result.subtotal += subtotal;
      result.vatTotal += vat;
      result.total += subtotal + vat;
      return result;
    },
    { subtotal: 0, vatTotal: 0, total: 0 },
  );

  return {
    subtotal: roundCurrency(totals.subtotal),
    vatTotal: roundCurrency(totals.vatTotal),
    total: roundCurrency(totals.total),
  };
}

export function scheduleToPreviewInvoice(schedule: InvoiceScheduleWithDetails): InvoiceWithDetails {
  const totals = calculateScheduleTotals(schedule);
  const issueDate = schedule.next_run_at
    ? dateInTimeZone(schedule.next_run_at, schedule.timezone)
    : schedule.start_date;
  const dueDate = addDays(issueDate, schedule.payment_terms_days);

  return {
    id: `schedule-preview-${schedule.id}`,
    owner_user_id: schedule.owner_user_id,
    company_id: schedule.company_id,
    recipient_name: schedule.company?.name ?? "Ukjent mottaker",
    recipient_org_number: schedule.company?.org_number ?? null,
    recipient_email: schedule.company?.email ?? null,
    recipient_country: null,
    schedule_id: schedule.id,
    scheduled_for: schedule.next_run_at,
    invoice_number: "Opprettes ved utsending",
    title: schedule.invoice_title?.trim() || "Opprettes ved utsending",
    issue_date: issueDate,
    due_date: dueDate,
    status: "ready",
    paid: false,
    pdf_template: schedule.pdf_template,
    notes: schedule.invoice_notes,
    subtotal: totals.subtotal,
    vat_total: totals.vatTotal,
    total: totals.total,
    created_at: schedule.created_at,
    updated_at: schedule.updated_at,
    company: schedule.company ? {
      ...schedule.company,
    } : null,
    invoice_items: (schedule.invoice_schedule_lines ?? []).map((line) => {
      const subtotal = Number(line.quantity) * Number(line.unit_price);
      const vat = subtotal * Number(line.vat_rate) / 100;

      return {
        id: `schedule-line-preview-${line.id}`,
        invoice_id: `schedule-preview-${schedule.id}`,
        product_id: line.product_id,
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unit_price: Number(line.unit_price),
        vat_rate: Number(line.vat_rate),
        line_subtotal: roundCurrency(subtotal),
        line_vat: roundCurrency(vat),
        line_total: roundCurrency(subtotal + vat),
        sort_order: line.sort_order,
        created_at: line.created_at,
      };
    }),
  };
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("nb-NO", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : value.slice(0, 10);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
