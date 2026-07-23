import { Button } from "../../../../components/Button";
import type { DocumentBrowserItem } from "../../../../components/DocumentBrowser";
import { formatCurrency, formatDate } from "../../../../lib/format";

type CompactInvoiceListProps = {
  items: DocumentBrowserItem[];
  onSelect: (invoiceId: string) => void;
};

export function CompactInvoiceList({ items, onSelect }: CompactInvoiceListProps) {
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
