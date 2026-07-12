import { useEffect, useState } from "react";
import type { Company, InvoiceWithDetails, Product } from "../types";
import type { InvoiceInput } from "../lib/data";
import { sendInvoiceEmail, updateInvoicePaid } from "../lib/data";
import { formatCurrency, formatDate } from "../lib/format";
import { createInvoicePdfBase64 } from "../lib/pdf";
import { EmptyState } from "./EmptyState";
import { buttonPrimaryClass, buttonSecondaryClass } from "./FormField";
import { SectionHeader } from "./SectionHeader";
import { PdfPreview } from "./PdfPreview";
import { InvoiceBuilder } from "./InvoiceBuilder";

type InvoicesViewProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  currentUserEmail: string | null | undefined;
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<void>;
  onOpenCompanies: () => void;
  onRefreshInvoices: () => Promise<void>;
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  sending: "Sendes",
  ready: "Klar",
  sent: "Sendt",
  reminded: "Purret",
  paid: "Betalt",
  cancelled: "Kansellert",
};

export function InvoicesView({
  companies,
  products,
  invoices,
  currentUserEmail,
  onCreateInvoice,
  onOpenCompanies,
  onRefreshInvoices,
  onDeleteInvoice,
}: InvoicesViewProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [deletingInvoiceId, setDeletingInvoiceId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");
  const [updatingPaidInvoiceId, setUpdatingPaidInvoiceId] = useState("");
  const [sendMessage, setSendMessage] = useState("");

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

  async function handleSendSelectedInvoice(action: "send" | "remind") {
    if (!selectedInvoice) {
      return;
    }

    if (action === "send" && selectedInvoice.status !== "draft" && selectedInvoice.status !== "ready") {
      setSendMessage("Fakturaen er allerede sendt.");
      return;
    }

    if (action === "remind" && selectedInvoice.status !== "sent") {
      setSendMessage("Fakturaen kan ikke purres flere ganger.");
      return;
    }

    if (!selectedInvoice.company?.email) {
      setSendMessage("Valgt selskap mangler e-postadresse.");
      return;
    }

    setSendingInvoiceId(selectedInvoice.id);
    setSendMessage("");

    try {
      const attachmentContent = await createInvoicePdfBase64(selectedInvoice);
      const invoiceSubject = `Faktura ${selectedInvoice.invoice_number}`;
      const invoiceHtml = `<p>Hei${selectedInvoice.company.name ? ` ${selectedInvoice.company.name}` : ""}, vedlagt ligger faktura ${selectedInvoice.invoice_number}.</p>`;

      await sendInvoiceEmail({
        recipientEmail: selectedInvoice.company.email,
        subject: invoiceSubject,
        html: invoiceHtml,
        attachmentFilename: `faktura-${selectedInvoice.invoice_number}.pdf`,
        attachmentContent,
        markStatus: {
          invoiceId: selectedInvoice.id,
          status: action === "send" ? "sent" : "reminded",
        },
      });

      if (currentUserEmail) {
        await sendInvoiceEmail({
          recipientEmail: currentUserEmail,
          subject: `Copy: ${invoiceSubject}`,
          html: `<p>Copy av sendt faktura til ${selectedInvoice.company.email}.</p>${invoiceHtml}`,
          attachmentFilename: `faktura-${selectedInvoice.invoice_number}.pdf`,
          attachmentContent,
        });
      }

      await onRefreshInvoices();
      setSendMessage(
        currentUserEmail
          ? `${action === "send" ? "Faktura sendt" : "Purring sendt"} til ${selectedInvoice.company.email}, og kopi sendt til ${currentUserEmail}.`
          : `${action === "send" ? "Faktura sendt" : "Purring sendt"} til ${selectedInvoice.company.email}.`
      );
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : action === "send" ? "Kunne ikke sende faktura." : "Kunne ikke sende purring.");
    } finally {
      setSendingInvoiceId("");
    }
  }

  async function handleTogglePaid() {
    if (!selectedInvoice) {
      return;
    }

    setUpdatingPaidInvoiceId(selectedInvoice.id);
    setSendMessage("");

    try {
      await updateInvoicePaid(selectedInvoice.id, !selectedInvoice.paid);
      await onRefreshInvoices();
      setSendMessage(selectedInvoice.paid ? "Fakturaen er markert som ubetalt." : "Fakturaen er markert som betalt.");
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : "Kunne ikke oppdatere betalingsstatus.");
    } finally {
      setUpdatingPaidInvoiceId("");
    }
  }

  const header = (
    <SectionHeader
      title="Fakturaer"
      description="Lag nye fakturaer og velg en faktura for detaljer og PDF-forhandsvisning."
      action={
        <button className={buttonPrimaryClass} type="button" onClick={() => setShowCreateForm((value) => !value)}>
          {showCreateForm ? "Skjul skjema" : "Ny faktura"}
        </button>
      }
    />
  );

  if (invoices.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        {showCreateForm ? (
          <InvoiceBuilder
            companies={companies}
            products={products}
            onCreateInvoice={async (input) => {
              await onCreateInvoice(input);
              setShowCreateForm(false);
            }}
            onOpenCompanies={onOpenCompanies}
          />
        ) : (
          <EmptyState title="Ingen fakturaer" description="Lag en faktura her, sa vises den i listen med en gang." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {showCreateForm && (
        <InvoiceBuilder
          companies={companies}
          products={products}
          onCreateInvoice={async (input) => {
            await onCreateInvoice(input);
            setShowCreateForm(false);
          }}
          onOpenCompanies={onOpenCompanies}
        />
      )}

      {sendMessage && <p className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-blue-900 shadow-sm">{sendMessage}</p>}

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
                    {invoice.paid ? "Betalt" : statusLabels[invoice.status] ?? invoice.status}
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
                  <p className="text-sm text-slate-600">{selectedInvoice.company?.email ?? "!Mangler e-post!"}</p>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <p className="text-2xl font-semibold text-slate-950">{formatCurrency(selectedInvoice.total)}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={buttonSecondaryClass}
                      type="button"
                      onClick={() => void handleTogglePaid()}
                      disabled={updatingPaidInvoiceId === selectedInvoice.id}
                    >
                      {updatingPaidInvoiceId === selectedInvoice.id
                        ? "Oppdaterer..."
                        : selectedInvoice.paid
                          ? "Marker som ubetalt"
                          : "Marker som betalt"}
                    </button>
                    {(selectedInvoice.status === "draft" || selectedInvoice.status === "ready") && (
                      <button
                        className={buttonPrimaryClass}
                        type="button"
                        onClick={() => void handleSendSelectedInvoice("send")}
                        disabled={sendingInvoiceId === selectedInvoice.id}
                      >
                        {sendingInvoiceId === selectedInvoice.id ? "Sender..." : "Send faktura"}
                      </button>
                    )}
                    {selectedInvoice.status === "sent" && (
                      <button
                        className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={() => void handleSendSelectedInvoice("remind")}
                        disabled={sendingInvoiceId === selectedInvoice.id}
                      >
                        {sendingInvoiceId === selectedInvoice.id ? "Sender..." : "Purre"}
                      </button>
                    )}
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
