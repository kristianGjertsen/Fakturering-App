import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, EyeOff } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../components/AnimatedIconButton";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { ConfirmDialog } from "../../components/layout/ConfirmDialog";
import { Notice } from "../../components/layout/Notice";
import type { CompanyLogoPreferenceInput, ProductInput } from "../../lib/data";
import type { Company, InvoiceWithDetails, Product } from "../../types";
import { CompanyInfo } from "./components/CompanyInfo";
import { CompanyInvoicesPanel } from "./components/CompanyInvoicesPanel";
import {
  CompanyLogo,
  NO_LOGO_FOUND_SOURCE,
} from "./components/CompanyLogo";
import { CompanyProducts } from "./components/CompanyProducts";
import { CompanyStatistics } from "./components/CompanyStatistics";
import { NewProductDialog } from "./components/NewProductDialog";

type CompanyPageProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  onCreateProduct: (input: ProductInput) => Promise<void>;
  onDeleteCompany: (companyId: string) => Promise<void>;
  onUpdateCompanyActive: (companyId: string, isActive: boolean) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
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
  onDeleteCompany,
  onUpdateCompanyActive,
  onDeleteProduct,
  onUpdateCompanyLogoPreference,
}: CompanyPageProps) {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [updatingLogo, setUpdatingLogo] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState(false);
  const [updatingCompanyActive, setUpdatingCompanyActive] = useState(false);
  const [showDeleteCompanyDialog, setShowDeleteCompanyDialog] = useState(false);
  const [showArchiveCompanyDialog, setShowArchiveCompanyDialog] = useState(false);
  const [rediscoverLogo, setRediscoverLogo] = useState(false);
  const [resolvedLogo, setResolvedLogo] = useState<{
    companyId: string;
    url: string;
  } | null>(null);
  const company = companies.find((item) => item.id === companyId) ?? null;

  useEffect(() => {
    setRediscoverLogo(false);
  }, [companyId]);

  if (!company) {
    return (
      <>
        <AnimatedIconButton icon={ArrowLeft} variant="secondary" onClick={() => navigate("/companies")}>
          Tilbake til selskaper
        </AnimatedIconButton>
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
  const companyHasInvoices = companyInvoices.length > 0;
  const displayedLogoUrl = currentCompany.logo_disabled
    ? null
    : resolvedLogo?.companyId === currentCompany.id
      ? resolvedLogo.url
      : currentCompany.logo_url;

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
            logo_url: currentCompany.logo_url,
            logo_source: currentCompany.logo_source,
          }
        : {
            logo_disabled: false,
            logo_url: currentCompany.logo_url,
            logo_source: currentCompany.logo_url
              ? currentCompany.logo_source
              : null,
          },
    );

    if (saved) {
      setResolvedLogo(null);
      setRediscoverLogo(!logoDisabled);
    }
  }

  async function handleDeleteProduct(productId: string) {
    setMessage("");

    try {
      await onDeleteProduct(productId);
      setMessage("Produktet er slettet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke slette produktet.");
      throw error;
    }
  }

  async function handleDeleteCompany() {
    setDeletingCompany(true);
    setMessage("");

    try {
      await onDeleteCompany(currentCompany.id);
      setShowDeleteCompanyDialog(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke slette firmaet.");
    } finally {
      setDeletingCompany(false);
    }
  }

  async function handleUpdateCompanyActive(isActive: boolean) {
    setUpdatingCompanyActive(true);
    setMessage("");

    try {
      await onUpdateCompanyActive(currentCompany.id, isActive);
      setShowArchiveCompanyDialog(false);
      setMessage(isActive ? "Firmaet er aktivert." : "Firmaet er satt som inaktivt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke oppdatere firmaet.");
    } finally {
      setUpdatingCompanyActive(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex w-full flex-col gap-2 sm:w-40">
          <CompanyLogo
            company={currentCompany}
            discover={rediscoverLogo}
            updating={updatingLogo}
            onLogoResolved={(source, logoBlob) => {
              setResolvedLogo({ companyId: currentCompany.id, url: source.src });
              void handleSaveLogoPreference({
                logo_disabled: false,
                logo_url: source.src,
                logo_source: source.label,
                logo_blob: logoBlob,
              });
            }}
            onLogoSearchExhausted={() => {
              setRediscoverLogo(false);
              void handleSaveLogoPreference({
                logo_disabled: false,
                logo_url: null,
                logo_source: NO_LOGO_FOUND_SOURCE,
              });
            }}
            onToggleLogoDisabled={(logoDisabled) => void handleToggleLogoDisabled(logoDisabled)}
          />

        </div>
        <div className="min-w-0 flex-1">
          <SectionHeader
            title={currentCompany.name}
            description="Selskapsinformasjon, produkter og tjenester."
            action={
              <div className="flex flex-wrap justify-end gap-2">
                {currentCompany.is_active ? (
                  <AnimatedIconButton
                    icon={companyHasInvoices ? EyeOff : Trash2}
                    variant={companyHasInvoices ? "secondary" : "danger"}
                    onClick={() =>
                      companyHasInvoices
                        ? setShowArchiveCompanyDialog(true)
                        : setShowDeleteCompanyDialog(true)
                    }
                    disabled={deletingCompany || updatingCompanyActive}
                  >
                    {companyHasInvoices ? "Sett inaktiv" : "Slett firma"}
                  </AnimatedIconButton>
                ) : (
                  <AnimatedIconButton
                    icon={Plus}
                    variant="secondary"
                    onClick={() => void handleUpdateCompanyActive(true)}
                    disabled={updatingCompanyActive}
                  >
                    {updatingCompanyActive ? "Aktiverer..." : "Aktiver firma"}
                  </AnimatedIconButton>
                )}
                <AnimatedIconButton icon={ArrowLeft} variant="secondary" onClick={() => navigate("/companies")}>
                  Tilbake
                </AnimatedIconButton>
              </div>
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
        onDeleteProduct={handleDeleteProduct}
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

      <ConfirmDialog
        open={showDeleteCompanyDialog}
        title="Slett firma"
        message={`Slette ${currentCompany.name}? Dette kan bare gjøres når firmaet ikke er brukt i fakturaer.`}
        confirmLabel={deletingCompany ? "Sletter..." : "Slett firma"}
        tone="danger"
        loading={deletingCompany}
        onCancel={() => setShowDeleteCompanyDialog(false)}
        onConfirm={() => void handleDeleteCompany()}
      />

      <ConfirmDialog
        open={showArchiveCompanyDialog}
        title="Sett firma inaktivt"
        message={`${currentCompany.name} er brukt i fakturaer og kan derfor ikke slettes. Sett firmaet som inaktivt? Det skjules fra fakturavalg og statistikk.`}
        confirmLabel={updatingCompanyActive ? "Lagrer..." : "Sett inaktiv"}
        tone="danger"
        loading={updatingCompanyActive}
        onCancel={() => setShowArchiveCompanyDialog(false)}
        onConfirm={() => void handleUpdateCompanyActive(false)}
      />
    </>
  );
}

function imageNameFromUrl(imageUrl: string) {
  try {
    const pathParts = new URL(imageUrl).pathname.split("/").filter(Boolean);
    return decodeURIComponent(pathParts[pathParts.length - 1] ?? imageUrl);
  } catch {
    const pathParts = imageUrl.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1] ?? imageUrl;
  }
}
