import { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { formatCurrency, formatDate } from "../lib/format";

export type DocumentBrowserItem = {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusTone?: StatusTone;
  amount: number;
  date: string | null;
  dateLabel?: string;
};

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "purple";

type SortKey = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "amount-desc" | "amount-asc";
type ViewMode = "companies" | "all";

type DocumentBrowserProps = {
  items: DocumentBrowserItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchPlaceholder: string;
  itemLabel: string;
};

const controlClass =
  "h-9 rounded-md border border-blue-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export function DocumentBrowser({
  items,
  selectedId,
  onSelect,
  searchPlaceholder,
  itemLabel,
}: DocumentBrowserProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("companies");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [openCompanyIds, setOpenCompanyIds] = useState<string[]>([]);

  const companies = useMemo(() => {
    const companyMap = new Map<string, string>();

    for (const item of items) {
      companyMap.set(item.companyId, item.companyName);
    }

    return [...companyMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }, [items]);

  const statuses = useMemo(() => [...new Set(items.map((item) => item.statusLabel))]
    .sort((a, b) => a.localeCompare(b, "nb")), [items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("nb-NO");
    const matches = items.filter((item) => {
      const matchesCompany = companyFilter === "all" || item.companyId === companyFilter;
      const matchesStatus = statusFilter === "all" || item.statusLabel === statusFilter;
      const haystack = `${item.title} ${item.subtitle ?? ""} ${item.companyName} ${item.statusLabel}`.toLocaleLowerCase("nb-NO");
      return matchesCompany && matchesStatus && (!normalizedSearch || haystack.includes(normalizedSearch));
    });

    return [...matches].sort((a, b) => compareItems(a, b, sortKey));
  }, [items, search, companyFilter, statusFilter, sortKey]);

  const groups = useMemo(() => {
    const grouped = new Map<string, { companyName: string; items: DocumentBrowserItem[] }>();

    for (const item of filteredItems) {
      const group = grouped.get(item.companyId) ?? { companyName: item.companyName, items: [] };
      group.items.push(item);
      grouped.set(item.companyId, group);
    }

    return [...grouped.entries()]
      .map(([companyId, group]) => ({ companyId, ...group }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName, "nb"));
  }, [filteredItems]);

  useEffect(() => {
    if (filteredItems.length > 0 && !filteredItems.some((item) => item.id === selectedId)) {
      onSelect(filteredItems[0].id);
    }
  }, [filteredItems, selectedId, onSelect]);

  useEffect(() => {
    if (statusFilter !== "all" && !statuses.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, statuses]);

  useEffect(() => {
    const selectedItem = items.find((item) => item.id === selectedId);
    const fallbackCompanyId = groups[0]?.companyId;
    const companyId = selectedItem?.companyId ?? fallbackCompanyId;

    if (companyId) {
      setOpenCompanyIds((current) => current.includes(companyId) ? current : [...current, companyId]);
    }
  }, [selectedId, items, groups]);

  function toggleCompany(companyId: string) {
    setOpenCompanyIds((current) => current.includes(companyId)
      ? current.filter((id) => id !== companyId)
      : [...current, companyId]);
  }

  return (
    <aside className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Oversikt</p>
            <p className="text-xs text-slate-500">
              {filteredItems.length} {itemLabel} · {formatCurrency(filteredItems.reduce((sum, item) => sum + item.amount, 0))}
            </p>
          </div>
          <div className="flex rounded-md border border-blue-200 bg-white p-0.5">
            <Button
              variant={viewMode === "companies" ? "primary" : "ghost"}
              size="xs"
              className="shadow-none"
              onClick={() => setViewMode("companies")}
            >
              Bedrifter
            </Button>
            <Button
              variant={viewMode === "all" ? "primary" : "ghost"}
              size="xs"
              className="shadow-none"
              onClick={() => setViewMode("all")}
            >
              Alle
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <label className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <span className="sr-only">Søk</span>
            <input
              className={`${controlClass} w-full`}
              type="search"
              value={search}
              placeholder={searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filtrer på bedrift</span>
            <select className={`${controlClass} w-full`} value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Alle bedrifter</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrer på status</span>
            <select className={`${controlClass} w-full`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Alle statuser</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <span className="sr-only">Sorter</span>
            <select className={`${controlClass} w-full`} value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="date-desc">Nyeste dato</option>
              <option value="date-asc">Eldste dato</option>
              <option value="name-asc">Navn A–Å</option>
              <option value="name-desc">Navn Å–A</option>
              <option value="amount-desc">Høyeste pris</option>
              <option value="amount-asc">Laveste pris</option>
            </select>
          </label>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-y-auto p-2">
        {filteredItems.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-slate-500">Ingen treff med valgte filtre.</p>
        ) : viewMode === "companies" ? (
          <div className="space-y-1">
            {groups.map((group) => {
              const isOpen = openCompanyIds.includes(group.companyId);
              const groupTotal = group.items.reduce((sum, item) => sum + item.amount, 0);

              return (
                <div key={group.companyId} className="overflow-hidden rounded-lg border border-blue-100">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 bg-blue-50/60 px-3 py-3 text-left transition hover:bg-blue-50"
                    aria-expanded={isOpen}
                    onClick={() => toggleCompany(group.companyId)}
                  >
                    <span className="text-xs font-bold text-blue-700" aria-hidden="true">{isOpen ? "▼" : "▶"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950">{group.companyName}</span>
                      <span className="block text-xs text-slate-500">{group.items.length} · {formatCurrency(groupTotal)}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-1 border-t border-blue-100 bg-white p-1.5">
                      {group.items.map((item) => (
                        <DocumentRow key={item.id} item={item} selected={selectedId === item.id} onSelect={onSelect} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredItems.map((item) => (
              <DocumentRow key={item.id} item={item} selected={selectedId === item.id} onSelect={onSelect} showCompany />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function DocumentRow({
  item,
  selected,
  onSelect,
  showCompany = false,
}: {
  item: DocumentBrowserItem;
  selected: boolean;
  onSelect: (id: string) => void;
  showCompany?: boolean;
}) {
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
          <span className="block truncate text-sm font-semibold text-slate-950">{item.title}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {[showCompany ? item.companyName : null, item.subtitle].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${statusToneClasses[item.statusTone ?? "neutral"]}`}>
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

export const statusToneClasses: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
};

function compareItems(a: DocumentBrowserItem, b: DocumentBrowserItem, sortKey: SortKey) {
  if (sortKey === "name-asc" || sortKey === "name-desc") {
    const companyResult = a.companyName.localeCompare(b.companyName, "nb", { numeric: true });
    const result = companyResult || a.title.localeCompare(b.title, "nb", { numeric: true });
    return sortKey === "name-asc" ? result : -result;
  }

  if (sortKey === "amount-asc" || sortKey === "amount-desc") {
    const result = a.amount - b.amount;
    return sortKey === "amount-asc" ? result : -result;
  }

  const aTime = a.date ? new Date(a.date).getTime() : 0;
  const bTime = b.date ? new Date(b.date).getTime() : 0;
  return sortKey === "date-asc" ? aTime - bTime : bTime - aTime;
}
