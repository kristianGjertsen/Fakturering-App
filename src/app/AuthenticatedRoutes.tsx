import type { Session } from "@supabase/supabase-js";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type {
  AppData,
  CompanyInput,
  CompanyLogoPreferenceInput,
  InvoiceInput,
  ProductInput,
} from "../lib/data";
import CompaniesPage from "../pages/Companies/CompaniesPage";
import CompanyPage from "../pages/Company/CompanyPage";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import InvoicesPage from "../pages/Invoices/InvoicesPage";
import ProfilePage from "../pages/Profile/ProfilePage";
import RecurringPage from "../pages/Recurring/RecurringPage";
import AccountingPage from "../pages/Accounting/AccountingPage";

type AuthenticatedRoutesProps = {
  session: Session;
  data: AppData;
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateCompanyActive: (companyId: string, isActive: boolean) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onUpdateCompanyLogoPreference: (
    companyId: string,
    input: CompanyLogoPreferenceInput,
  ) => Promise<void>;
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<string>;
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
  onRefreshInvoices: () => Promise<void>;
  onUpdateProfile: (profilePatch: Partial<AppData["profile"]>) => void;
  onSignOut: () => Promise<void>;
};

export function AuthenticatedRoutes({
  session,
  data,
  onCreateCompany,
  onDeleteCompany,
  onUpdateCompanyActive,
  onCreateProduct,
  onDeleteProduct,
  onUpdateCompanyLogoPreference,
  onCreateInvoice,
  onDeleteInvoice,
  onRefreshInvoices,
  onUpdateProfile,
  onSignOut,
}: AuthenticatedRoutesProps) {
  const navigate = useNavigate();
  const activeCompanies = data.companies.filter((company) => company.is_active !== false);
  const activeCompanyIds = new Set(activeCompanies.map((company) => company.id));
  const activeProducts = data.products.filter((product) => activeCompanyIds.has(product.company_id));
  const recurringSchedules = data.schedules.filter(
    (schedule) => schedule.schedule_type !== "once",
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <DashboardPage
            companies={activeCompanies}
            products={activeProducts}
            invoices={data.invoices}
            schedules={recurringSchedules}
            onCreateInvoice={() => navigate("/invoices?create=true")}
            onOpenInvoice={(invoiceId) => navigate(`/invoices?invoiceId=${invoiceId}`)}
          />
        }
      />
      <Route
        path="/companies"
        element={
          <CompaniesPage
            companies={data.companies}
            onCreateCompany={onCreateCompany}
            onOpenCompany={(companyId) => navigate(`/companies/${companyId}`)}
            onUpdateCompanyLogoPreference={onUpdateCompanyLogoPreference}
          />
        }
      />
      <Route
        path="/companies/:companyId"
        element={
          <CompanyPage
            companies={data.companies}
            products={data.products}
            invoices={data.invoices}
            onCreateProduct={onCreateProduct}
            onDeleteCompany={onDeleteCompany}
            onUpdateCompanyActive={onUpdateCompanyActive}
            onDeleteProduct={onDeleteProduct}
            onUpdateCompanyLogoPreference={onUpdateCompanyLogoPreference}
          />
        }
      />
      <Route
        path="/invoices"
        element={
          <InvoicesPage
            companies={activeCompanies}
            bankAccounts={data.bankAccounts}
            accountingAccounts={data.accounting.accounts}
            sellerProfile={data.profile}
            products={activeProducts}
            invoices={data.invoices}
            schedules={data.schedules}
            currentUserEmail={session.user.email}
            onCreateInvoice={onCreateInvoice}
            onOpenCompanies={() => navigate("/companies")}
            onRefreshInvoices={onRefreshInvoices}
            onDeleteInvoice={onDeleteInvoice}
          />
        }
      />
      <Route
        path="/recurring"
        element={<RecurringPage schedules={recurringSchedules} sellerProfile={data.profile} />}
      />
      <Route
        path="/profile"
        element={
          <ProfilePage
            session={session}
            profile={data.profile}
            invoices={data.invoices}
            onUpdateProfile={onUpdateProfile}
            onSignOut={onSignOut}
          />
        }
      />
      <Route
        path="/accounting"
        element={
          <AccountingPage
            ownerUserId={session.user.id}
            accounting={data.accounting}
            salesInvoices={data.invoices}
            onRefresh={onRefreshInvoices}
          />
        }
      />
      <Route
        path="/payments/incoming"
        element={
          <AccountingPage
            ownerUserId={session.user.id}
            accounting={data.accounting}
            salesInvoices={data.invoices}
            onRefresh={onRefreshInvoices}
            incomingPaymentsOnly
          />
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
