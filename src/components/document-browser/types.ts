export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "purple";

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

export type DocumentSortKey =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "amount-desc"
  | "amount-asc";

export type DocumentGroup = {
  companyId: string;
  companyName: string;
  items: DocumentBrowserItem[];
};
