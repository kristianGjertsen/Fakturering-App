import { createClient } from "jsr:@supabase/supabase-js@2";
import type { PdfTemplate } from "../_shared/invoice-pdf.ts";

export type SupabaseClient = ReturnType<typeof createClient>;

export type Schedule = {
  id: string;
  next_run_at: string;
  owner_user_id: string;
  title: string;
};

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
  sort_order?: number;
};

export type StoredAttachment = {
  id: string;
  invoice_item_id: string;
  storage_path: string;
  original_name: string;
  created_at: string;
};

export type ClaimedInvoice = {
  id: string;
  owner_user_id: string;
  pdf_template?: PdfTemplate;
  invoice_number: string;
  pdf_storage_path?: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company: {
    name: string;
    email: string | null;
  } | null;
  invoice_items: InvoiceItem[];
  invoice_attachments: StoredAttachment[];
};

export type ProcessingFailure = {
  scheduleId: string;
  message: string;
};
