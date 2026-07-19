import { useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { ContentStack } from "../../../components/layout/PageLayout";
import { Panel } from "../../../components/layout/Panel";
import {
  attachmentFileName,
  formatFileSize,
  referenceInvoiceAttachments,
} from "../../../lib/attachments";
import { downloadInvoiceAttachment } from "../../../lib/data";
import { formatCurrency, formatDate, frequencyLabel } from "../../../lib/format";
import { describeRecurrence } from "../../../lib/recurrence";
import { calculateScheduleTotals, scheduleToPreviewInvoice } from "../../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails } from "../../../types";
import { PdfPreviewPanel } from "../../Invoices/InvoicesComponents/PdfPreviewPanel";

type RecurringDetailsProps = {
  schedule: InvoiceScheduleWithDetails;
};

export function RecurringDetails({ schedule }: RecurringDetailsProps) {
  const lines = useMemo(
    () => [...(schedule.invoice_schedule_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [schedule],
  );
  const totals = useMemo(() => calculateScheduleTotals(schedule), [schedule]);
  const previewInvoice = useMemo(() => scheduleToPreviewInvoice(schedule), [schedule]);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const attachments = referenceInvoiceAttachments(
    previewInvoice.invoice_items ?? [],
    previewInvoice.invoice_attachments ?? [],
  );

  async function handleDownload(
    attachment: NonNullable<typeof previewInvoice.invoice_attachments>[number],
    reference: string,
  ) {
    setAttachmentMessage("");

    try {
      await downloadInvoiceAttachment(attachment, reference);
    } catch (error) {
      setAttachmentMessage(
        error instanceof Error ? error.message : `Kunne ikke laste ned ${attachment.original_name}.`
      );
    }
  }

  return (
    <ContentStack>
      <Panel as="article">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Gjentakende plan</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">{displayScheduleTitle(schedule)}</h3>
            <p className="mt-1 text-sm text-slate-600">{schedule.company?.name ?? "Ukjent bedrift"}</p>
            <p className="text-sm text-slate-500">{schedule.company?.email ?? "Mangler e-postadresse"}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <p className="text-2xl font-semibold text-slate-950">{formatCurrency(totals.total)}</p>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
              {schedule.auto_send ? "Sendes automatisk" : "Manuell sending"}
            </span>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem
            label="Gjentas"
            value={frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count)}
          />
          <DetailItem
            label="Regel"
            value={describeRecurrence(schedule.frequency ?? "monthly", schedule.day_of_week, schedule.day_of_month)}
          />
          <DetailItem label="Neste utsending" value={formatDate(schedule.next_run_at)} />
          <DetailItem label="Forfall" value={`${schedule.payment_terms_days} dager etter utsending`} />
        </dl>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-semibold">Beskrivelse</th>
                <th className="py-3 pr-4 text-center font-semibold">Vedlegg</th>
                <th className="py-3 pr-4 text-right font-semibold">Antall</th>
                <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                <th className="py-3 text-right font-semibold">Sum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {lines.map((line) => {
                const references = attachments
                  .filter(
                    ({ attachment }) =>
                      attachment.invoice_item_id === `schedule-line-preview-${line.id}`,
                  )
                  .map(({ reference }) => reference);

                return (
                  <tr key={line.id}>
                    <td className="py-3 pr-4 font-medium text-slate-950">
                      {line.description}
                    </td>
                    <td className="py-3 pr-4 text-center text-slate-600">
                      {references.length > 0 ? references.join(", ") : "NEI"}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-600">{line.quantity} {line.unit}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{formatCurrency(line.unit_price)}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{line.vat_rate}%</td>
                    <td className="py-3 text-right font-medium text-slate-950">
                      {formatCurrency(line.quantity * line.unit_price * (1 + line.vat_rate / 100))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {attachments.length > 0 && (
          <div className="mt-5 border-t border-blue-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-950">
              Vedlegg x{attachments.length}
            </h4>
            <ul className="mt-2 divide-y divide-blue-100 rounded-md border border-blue-100">
              {attachments.map(({ attachment, reference }) => (
                <li key={attachment.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">
                      {attachmentFileName(attachment.original_name, reference)}
                    </span>
                    <span className="block text-xs text-slate-500">{formatFileSize(attachment.size_bytes)}</span>
                  </span>
                  <Button variant="secondary" size="xs" onClick={() => void handleDownload(attachment, reference)}>
                    Last ned
                  </Button>
                </li>
              ))}
            </ul>
            {attachmentMessage && <p className="mt-2 text-sm text-red-700">{attachmentMessage}</p>}
          </div>
        )}

        <div className="mt-5 flex justify-end border-t border-blue-100 pt-4 text-sm">
          <dl className="w-full max-w-xs space-y-2">
            <TotalItem label="Eks. MVA" value={formatCurrency(totals.subtotal)} />
            <TotalItem label="MVA" value={formatCurrency(totals.vatTotal)} />
            <TotalItem label="Total" value={formatCurrency(totals.total)} total />
          </dl>
        </div>
      </Panel>

      <PdfPreviewPanel invoice={previewInvoice} />
    </ContentStack>
  );
}

export function displayScheduleTitle(schedule: InvoiceScheduleWithDetails) {
  const genericTitle = `Gjentakende faktura - ${schedule.company?.name ?? ""}`;
  return schedule.title === genericTitle
    ? frequencyLabel(schedule.frequency ?? "monthly", schedule.interval_count)
    : schedule.title;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function TotalItem({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${
      total ? "border-t border-blue-100 pt-2 text-base font-semibold text-slate-950" : "text-slate-600"
    }`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
