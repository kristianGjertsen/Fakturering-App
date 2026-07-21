import { DocumentBrowser, type DocumentBrowserItem, type StatusTone } from "../../../components/DocumentBrowser";
import { Button } from "../../../components/Button";
import { formatCurrency, formatDate } from "../../../lib/format";
import { scheduleToPreviewInvoice } from "../../../lib/schedulePreview";
import type { InvoiceScheduleWithDetails, InvoiceWithDetails } from "../../../types";

type InvoiceListProps = {
  invoices: InvoiceWithDetails[];
  schedules?: InvoiceScheduleWithDetails[];
  selectedId: string;
  onSelect: (invoiceId: string) => void;
  compact?: boolean;
  limit?: number;
};

export const invoiceStatusLabels: Record<string, string> = {
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

export function invoiceStatusTone(status: InvoiceWithDetails["status"], paid: boolean): StatusTone {
  if (paid || status === "paid") return "success";
  if (status === "sent") return "info";
  if (status === "ready") return "warning";
  if (status === "reminded") return "purple";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function InvoiceList({
  invoices,
  schedules = [],
  selectedId,
  onSelect,
  compact = false,
  limit,
}: InvoiceListProps) {
  const visibleInvoices = getVisibleInvoices(invoices);
  const items = createInvoiceListItems(visibleInvoices, schedules);
  const displayedItems = typeof limit === "number" ? items.slice(0, limit) : items;

  if (compact) {
    if (displayedItems.length === 0) {
      return <p className="py-8 text-center text-sm text-slate-500">Ingen fakturaer registrert.</p>;
    }

    return (
      <div className="divide-y divide-blue-100 overflow-hidden rounded-lg border border-blue-100">
        {displayedItems.map((item) => (
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
            <span className="shrink-0 text-sm font-semibold text-slate-950">{formatCurrency(item.amount)}</span>
          </Button>
        ))}
      </div>
    );
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

function createInvoiceListItems(
  invoices: InvoiceWithDetails[],
  schedules: InvoiceScheduleWithDetails[],
): DocumentBrowserItem[] {
  return [
    ...schedules.map((schedule) => {
      const preview = scheduleToPreviewInvoice(schedule);
      return {
        id: preview.id,
        companyId: schedule.company_id,
        companyName: schedule.company?.name ?? "Ukjent bedrift",
        title: preview.title,
        subtitle: preview.invoice_number ?? "Opprettes ved utsending",
        statusLabel: "Planlagt",
        statusTone: "purple" as const,
        amount: Number(preview.total),
        date: schedule.next_run_at,
      };
    }),
    ...invoices.map((invoice) => ({
      id: invoice.id,
      companyId: invoice.company_id ?? `guest-${invoice.id}`,
      companyName: invoice.company?.name ?? invoice.recipient_name,
      title: invoice.title || invoice.invoice_number || "Utkast",
      subtitle: invoice.invoice_number ?? "Fakturanummer tildeles ved ferdigstilling",
      statusLabel: invoice.paid ? "Betalt" : invoiceStatusLabels[invoice.status] ?? invoice.status,
      statusTone: invoiceStatusTone(invoice.status, invoice.paid),
      amount: Number(invoice.total),
      date: invoice.issue_date,
    })),
  ].sort((left, right) =>
    new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime()
  );
}
