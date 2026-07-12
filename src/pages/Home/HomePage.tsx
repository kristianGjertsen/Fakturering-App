import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppLayout } from "../../components/AppLayout";
import { supabase } from "../../supabaseClient";
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
} from "../../lib/data";
import CompaniesPage from "../Companies/CompaniesPage";
import DashboardPage from "../Dashboard/DashboardPage";
import InvoicesPage from "../Invoices/InvoicesPage";
import ProfilePage from "../Profile/ProfilePage";
import RecurringPage from "../Recurring/RecurringPage";
import { HomePageError, HomePageLoading } from "./HomePageComponents";

type HomePageProps = { session: Session };

const emptyData: AppData = { companies: [], products: [], invoices: [], schedules: [] };

export default function HomePage({ session }: HomePageProps) {
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
    await createInvoice({ ...input, ownerUserId: session.user.id });
    await loadData();
    navigate(input.repeat.enabled ? "/recurring" : "/invoices");
  }

  async function handleDeleteInvoice(invoiceId: string) {
    await deleteInvoice(invoiceId);
    await loadData();
  }

  return (
    <AppLayout>
      {error && <HomePageError message={error} />}
      {loading ? (
        <HomePageLoading />
      ) : (
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                companies={data.companies}
                products={data.products}
                invoices={data.invoices}
                schedules={data.schedules}
                onCreateInvoice={() => navigate("/invoices")}
              />
            }
          />
          <Route
            path="/companies"
            element={
              <CompaniesPage
                companies={data.companies}
                products={data.products}
                onCreateCompany={handleCreateCompany}
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
                currentUserEmail={session.user.email}
                onCreateInvoice={handleCreateInvoice}
                onOpenCompanies={() => navigate("/companies")}
                onRefreshInvoices={loadData}
                onDeleteInvoice={handleDeleteInvoice}
              />
            }
          />
          <Route path="/recurring" element={<RecurringPage schedules={data.schedules} />} />
          <Route
            path="/profile"
            element={<ProfilePage session={session} onSignOut={() => supabase.auth.signOut().then(() => undefined)} />}
          />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      )}
    </AppLayout>
  );
}
