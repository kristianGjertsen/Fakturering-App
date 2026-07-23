import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type {
  Company,
  InvoiceDraftLine,
  PdfTemplate,
  Product,
} from "../../../../types";
import type { InvoiceInput } from "../../../../lib/data";
import { validateAttachmentFiles } from "../../../../lib/attachments";
import { todayInputValue } from "../../../../lib/format";
import { calculateTotals } from "../../../../lib/invoiceMath";
import { FormField } from "../../../../components/FormField";
import { inputClass } from "../../../../components/Input";
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

type InvoiceBuilderProps = {
  companies: Company[];
  products: Product[];
  onCreateInvoice: (input: Omit<InvoiceInput, "ownerUserId">) => Promise<string>;
  onOpenCompanies: () => void;
  initialCompanyId?: string;
};

export function InvoiceBuilder({ companies, products, onCreateInvoice, onOpenCompanies, initialCompanyId = "" }: InvoiceBuilderProps) {
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

  const companyProducts = products.filter((product) => product.company_id === companyId);
  const totals = calculateTotals(lines);
  const selectedCompany = companies.find((company) => company.id === companyId) ?? null;
  const dueDate = addDaysToDate(issueDate, paymentTermsDays);
  const previewInvoice = createInvoicePreview({
    companyId,
    dueDate,
    invoiceKind,
    invoiceTitle,
    issueDate,
    lines,
    notes,
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
        notes,
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
