import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type {
  Company,
  InvoiceDraftLine,
  PdfTemplate,
  Product,
  ProfileBankAccount,
} from "../../../../types";
import type { InvoiceInput } from "../../../../lib/data";
import { validateAttachmentFiles } from "../../../../lib/attachments";
import { todayInputValue } from "../../../../lib/format";
import { calculateTotals } from "../../../../lib/invoiceMath";
import { FormField } from "../../../../components/FormField";
import { inputClass, Input } from "../../../../components/Input";
import { Button } from "../../../../components/Button";
import { SectionHeader } from "../../../../components/SectionHeader";
import { Panel } from "../../../../components/layout/Panel";
import { Notice } from "../../../../components/layout/Notice";
import { InvoicePdfPreview } from "../preview/InvoicePdfPreview";
import { InvoicePdfTemplateSelector } from "./InvoicePdfTemplateSelector";
import { UnregisteredRecipientDialog } from "./UnregisteredRecipientDialog";
import { InvoiceLinesEditor } from "./InvoiceLinesEditor";
import { InvoiceInformationPanel } from "./InvoiceInformationPanel";
import {
  InvoiceRecurrencePanel,
  InvoiceTotalsPanel,
  InvoiceTypePanel,
} from "./InvoiceBuilderSections";
import {
  addDaysToDate,
  createDefaultRepeatDraft,
  createDraftAttachment,
  createEmptyInvoiceLine,
  createInvoicePreview,
  getTotalAttachmentBytes,
  isSubmittableInvoiceLine,
  type InvoiceKind,
  type RecipientMode,
} from "../../invoiceBuilderModel";
import { Select } from "../../../../components/Select";

type InvoiceBuilderProps = {
  companies: Company[];
  bankAccounts: ProfileBankAccount[];
  products: Product[];
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<string>;
  onOpenCompanies: () => void;
  initialCompanyId?: string;
};

