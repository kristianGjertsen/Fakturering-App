export type Company = {
  id: string;
  owner_user_id: string;
  name: string;
  org_number: string | null;
  email: string | null;
  address: string | null;
  postal_address: string | null;
  country: string | null;
  private_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileBankAccount = {
  id: string;
  profile_id: string;
  account_name: string;
  account_number: string;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  address: string | null;
  postal_address: string | null;
  country: string;
  org_number: string | null;
  has_sent_invoices_before: boolean;
  last_invoice_number: number;
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

export type InvoiceStatus = "draft" | "sending" | "ready" | "sent" | "reminded" | "paid" | "cancelled";
export type PdfTemplate = "classic" | "modern" | "minimal";

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

export type InvoiceAttachment = {
  id: string;
  invoice_id: string;
  invoice_item_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  owner_user_id: string;
  company_id: string | null;
  recipient_name: string;
  recipient_org_number: string | null;
  recipient_email: string | null;
  recipient_country: string | null;
  schedule_id: string | null;
  scheduled_for: string | null;
  invoice_number: string | null;
  title: string;
  issue_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  finalized_at: string | null;
  pdf_storage_path: string | null;
  pdf_locked_at: string | null;
  paid: boolean;
  pdf_template: PdfTemplate;
  notes: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type InvoiceWithDetails = Invoice & {
  company?: Pick<Company, "id" | "name" | "org_number" | "email" | "address" | "postal_address" | "country"> | null;
  invoice_items?: InvoiceItem[];
  invoice_attachments?: InvoiceAttachment[];
};

export type ScheduleFrequency = "daily" | "weekly" | "monthly";
export type ScheduleType = "once" | "recurring";

export type InvoiceSchedule = {
  id: string;
  owner_user_id: string;
  company_id: string;
  title: string;
  invoice_title: string | null;
  schedule_type: ScheduleType;
  frequency: ScheduleFrequency | null;
  interval_count: number;
  day_of_week: number | null;
  day_of_month: number | null;
  send_time: string;
  timezone: string;
  start_date: string;
  next_run_at: string | null;
  last_run_at: string | null;
  completed_at: string | null;
  is_active: boolean;
  auto_send: boolean;
  payment_terms_days: number;
  invoice_notes: string | null;
  pdf_template: PdfTemplate;
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

export type InvoiceScheduleAttachment = {
  id: string;
  schedule_id: string;
  schedule_line_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type InvoiceScheduleWithDetails = InvoiceSchedule & {
  company?: Pick<Company, "id" | "name" | "org_number" | "email" | "address" | "postal_address" | "country"> | null;
  invoice_schedule_lines?: InvoiceScheduleLine[];
  invoice_schedule_attachments?: InvoiceScheduleAttachment[];
};

export type InvoiceDraftAttachment = {
  localId: string;
  file: File;
};

export type InvoiceDraftLine = {
  localId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  attachments: InvoiceDraftAttachment[];
};

export type RepeatDraft = {
  enabled: boolean;
  frequency: ScheduleFrequency;
  intervalCount: number;
  dayOfWeek: number;
  dayOfMonth: number;
  startDate: string;
  autoSend: boolean;
  paymentTermsDays: number;
};

export type SingleScheduleDraft = {
  enabled: boolean;
};
