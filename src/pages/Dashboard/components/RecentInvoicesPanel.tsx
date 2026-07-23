import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Panel } from "../../../components/layout/Panel";
import { formatCurrency } from "../../../lib/format";
import type { InvoiceWithDetails } from "../../../types";
import { INVOICE_STATUS_LABELS } from "../../Invoices/invoicePresentation";

type RecentInvoicesPanelProps = {
  invoices: InvoiceWithDetails[];
  onCreateInvoice: () => void;
};

export function RecentInvoicesPanel({ invoices, onCreateInvoice }: RecentInvoicesPanelProps) {
  return (
    <Panel as="div">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Siste fakturaer</h2>
          <p className="text-sm text-slate-600">De nyeste fakturaene du har opprettet.</p>
        </div>
        <Button onClick={onCreateInvoice}>Ny faktura</Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        {invoices.length === 0 ? (
          <EmptyState
            title="Ingen fakturaer ennå"
            description="Opprett den første fakturaen når selskap og produkter er registrert."
          />
        ) : (
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 pr-4 font-semibold">Faktura</th>
                <th className="py-3 pr-4 font-semibold">Selskap</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="py-3 pr-4 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50">
              {invoices.slice(0, 6).map((invoice) => (
                <tr key={invoice.id}>
                  <td className="py-3 pr-4">
                    <span className="block font-medium text-slate-950">
                      {invoice.title || invoice.invoice_number}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {invoice.invoice_number}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {invoice.company?.name ?? "Ukjent"}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {invoice.paid ? "Betalt" : INVOICE_STATUS_LABELS[invoice.status] || invoice.status}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium text-slate-950">
                    {formatCurrency(invoice.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
