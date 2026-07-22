import { useMemo } from "react";
import { ContentStack } from "../../../components/layout/PageLayout";
import { Panel } from "../../../components/layout/Panel";
import { referenceInvoiceAttachments } from "../../../lib/attachments";
import { formatCurrency, formatDate, frequencyLabel } from "../../../lib/format";
import { describeRecurrence } from "../../../lib/recurrence";
import {
  calculateScheduleTotals,
  scheduleToPreviewInvoice,
} from "../../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails } from "../../../types";
import { InvoicePdfPreviewPanel } from "../../Invoices/components/InvoicePdfPreviewPanel";
import { getScheduleDisplayTitle } from "../schedulePresentation";
import { ScheduleAttachmentList } from "./ScheduleAttachmentList";
import { ScheduleLineItemsTable } from "./ScheduleLineItemsTable";

type RecurringDetailsProps = {
  schedule: InvoiceScheduleWithDetails;
};

export function RecurringDetails({ schedule }: RecurringDetailsProps) {
  const lines = useMemo(
    () => [...(schedule.invoice_schedule_lines ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order,
    ),
    [schedule],
  );
  const totals = useMemo(() => calculateScheduleTotals(schedule), [schedule]);
  const previewInvoice = useMemo(() => scheduleToPreviewInvoice(schedule), [schedule]);
  const attachments = referenceInvoiceAttachments(
    previewInvoice.invoice_items ?? [],
    previewInvoice.invoice_attachments ?? [],
  );

  return (
    <ContentStack>
      <Panel as="article">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Gjentakende plan
            </p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">
              {getScheduleDisplayTitle(schedule)}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {schedule.company?.name ?? "Ukjent bedrift"}
            </p>
            <p className="text-sm text-slate-500">
              {schedule.company?.email ?? "Mangler e-postadresse"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <p className="text-2xl font-semibold text-slate-950">
              {formatCurrency(totals.total)}
            </p>
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
            value={describeRecurrence(
              schedule.frequency ?? "monthly",
              schedule.day_of_week,
              schedule.day_of_month,
            )}
          />
          <DetailItem label="Neste utsending" value={formatDate(schedule.next_run_at)} />
          <DetailItem
            label="Forfall"
            value={`${schedule.payment_terms_days} dager etter utsending`}
          />
        </dl>

        <ScheduleLineItemsTable lines={lines} attachments={attachments} />
        <ScheduleAttachmentList attachments={attachments} />

        <div className="mt-5 flex justify-end border-t border-blue-100 pt-4 text-sm">
          <dl className="w-full max-w-xs space-y-2">
            <TotalItem label="Eks. MVA" value={formatCurrency(totals.subtotal)} />
            <TotalItem label="MVA" value={formatCurrency(totals.vatTotal)} />
            <TotalItem label="Total" value={formatCurrency(totals.total)} total />
          </dl>
        </div>
      </Panel>

      <InvoicePdfPreviewPanel invoice={previewInvoice} />
    </ContentStack>
  );
}

type DetailItemProps = {
  label: string;
  value: string;
};

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

type TotalItemProps = {
  label: string;
  value: string;
  total?: boolean;
};

function TotalItem({ label, value, total = false }: TotalItemProps) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        total
          ? "border-t border-blue-100 pt-2 text-base font-semibold text-slate-950"
          : "text-slate-600"
      }`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
