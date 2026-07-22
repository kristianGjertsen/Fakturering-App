import type {
  DocumentBrowserItem,
  DocumentGroup,
  DocumentSortKey,
} from "./types";

type DocumentFilters = {
  search: string;
  companyId: string;
  status: string;
  sortKey: DocumentSortKey;
};

export function listDocumentCompanies(items: DocumentBrowserItem[]) {
  const companyNamesById = new Map<string, string>();

  for (const item of items) {
    companyNamesById.set(item.companyId, item.companyName);
  }

  return [...companyNamesById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "nb"));
}

export function listDocumentStatuses(items: DocumentBrowserItem[]) {
  return [...new Set(items.map((item) => item.statusLabel))]
    .sort((left, right) => left.localeCompare(right, "nb"));
}

export function filterAndSortDocuments(
  items: DocumentBrowserItem[],
  { search, companyId, status, sortKey }: DocumentFilters,
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("nb-NO");
  const matchingItems = items.filter((item) => {
    const matchesCompany = companyId === "all" || item.companyId === companyId;
    const matchesStatus = status === "all" || item.statusLabel === status;
    const searchableText = `${item.title} ${item.subtitle ?? ""} ${item.companyName} ${item.statusLabel}`
      .toLocaleLowerCase("nb-NO");

    return matchesCompany
      && matchesStatus
      && (!normalizedSearch || searchableText.includes(normalizedSearch));
  });

  return [...matchingItems].sort((left, right) => compareDocuments(left, right, sortKey));
}

export function groupDocumentsByCompany(items: DocumentBrowserItem[]): DocumentGroup[] {
  const groupsByCompany = new Map<
    string,
    Omit<DocumentGroup, "companyId">
  >();

  for (const item of items) {
    const group = groupsByCompany.get(item.companyId) ?? {
      companyName: item.companyName,
      items: [],
    };
    group.items.push(item);
    groupsByCompany.set(item.companyId, group);
  }

  return [...groupsByCompany.entries()]
    .map(([companyId, group]) => ({ companyId, ...group }))
    .sort((left, right) => left.companyName.localeCompare(right.companyName, "nb"));
}

function compareDocuments(
  left: DocumentBrowserItem,
  right: DocumentBrowserItem,
  sortKey: DocumentSortKey,
) {
  if (sortKey === "name-asc" || sortKey === "name-desc") {
    const companyResult = left.companyName.localeCompare(right.companyName, "nb", {
      numeric: true,
    });
    const result = companyResult
      || left.title.localeCompare(right.title, "nb", { numeric: true });
    return sortKey === "name-asc" ? result : -result;
  }

  if (sortKey === "amount-asc" || sortKey === "amount-desc") {
    const result = left.amount - right.amount;
    return sortKey === "amount-asc" ? result : -result;
  }

  const leftTime = left.date ? new Date(left.date).getTime() : 0;
  const rightTime = right.date ? new Date(right.date).getTime() : 0;
  return sortKey === "date-asc" ? leftTime - rightTime : rightTime - leftTime;
}
