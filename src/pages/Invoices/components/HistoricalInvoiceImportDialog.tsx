import { useId, useMemo, useState, type FormEvent } from "react";
import { FileText, Plus, Trash2, Upload } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { Modal } from "../../../components/layout/Modal";
import { calculateSupplierLine, roundMoney } from "../../../lib/accounting";
import { formatFileSize } from "../../../lib/attachments";
import { countryOptions } from "../../../lib/countries";
import { formatCurrency, todayInputValue } from "../../../lib/format";
import { readHistoricalInvoicePdf } from "../../../lib/historicalInvoiceParser";
import { parseLocalizedMoney } from "../../../lib/supplierInvoiceParser";
import type { HistoricalInvoiceInput } from "../../../lib/data";
import type { AccountingAccount, Profile } from "../../../types";

type HistoricalInvoiceImportDialogProps = {
  open: boolean;
  sellerProfile: Profile;
  bankAccounts: AccountingAccount[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: Omit<HistoricalInvoiceInput, "ownerUserId">) => Promise<void>;
};

type HistoricalLine = {
  localId: string;
  description: string;
  grossAmount: string;
  vatRate: number;
};

type PdfState = {
  status: "idle" | "reading" | "success" | "warning" | "error";
  message: string;
};

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function HistoricalInvoiceImportDialog({
  open,
  sellerProfile,
  bankAccounts,
  saving,
  onClose,
  onSave,
}: HistoricalInvoiceImportDialogProps) {
  const fileInputId = useId();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfState, setPdfState] = useState<PdfState>({ status: "idle", message: "" });
  const [recipientName, setRecipientName] = useState("");
  const [recipientOrgNumber, setRecipientOrgNumber] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("NO");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [title, setTitle] = useState("Historisk faktura");
  const [lines, setLines] = useState<HistoricalLine[]>([createLine()]);
  const [extractedTotal, setExtractedTotal] = useState<number | null>(null);
  const [extractedVat, setExtractedVat] = useState<number | null>(null);
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState("");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateTotals(lines), [lines]);

  async function handleFileSelection(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Velg en PDF-fil.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
      setError("PDF-filen må være større enn 0 byte og maksimalt 10 MB.");
      return;
    }

    setPdfFile(file);
    setPdfState({ status: "reading", message: `Leser ${file.name} ...` });
    setError("");

    try {
      const result = await readHistoricalInvoicePdf(file, sellerProfile);
      if (!result.textFound) {
        setPdfState({
          status: "warning",
          message: "PDF-en inneholder ikke lesbar tekst. Fyll ut feltene manuelt; originalen blir fortsatt lagret.",
        });
        return;
      }

      const fields = result.fields;
      if (fields.recipientName) setRecipientName(fields.recipientName.value);
      if (fields.recipientOrgNumber) setRecipientOrgNumber(fields.recipientOrgNumber.value);
      if (fields.recipientEmail) setRecipientEmail(fields.recipientEmail.value);
      if (fields.invoiceNumber) setInvoiceNumber(fields.invoiceNumber.value);
      if (fields.invoiceDate) setIssueDate(fields.invoiceDate.value);
      if (fields.dueDate) setDueDate(fields.dueDate.value);
      if (fields.description) setTitle(fields.description.value);

      const grossAmount = fields.grossAmount?.value ?? null;
      const vatRate = fields.vatRate?.value ?? ((fields.vatAmount?.value ?? 0) > 0 ? 25 : 0);
      setExtractedTotal(grossAmount);
      setExtractedVat(fields.vatAmount?.value ?? null);
      setLines([createLine({
        description: fields.description?.value ?? "Salg",
        grossAmount: grossAmount === null ? "" : String(grossAmount),
        vatRate,
      })]);

      const foundFields = Object.values(fields).filter(Boolean).length;
      const pageLabel = result.pageCount === 1 ? "side" : "sider";
      setPdfState({
        status: result.warnings.length > 0 ? "warning" : "success",
        message: [
          `Fant ${foundFields} felt på ${result.pageCount} ${pageLabel}. Kontroller forslagene før import.`,
          ...result.warnings,
        ].join(" "),
      });
    } catch (readError) {
      setPdfState({
        status: "error",
        message: readError instanceof Error ? readError.message : "Kunne ikke lese PDF-en.",
      });
    }
  }

  function updateLine(localId: string, patch: Partial<HistoricalLine>) {
    setLines((current) => current.map((line) => line.localId === localId
      ? { ...line, ...patch }
      : line));
    setError("");
  }

  function togglePaid(checked: boolean) {
    setMarkPaid(checked);
    if (checked && !paymentDate) {
      setPaymentDate(dueDate || issueDate || todayInputValue());
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (!pdfFile) throw new Error("Velg original-PDF-en som skal importeres.");
      if (!recipientName.trim()) throw new Error("Mottakernavn mangler.");
      if (!invoiceNumber.trim()) throw new Error("Fakturanummer mangler.");
      if (!issueDate) throw new Error("Fakturadato mangler.");
      if (issueDate > todayInputValue()) throw new Error("En historisk faktura kan ikke ha dato i fremtiden.");
      if (dueDate && dueDate < issueDate) throw new Error("Forfallsdato kan ikke være før fakturadato.");
      if (lines.some((line) => !line.description.trim())) {
        throw new Error("Alle fakturalinjer må ha en beskrivelse.");
      }

      const parsedLines = lines.map((line) => ({
        description: line.description.trim(),
        grossAmount: parseMoney(line.grossAmount),
        vatRate: line.vatRate,
      }));
      if (parsedLines.some((line) => line.grossAmount <= 0)) {
        throw new Error("Alle fakturalinjer må ha et beløp større enn null.");
      }
      if (markPaid && !paymentDate) throw new Error("Betalingsdato mangler.");
      if (markPaid && paymentDate < issueDate) {
        throw new Error("Betalingsdato kan ikke være før fakturadato.");
      }
      if (markPaid && !bankAccountId) throw new Error("Velg bankkonto for innbetalingen.");

      await onSave({
        recipientName,
        recipientOrgNumber,
        recipientEmail,
        recipientCountry,
        invoiceNumber,
        issueDate,
        dueDate,
        title,
        lines: parsedLines,
        pdfFile,
        markPaid,
        paymentDate,
        bankAccountId: markPaid ? bankAccountId : null,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke importere fakturaen.");
    }
  }

  const totalDifference = extractedTotal === null ? 0 : roundMoney(totals.total - extractedTotal);
  const vatDifference = extractedVat === null ? 0 : roundMoney(totals.vatTotal - extractedVat);

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Importer historisk faktura"
      description="Original-PDF-en lagres med en engangsmottaker og bokføres som en tidligere sendt faktura."
      labelledBy="historical-invoice-import-title"
      maxWidth="2xl"
    >
      <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        <section>
          <input
            id={fileInputId}
            className="sr-only"
            type="file"
            accept="application/pdf,.pdf"
            disabled={saving}
            onChange={(event) => void handleFileSelection(event.currentTarget.files)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <AnimatedIconButton
              icon={Upload}
              variant="secondary"
              size="sm"
              disabled={saving || pdfState.status === "reading"}
              onClick={() => document.getElementById(fileInputId)?.click()}
            >
              Velg PDF
            </AnimatedIconButton>
            {pdfFile ? (
              <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                <FileText size={18} />
                <span className="min-w-0 truncate font-medium">{pdfFile.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatFileSize(pdfFile.size)}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-500">Tekstbasert PDF, maks 10 MB.</span>
            )}
          </div>
          {pdfState.status !== "idle" && (
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${pdfStatusClass(pdfState.status)}`}
              role={pdfState.status === "error" ? "alert" : "status"}
            >
              {pdfState.message}
            </p>
          )}
        </section>

        <section className="border-t border-blue-100 pt-5">
          <h3 className="text-base font-semibold text-slate-950">Engangsmottaker</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormField label="Navn">
              <Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required />
            </FormField>
            <FormField label="Organisasjonsnummer">
              <Input inputMode="numeric" value={recipientOrgNumber} onChange={(event) => setRecipientOrgNumber(event.target.value)} />
            </FormField>
            <FormField label="E-post">
              <Input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
            </FormField>
            <FormField label="Land">
              <Select ariaLabel="Mottakerens land" value={recipientCountry} options={countryOptions} onChange={setRecipientCountry} />
            </FormField>
          </div>
        </section>

        <section className="grid gap-4 border-t border-blue-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Fakturanummer">
            <Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
          </FormField>
          <FormField label="Fakturadato">
            <Input type="date" max={todayInputValue()} value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required />
          </FormField>
          <FormField label="Forfallsdato">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </FormField>
          <div className="sm:col-span-2 lg:col-span-3">
            <FormField label="Tittel">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </FormField>
          </div>
        </section>

        <section className="border-t border-blue-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Fakturalinjer</h3>
              <p className="text-sm text-slate-600">Del opp beløpet dersom PDF-en bruker flere MVA-satser.</p>
            </div>
            <AnimatedIconButton
              icon={Plus}
              variant="secondary"
              size="sm"
              onClick={() => setLines((current) => [...current, createLine()])}
            >
              Ny linje
            </AnimatedIconButton>
          </div>

          <div className="mt-3 space-y-3">
            {lines.map((line, index) => {
              const calculated = calculateLine(line);
              return (
                <div key={line.localId} className="grid gap-3 border-b border-blue-100 pb-3 sm:grid-cols-[minmax(0,1fr)_140px_100px_auto] sm:items-end">
                  <FormField label={`Beskrivelse ${index + 1}`}>
                    <Input value={line.description} onChange={(event) => updateLine(line.localId, { description: event.target.value })} required />
                  </FormField>
                  <FormField label="Beløp inkl. MVA">
                    <Input inputMode="decimal" value={line.grossAmount} onChange={(event) => updateLine(line.localId, { grossAmount: event.target.value })} required />
                  </FormField>
                  <FormField label="MVA">
                    <Select
                      ariaLabel={`MVA-sats for linje ${index + 1}`}
                      value={line.vatRate}
                      options={[25, 15, 12, 0].map((rate) => ({ value: rate, label: `${rate} %` }))}
                      onChange={(value) => updateLine(line.localId, { vatRate: Number(value) })}
                    />
                  </FormField>
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <span className="text-xs text-slate-500 sm:mb-2 sm:block sm:text-right">
                      Netto {formatCurrency(calculated.netAmount)}
                    </span>
                    <AnimatedIconButton
                      icon={Trash2}
                      variant="danger"
                      size="xs"
                      className="h-9 w-9 !p-0"
                      disabled={lines.length === 1}
                      onClick={() => setLines((current) => current.filter((item) => item.localId !== line.localId))}
                      title="Fjern linje"
                    >
                      <span className="sr-only">Fjern linje</span>
                    </AnimatedIconButton>
                  </div>
                </div>
              );
            })}
          </div>

          <dl className="ml-auto mt-4 grid max-w-sm grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-slate-600">Netto</dt><dd className="text-right">{formatCurrency(totals.subtotal)}</dd>
            <dt className="text-slate-600">MVA</dt><dd className="text-right">{formatCurrency(totals.vatTotal)}</dd>
            <dt className="border-t border-blue-100 pt-2 font-semibold">Totalt</dt>
            <dd className="border-t border-blue-100 pt-2 text-right font-semibold">{formatCurrency(totals.total)}</dd>
          </dl>
          {(Math.abs(totalDifference) > 0.01 || Math.abs(vatDifference) > 0.01) && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Linjene avviker fra beløpene som ble lest fra PDF-en
              {Math.abs(totalDifference) > 0.01 ? ` med ${formatCurrency(Math.abs(totalDifference))} totalt` : ""}
              {Math.abs(vatDifference) > 0.01 ? ` og ${formatCurrency(Math.abs(vatDifference))} i MVA` : ""}.
            </p>
          )}
        </section>

        <section className="border-t border-blue-100 pt-5">
          <label className="flex items-start gap-3">
            <Input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-700"
              checked={markPaid}
              disabled={saving}
              onChange={(event) => togglePaid(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">Fakturaen er allerede betalt</span>
              <span className="block text-xs text-slate-500">Oppretter et eget innbetalingsbilag mot bank.</span>
            </span>
          </label>
          {markPaid && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="Betalingsdato">
                <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
              </FormField>
              <FormField label="Mottatt på konto">
                <Select
                  ariaLabel="Konto for historisk innbetaling"
                  value={bankAccountId}
                  options={bankAccounts.map((account) => ({ value: account.id, label: `${account.account_number} ${account.name}` }))}
                  onChange={setBankAccountId}
                />
              </FormField>
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-blue-100 pt-4">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Avbryt</Button>
          <Button type="submit" disabled={saving || pdfState.status === "reading"}>
            {saving ? "Importerer ..." : "Importer faktura"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function createLine(patch: Partial<HistoricalLine> = {}): HistoricalLine {
  return {
    localId: crypto.randomUUID(),
    description: "Salg",
    grossAmount: "",
    vatRate: 25,
    ...patch,
  };
}

function parseMoney(value: string) {
  return roundMoney(parseLocalizedMoney(value) ?? 0);
}

function calculateLine(line: HistoricalLine) {
  return calculateSupplierLine({
    grossAmount: parseMoney(line.grossAmount),
    vatRate: line.vatRate,
  });
}

function calculateTotals(lines: HistoricalLine[]) {
  return lines.reduce((totals, line) => {
    const calculated = calculateLine(line);
    return {
      subtotal: roundMoney(totals.subtotal + calculated.netAmount),
      vatTotal: roundMoney(totals.vatTotal + calculated.vatAmount),
      total: roundMoney(totals.total + calculated.grossAmount),
    };
  }, { subtotal: 0, vatTotal: 0, total: 0 });
}

function pdfStatusClass(status: PdfState["status"]) {
  if (status === "error") return "border-red-200 bg-red-50 text-red-800";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}
