import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Plus } from "@animateicons/react/lucide";
import type {
  Company,
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
  Product,
  Profile,
  ProfileBankAccount,
} from "../../types";
import type { InvoiceInput } from "../../lib/data";
import { sendInvoiceEmail, updateInvoicePaid } from "../../lib/data";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/Button";
import { AnimatedIconButton } from "../../components/AnimatedIconButton";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import { DetailModal } from "../../components/layout/DetailModal";
import { ConfirmDialog } from "../../components/layout/ConfirmDialog";
import { InvoiceBuilder } from "./components/invoice-builder/InvoiceBuilder";
import { InvoiceDetails } from "./components/view/InvoiceDetails";
import { InvoiceList } from "./components/view/InvoiceList";
import { scheduleToPreviewInvoice } from "../../lib/schedulePreview";
import type { InvoiceKind } from "./invoiceBuilderModel";
import {
  prepareInvoiceEmailDelivery,
  type InvoiceDeliveryAction,
} from "./invoiceDelivery";
import { getVisibleInvoices } from "./invoicePresentation";

type InvoicesLocationState = {
  openCreateForm?: boolean;
  invoiceKind?: InvoiceKind;
};

type InvoicesPageProps = {
  companies: Company[];
  bankAccounts: ProfileBankAccount[];
  sellerProfile: Profile;
  products: Product[];
  invoices: InvoiceWithDetails[];
  schedules: InvoiceScheduleWithDetails[];
  currentUserEmail: string | null | undefined;
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<string>;
  onOpenCompanies: () => void;
  onRefreshInvoices: () => Promise<void>;
  onDeleteInvoice: (invoiceId: string) => Promise<void>;
};

