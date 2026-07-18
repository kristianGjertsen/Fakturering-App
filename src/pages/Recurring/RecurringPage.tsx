import { useEffect, useMemo, useState } from "react";
import type { InvoiceScheduleWithDetails } from "../../types";
import { describeRecurrence } from "../../lib/recurrence";
import { formatCurrency, formatDate, frequencyLabel } from "../../lib/format";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { DocumentBrowser, type DocumentBrowserItem } from "../../components/DocumentBrowser";
import { PdfPreview } from "../Invoices/InvoicesComponents/PdfPreview";
import { calculateScheduleTotals, scheduleToPreviewInvoice } from "../../lib/schedulePreview";
import { ContentStack, MasterDetailLayout } from "../../components/layout/PageLayout";
import { Panel } from "../../components/layout/Panel";

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
    subtitle: frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count),
    statusLabel: schedule.auto_send ? "Automatisk" : "Manuell",
    statusTone: schedule.auto_send ? "info" : "neutral",
    amount: totalsByScheduleId.get(schedule.id) ?? 0,
    date: schedule.next_run_at,
    dateLabel: `Neste: ${formatDate(schedule.next_run_at)}`,
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
    <>
      <SectionHeader
        title="Gjentakende fakturaer"
        description="Åpne en bedriftsmappe for å finne planer, eller bytt til alle for en samlet liste. Velg en plan for detaljer og PDF-forhåndsvisning."
      />

      {schedules.length === 0 ? (
        <EmptyState title="Ingen gjentakelser" description="Når du lager en faktura og slår på gjentakelse, vises planen her." />
      ) : (
        <MasterDetailLayout>
          <DocumentBrowser
            items={browserItems}
            selectedId={selectedSchedule?.id ?? ""}
            onSelect={setSelectedScheduleId}
            searchPlaceholder="Søk etter plan eller bedrift"
            itemLabel="planer"
          />

          {selectedSchedule && previewInvoice && (
            <ContentStack>
              <Panel as="article">
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
                      {frequencyLabel(selectedSchedule.frequency ?? "monthly", selectedSchedule.interval_count)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Regel</dt>
                    <dd className="mt-1 font-semibold text-slate-950">
                      {describeRecurrence(selectedSchedule.frequency ?? "monthly", selectedSchedule.day_of_week, selectedSchedule.day_of_month)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Neste utsending</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{formatDate(selectedSchedule.next_run_at)}</dd>
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
              </Panel>

              <Panel as="div">
                <PdfPreview invoice={previewInvoice} />
              </Panel>
            </ContentStack>
          )}
        </MasterDetailLayout>
      )}
    </>
  );
}

function displayScheduleTitle(schedule: InvoiceScheduleWithDetails) {
  const genericTitle = `Gjentakende faktura - ${schedule.company?.name ?? ""}`;

  if (schedule.title === genericTitle) {
    return frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count);
  }

  return schedule.title;
}
