export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "purple";

export type DocumentBrowserItem = {
  id: string;
  selectId?: string;
  companyId: string;
  companyName: string;
  invoiceNumber?: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusTone?: StatusTone;
  amount: number;
  date: string | null;
  dateLabel?: string;
  createdAt?: string | null;
  dueDate?: string | null;
  canMarkPaid?: boolean;
  recurrence?: {
    frequency: "daily" | "weekly" | "monthly";
    intervalCount: number;
    dayOfMonth?: number | null;
  };
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
