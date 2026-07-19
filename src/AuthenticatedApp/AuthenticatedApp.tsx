import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { PageLayout } from "../components/layout/PageLayout";
import { supabase } from "../supabaseClient";
import {
  createCompany,
  createInvoice,
  createProduct,
  deleteInvoice,
  fetchAppData,
  type AppData,
  type CompanyInput,
  type InvoiceInput,
  type ProductInput,
} from "../lib/data";
import CompaniesPage from "../pages/Companies/CompaniesPage";
import CompanyPage from "../pages/Company/CompanyPage";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import InvoicesPage from "../pages/Invoices/InvoicesPage";
import ProfilePage from "../pages/Profile/ProfilePage";
import RecurringPage from "../pages/Recurring/RecurringPage";
import { AuthenticatedAppError, AuthenticatedAppLoading } from "./AuthenticatedAppFeedback";

type AuthenticatedAppProps = { session: Session };

const emptyData: AppData = { companies: [], products: [], invoices: [], schedules: [] };

export default function AuthenticatedApp({ session }: AuthenticatedAppProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAppData());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente data fra Supabase.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateCompany(input: CompanyInput) {
    await createCompany(session.user.id, input);
    await loadData();
  }

  async function handleCreateProduct(input: ProductInput) {
    await createProduct(input);
    await loadData();
  }

  async function handleCreateInvoice(input: Omit<InvoiceInput, "ownerUserId">) {
    const createdId = await createInvoice({ ...input, ownerUserId: session.user.id });
    await loadData();

    if (input.repeat.enabled) {
      navigate(`/recurring?scheduleId=${createdId}`);
    } else if (input.scheduleOnce.enabled) {
      navigate(`/invoices?invoiceId=schedule-preview-${createdId}`);
    } else {
      navigate(`/invoices?invoiceId=${createdId}`);
    }

    return createdId;
  }

  async function handleDeleteInvoice(invoiceId: string) {
    await deleteInvoice(invoiceId);
    await loadData();
  }

  return (
    <AppLayout>
      {error && <AuthenticatedAppError message={error} />}
      {loading ? (
        <AuthenticatedAppLoading />
      ) : (
        <PageLayout>
          <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                companies={data.companies}
                products={data.products}
                invoices={data.invoices}
                schedules={data.schedules.filter((schedule) => schedule.schedule_type !== "once")}
                onCreateInvoice={() => navigate("/invoices?create=true")}
              />
            }
          />
          <Route
            path="/companies"
            element={
              <CompaniesPage
                companies={data.companies}
                onCreateCompany={handleCreateCompany}
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
                onCreateProduct={handleCreateProduct}
              />
            }
          />
          <Route
            path="/invoices"
            element={
              <InvoicesPage
                companies={data.companies}
                products={data.products}
                invoices={data.invoices}
                schedules={data.schedules.filter((schedule) => schedule.schedule_type === "once")}
                currentUserEmail={session.user.email}
                onCreateInvoice={handleCreateInvoice}
                onOpenCompanies={() => navigate("/companies")}
                onRefreshInvoices={loadData}
                onDeleteInvoice={handleDeleteInvoice}
              />
            }
          />
          <Route
            path="/recurring"
            element={<RecurringPage schedules={data.schedules.filter((schedule) => schedule.schedule_type !== "once")} />}
          />
          <Route
            path="/profile"
            element={<ProfilePage session={session} onSignOut={() => supabase.auth.signOut().then(() => undefined)} />}
          />
          <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </PageLayout>
      )}
    </AppLayout>
  );
}
