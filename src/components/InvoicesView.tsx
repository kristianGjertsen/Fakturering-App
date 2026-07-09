import { useEffect, useState } from "react";
import type { InvoiceWithDetails } from "../types";
import { formatCurrency, formatDate } from "../lib/format";
import { EmptyState } from "./EmptyState";
import { buttonSecondaryClass } from "./FormField";
import { SectionHeader } from "./SectionHeader";
import { PdfPreview } from "./PdfPreview";

type InvoicesViewProps = {
  invoices: InvoiceWithDetails[];
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  ready: "Klar",
  sent: "Sendt",
  paid: "Betalt",
  cancelled: "Kansellert",
};

export function InvoicesView({ invoices, onDeleteInvoice }: InvoicesViewProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [deletingInvoiceId, setDeletingInvoiceId] = useState("");

  useEffect(() => {
    if (!selectedInvoiceId && invoices[0]) {
      setSelectedInvoiceId(invoices[0].id);
    }

    if (selectedInvoiceId && !invoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId(invoices[0]?.id ?? "");
    }
  }, [invoices, selectedInvoiceId]);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0] ?? null;

  async function handleDeleteSelectedInvoice() {
    if (!selectedInvoice) {
      return;
    }

    const confirmed = window.confirm(`Slette faktura ${selectedInvoice.invoice_number}?`);

    if (!confirmed) {
      return;
    }

    setDeletingInvoiceId(selectedInvoice.id);

    try {
      await onDeleteInvoice(selectedInvoice.id);
    } finally {
      setDeletingInvoiceId("");
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Fakturaer" description="Alle fakturaer som er lagret i Supabase vises her." />
        <EmptyState title="Ingen fakturaer" description="Lag en faktura først. Når den er lagret kan du se PDF og detaljer her." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Fakturaer" description="Velg en faktura for detaljer og PDF-forhåndsvisning." />

      <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <button
                key={invoice.id}
                className={`w-full rounded-lg border p-4 text-left transition ${
                  selectedInvoice?.id === invoice.id
                    ? "border-blue-400 bg-blue-50"
                    : "border-blue-100 bg-white hover:border-blue-300"
                }`}
                type="button"
                onClick={() => setSelectedInvoiceId(invoice.id)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-slate-950">{invoice.invoice_number}</span>
                    <span className="mt-1 block text-sm text-slate-600">{invoice.company?.name ?? "Ukjent selskap"}</span>
                  </span>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-blue-800 ring-1 ring-blue-100">
                    {statusLabels[invoice.status] ?? invoice.status}
                  </span>
                </span>
                <span className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">{formatDate(invoice.issue_date)}</span>
                  <span className="font-semibold text-slate-950">{formatCurrency(invoice.total)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {selectedInvoice && (
          <div className="space-y-5">
            <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{selectedInvoice.invoice_number}</h3>
                  <p className="text-sm text-slate-600">{selectedInvoice.company?.name ?? "Ukjent selskap"}</p>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <p className="text-2xl font-semibold text-slate-950">{formatCurrency(selectedInvoice.total)}</p>
                  <button
                    className={buttonSecondaryClass}
                    type="button"
                    onClick={() => void handleDeleteSelectedInvoice()}
                    disabled={deletingInvoiceId === selectedInvoice.id}
                  >
                    {deletingInvoiceId === selectedInvoice.id ? "Sletter..." : "Slett faktura"}
                  </button>
                </div>
              </div>

              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500">Fakturadato</dt>
                  <dd className="mt-1 font-medium text-slate-950">{formatDate(selectedInvoice.issue_date)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Forfall</dt>
                  <dd className="mt-1 font-medium text-slate-950">{formatDate(selectedInvoice.due_date)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Gjentakelse</dt>
                  <dd className="mt-1 font-medium text-slate-950">{selectedInvoice.schedule_id ? "Ja" : "Nei"}</dd>
                </div>
              </dl>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-3 pr-4 font-semibold">Tekst</th>
                      <th className="py-3 pr-4 text-right font-semibold">Antall</th>
                      <th className="py-3 pr-4 text-right font-semibold">Pris</th>
                      <th className="py-3 pr-4 text-right font-semibold">MVA</th>
                      <th className="py-3 pr-4 text-right font-semibold">Sum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {[...(selectedInvoice.invoice_items ?? [])]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 pr-4 font-medium text-slate-950">{item.description}</td>
                          <td className="py-3 pr-4 text-right text-slate-600">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-600">{formatCurrency(item.unit_price)}</td>
                          <td className="py-3 pr-4 text-right text-slate-600">{item.vat_rate}%</td>
                          <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatCurrency(item.line_total)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
              <PdfPreview invoice={selectedInvoice} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
