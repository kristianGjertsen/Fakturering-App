import { Plus } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { EmptyState } from "../../../components/EmptyState";
import { Panel } from "../../../components/layout/Panel";
import type { InvoiceWithDetails } from "../../../types";
import { InvoiceList } from "../../Invoices/components/view/InvoiceList";

type RecentInvoicesPanelProps = {
  invoices: InvoiceWithDetails[];
  onCreateInvoice: () => void;
  onOpenInvoice: (invoiceId: string) => void;
};

export function RecentInvoicesPanel({
  invoices,
  onCreateInvoice,
  onOpenInvoice,
}: RecentInvoicesPanelProps) {
  return (
    <Panel as="div">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Siste fakturaer</h2>
          <p className="text-sm text-slate-600">De nyeste fakturaene du har opprettet.</p>
        </div>
        <AnimatedIconButton icon={Plus} onClick={onCreateInvoice}>
          Ny faktura
        </AnimatedIconButton>
      </div>

      <div className="mt-5">
        {invoices.length === 0 ? (
          <EmptyState
            title="Ingen fakturaer ennå"
            description="Opprett den første fakturaen når selskap og produkter er registrert."
          />
        ) : (
          <InvoiceList
            invoices={invoices}
            selectedId=""
            onSelect={onOpenInvoice}
            compact
            limit={6}
          />
        )}
      </div>
    </Panel>
  );
}
