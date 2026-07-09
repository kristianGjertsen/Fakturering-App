import type { InvoiceScheduleWithDetails } from "../types";
import { describeRecurrence } from "../lib/recurrence";
import { formatCurrency, formatDateTime, frequencyLabel } from "../lib/format";
import { EmptyState } from "./EmptyState";
import { SectionHeader } from "./SectionHeader";

type RecurringViewProps = {
  schedules: InvoiceScheduleWithDetails[];
};

export function RecurringView({ schedules }: RecurringViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Gjentakende fakturaer"
        description="Her ser du hvilke fakturaoppsett som er satt til å gjentas, og når neste faktura er planlagt."
      />

      {schedules.length === 0 ? (
        <EmptyState title="Ingen gjentakelser" description="Når du lager en faktura og slår på gjentakelse, vises planen her." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {schedules.map((schedule) => {
            const lines = [...(schedule.invoice_schedule_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
            const total = lines.reduce((sum, line) => sum + line.quantity * line.unit_price * (1 + line.vat_rate / 100), 0);

            return (
              <article key={schedule.id} className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{schedule.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{schedule.company?.name ?? "Ukjent selskap"}</p>
                  </div>
                  <span className="w-fit rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                    {schedule.auto_send ? "Auto senere" : "Manuell sending"}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Frekvens</dt>
                    <dd className="mt-1 font-medium text-slate-950">{frequencyLabel(schedule.frequency, schedule.interval_count)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Regel</dt>
                    <dd className="mt-1 font-medium text-slate-950">
                      {describeRecurrence(schedule.frequency, schedule.day_of_week, schedule.day_of_month)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Neste</dt>
                    <dd className="mt-1 font-medium text-slate-950">{formatDateTime(schedule.next_run_at)}</dd>
                  </div>
                </dl>

                <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-950">Linjer</h4>
                    <span className="text-sm font-semibold text-slate-950">{formatCurrency(total)}</span>
                  </div>
                  <ul className="mt-3 divide-y divide-blue-100 text-sm">
                    {lines.map((line) => (
                      <li key={line.id} className="flex justify-between gap-4 py-2">
                        <span className="text-slate-700">{line.description}</span>
                        <span className="shrink-0 font-medium text-slate-950">
                          {line.quantity} {line.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
