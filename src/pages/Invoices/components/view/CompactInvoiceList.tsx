import type { DocumentBrowserItem } from "../../../../components/DocumentBrowser";
import { Tag } from "../../../../components/Tag";
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
    <>
    <div className="grid gap-2 sm:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="w-full rounded-md border border-blue-100 bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          onClick={() => onSelect(item.id)}
        >
          <span className="flex min-w-0 items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-950" title={item.title}>
                {item.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-600" title={item.companyName}>
                {item.companyName}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm font-semibold text-slate-950">
              {formatCurrency(item.amount)}
            </span>
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-2">
            <Tag tone={item.statusTone}>
              {item.statusLabel}
            </Tag>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              {item.invoiceNumber ?? item.subtitle ?? "Uten nummer"}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              {formatDate(item.date)}
            </span>
          </span>
        </button>
      ))}
    </div>
    <div className="hidden overflow-x-auto rounded-lg border border-blue-100 sm:block">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-blue-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Faktura</th>
            <th className="px-4 py-3 font-semibold">Selskap</th>
            <th className="px-4 py-3 font-semibold">Fakturanr.</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 text-right font-semibold">Total</th>
            <th className="px-4 py-3 font-semibold">Dato</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="cursor-pointer bg-white transition [&>td]:border-b [&>td]:border-blue-50 last:[&>td]:border-b-0 hover:bg-blue-50"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item.id);
                }
              }}
            >
              <td className="max-w-56 px-4 py-3 font-semibold text-slate-950">
                <span className="block truncate" title={item.title}>
                  {item.title}
                </span>
              </td>
              <td className="max-w-44 px-4 py-3 text-slate-700">
                <span className="block truncate" title={item.companyName}>
                  {item.companyName}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                {item.invoiceNumber ?? item.subtitle ?? "–"}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <Tag tone={item.statusTone}>
                  {item.statusLabel}
                </Tag>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-950">
                {formatCurrency(item.amount)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {formatDate(item.date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
