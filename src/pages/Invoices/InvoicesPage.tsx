import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Company, InvoiceScheduleWithDetails, InvoiceWithDetails, Product } from "../../types";
import type { InvoiceInput } from "../../lib/data";
import { sendInvoiceEmail, updateInvoicePaid } from "../../lib/data";
import { createInvoicePdfBase64 } from "../../lib/pdf";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { InvoiceBuilder } from "./InvoicesComponents/InvoiceBuilder";
import { InvoiceDetails } from "./InvoicesComponents/InvoiceDetails";
import { getVisibleInvoices, InvoiceList } from "./InvoicesComponents/InvoiceList";
import { scheduleToPreviewInvoice } from "../../lib/schedulePreview";

type InvoicesPageProps = {
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
}: InvoicesPageProps) {
  const [searchParams] = useSearchParams();
  const companyFilterId = searchParams.get("companyId") ?? "";
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(searchParams.get("invoiceId") ?? "");
  const [deletingInvoiceId, setDeletingInvoiceId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(searchParams.get("create") === "true");
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");
  const [updatingPaidInvoiceId, setUpdatingPaidInvoiceId] = useState("");
  const [sendMessage, setSendMessage] = useState("");

  const pageInvoices = useMemo(
    () => companyFilterId ? invoices.filter((invoice) => invoice.company_id === companyFilterId) : invoices,
    [companyFilterId, invoices],
  );
  const pageSchedules = useMemo(
    () => companyFilterId ? schedules.filter((schedule) => schedule.company_id === companyFilterId) : schedules,
    [companyFilterId, schedules],
  );
  const displayedInvoices = useMemo(() => getVisibleInvoices(pageInvoices), [pageInvoices]);
  const scheduledPreviews = useMemo(
    () => pageSchedules.map((schedule) => scheduleToPreviewInvoice(schedule)),
    [pageSchedules],
  );
  const selectableInvoices = useMemo(
    () => [...scheduledPreviews, ...displayedInvoices].sort(
      (left, right) =>
        new Date(right.scheduled_for ?? right.issue_date).getTime()
        - new Date(left.scheduled_for ?? left.issue_date).getTime(),
    ),
    [scheduledPreviews, displayedInvoices],
  );

  useEffect(() => {
    if (!selectedInvoiceId && selectableInvoices[0]) {
      setSelectedInvoiceId(selectableInvoices[0].id);
    }

    if (selectedInvoiceId && !selectableInvoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId(selectableInvoices[0]?.id ?? "");
    }
  }, [selectableInvoices, selectedInvoiceId]);

  const selectedInvoice =
    selectableInvoices.find((invoice) => invoice.id === selectedInvoiceId)
    ?? selectableInvoices[0]
    ?? null;
  const selectedSchedule = selectedInvoice
    ? pageSchedules.find((schedule) => `schedule-preview-${schedule.id}` === selectedInvoice.id) ?? null
    : null;

  async function handleDeleteSelectedInvoice() {
    if (!selectedInvoice || selectedSchedule) return;
    if (!window.confirm(`Slette faktura ${selectedInvoice.invoice_number}?`)) return;

    setDeletingInvoiceId(selectedInvoice.id);
    try {
      await onDeleteInvoice(selectedInvoice.id);
    } finally {
      setDeletingInvoiceId("");
    }
  }

  async function handleSendSelectedInvoice(action: "send" | "remind") {
    if (!selectedInvoice || selectedSchedule) return;

    if (action === "send" && !["draft", "ready"].includes(selectedInvoice.status)) {
      setSendMessage("Fakturaen er allerede sendt.");
      return;
    }

    if (action === "remind" && selectedInvoice.status !== "sent") {
      setSendMessage("Fakturaen kan ikke purres flere ganger.");
      return;
    }

    const recipientEmail = selectedInvoice.recipient_email ?? selectedInvoice.company?.email;
    const recipientName = selectedInvoice.recipient_name || selectedInvoice.company?.name || "";

    if (!recipientEmail) {
      setSendMessage("Fakturaen mangler mottakerens e-postadresse.");
      return;
    }

    setSendingInvoiceId(selectedInvoice.id);
    setSendMessage("");

    try {
      const attachmentContent = await createInvoicePdfBase64(selectedInvoice);
      const subject = `Faktura ${selectedInvoice.invoice_number}`;
      const html = `<p>Hei${recipientName ? ` ${recipientName}` : ""}, vedlagt ligger faktura ${selectedInvoice.invoice_number}.</p>`;

      await sendInvoiceEmail({
        recipientEmail,
        subject,
        html,
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
          subject: `Copy: ${subject}`,
          html: `<p>Copy av sendt faktura til ${recipientEmail}.</p>${html}`,
          attachmentFilename: `faktura-${selectedInvoice.invoice_number}.pdf`,
          attachmentContent,
        });
      }

      await onRefreshInvoices();
      setSendMessage(
        currentUserEmail
          ? `${action === "send" ? "Faktura sendt" : "Purring sendt"} til ${recipientEmail}, og kopi sendt til ${currentUserEmail}.`
          : `${action === "send" ? "Faktura sendt" : "Purring sendt"} til ${recipientEmail}.`,
      );
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : "Kunne ikke sende fakturaen.");
    } finally {
      setSendingInvoiceId("");
    }
  }

  async function handleTogglePaid() {
    if (!selectedInvoice || selectedSchedule) return;

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
      description={companyFilterId
        ? "Viser fakturaer for valgt selskap."
        : "Finn fakturaer etter bedrift, sorter listen og åpne en faktura for detaljer og PDF-forhåndsvisning."}
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
          initialCompanyId={companyFilterId}
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
        <EmptyState title="Ingen fakturaer" description="Lag en faktura, eller vent til en planlagt faktura er sendt." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {sendMessage && (
        <p className="rounded-md border border-blue-100 bg-white px-4 py-3 text-sm text-blue-900 shadow-sm">
          {sendMessage}
        </p>
      )}

      <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <InvoiceList
          invoices={displayedInvoices}
          schedules={pageSchedules}
          selectedId={selectedInvoice?.id ?? ""}
          onSelect={setSelectedInvoiceId}
        />

        {selectedInvoice && (
          <InvoiceDetails
            invoice={selectedInvoice}
            schedule={selectedSchedule}
            deleting={deletingInvoiceId === selectedInvoice.id}
            sending={sendingInvoiceId === selectedInvoice.id}
            updatingPaid={updatingPaidInvoiceId === selectedInvoice.id}
            onDelete={() => void handleDeleteSelectedInvoice()}
            onSend={(action) => void handleSendSelectedInvoice(action)}
            onTogglePaid={() => void handleTogglePaid()}
          />
        )}
      </section>
    </div>
  );
}
