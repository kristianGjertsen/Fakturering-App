import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import type { CompanyLogoPreferenceInput, ProductInput } from "../../lib/data";
import type { Company, InvoiceWithDetails, Product } from "../../types";
import { CompanyInfo } from "./components/CompanyInfo";
import { CompanyInvoicesPanel } from "./components/CompanyInvoicesPanel";
import { CompanyLogo } from "./components/CompanyLogo";
import { CompanyProducts } from "./components/CompanyProducts";
import { CompanyStatistics } from "./components/CompanyStatistics";
import { NewProductDialog } from "./components/NewProductDialog";

type CompanyPageProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onUpdateCompanyLogoPreference: (
    companyId: string,
    input: CompanyLogoPreferenceInput,
  ) => Promise<void>;
};

export default function CompanyPage({
  companies,
  products,
  invoices,
  onCreateProduct,
  onUpdateCompanyLogoPreference,
}: CompanyPageProps) {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [updatingLogo, setUpdatingLogo] = useState(false);
  const company = companies.find((item) => item.id === companyId) ?? null;

  if (!company) {
    return (
      <>
        <Button variant="secondary" onClick={() => navigate("/companies")}>
          ← Tilbake til selskaper
        </Button>
        <EmptyState
          title="Fant ikke selskapet"
          description="Selskapet finnes ikke, eller du har ikke tilgang til det."
        />
      </>
    );
  }

  const currentCompany = company;
  const companyProducts = products.filter((product) => product.company_id === currentCompany.id);
  const companyInvoices = invoices.filter((invoice) => invoice.company_id === currentCompany.id);

  async function handleSaveLogoPreference(input: CompanyLogoPreferenceInput) {
    setUpdatingLogo(true);
    setMessage("");

    try {
      await onUpdateCompanyLogoPreference(currentCompany.id, input);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke oppdatere logo-innstilling.");
      return false;
    } finally {
      setUpdatingLogo(false);
    }
  }

  async function handleToggleLogoDisabled(logoDisabled: boolean) {
    const saved = await handleSaveLogoPreference(
      logoDisabled
        ? {
            logo_disabled: true,
            logo_url: null,
            logo_source: "fallback",
          }
        : {
            logo_disabled: false,
            logo_url: null,
            logo_source: null,
          },
    );

    if (saved) {
      setMessage(logoDisabled ? "Fallback-logo er lagret for dette selskapet." : "Logo hentes igjen for dette selskapet.");
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <CompanyLogo
          company={currentCompany}
          updating={updatingLogo}
          onLogoResolved={(source) => void handleSaveLogoPreference({
            logo_disabled: false,
            logo_url: source.src,
            logo_source: source.label,
          })}
          onToggleLogoDisabled={(logoDisabled) => void handleToggleLogoDisabled(logoDisabled)}
        />
        <div className="min-w-0 flex-1">
          <SectionHeader
            title={currentCompany.name}
            description="Selskapsinformasjon, produkter og tjenester."
            action={
              <Button variant="secondary" onClick={() => navigate("/companies")}>
                ← Tilbake
              </Button>
            }
          />
        </div>
      </div>

      <NewProductDialog
        open={showNewProduct}
        companyId={currentCompany.id}
        companyName={currentCompany.name}
        onClose={() => setShowNewProduct(false)}
        onCreateProduct={onCreateProduct}
        onMessage={setMessage}
      />

      {message && <Notice>{message}</Notice>}

      <CompanyStatistics invoices={companyInvoices} />
      <CompanyInfo company={currentCompany} />
      <CompanyProducts
        products={companyProducts}
        onAddProduct={() => setShowNewProduct(true)}
      />

      <CompanyInvoicesPanel
        companyName={currentCompany.name}
        invoices={companyInvoices}
        onOpenAllInvoices={() => navigate(`/invoices?companyId=${currentCompany.id}`)}
        onCreateInvoice={() => navigate(`/invoices?create=true&companyId=${currentCompany.id}`)}
        onOpenInvoice={(invoiceId) =>
          navigate(`/invoices?invoiceId=${invoiceId}&companyId=${currentCompany.id}`)
        }
      />
    </>
  );
}
