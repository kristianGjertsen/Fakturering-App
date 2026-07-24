import type {
  Company,
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
  ProfileBankAccount,
  Product,
} from "../types";
import { fetchCompanies } from "./companyData";
import { fetchInvoices, fetchSchedules } from "./invoiceData";
import { fetchProducts } from "./productData";
import { fetchProfileDetails } from "./profileData";

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
  bankAccounts: ProfileBankAccount[];
};

export async function fetchAppData(userId: string): Promise<AppData> {
  const [companies, products, invoices, schedules, profileDetails] = await Promise.all([
    fetchCompanies(),
    fetchProducts(),
    fetchInvoices(),
    fetchSchedules(),
    fetchProfileDetails(userId),
  ]);

  return {
    companies,
    products,
    invoices,
    schedules,
    bankAccounts: profileDetails.bankAccounts,
  };
}
