import { DocumentBrowser, type DocumentBrowserItem } from "../../../components/DocumentBrowser";
import { Button } from "../../../components/Button";
import { formatCurrency, formatDate } from "../../../lib/format";
import { scheduleToPreviewInvoice } from "../../../lib/schedulePreview";
import type {
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
} from "../../../types";
import {
  getInvoiceStatusTone,
  getVisibleInvoices,
  INVOICE_STATUS_LABELS,
} from "../invoicePresentation";

type InvoiceListProps = {
  invoices: InvoiceWithDetails[];
  schedules?: InvoiceScheduleWithDetails[];
  selectedId: string;
  onSelect: (invoiceId: string) => void;
  compact?: boolean;
  limit?: number;
};

export function InvoiceList({
  invoices,
  schedules = [],
  selectedId,
  onSelect,
  compact = false,
  limit,
}: InvoiceListProps) {
  const visibleInvoices = getVisibleInvoices(invoices);
  const listItems = buildInvoiceListItems(visibleInvoices, schedules);
  const displayedItems = typeof limit === "number" ? listItems.slice(0, limit) : listItems;

  if (compact) {
    return <CompactInvoiceList items={displayedItems} onSelect={onSelect} />;
  }

  return (
    <DocumentBrowser
      items={displayedItems}
      selectedId={selectedId}
      onSelect={onSelect}
      searchPlaceholder="Søk etter faktura eller bedrift"
      itemLabel="fakturaer"
    />
  );
}

function CompactInvoiceList({
  items,
  onSelect,
}: {
  items: DocumentBrowserItem[];
  onSelect: (invoiceId: string) => void;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Ingen fakturaer registrert.</p>;
  }

  return (
    <div className="divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100">
      {items.map((item) => (
        <Button
          key={item.id}
          variant="ghost"
          className="w-full justify-between rounded-none px-4 py-3 text-left"
          onClick={() => onSelect(item.id)}
        >
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-950">{item.title}</span>
            {item.subtitle && (
              <span className="mt-0.5 block truncate text-xs font-medium text-slate-600">
                {item.subtitle}
              </span>
            )}
            <span className="mt-1 block text-xs font-normal text-slate-500">
              {formatDate(item.date)} · {item.statusLabel}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-slate-950">
            {formatCurrency(item.amount)}
          </span>
        </Button>
      ))}
    </div>
  );
}

function buildInvoiceListItems(
  invoices: InvoiceWithDetails[],
  schedules: InvoiceScheduleWithDetails[],
): DocumentBrowserItem[] {
  return [
    ...schedules.map(scheduleToListItem),
    ...invoices.map(invoiceToListItem),
  ].sort((left, right) =>
    new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime()
  );
}

function scheduleToListItem(schedule: InvoiceScheduleWithDetails): DocumentBrowserItem {
  const previewInvoice = scheduleToPreviewInvoice(schedule);

  return {
    id: previewInvoice.id,
    companyId: schedule.company_id,
    companyName: schedule.company?.name ?? "Ukjent bedrift",
    title: previewInvoice.title,
    subtitle: previewInvoice.invoice_number ?? "Opprettes ved utsending",
    statusLabel: "Planlagt",
    statusTone: "purple",
    amount: Number(previewInvoice.total),
    date: schedule.next_run_at,
  };
}

function invoiceToListItem(invoice: InvoiceWithDetails): DocumentBrowserItem {
  return {
    id: invoice.id,
    companyId: invoice.company_id ?? `guest-${invoice.id}`,
    companyName: invoice.company?.name ?? invoice.recipient_name,
    title: invoice.title || invoice.invoice_number || "Utkast",
    subtitle: invoice.invoice_number ?? "Fakturanummer tildeles ved ferdigstilling",
    statusLabel: invoice.paid ? "Betalt" : INVOICE_STATUS_LABELS[invoice.status],
    statusTone: getInvoiceStatusTone(invoice.status, invoice.paid),
    amount: Number(invoice.total),
    date: invoice.issue_date,
  };
}
