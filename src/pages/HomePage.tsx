import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import type { AppView } from "../components/AppLayout";
import { AppLayout } from "../components/AppLayout";
import { CompaniesView } from "../components/CompaniesView";
import { DashboardView } from "../components/DashboardView";
import { InvoicesView } from "../components/InvoicesView";
import { RecurringView } from "../components/RecurringView";
import {
  createCompany,
  deleteInvoice,
  createInvoice,
  createProduct,
  fetchAppData,
  type AppData,
  type CompanyInput,
  type InvoiceInput,
  type ProductInput,
} from "../lib/data";

type HomePageProps = {
  session: Session;
};

const emptyData: AppData = {
  companies: [],
  products: [],
  invoices: [],
  schedules: [],
};

export default function HomePage({ session }: HomePageProps) {
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const nextData = await fetchAppData();
      setData(nextData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente data fra Supabase.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

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
    setActiveView("invoices");
  }

  async function handleDeleteInvoice(invoiceId: string) {
    await deleteInvoice(invoiceId);
    await loadData();
  }

  return (
    <AppLayout session={session} activeView={activeView} onViewChange={setActiveView} onSignOut={handleSignOut}>
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid min-h-[360px] place-items-center rounded-lg border border-blue-100 bg-white text-sm text-slate-600 shadow-sm">
          Laster data...
        </div>
      ) : (
        <>
          {activeView === "dashboard" && (
            <DashboardView
              companies={data.companies}
              products={data.products}
              invoices={data.invoices}
              schedules={data.schedules}
              onCreateInvoice={() => setActiveView("invoices")}
            />
          )}

          {activeView === "companies" && (
            <CompaniesView
              companies={data.companies}
              products={data.products}
              onCreateCompany={handleCreateCompany}
              onCreateProduct={handleCreateProduct}
            />
          )}

          {activeView === "invoices" && (
            <InvoicesView
              companies={data.companies}
              products={data.products}
              invoices={data.invoices}
              onCreateInvoice={handleCreateInvoice}
              onOpenCompanies={() => setActiveView("companies")}
              onRefreshInvoices={loadData}
              onDeleteInvoice={handleDeleteInvoice}
            />
          )}

          {activeView === "recurring" && <RecurringView schedules={data.schedules} />}
        </>
      )}
    </AppLayout>
  );
}
