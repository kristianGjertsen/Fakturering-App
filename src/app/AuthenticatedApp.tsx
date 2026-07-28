import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { PageLayout } from "../components/layout/PageLayout";
import {
  createCompany,
  createInvoice,
  createProduct,
  deleteInvoice,
  type CompanyInput,
  type CompanyLogoPreferenceInput,
  type InvoiceInput,
  type ProductInput,
  updateCompanyLogoPreference,
} from "../lib/data";
import { supabase } from "../supabaseClient";
import {
  AuthenticatedAppError,
  AuthenticatedAppLoading,
} from "./AuthenticatedAppFeedback";
import { AuthenticatedRoutes } from "./AuthenticatedRoutes";
import { useAppData } from "./useAppData";

type AuthenticatedAppProps = {
  session: Session;
};

export default function AuthenticatedApp({ session }: AuthenticatedAppProps) {
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    error,
    refreshData,
    updateCompanyInData,
  } = useAppData(session.user.id);

  async function handleCreateCompany(input: CompanyInput) {
    await createCompany(session.user.id, input);
    await refreshData();
  }

  async function handleCreateProduct(input: ProductInput) {
    await createProduct(input);
    await refreshData();
  }

  async function handleUpdateCompanyLogoPreference(
    companyId: string,
    input: CompanyLogoPreferenceInput,
  ) {
    const savedPreference = await updateCompanyLogoPreference(companyId, input);
    updateCompanyInData(companyId, savedPreference);
  }

  async function handleCreateInvoice(input: Omit<InvoiceInput, "ownerUserId">) {
    const createdId = await createInvoice({
      ...input,
      ownerUserId: session.user.id,
    });
    await refreshData();

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
    await refreshData();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <AppLayout>
      {error && <AuthenticatedAppError message={error} />}
      {isLoading ? (
        <AuthenticatedAppLoading />
      ) : (
        <PageLayout>
          <AuthenticatedRoutes
            session={session}
            data={data}
            onCreateCompany={handleCreateCompany}
            onCreateProduct={handleCreateProduct}
            onUpdateCompanyLogoPreference={handleUpdateCompanyLogoPreference}
            onCreateInvoice={handleCreateInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onRefreshInvoices={refreshData}
            onSignOut={handleSignOut}
          />
        </PageLayout>
      )}
    </AppLayout>
  );
}
