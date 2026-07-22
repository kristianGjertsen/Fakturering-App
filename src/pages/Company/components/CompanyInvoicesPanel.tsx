import { Button } from "../../../components/Button";
import { Panel } from "../../../components/layout/Panel";
import type { InvoiceWithDetails } from "../../../types";
import { InvoiceList } from "../../Invoices/components/InvoiceList";

type CompanyInvoicesPanelProps = {
  companyName: string;
  invoices: InvoiceWithDetails[];
  onCreateInvoice: () => void;
  onOpenAllInvoices: () => void;
  onOpenInvoice: (invoiceId: string) => void;
};

export function CompanyInvoicesPanel({
  companyName,
  invoices,
  onCreateInvoice,
  onOpenAllInvoices,
  onOpenInvoice,
}: CompanyInvoicesPanelProps) {
  return (
    <Panel>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Fakturaer</h3>
          <p className="mt-1 text-sm text-slate-600">
            De siste fakturaene som tilhører {companyName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onOpenAllInvoices}>
            Se alle fakturaer
          </Button>
          <Button onClick={onCreateInvoice}>Ny faktura</Button>
        </div>
      </div>
      <InvoiceList
        invoices={invoices}
        selectedId=""
        onSelect={onOpenInvoice}
        compact
        limit={5}
      />
    </Panel>
  );
}
