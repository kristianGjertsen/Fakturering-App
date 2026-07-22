import type {
  Company,
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
  Product,
} from "../types";
import { fetchCompanies } from "./companyData";
import { fetchInvoices, fetchSchedules } from "./invoiceData";
import { fetchProducts } from "./productData";

export {
  createCompany,
  fetchCompanies,
} from "./companyData";
export type { CompanyInput } from "./companyData";
export {
  deleteInvoice,
  fetchInvoices,
  fetchSchedules,
  finalizeInvoice,
  createInvoice,
  lockInvoicePdf,
  updateInvoicePaid,
} from "./invoiceData";
export type { InvoiceInput } from "./invoiceData";
export {
  downloadInvoiceAttachment,
  loadInvoiceEmailAttachments,
  sendInvoiceEmail,
} from "./invoiceEmail";
export {
  deleteCurrentUser,
  ensureProfile,
  fetchProfileDetails,
  saveProfileDetails,
} from "./profileData";
export type { ProfileDetailsInput } from "./profileData";
export {
  createProduct,
  fetchProducts,
} from "./productData";
export type { ProductInput } from "./productData";

export type AppData = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  schedules: InvoiceScheduleWithDetails[];
};

export async function fetchAppData(): Promise<AppData> {
  const [companies, products, invoices, schedules] = await Promise.all([
    fetchCompanies(),
    fetchProducts(),
    fetchInvoices(),
    fetchSchedules(),
  ]);

  return { companies, products, invoices, schedules };
}
