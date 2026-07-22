import { formatCurrency, formatDate } from "../../lib/format";
import type { DocumentBrowserItem, DocumentGroup, StatusTone } from "./types";

type DocumentRowProps = {
  item: DocumentBrowserItem;
  selected: boolean;
  onSelect: (id: string) => void;
  showCompany?: boolean;
};

type CompanyDocumentGroupProps = {
  group: DocumentGroup;
  open: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onToggle: () => void;
};

export const statusToneClasses: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function CompanyDocumentGroup({
  group,
  open,
  selectedId,
  onSelect,
  onToggle,
}: CompanyDocumentGroupProps) {
  const total = group.items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-blue-100">
      <button
        type="button"
        className="flex w-full items-center gap-3 bg-blue-50/60 px-3 py-3 text-left transition hover:bg-blue-50"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="text-xs font-bold text-blue-700" aria-hidden="true">
          {open ? "▼" : "▶"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-950">
            {group.companyName}
          </span>
          <span className="block text-xs text-slate-500">
            {group.items.length} · {formatCurrency(total)}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-1 border-t border-blue-100 bg-white p-1.5">
          {group.items.map((item) => (
            <DocumentRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentRow({
  item,
  selected,
  onSelect,
  showCompany = false,
}: DocumentRowProps) {
  return (
    <button
      type="button"
      className={`w-full rounded-md border px-3 py-3 text-left transition ${
        selected
          ? "border-blue-400 bg-blue-50 shadow-sm"
          : "border-transparent bg-white hover:border-blue-200 hover:bg-slate-50"
      }`}
      onClick={() => onSelect(item.id)}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-950">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {[showCompany ? item.companyName : null, item.subtitle].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${
            statusToneClasses[item.statusTone ?? "neutral"]
          }`}
        >
          {item.statusLabel}
        </span>
      </span>
      <span className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500">{item.dateLabel ?? formatDate(item.date)}</span>
        <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
      </span>
    </button>
  );
}
