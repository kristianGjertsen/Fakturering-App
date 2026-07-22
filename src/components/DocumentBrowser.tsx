import { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Select } from "./Select";
import { formatCurrency } from "../lib/format";
import { Panel } from "./layout/Panel";
import {
  CompanyDocumentGroup,
  DocumentRow,
} from "./document-browser/DocumentList";
import {
  filterAndSortDocuments,
  groupDocumentsByCompany,
  listDocumentCompanies,
  listDocumentStatuses,
} from "./document-browser/documentBrowserUtils";
import type {
  DocumentBrowserItem,
  DocumentSortKey,
} from "./document-browser/types";

type ViewMode = "companies" | "all";

export { statusToneClasses } from "./document-browser/DocumentList";
export type { DocumentBrowserItem, StatusTone } from "./document-browser/types";

type DocumentBrowserProps = {
  items: DocumentBrowserItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchPlaceholder: string;
  itemLabel: string;
};

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
  const [sortKey, setSortKey] = useState<DocumentSortKey>("date-desc");
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
  const groups = useMemo(
    () => groupDocumentsByCompany(filteredItems),
    [filteredItems],
  );

  useEffect(() => {
    if (statusFilter !== "all" && !statuses.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, statuses]);

  useEffect(() => {
    const selectedItem = items.find((item) => item.id === selectedId);
    const companyId = selectedItem?.companyId;

    if (companyId) {
      setOpenCompanyIds((current) => current.includes(companyId) ? current : [...current, companyId]);
    }
  }, [selectedId, items]);

  function toggleCompany(companyId: string) {
    setOpenCompanyIds((current) => current.includes(companyId)
      ? current.filter((id) => id !== companyId)
      : [...current, companyId]);
  }

  return (
    <Panel as="aside" padding="none" className="overflow-hidden">
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

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="md:col-span-2 xl:col-span-1">
            <span className="sr-only">Søk</span>
            <Input
              className="h-9 border-blue-200 py-0 text-slate-800"
              type="search"
              value={search}
              placeholder={searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filtrer på bedrift</span>
            <Select
              ariaLabel="Filtrer på bedrift"
              className="h-9 py-0"
              value={companyFilter}
              options={[
                { value: "all", label: "Alle bedrifter" },
                ...companies.map((company) => ({ value: company.id, label: company.name })),
              ]}
              onChange={setCompanyFilter}
            />
          </label>
          <label>
            <span className="sr-only">Filtrer på status</span>
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
          </label>
          <label>
            <span className="sr-only">Sorter</span>
            <Select
              ariaLabel="Sorter"
              className="h-9 py-0"
              value={sortKey}
              options={[
                { value: "date-desc", label: "Nyeste dato" },
                { value: "date-asc", label: "Eldste dato" },
                { value: "name-asc", label: "Navn A–Å" },
                { value: "name-desc", label: "Navn Å–A" },
                { value: "amount-desc", label: "Høyeste pris" },
                { value: "amount-asc", label: "Laveste pris" },
              ]}
              onChange={(value) => setSortKey(value as DocumentSortKey)}
            />
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

              return (
                <CompanyDocumentGroup
                  key={group.companyId}
                  group={group}
                  open={isOpen}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onToggle={() => toggleCompany(group.companyId)}
                />
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
    </Panel>
  );
}
