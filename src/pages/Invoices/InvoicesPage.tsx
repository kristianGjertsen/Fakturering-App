import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Plus } from "@animateicons/react/lucide";
import type {
  Company,
  AccountingAccount,
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
import { Modal } from "../../components/layout/Modal";
import { FormField } from "../../components/FormField";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { todayInputValue } from "../../lib/format";
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
  accountingAccounts: AccountingAccount[];
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
  accountingAccounts,
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
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInputValue());
  const accountingBankAccounts = accountingAccounts.filter((account) =>
    account.is_active && account.category === "asset" && account.system_key === "bank",
  );
  const [paymentAccountId, setPaymentAccountId] = useState(
    accountingBankAccounts[0]?.id ?? "",
  );

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

  function handleTogglePaid() {
    if (!selectedInvoice || selectedInvoiceSchedule) return;
    openPaymentDialog(selectedInvoice.id, selectedInvoice.paid_at ?? todayInputValue());
  }

  function handleMarkInvoicePaid(invoiceId: string) {
    const invoice = visibleInvoices.find((item) => item.id === invoiceId);
    if (
      !invoice
      || invoice.paid
      || invoice.status === "paid"
      || !["sent", "reminded"].includes(invoice.status)
    ) {
      return;
    }

    openPaymentDialog(invoiceId, todayInputValue());
  }

  function openPaymentDialog(invoiceId: string, date: string) {
    setActionMessage("");
    setPaymentInvoiceId(invoiceId);
    setPaymentDate(date);
    setPaymentAccountId(accountingBankAccounts[0]?.id ?? "");
  }

  async function handleSavePayment() {
    const invoice = invoices.find((item) => item.id === paymentInvoiceId);
    if (!invoice) return;

    setUpdatingPaidInvoiceId(invoice.id);
    setActionMessage("");
    try {
      await updateInvoicePaid(
        invoice.id,
        !invoice.paid,
        paymentDate,
        invoice.paid ? null : paymentAccountId || null,
      );
      await onRefreshInvoices();
      setPaymentInvoiceId("");
      setActionMessage(invoice.paid
        ? "Betalingen er korrigert med et motbilag."
        : "Betalingen er bokført.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Kunne ikke bokføre betalingen.");
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
        title={selectedInvoiceSchedule ? "Gjentagende fakturaplan" : "Faktura"}
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
            onTogglePaid={handleTogglePaid}
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

      <Modal
        open={Boolean(paymentInvoiceId)}
        onClose={() => !updatingPaidInvoiceId && setPaymentInvoiceId("")}
        title={invoices.find((invoice) => invoice.id === paymentInvoiceId)?.paid
          ? "Korriger betaling"
          : "Registrer innbetaling"}
        description={invoices.find((invoice) => invoice.id === paymentInvoiceId)?.paid
          ? "Det opprinnelige bilaget beholdes og korrigeres med et motbilag."
          : "Betalingen bokføres mot bank og kundefordringer."}
        labelledBy="sales-payment-title"
      >
        <div className="space-y-4">
          {actionMessage && <Notice tone="danger">{actionMessage}</Notice>}
          <FormField label={invoices.find((invoice) => invoice.id === paymentInvoiceId)?.paid
            ? "Korreksjonsdato"
            : "Betalingsdato"}
          >
            <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </FormField>
          {!invoices.find((invoice) => invoice.id === paymentInvoiceId)?.paid && (
            <FormField label="Mottatt på konto">
              <Select
                ariaLabel="Konto for innbetaling"
                value={paymentAccountId}
                options={accountingBankAccounts.map((account) => ({
                  value: account.id,
                  label: `${account.account_number} ${account.name}`,
                }))}
                onChange={setPaymentAccountId}
              />
            </FormField>
          )}
          <div className="flex justify-end gap-2 border-t border-blue-100 pt-4">
            <Button variant="secondary" disabled={Boolean(updatingPaidInvoiceId)} onClick={() => setPaymentInvoiceId("")}>Avbryt</Button>
            <Button disabled={Boolean(updatingPaidInvoiceId) || !paymentDate} onClick={() => void handleSavePayment()}>
              {updatingPaidInvoiceId ? "Bokfører..." : invoices.find((invoice) => invoice.id === paymentInvoiceId)?.paid ? "Opprett motbilag" : "Bokfør betaling"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