export function InvoiceBuilder({
  companies,
  bankAccounts,
  products,
  onCreateInvoice,
  onOpenCompanies,
  initialCompanyId = "",
}: InvoiceBuilderProps) {
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>("single");
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("company");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [showUnregisteredRecipientDialog, setShowUnregisteredRecipientDialog] = useState(
    () => companies.length === 0,
  );
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [issueDate, setIssueDate] = useState(todayInputValue);
  const [paymentTermsDays, setPaymentTermsDays] = useState(14);
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentInfoText, setPaymentInfoText] = useState("");
  const [kidEnabled, setKidEnabled] = useState(false);
  const [kidNumber, setKidNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>("classic");
  const [lines, setLines] = useState<InvoiceDraftLine[]>([createEmptyInvoiceLine()]);
  const [repeat, setRepeat] = useState(createDefaultRepeatDraft);
  const [scheduleOnce, setScheduleOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (recipientMode === "company" && !companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId, recipientMode]);

  useEffect(() => {
    if (!bankAccounts.length) {
      setBankAccountId("");
      setPaymentInfoText("");
      return;
    }

    if (!bankAccountId || !bankAccounts.some((account) => account.id === bankAccountId)) {
      const firstAccount = bankAccounts[0];
      setBankAccountId(firstAccount.id);
      setPaymentInfoText(createPaymentInfoText(firstAccount));
    }
  }, [bankAccountId, bankAccounts]);

  const companyProducts = products.filter((product) => product.company_id === companyId);
  const totals = calculateTotals(lines);
  const selectedCompany = companies.find((company) => company.id === companyId) ?? null;
  const invoiceNotes = createInvoiceNotes({
    kidEnabled,
    kidNumber,
    notes,
    paymentInfoText,
  });
  const dueDate = addDaysToDate(issueDate, paymentTermsDays);
  const previewInvoice = createInvoicePreview({
    companyId,
    dueDate,
    invoiceKind,
    invoiceTitle,
    issueDate,
    lines,
    notes: invoiceNotes,
    pdfTemplate,
    recipientEmail,
    recipientMode,
    recipientName,
    repeat,
    scheduleOnce,
    selectedCompany,
    totals,
  });

  function handleCompanyChange(nextCompanyId: string) {
    setRecipientMode("company");
    setCompanyId(nextCompanyId);
    setRecipientName("");
    setRecipientEmail("");
    setLines([createEmptyInvoiceLine()]);
  }

  function handleBankAccountChange(nextBankAccountId: string) {
    const nextBankAccount = bankAccounts.find((account) => account.id === nextBankAccountId) ?? null;

    setBankAccountId(nextBankAccountId);
    setPaymentInfoText(nextBankAccount ? createPaymentInfoText(nextBankAccount) : "");
  }

  function continueWithUnregisteredRecipient() {
    setRecipientMode("guest");
    setCompanyId("");
    setInvoiceKind("single");
    setScheduleOnce(false);
    setLines([createEmptyInvoiceLine()]);
    setShowUnregisteredRecipientDialog(false);
  }

  function updateLine(localId: string, patch: Partial<InvoiceDraftLine>) {
    setLines((currentLines) =>
      currentLines.map((line) => (line.localId === localId ? { ...line, ...patch } : line))
    );
  }

  function addManualLine() {
    setLines((currentLines) => [...currentLines, createEmptyInvoiceLine()]);
  }

  function addLineWithAttachments(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    const validationError = validateAttachmentFiles(files, getTotalAttachmentBytes(lines));

    if (validationError) {
      setMessage(validationError);
      return;
    }

    const attachments = files.map(createDraftAttachment);
    setLines((currentLines) => {
      const lastLine = currentLines[currentLines.length - 1];

      if (
        lastLine &&
        !lastLine.productId &&
        !lastLine.description.trim() &&
        lastLine.attachments.length === 0
      ) {
        return currentLines.map((line) =>
          line.localId === lastLine.localId ? { ...line, attachments } : line
        );
      }

      const line = createEmptyInvoiceLine();
      line.attachments = attachments;
      return [...currentLines, line];
    });
    setMessage("");
  }

  function addAttachmentsToLine(localId: string, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    const validationError = validateAttachmentFiles(files, getTotalAttachmentBytes(lines));

    if (validationError) {
      setMessage(validationError);
      return;
    }

    const attachments = files.map(createDraftAttachment);
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.localId === localId
          ? { ...line, attachments: [...line.attachments, ...attachments] }
          : line
      )
    );
    setMessage("");
  }

  function removeAttachment(lineId: string, attachmentId: string) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.localId === lineId
          ? {
            ...line,
            attachments: line.attachments.filter((attachment) => attachment.localId !== attachmentId),
          }
          : line
      )
    );
  }

  function removeLine(localId: string) {
    setLines((currentLines) =>
      currentLines.length === 1
        ? [createEmptyInvoiceLine()]
        : currentLines.filter((line) => line.localId !== localId)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const validLines = lines.filter(isSubmittableInvoiceLine);

    if (recipientMode === "company" && !companyId) {
      setMessage("Velg et selskap før du lagrer fakturaen.");
      return;
    }

    if (recipientMode === "guest" && !recipientEmail.trim()) {
      setMessage("Oppgi e-postadressen til mottakeren.");
      return;
    }

    if (recipientMode === "guest" && (invoiceKind === "recurring" || scheduleOnce)) {
      setMessage("Engangskunder kan bare brukes på fakturaer som lagres nå.");
      return;
    }

    if (validLines.length === 0) {
      setMessage("Legg inn minst én fakturalinje.");
      return;
    }

    if (invoiceKind === "single" && scheduleOnce && !selectedCompany?.email) {
      setMessage("Selskapet må ha en e-postadresse før fakturaen kan planlegges.");
      return;
    }

    setSaving(true);

    try {
      await onCreateInvoice({
        companyId: companyId || null,
        recipientName,
        recipientEmail,
        invoiceTitle,
        issueDate,
        dueDate,
        notes: invoiceNotes,
        pdfTemplate,
        lines: validLines,
        repeat: { ...repeat, enabled: invoiceKind === "recurring", autoSend: true },
        scheduleOnce: {
          enabled: invoiceKind === "single" && scheduleOnce,
        },
      });

      setMessage(
        invoiceKind === "recurring"
          ? "Gjentakende faktura lagret. Første faktura opprettes ved utsending."
          : scheduleOnce
            ? "Fakturaen er planlagt og opprettes på fakturadatoen."
            : "Faktura lagret.",
      );
      setInvoiceTitle("");
      setIssueDate(todayInputValue());
      setPaymentTermsDays(14);
      setNotes("");
      setBankAccountId(bankAccounts[0]?.id ?? "");
      setPaymentInfoText(bankAccounts[0] ? createPaymentInfoText(bankAccounts[0]) : "");
      setKidEnabled(false);
      setKidNumber("");
      setPdfTemplate("classic");
      setLines([createEmptyInvoiceLine()]);
      setRepeat(createDefaultRepeatDraft());
      setScheduleOnce(false);
      setInvoiceKind("single");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre fakturaen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <UnregisteredRecipientDialog
        open={showUnregisteredRecipientDialog}
        onCancel={() => setShowUnregisteredRecipientDialog(false)}
        onCreateCompany={onOpenCompanies}
        onContinue={continueWithUnregisteredRecipient}
      />
      <SectionHeader
        title="Ny faktura"
        description="Velg et selskap, fyll inn produkter eller manuelle linjer, og lagre fakturaen i Supabase."
        action={
          <Button type="submit" disabled={saving}>
            {saving
              ? "Lagrer..."
              : invoiceKind === "recurring"
                ? "Lagre gjentakelse"
                : scheduleOnce
                  ? "Planlegg faktura"
                  : "Lagre faktura"}
          </Button>
        }
      />

      {message && <Notice>{message}</Notice>}

      <InvoiceTypePanel
        value={invoiceKind}
        recurringDisabled={recipientMode === "guest"}
        onChange={(nextInvoiceKind) => {
          setInvoiceKind(nextInvoiceKind);
          if (nextInvoiceKind === "recurring") setScheduleOnce(false);
        }}
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <InvoiceInformationPanel
            companies={companies}
            companyId={companyId}
            dueDate={dueDate}
            invoiceKind={invoiceKind}
            invoiceTitle={invoiceTitle}
            issueDate={issueDate}
            paymentTermsDays={paymentTermsDays}
            recipientEmail={recipientEmail}
            recipientMode={recipientMode}
            recipientName={recipientName}
            scheduleOnce={scheduleOnce}
            onCompanyChange={handleCompanyChange}
            onInvoiceTitleChange={setInvoiceTitle}
            onIssueDateChange={setIssueDate}
            onPaymentTermsDaysChange={setPaymentTermsDays}
            onRecipientEmailChange={setRecipientEmail}
            onRecipientNameChange={setRecipientName}
            onRequestUnregisteredRecipient={() => setShowUnregisteredRecipientDialog(true)}
            onScheduleOnceChange={setScheduleOnce}
          />
          <InvoiceLinesEditor
            lines={lines}
            products={companyProducts}
            onAddLine={addManualLine}
            onAddLineWithAttachments={addLineWithAttachments}
            onAddAttachments={addAttachmentsToLine}
            onRemoveAttachment={removeAttachment}
            onRemoveLine={removeLine}
            onUpdateLine={updateLine}
          />
          <Panel>
            <FormField
              label="Betaling til"
              helper={
                bankAccounts.length > 0
                  ? "Valgt konto legges inn på fakturaen."
                  : "Legg inn bankkonto under Profil for å velge konto her."
              }
            >
              <Select
                ariaLabel="Betaling til"
                value={bankAccountId}
                options={[
                  ...(bankAccounts.length === 0
                    ? [{ value: "", label: "Ingen registrerte kontoer", disabled: true }]
                    : []),
                  ...bankAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.account_name} - ${account.account_number}`,
                  })),
                ]}
                onChange={handleBankAccountChange}
                disabled={bankAccounts.length === 0}
              />
            </FormField>

            <FormField label="Betalingstekst">
              <Input
                value={paymentInfoText}
                onChange={(event) => setPaymentInfoText(event.target.value)}
                placeholder="Betaling til kontonummer 1234.56.78901"
              />
            </FormField>

            <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
              <Input
                type="checkbox"
                className="h-4 w-4 rounded border-blue-200 text-blue-700 focus:ring-blue-100"
                checked={kidEnabled}
                onChange={(event) => setKidEnabled(event.target.checked)}
              />
              KID
            </label>

            {kidEnabled && (
              <FormField label="KID">
                <Input
                  value={kidNumber}
                  onChange={(event) => setKidNumber(event.target.value)}
                  placeholder="Skriv inn KID"
                />
              </FormField>
            )}

            <FormField label="Notat på faktura">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel className="space-y-4">
            <InvoicePdfTemplateSelector value={pdfTemplate} onChange={setPdfTemplate} />
            <InvoicePdfPreview invoice={previewInvoice} compact />
          </Panel>

          <InvoiceTotalsPanel totals={totals} />

          {invoiceKind === "recurring" && (
            <InvoiceRecurrencePanel repeat={repeat} onChange={setRepeat} />
          )}
        </aside>
      </section>
    </form>
  );
}

function createPaymentInfoText(bankAccount: ProfileBankAccount) {
  return `Betaling til kontonummer ${bankAccount.account_number}`;
}

function createInvoiceNotes({
  kidEnabled,
  kidNumber,
  notes,
  paymentInfoText,
}: {
  kidEnabled: boolean;
  kidNumber: string;
  notes: string;
  paymentInfoText: string;
}) {
  return [
    paymentInfoText.trim(),
    kidEnabled && kidNumber.trim() ? `KID: ${kidNumber.trim()}` : "",
    notes.trim(),
  ].filter(Boolean).join("\n\n");
}
