import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SectionHeader } from "../../components/SectionHeader";
import { Panel } from "../../components/layout/Panel";
import { Notice } from "../../components/layout/Notice";
import type { ProductInput } from "../../lib/data";
import type { Company, InvoiceWithDetails, Product } from "../../types";
import { InvoiceList } from "../Invoices/InvoicesComponents/InvoiceList";
import { CompanyInfo } from "./CompanyComponents/CompanyInfo";
import { CompanyProducts } from "./CompanyComponents/CompanyProducts";
import { CompanyStatistics } from "./CompanyComponents/CompanyStatistics";
import { NewProductDialog } from "./CompanyComponents/NewProductDialog";

type CompanyPageProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  onCreateProduct: (input: ProductInput) => Promise<void>;
};

export default function CompanyPage({ companies, products, invoices, onCreateProduct }: CompanyPageProps) {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const company = companies.find((item) => item.id === companyId) ?? null;

  if (!company) {
    return (
      <>
        <Button variant="secondary" onClick={() => navigate("/companies")}>← Tilbake til selskaper</Button>
        <EmptyState title="Fant ikke selskapet" description="Selskapet finnes ikke, eller du har ikke tilgang til det." />
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
        action={<Button variant="secondary" onClick={() => navigate("/companies")}>← Tilbake</Button>}
      />

      <NewProductDialog
        open={showNewProduct}
        companyId={company.id}
        companyName={company.name}
        onClose={() => setShowNewProduct(false)}
        onCreateProduct={onCreateProduct}
        onMessage={setMessage}
      />

      {message && (
        <Notice>
          {message}
        </Notice>
      )}

      <CompanyStatistics invoices={companyInvoices} />
      <CompanyInfo company={company} />
      <CompanyProducts
        products={companyProducts}
        onAddProduct={() => setShowNewProduct(true)}
      />

      <Panel>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Fakturaer</h3>
            <p className="mt-1 text-sm text-slate-600">De siste fakturaene som tilhører {company.name}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/invoices?companyId=${company.id}`)}
            >
              Se alle fakturaer
            </Button>
            <Button onClick={() => navigate(`/invoices?create=true&companyId=${company.id}`)}>
              Ny faktura
            </Button>
          </div>
        </div>
        <InvoiceList
          invoices={companyInvoices}
          selectedId=""
          onSelect={(invoiceId) => navigate(`/invoices?invoiceId=${invoiceId}&companyId=${company.id}`)}
          compact
          limit={5}
        />
      </Panel>
    </>
  );
}
