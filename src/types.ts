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
  contact_person: string | null;
  phone: string | null;
  payment_terms_days: number;
  invoice_notes: string | null;
  website: string | null;
  website_from_brreg: boolean;
  is_active: boolean;
  logo_disabled: boolean;
  logo_url: string | null;
  logo_source: string | null;
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
  invoice_number_prefix: string;
  invoice_number_padding_width: number;
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
  paid_at: string | null;
  pdf_template: PdfTemplate;
  notes: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  is_historical: boolean;
  historical_pdf_name: string | null;
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

export type AccountingAccountCategory =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type AccountingAccount = {
  id: string;
  owner_user_id: string;
  account_number: string;
  name: string;
  category: AccountingAccountCategory;
  system_key: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  owner_user_id: string;
  name: string;
  org_number: string | null;
  email: string | null;
  bank_account: string | null;
  notes: string | null;
  default_expense_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierInvoiceStatus = "posted" | "paid" | "cancelled";

export type SupplierInvoiceLine = {
  id: string;
  supplier_invoice_id: string;
  expense_account_id: string;
  description: string;
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  original_net_amount: number;
  original_vat_amount: number;
  original_gross_amount: number;
  sort_order: number;
  created_at: string;
  account?: Pick<AccountingAccount, "id" | "account_number" | "name"> | null;
};

export type SupplierInvoiceAttachment = {
  id: string;
  supplier_invoice_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type SupplierInvoice = {
  id: string;
  owner_user_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  kid: string | null;
  description: string | null;
  currency: string;
  exchange_rate: number;
  exchange_rate_date: string | null;
  exchange_rate_source: string | null;
  original_subtotal: number;
  original_vat_total: number;
  original_total: number;
  status: SupplierInvoiceStatus;
  subtotal: number;
  vat_total: number;
  total: number;
  journal_entry_id: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierInvoiceWithDetails = SupplierInvoice & {
  supplier?: Supplier | null;
  supplier_invoice_lines?: SupplierInvoiceLine[];
  supplier_invoice_attachments?: SupplierInvoiceAttachment[];
};

export type PurchasePaymentStatus = "booked" | "reimbursed" | "cancelled";
export type PurchasePaymentSource = "company" | "private";

export type PurchasePaymentLine = {
  id: string;
  purchase_payment_id: string;
  expense_account_id: string;
  description: string;
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  sort_order: number;
  created_at: string;
  account?: Pick<AccountingAccount, "id" | "account_number" | "name"> | null;
};

export type PurchasePaymentAttachment = {
  id: string;
  purchase_payment_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type PurchasePayment = {
  id: string;
  owner_user_id: string;
  supplier_name: string;
  supplier_org_number: string | null;
  purchase_date: string;
  description: string;
  payment_source: PurchasePaymentSource;
  settlement_account_id: string;
  paid_by: string | null;
  attested_at: string | null;
  attested_by: string | null;
  status: PurchasePaymentStatus;
  subtotal: number;
  vat_total: number;
  total: number;
  journal_entry_id: string;
  reimbursed_at: string | null;
  reimbursement_journal_entry_id: string | null;
  cancelled_at: string | null;
  cancellation_journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchasePaymentWithDetails = PurchasePayment & {
  settlement_account?: Pick<AccountingAccount, "id" | "account_number" | "name" | "system_key"> | null;
  purchase_payment_lines?: PurchasePaymentLine[];
  purchase_payment_attachments?: PurchasePaymentAttachment[];
};

export type JournalSourceType =
  | "sales_invoice"
  | "sales_payment"
  | "supplier_invoice"
  | "supplier_payment"
  | "purchase_payment"
  | "purchase_reimbursement"
  | "manual"
  | "correction";

export type JournalLine = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  description: string | null;
  debit: number;
  credit: number;
  vat_rate: number | null;
  sort_order: number;
  created_at: string;
  account?: Pick<AccountingAccount, "id" | "account_number" | "name" | "category" | "system_key"> | null;
};

export type JournalEntry = {
  id: string;
  owner_user_id: string;
  voucher_number: number;
  entry_date: string;
  description: string;
  source_type: JournalSourceType;
  source_id: string | null;
  reversal_of_id: string | null;
  created_at: string;
  posted_at: string;
  journal_lines?: JournalLine[];
};

export type AccountingPayment = {
  id: string;
  owner_user_id: string;
  direction: "incoming" | "outgoing";
  sales_invoice_id: string | null;
  supplier_invoice_id: string | null;
  bank_account_id: string;
  amount: number;
  payment_date: string;
  journal_entry_id: string;
  status: "active" | "reversed";
  reversed_at: string | null;
  reversal_journal_entry_id: string | null;
  created_at: string;
};

export type AccountingPeriod = {
  id: string;
  owner_user_id: string;
  year: number;
  month: number;
  status: "open" | "closed";
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupplierInvoiceDraftLine = {
  localId: string;
  description: string;
  expenseAccountId: string;
  grossAmount: number;
  vatRate: number;
};
