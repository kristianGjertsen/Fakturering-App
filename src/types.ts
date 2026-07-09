export type Company = {
  id: string;
  owner_user_id: string;
  name: string;
  org_number: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  private_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  vat_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InvoiceStatus = "draft" | "ready" | "sent" | "paid" | "cancelled";

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_subtotal: number;
  line_vat: number;
  line_total: number;
  sort_order: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  owner_user_id: string;
  company_id: string;
  schedule_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  notes: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type InvoiceWithDetails = Invoice & {
  company?: Pick<Company, "id" | "name" | "org_number" | "email" | "city" | "country"> | null;
  invoice_items?: InvoiceItem[];
};

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type InvoiceSchedule = {
  id: string;
  owner_user_id: string;
  company_id: string;
  title: string;
  frequency: ScheduleFrequency;
  interval_count: number;
  day_of_week: number | null;
  day_of_month: number | null;
  send_time: string;
  timezone: string;
  start_date: string;
  next_run_at: string | null;
  last_run_at: string | null;
  is_active: boolean;
  auto_send: boolean;
  created_at: string;
  updated_at: string;
};

export type InvoiceScheduleLine = {
  id: string;
  schedule_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  sort_order: number;
  created_at: string;
};

export type InvoiceScheduleWithDetails = InvoiceSchedule & {
  company?: Pick<Company, "id" | "name" | "org_number" | "email"> | null;
  invoice_schedule_lines?: InvoiceScheduleLine[];
};

export type InvoiceDraftLine = {
  localId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
};

export type RepeatDraft = {
  enabled: boolean;
  frequency: ScheduleFrequency;
  intervalCount: number;
  dayOfWeek: number;
  dayOfMonth: number;
  sendTime: string;
  startDate: string;
  autoSend: boolean;
};