export default function InvoicesPage({
  companies,
  bankAccounts,
  sellerProfile,
  products,
  invoices,
  schedules,
  currentUserEmail,
  onCreateInvoice,
  onOpenCompanies,
  onRefreshInvoices,
  onDeleteInvoice,
}: InvoicesPageProps) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilterId = searchParams.get("companyId") ?? "";
  const requestedInvoiceId = searchParams.get("invoiceId") ?? "";
  const routeState = location.state as InvoicesLocationState | null;
  const requestedCreateForm = routeState?.openCreateForm;
  const requestedInvoiceKind = routeState?.invoiceKind === "recurring"
    ? "recurring"
    : "single";
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(searchParams.get("invoiceId") ?? "");
  const [deletingInvoiceId, setDeletingInvoiceId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(
    requestedCreateForm ?? searchParams.get("create") === "true",
  );
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");
  const [updatingPaidInvoiceId, setUpdatingPaidInvoiceId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [showDeleteInvoiceDialog, setShowDeleteInvoiceDialog] = useState(false);

  const filteredInvoices = useMemo(
    () => companyFilterId ? invoices.filter((invoice) => invoice.company_id === companyFilterId) : invoices,
    [companyFilterId, invoices],
  );
  const filteredSchedules = useMemo(
    () => companyFilterId ? schedules.filter((schedule) => schedule.company_id === companyFilterId) : schedules,
    [companyFilterId, schedules],
  );
  const visibleInvoices = useMemo(() => getVisibleInvoices(filteredInvoices), [filteredInvoices]);
  const scheduledPreviews = useMemo(
    () => filteredSchedules.map((schedule) => scheduleToPreviewInvoice(schedule)),
    [filteredSchedules],
  );
  const availableInvoices = useMemo(
    () => [...scheduledPreviews, ...visibleInvoices].sort(
      (left, right) =>
        new Date(right.scheduled_for ?? right.issue_date).getTime()
        - new Date(left.scheduled_for ?? left.issue_date).getTime(),
    ),
    [scheduledPreviews, visibleInvoices],
  );

  useEffect(() => {
    if (typeof requestedCreateForm === "boolean") {
      setShowCreateForm(requestedCreateForm);
    }
  }, [location.key, requestedCreateForm]);

  useEffect(() => {
    if (!requestedInvoiceId) {
      if (selectedInvoiceId) {
        setSelectedInvoiceId("");
      }
      return;
    }

    if (
      requestedInvoiceId !== selectedInvoiceId &&
      availableInvoices.some((invoice) => invoice.id === requestedInvoiceId)
    ) {
      setSelectedInvoiceId(requestedInvoiceId);
      return;
    }

    if (
      selectedInvoiceId &&
      !availableInvoices.some((invoice) => invoice.id === selectedInvoiceId)
    ) {
      setSelectedInvoiceId("");
    }
  }, [availableInvoices, requestedInvoiceId, selectedInvoiceId]);

  const selectedInvoice = availableInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const selectedInvoiceSchedule = selectedInvoice
    ? filteredSchedules.find((schedule) => `schedule-preview-${schedule.id}` === selectedInvoice.id) ?? null
    : null;

  function selectInvoice(invoiceId: string) {
    const nextInvoiceId = selectedInvoiceId === invoiceId ? "" : invoiceId;
    updateInvoiceSelection(nextInvoiceId);
  }

  function closeInvoiceDetails() {
    updateInvoiceSelection("");
  }

  function updateInvoiceSelection(invoiceId: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      if (invoiceId) {
        next.set("invoiceId", invoiceId);
      } else {
        next.delete("invoiceId");
      }
      return next;
    }, { replace: true });
  }

  async function handleDeleteSelectedInvoice() {
    if (!selectedInvoice || selectedInvoiceSchedule) return;

    setDeletingInvoiceId(selectedInvoice.id);
    try {
      await onDeleteInvoice(selectedInvoice.id);
      setShowDeleteInvoiceDialog(false);
      closeInvoiceDetails();
    } finally {
      setDeletingInvoiceId("");
    }
  }

  async function handleSendSelectedInvoice(action: InvoiceDeliveryAction) {
    if (!selectedInvoice || selectedInvoiceSchedule) return;

    if (action === "send" && !["draft", "ready"].includes(selectedInvoice.status)) {
      setActionMessage("Fakturaen er allerede sendt.");
      return;
    }

    if (action === "remind" && selectedInvoice.status !== "sent") {
      setActionMessage("Fakturaen kan ikke purres flere ganger.");
      return;
    }

    const recipientEmail = selectedInvoice.recipient_email ?? selectedInvoice.company?.email;
    const recipientName = selectedInvoice.recipient_name || selectedInvoice.company?.name || "";

    if (!recipientEmail) {
      setActionMessage("Fakturaen mangler mottakerens e-postadresse.");
      return;
    }

    setSendingInvoiceId(selectedInvoice.id);
    setActionMessage("");

    try {
      const { attachments, html, subject } = await prepareInvoiceEmailDelivery(
        selectedInvoice,
        sellerProfile,
        action,
        recipientName,
      );

      await sendInvoiceEmail({
        recipientEmail,
        subject,
        html,
        attachments,
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
          attachments,
        });
      }

      await onRefreshInvoices();
      setActionMessage(
        currentUserEmail
          ? `${action === "send" ? "Faktura sendt" : "Purring sendt"} til ${recipientEmail}, og kopi sendt til ${currentUserEmail}.`
          : `${action === "send" ? "Faktura sendt" : "Purring sendt"} til ${recipientEmail}.`,
      );
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Kunne ikke sende fakturaen.");
    } finally {
      setSendingInvoiceId("");
    }
  }

  async function handleTogglePaid() {
    if (!selectedInvoice || selectedInvoiceSchedule) return;

    setUpdatingPaidInvoiceId(selectedInvoice.id);
    setActionMessage("");
    try {
      await updateInvoicePaid(selectedInvoice.id, !selectedInvoice.paid);
      await onRefreshInvoices();
      setActionMessage(selectedInvoice.paid ? "Fakturaen er markert som ubetalt." : "Fakturaen er markert som betalt.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Kunne ikke oppdatere betalingsstatus.");
    } finally {
      setUpdatingPaidInvoiceId("");
    }
  }

  async function handleMarkInvoicePaid(invoiceId: string) {
    const invoice = visibleInvoices.find((item) => item.id === invoiceId);
    if (
      !invoice
      || invoice.paid
      || invoice.status === "paid"
      || !["sent", "reminded"].includes(invoice.status)
    ) {
      return;
    }

    setUpdatingPaidInvoiceId(invoiceId);
    setActionMessage("");
    try {
      await updateInvoicePaid(invoiceId, true);
      await onRefreshInvoices();
      setActionMessage("Fakturaen er markert som betalt.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Kunne ikke oppdatere betalingsstatus.");
    } finally {
      setUpdatingPaidInvoiceId("");
    }
  }

  const pageHeader = (
    <div>
      
      <SectionHeader
        title="Fakturaer"
        description={"Finn fakturaer etter bedrift, sorter listen og åpne en faktura for detaljer og PDF-forhåndsvisning."}
        action={!showCreateForm ? (
          <AnimatedIconButton icon={Plus} onClick={() => setShowCreateForm((value) => !value)}>
            Ny faktura
          </AnimatedIconButton>
        ) : undefined}
      />
    </div>
  );

  if (showCreateForm) {
    return (
      <>
        {showCreateForm ? null : pageHeader}
        <InvoiceBuilder
          companies={companies}
          bankAccounts={bankAccounts}
          sellerProfile={sellerProfile}
          products={products}
          initialCompanyId={companyFilterId}
          initialInvoiceKind={requestedInvoiceKind}
          onCreateInvoice={async (input) => {
            const createdId = await onCreateInvoice(input);
            setShowCreateForm(false);
            return createdId;
          }}
          onDiscardDraft={() => setShowCreateForm(false)}
          onOpenCompanies={onOpenCompanies}
        />
      </>
    );
  }

  if (availableInvoices.length === 0) {
    return (
      <>
        {pageHeader}
        <EmptyState title="Ingen fakturaer" description="Lag en faktura, eller vent til en planlagt faktura er sendt." />
      </>
    );
  }

  return (
    <>
      {pageHeader}

      {actionMessage && !selectedInvoice && (
        <Notice>
          {actionMessage}
        </Notice>
      )}

      <InvoiceList
        invoices={visibleInvoices}
        schedules={filteredSchedules}
        selectedId={selectedInvoiceId}
        onSelect={selectInvoice}
        onMarkPaid={(invoiceId) => void handleMarkInvoicePaid(invoiceId)}
        markingPaidId={updatingPaidInvoiceId}
      />

      <DetailModal
        open={Boolean(selectedInvoice)}
        onClose={closeInvoiceDetails}
        ariaLabel={selectedInvoice
          ? `Fakturadetaljer for ${selectedInvoice.title || selectedInvoice.invoice_number}`
          : "Fakturadetaljer"}
      >
        {actionMessage && <Notice className="mb-5">{actionMessage}</Notice>}
        {selectedInvoice && (
          <InvoiceDetails
            invoice={selectedInvoice}
            sellerProfile={sellerProfile}
            schedule={selectedInvoiceSchedule}
            deleting={deletingInvoiceId === selectedInvoice.id}
            sending={sendingInvoiceId === selectedInvoice.id}
            updatingPaid={updatingPaidInvoiceId === selectedInvoice.id}
            onDelete={() => setShowDeleteInvoiceDialog(true)}
            onSend={(action) => void handleSendSelectedInvoice(action)}
            onTogglePaid={() => void handleTogglePaid()}
          />
        )}
      </DetailModal>

      <ConfirmDialog
        open={Boolean(selectedInvoice && showDeleteInvoiceDialog)}
        title="Slett faktura"
        message={`Slette ${selectedInvoice?.invoice_number ? `faktura ${selectedInvoice.invoice_number}` : "utkastet"}?`}
        confirmLabel={deletingInvoiceId ? "Sletter..." : "Slett"}
        tone="danger"
        loading={Boolean(deletingInvoiceId)}
        onCancel={() => setShowDeleteInvoiceDialog(false)}
        onConfirm={() => void handleDeleteSelectedInvoice()}
      />
    </>
  );
}
