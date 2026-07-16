import { useEffect, useMemo, useState } from "react";
import type { InvoiceScheduleWithDetails, InvoiceWithDetails } from "../../types";
import { describeRecurrence } from "../../lib/recurrence";
import { formatCurrency, formatDateTime, frequencyLabel } from "../../lib/format";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { DocumentBrowser, type DocumentBrowserItem } from "../../components/DocumentBrowser";
import { PdfPreview } from "../Invoices/InvoicesComponents/PdfPreview";

type RecurringViewProps = {
  schedules: InvoiceScheduleWithDetails[];
};

export default function RecurringPage({ schedules }: RecurringViewProps) {
  const [selectedScheduleId, setSelectedScheduleId] = useState("");

  const totalsByScheduleId = useMemo(() => new Map(
    schedules.map((schedule) => [schedule.id, calculateScheduleTotals(schedule).total]),
  ), [schedules]);

  const browserItems = useMemo<DocumentBrowserItem[]>(() => schedules.map((schedule) => ({
    id: schedule.id,
    companyId: schedule.company_id,
    companyName: schedule.company?.name ?? "Ukjent bedrift",
    title: displayScheduleTitle(schedule),
    subtitle: frequencyLabel(schedule.frequency, schedule.interval_count),
    statusLabel: schedule.auto_send ? "Automatisk" : "Manuell",
    statusTone: schedule.auto_send ? "info" : "neutral",
    amount: totalsByScheduleId.get(schedule.id) ?? 0,
    date: schedule.next_run_at,
    dateLabel: `Neste: ${formatDateTime(schedule.next_run_at)}`,
  })), [schedules, totalsByScheduleId]);

  useEffect(() => {
    if (!selectedScheduleId && schedules[0]) {
      setSelectedScheduleId(schedules[0].id);
    }

    if (selectedScheduleId && !schedules.some((schedule) => schedule.id === selectedScheduleId)) {
      setSelectedScheduleId(schedules[0]?.id ?? "");
    }
  }, [schedules, selectedScheduleId]);

  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? schedules[0] ?? null;
  const selectedLines = useMemo(
    () => [...(selectedSchedule?.invoice_schedule_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [selectedSchedule],
  );
  const selectedTotals = useMemo(
    () => selectedSchedule ? calculateScheduleTotals(selectedSchedule) : { subtotal: 0, vatTotal: 0, total: 0 },
    [selectedSchedule],
  );
  const previewInvoice = useMemo(
    () => selectedSchedule ? scheduleToPreviewInvoice(selectedSchedule) : null,
    [selectedSchedule],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Gjentakende fakturaer"
        description="Åpne en bedriftsmappe for å finne planer, eller bytt til alle for en samlet liste. Velg en plan for detaljer og PDF-forhåndsvisning."
      />

      {schedules.length === 0 ? (
        <EmptyState title="Ingen gjentakelser" description="Når du lager en faktura og slår på gjentakelse, vises planen her." />
      ) : (
        <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <DocumentBrowser
            items={browserItems}
            selectedId={selectedSchedule?.id ?? ""}
            onSelect={setSelectedScheduleId}
            searchPlaceholder="Søk etter plan eller bedrift"
            itemLabel="planer"
          />

          {selectedSchedule && previewInvoice && (
            <div className="min-w-0 space-y-5">
              <article className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Gjentakende plan</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-950">{displayScheduleTitle(selectedSchedule)}</h3>
                    <p className="mt-1 text-sm text-slate-600">{selectedSchedule.company?.name ?? "Ukjent bedrift"}</p>
                    <p className="text-sm text-slate-500">{selectedSchedule.company?.email ?? "Mangler e-postadresse"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <p className="text-2xl font-semibold text-slate-950">{formatCurrency(selectedTotals.total)}</p>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                      {selectedSchedule.auto_send ? "Sendes automatisk" : "Manuell sending"}
                    </span>
                  </div>
                </div>

                <dl className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <dt className="text-slate-500">Gjentas</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {frequencyLabel(selectedSchedule.frequency, selectedSchedule.interval_count)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Regel</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {describeRecurrence(selectedSchedule.frequency, selectedSchedule.day_of_week, selectedSchedule.day_of_month)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Neste utsending</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{formatDateTime(selectedSchedule.next_run_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Forfall</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{selectedSchedule.payment_terms_days} dager etter utsending</dd>
                  </div>
                </dl>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-3 pr-4 font-semibold">Beskrivelse</th>
                        <th className="py-3 pr-4 text-right font-semibold">Antall</th>
                        <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                        <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                        <th className="py-3 text-right font-semibold">Sum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {selectedLines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-3 pr-4 font-medium text-slate-950">{line.description}</td>
                          <td className="py-3 pr-4 text-right text-slate-600">{line.quantity} {line.unit}</td>
                          <td className="py-3 pr-4 text-right text-slate-600">{formatCurrency(line.unit_price)}</td>
                          <td className="py-3 pr-4 text-right text-slate-600">{line.vat_rate}%</td>
                          <td className="py-3 text-right font-medium text-slate-950">
                            {formatCurrency(line.quantity * line.unit_price * (1 + line.vat_rate / 100))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex justify-end border-t border-blue-100 pt-4 text-sm">
                  <dl className="w-full max-w-xs space-y-2">
                    <div className="flex justify-between gap-4 text-slate-600">
                      <dt>Eks. MVA</dt><dd>{formatCurrency(selectedTotals.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 text-slate-600">
                      <dt>MVA</dt><dd>{formatCurrency(selectedTotals.vatTotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-blue-100 pt-2 text-base font-semibold text-slate-950">
                      <dt>Total</dt><dd>{formatCurrency(selectedTotals.total)}</dd>
                    </div>
                  </dl>
                </div>
              </article>

              <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
                <PdfPreview invoice={previewInvoice} />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function calculateScheduleTotals(schedule: InvoiceScheduleWithDetails) {
  const totals = (schedule.invoice_schedule_lines ?? []).reduce(
    (totals, line) => {
      const subtotal = Number(line.quantity) * Number(line.unit_price);
      const vat = subtotal * Number(line.vat_rate) / 100;
      totals.subtotal += subtotal;
      totals.vatTotal += vat;
      totals.total += subtotal + vat;
      return totals;
    },
    { subtotal: 0, vatTotal: 0, total: 0 },
  );

  return {
    subtotal: roundCurrency(totals.subtotal),
    vatTotal: roundCurrency(totals.vatTotal),
    total: roundCurrency(totals.total),
  };
}

function displayScheduleTitle(schedule: InvoiceScheduleWithDetails) {
  const genericTitle = `Gjentakende faktura - ${schedule.company?.name ?? ""}`;

  if (schedule.title === genericTitle) {
    return `${frequencyLabel(schedule.frequency, schedule.interval_count)} kl. ${schedule.send_time.slice(0, 5)}`;
  }

  return schedule.title;
}

function scheduleToPreviewInvoice(schedule: InvoiceScheduleWithDetails): InvoiceWithDetails {
  const totals = calculateScheduleTotals(schedule);
  const issueDate = schedule.next_run_at
    ? dateInTimeZone(schedule.next_run_at, schedule.timezone)
    : schedule.start_date;
  const dueDate = addDays(issueDate, schedule.payment_terms_days);

  return {
    id: `schedule-preview-${schedule.id}`,
    owner_user_id: schedule.owner_user_id,
    company_id: schedule.company_id,
    schedule_id: schedule.id,
    scheduled_for: schedule.next_run_at,
    invoice_number: "Opprettes ved utsending",
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
      city: null,
      country: null,
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
