import type { Session } from "@supabase/supabase-js";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type {
  AppData,
  CompanyInput,
  InvoiceInput,
  ProductInput,
} from "../lib/data";
import CompaniesPage from "../pages/Companies/CompaniesPage";
import CompanyPage from "../pages/Company/CompanyPage";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import InvoicesPage from "../pages/Invoices/InvoicesPage";
import ProfilePage from "../pages/Profile/ProfilePage";
import RecurringPage from "../pages/Recurring/RecurringPage";

type AuthenticatedRoutesProps = {
  session: Session;
  data: AppData;
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<string>;
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
  onRefreshInvoices: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function AuthenticatedRoutes({
  session,
  data,
  onCreateCompany,
  onCreateProduct,
  onCreateInvoice,
  onDeleteInvoice,
  onRefreshInvoices,
  onSignOut,
}: AuthenticatedRoutesProps) {
  const navigate = useNavigate();
  const oneTimeSchedules = data.schedules.filter(
    (schedule) => schedule.schedule_type === "once",
  );
  const recurringSchedules = data.schedules.filter(
    (schedule) => schedule.schedule_type !== "once",
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <DashboardPage
            companies={data.companies}
            products={data.products}
            invoices={data.invoices}
            schedules={recurringSchedules}
            onCreateInvoice={() => navigate("/invoices?create=true")}
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
          />
        }
      />
      <Route
        path="/invoices"
        element={
          <InvoicesPage
            companies={data.companies}
            bankAccounts={data.bankAccounts}
            products={data.products}
            invoices={data.invoices}
            schedules={oneTimeSchedules}
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
        element={<RecurringPage schedules={recurringSchedules} />}
      />
      <Route
        path="/profile"
        element={<ProfilePage session={session} onSignOut={onSignOut} />}
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
