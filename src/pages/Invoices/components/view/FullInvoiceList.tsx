import { useEffect, useMemo, useState } from "react";
import {
  getStatusColorClasses,
  type DocumentBrowserItem,
} from "../../../../components/DocumentBrowser";
import { Input } from "../../../../components/Input";
import { Panel } from "../../../../components/layout/Panel";
import { Select } from "../../../../components/Select";
import {
  filterAndSortDocuments,
  groupDocumentsByCompany,
  listDocumentCompanies,
  listDocumentStatuses,
} from "../../../../components/document-browser/documentBrowserUtils";
import type { DocumentSortKey } from "../../../../components/document-browser/types";
import { DocumentCalendar } from "../../../../components/document-browser/DocumentCalendar";
import { formatCurrency, formatDate } from "../../../../lib/format";
import { Button } from "../../../../components/Button";

type FullInvoiceListProps = {
  items: DocumentBrowserItem[];
  selectedId: string;
  onSelect: (invoiceId: string) => void;
  onMarkPaid?: (invoiceId: string) => void;
  markingPaidId: string;
};

const PAGE_SIZE = 10;
type ViewMode = "all" | "companies" | "calendar";

export function FullInvoiceList({
  items,
  selectedId,
  onSelect,
  onMarkPaid,
  markingPaidId,
}: FullInvoiceListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<DocumentSortKey>("date-desc");
  const [page, setPage] = useState(1);
  const [openCompanyIds, setOpenCompanyIds] = useState<string[]>([]);

  const companies = useMemo(() => listDocumentCompanies(items), [items]);
  const statuses = useMemo(() => listDocumentStatuses(items), [items]);
  const filteredItems = useMemo(
    () => filterAndSortDocuments(items, {
      search,
      companyId: companyFilter,
      status: statusFilter,
      sortKey,
    }),
    [items, search, companyFilter, statusFilter, sortKey],
  );
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groups = useMemo(
    () => groupDocumentsByCompany(filteredItems),
    [filteredItems],
  );

  useEffect(() => {
    setPage(1);
  }, [search, companyFilter, statusFilter, sortKey]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    if (statusFilter !== "all" && !statuses.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, statuses]);

  function toggleCompany(companyId: string) {
    setOpenCompanyIds((current) => current.includes(companyId)
      ? current.filter((id) => id !== companyId)
      : [...current, companyId]);
  }

  function renderInvoiceRow(item: DocumentBrowserItem) {
    const selected = item.id === selectedId;

    return (
      <tr
        key={item.id}
        className={`cursor-pointer transition [&>td]:border-b [&>td]:border-[#c4c4c4] ${
          selected ? "bg-blue-50" : "bg-white hover:bg-blue-50"
        }`}
        aria-selected={selected}
        tabIndex={0}
        onClick={() => onSelect(item.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(item.id);
          }
        }}
      >
        <td className="max-w-44 px-4 py-3 font-semibold text-slate-950">
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
          <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${
            getStatusColorClasses(item.statusTone).badge
          }`}>
            {item.statusLabel}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-3 text-center">
          {item.canMarkPaid && onMarkPaid && (
            <Button
              variant="success"
              size="xs"
              disabled={markingPaidId === item.id}
              onClick={(event) => {
                event.stopPropagation();
                onMarkPaid(item.id);
              }}
            >
              {markingPaidId === item.id ? "Oppdaterer..." : "Marker betalt"}
            </Button>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
          {formatCurrency(item.amount)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {formatDate(item.date)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {formatDate(item.createdAt)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {formatDate(item.dueDate)}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <span className="text-lg font-semibold text-slate-400" aria-hidden="true">···</span>
        </td>
      </tr>
    );
  }

  return (
    <Panel as="section" padding="none" aria-label="Fakturaliste">
      <div className="border-b border-[#f4f7fb] bg-slate-50/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Oversikt</p>
            <p className="text-xs text-slate-500">
              {filteredItems.length} fakturaer ·{" "}
              {formatCurrency(filteredItems.reduce((sum, item) => sum + item.amount, 0))}
            </p>
          </div>

          <div className="flex rounded-md border border-blue-200 bg-white p-0.5">
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "all"
                  ? "bg-blue-700 text-white"
                  : "text-slate-600 hover:bg-blue-50"
              }`}
              onClick={() => setViewMode("all")}
            >
              Alle
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "companies"
                  ? "bg-blue-700 text-white"
                  : "text-slate-600 hover:bg-blue-50"
              }`}
              onClick={() => setViewMode("companies")}
            >
              Bedrifter
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "calendar"
                  ? "bg-blue-700 text-white"
                  : "text-slate-600 hover:bg-blue-50"
              }`}
              onClick={() => setViewMode("calendar")}
            >
              Kalender
            </button>
          </div>
        </div>

        <div className="mt-4 grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_160px_160px]">
            <label>
              <span className="sr-only">Søk etter faktura</span>
              <Input
                className="h-9 py-0"
                type="search"
                value={search}
                placeholder="Søk etter navn, firma eller fakturanr."
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <Select
              ariaLabel="Filtrer på firma"
              className="h-9 py-0"
              value={companyFilter}
              options={[
                { value: "all", label: "Alle firmaer" },
                ...companies.map((company) => ({ value: company.id, label: company.name })),
              ]}
              onChange={setCompanyFilter}
            />
            <Select
              ariaLabel="Filtrer på status"
              className="h-9 py-0"
              value={statusFilter}
              options={[
                { value: "all", label: "Alle statuser" },
                ...statuses.map((status) => ({ value: status, label: status })),
              ]}
              onChange={setStatusFilter}
            />
            <Select
              ariaLabel="Sorter fakturaer"
              className="h-9 py-0"
              value={sortKey}
              options={[
                { value: "date-desc", label: "Nyeste først" },
                { value: "date-asc", label: "Eldste først" },
                { value: "name-asc", label: "Firma A–Å" },
                { value: "name-desc", label: "Firma Å–A" },
                { value: "amount-desc", label: "Høyeste beløp" },
                { value: "amount-asc", label: "Laveste beløp" },
              ]}
              onChange={(value) => setSortKey(value as DocumentSortKey)}
            />
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-500">
          Ingen treff med valgte filtre.
        </p>
      ) : (
        <>
          {viewMode === "calendar" ? (
            <div className="min-h-[520px] p-3">
              <DocumentCalendar
                items={filteredItems}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </div>
          ) : (
          <div className="min-h-[520px] overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed border-separate border-spacing-0 text-left text-sm">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr className="[&>th]:border-b [&>th]:border-[#eef3f8]">
                  <th className="px-4 py-3">Fakturanavn</th>
                  <th className="px-4 py-3">Firma</th>
                  <th className="px-4 py-3">Fakturanr.</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-2 py-3 text-center">Betaling</th>
                  <th className="px-4 py-3 text-right">Beløp</th>
                  <th className="px-4 py-3">Fakturadato</th>
                  <th className="px-4 py-3">Opprettet</th>
                  <th className="px-4 py-3">Forfall</th>
                  <th className="w-10 px-3 py-3">
                    <span className="sr-only">Handling</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {viewMode === "all"
                  ? pageItems.map(renderInvoiceRow)
                  : groups.map((group) => {
                    const open = openCompanyIds.includes(group.companyId);
                    const groupTotal = group.items.reduce((sum, item) => sum + item.amount, 0);

                    return [
                      <tr
                        key={`group-${group.companyId}`}
                        className="bg-blue-50/30 [&>td]:border-b [&>td]:border-[#eef3f8]"
                      >
                        <td colSpan={10} className="p-0">
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-blue-50"
                            aria-expanded={open}
                            onClick={() => toggleCompany(group.companyId)}
                          >
                            <span className="w-4 text-xs font-bold text-blue-700" aria-hidden="true">
                              {open ? "▼" : "▶"}
                            </span>
                            <span className="font-semibold text-slate-950">{group.companyName}</span>
                            <span className="text-xs text-slate-500">
                              {group.items.length} fakturaer · {formatCurrency(groupTotal)}
                            </span>
                          </button>
                        </td>
                      </tr>,
                      ...(open ? group.items.map(renderInvoiceRow) : []),
                    ];
                  })}
              </tbody>
            </table>
          </div>
          )}

          {viewMode === "all" && (
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              className="rounded-md border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Forrige
            </button>
            <p className="text-xs text-slate-500">Side {page} av {pageCount}</p>
            <button
              type="button"
              className="rounded-md border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page === pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Neste
            </button>
          </div>
          )}
        </>
      )}
    </Panel>
  );
}
