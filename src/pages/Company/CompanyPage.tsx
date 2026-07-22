import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import type { ProductInput } from "../../lib/data";
import type { Company, InvoiceWithDetails, Product } from "../../types";
import { CompanyInfo } from "./components/CompanyInfo";
import { CompanyInvoicesPanel } from "./components/CompanyInvoicesPanel";
import { CompanyProducts } from "./components/CompanyProducts";
import { CompanyStatistics } from "./components/CompanyStatistics";
import { NewProductDialog } from "./components/NewProductDialog";

type CompanyPageProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  onCreateProduct: (input: ProductInput) => Promise<void>;
};

export default function CompanyPage({
  companies,
  products,
  invoices,
  onCreateProduct,
}: CompanyPageProps) {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
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

  const companyProducts = products.filter((product) => product.company_id === company.id);
  const companyInvoices = invoices.filter((invoice) => invoice.company_id === company.id);

  return (
    <>
      <SectionHeader
        title={company.name}
        description="Selskapsinformasjon, produkter og tjenester."
        action={
          <Button variant="secondary" onClick={() => navigate("/companies")}>
            ← Tilbake
          </Button>
        }
      />

      <NewProductDialog
        open={showNewProduct}
        companyId={company.id}
        companyName={company.name}
        onClose={() => setShowNewProduct(false)}
        onCreateProduct={onCreateProduct}
        onMessage={setMessage}
      />

      {message && <Notice>{message}</Notice>}

      <CompanyStatistics invoices={companyInvoices} />
      <CompanyInfo company={company} />
      <CompanyProducts
        products={companyProducts}
        onAddProduct={() => setShowNewProduct(true)}
      />

      <CompanyInvoicesPanel
        companyName={company.name}
        invoices={companyInvoices}
        onOpenAllInvoices={() => navigate(`/invoices?companyId=${company.id}`)}
        onCreateInvoice={() => navigate(`/invoices?create=true&companyId=${company.id}`)}
        onOpenInvoice={(invoiceId) =>
          navigate(`/invoices?invoiceId=${invoiceId}&companyId=${company.id}`)
        }
      />
    </>
  );
}
