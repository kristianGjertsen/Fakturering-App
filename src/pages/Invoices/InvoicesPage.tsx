import { useEffect, useMemo, useState } from "react";
import type { Company, InvoiceScheduleWithDetails, InvoiceWithDetails, Product } from "../../types";
import type { InvoiceInput } from "../../lib/data";
import { sendInvoiceEmail, updateInvoicePaid } from "../../lib/data";
import { formatCurrency, formatDate } from "../../lib/format";
import { createInvoicePdfBase64 } from "../../lib/pdf";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { DocumentBrowser, statusToneClasses, type DocumentBrowserItem, type StatusTone } from "../../components/DocumentBrowser";
import { PdfPreview } from "./InvoicesComponents/PdfPreview";
import { InvoiceBuilder } from "./InvoicesComponents/InvoiceBuilder";
import { scheduleToPreviewInvoice } from "../../lib/schedulePreview";

type InvoicesViewProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  schedules: InvoiceScheduleWithDetails[];
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

export default function InvoicesPage({
  companies,
  products,
  invoices,
  schedules,
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

  const displayedInvoices = useMemo(() => invoices.filter((invoice) => {
    if (invoice.status === "draft" || invoice.status === "sending") {
      return false;
    }

    if (invoice.schedule_id && !invoice.paid && !["sent", "reminded", "paid"].includes(invoice.status)) {
      return false;
    }

    return true;
  }), [invoices]);

  const scheduledPreviews = useMemo(
    () => schedules.map((schedule) => scheduleToPreviewInvoice(schedule)),
    [schedules],
  );

  const selectableInvoices = useMemo(
    () => [...scheduledPreviews, ...displayedInvoices].sort(
      (a, b) => new Date(b.scheduled_for ?? b.issue_date).getTime() - new Date(a.scheduled_for ?? a.issue_date).getTime(),
    ),
    [scheduledPreviews, displayedInvoices],
  );

  const browserItems = useMemo<DocumentBrowserItem[]>(() => [
    ...schedules.map((schedule) => {
      const preview = scheduleToPreviewInvoice(schedule);
      return {
        id: preview.id,
        companyId: schedule.company_id,
        companyName: schedule.company?.name ?? "Ukjent bedrift",
        title: "Planlagt faktura",
        subtitle: `Sendes ${formatDate(schedule.next_run_at)}`,
        statusLabel: "Planlagt",
        statusTone: "purple" as const,
        amount: Number(preview.total),
        date: schedule.next_run_at,
      };
    }),
    ...displayedInvoices.map((invoice) => ({
      id: invoice.id,
      companyId: invoice.company_id,
      companyName: invoice.company?.name ?? "Ukjent bedrift",
      title: invoice.invoice_number,
      subtitle: invoice.schedule_id ? "Gjentakende faktura" : "Enkeltfaktura",
      statusLabel: invoice.paid ? "Betalt" : statusLabels[invoice.status] ?? invoice.status,
      statusTone: invoiceStatusTone(invoice.status, invoice.paid),
      amount: Number(invoice.total),
      date: invoice.issue_date,
    })),
  ], [displayedInvoices, schedules]);

  useEffect(() => {
    if (!selectedInvoiceId && selectableInvoices[0]) {
      setSelectedInvoiceId(selectableInvoices[0].id);
    }

    if (selectedInvoiceId && !selectableInvoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId(selectableInvoices[0]?.id ?? "");
    }
  }, [selectableInvoices, selectedInvoiceId]);

  const selectedInvoice = selectableInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? selectableInvoices[0] ?? null;
  const selectedSchedule = selectedInvoice
    ? schedules.find((schedule) => `schedule-preview-${schedule.id}` === selectedInvoice.id) ?? null
    : null;

  async function handleDeleteSelectedInvoice() {
    if (!selectedInvoice || selectedSchedule) {
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
    if (!selectedInvoice || selectedSchedule) {
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
    if (!selectedInvoice || selectedSchedule) {
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
      description="Finn fakturaer etter bedrift, sorter listen og åpne en faktura for detaljer og PDF-forhåndsvisning."
      action={
        <Button onClick={() => setShowCreateForm((value) => !value)}>
          {showCreateForm ? "Skjul skjema" : "Ny faktura"}
        </Button>
      }
    />
  );

  if (showCreateForm) {
    return (
      <div className="space-y-6">
        {header}
        <InvoiceBuilder
          companies={companies}
          products={products}
          onCreateInvoice={async (input) => {
            await onCreateInvoice(input);
            setShowCreateForm(false);
          }}
          onOpenCompanies={onOpenCompanies}
        />
      </div>
    );
  }

  if (selectableInvoices.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState title="Ingen fakturaer" description="Lag en faktura, eller vent til en gjentakende faktura er sendt, så vises den her." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {sendMessage && <p className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-blue-900 shadow-sm">{sendMessage}</p>}

      <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <DocumentBrowser
          items={browserItems}
          selectedId={selectedInvoice?.id ?? ""}
          onSelect={setSelectedInvoiceId}
          searchPlaceholder="Søk etter faktura eller bedrift"
          itemLabel="fakturaer"
        />

        {selectedInvoice && (
          <div className="min-w-0 space-y-5">
            <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {selectedSchedule ? "Planlagt faktura" : selectedInvoice.invoice_number}
                  </h3>
                  <p className="text-sm text-slate-600">{selectedInvoice.company?.name ?? "Ukjent selskap"}</p>
                  <p className="text-sm text-slate-600">{selectedInvoice.company?.email ?? "!Mangler e-post!"}</p>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <p className="text-2xl font-semibold text-slate-950">{formatCurrency(selectedInvoice.total)}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusToneClasses[selectedSchedule ? "purple" : invoiceStatusTone(selectedInvoice.status, selectedInvoice.paid)]}`}>
                    {selectedSchedule ? "Planlagt" : selectedInvoice.paid ? "Betalt" : statusLabels[selectedInvoice.status] ?? selectedInvoice.status}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedSchedule ? (
                      <Button variant="secondary" disabled>
                        Planlagt
                      </Button>
                    ) : (
                      <Button
                        variant={selectedInvoice.paid ? "secondary" : "success"}
                        onClick={() => void handleTogglePaid()}
                        disabled={updatingPaidInvoiceId === selectedInvoice.id}
                      >
                        {updatingPaidInvoiceId === selectedInvoice.id
                          ? "Oppdaterer..."
                          : selectedInvoice.paid
                            ? "Marker som ubetalt"
                            : "Marker som betalt"}
                      </Button>
                    )}
                    {!selectedSchedule && (selectedInvoice.status === "draft" || selectedInvoice.status === "ready") && (
                      <Button
                        onClick={() => void handleSendSelectedInvoice("send")}
                        disabled={sendingInvoiceId === selectedInvoice.id}
                      >
                        {sendingInvoiceId === selectedInvoice.id ? "Sender..." : "Send faktura"}
                      </Button>
                    )}
                    {!selectedSchedule && selectedInvoice.status === "sent" && (
                      <Button
                        variant="danger"
                        onClick={() => void handleSendSelectedInvoice("remind")}
                        disabled={sendingInvoiceId === selectedInvoice.id}
                      >
                        {sendingInvoiceId === selectedInvoice.id ? "Sender..." : "Purre"}
                      </Button>
                    )}
                    {!selectedSchedule && (
                      <Button
                        variant="danger"
                        onClick={() => void handleDeleteSelectedInvoice()}
                        disabled={deletingInvoiceId === selectedInvoice.id}
                      >
                        {deletingInvoiceId === selectedInvoice.id ? "Sletter..." : "Slett faktura"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Fakturadato</dt>
                  <dd className="mt-1 font-medium text-slate-950">{formatDate(selectedInvoice.issue_date)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Forfall</dt>
                  <dd className="mt-1 font-medium text-slate-950">{formatDate(selectedInvoice.due_date)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Type</dt>
                  <dd className="mt-1 font-medium text-slate-950">
                    {selectedSchedule ? "Planlagt engangsutsending" : selectedInvoice.schedule_id ? "Gjentakende faktura" : "Enkeltfaktura"}
                  </dd>
                </div>
                {selectedSchedule && (
                  <div>
                    <dt className="text-slate-500">Planlagt utsending</dt>
                    <dd className="mt-1 font-medium text-slate-950">{formatDate(selectedSchedule.next_run_at)}</dd>
                  </div>
                )}
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

function invoiceStatusTone(status: InvoiceWithDetails["status"], paid: boolean): StatusTone {
  if (paid || status === "paid") return "success";
  if (status === "sent") return "info";
  if (status === "ready") return "warning";
  if (status === "reminded") return "purple";
  if (status === "cancelled") return "danger";
  return "neutral";
}
