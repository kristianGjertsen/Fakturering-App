import { useMemo, useState, type FormEvent } from "react";
import { CreditCard, FileText, Plus, Trash2, Upload, User } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { ATTACHMENT_ACCEPT, formatFileSize, validateAttachmentFiles } from "../../../lib/attachments";
import { calculateSupplierInvoiceTotals, calculateSupplierLine } from "../../../lib/accounting";
import type { PurchasePaymentInput } from "../../../lib/data";
import { formatCurrency, todayInputValue } from "../../../lib/format";
import { readSupplierInvoicePdf } from "../../../lib/supplierInvoicePdf";
import { parseLocalizedMoney } from "../../../lib/supplierInvoiceParser";
import type { AccountingAccount, PurchasePaymentSource, SupplierInvoiceDraftLine } from "../../../types";

type PurchasePaymentFormProps = {
  ownerUserId: string;
  accounts: AccountingAccount[];
  saving: boolean;
  onSave: (input: PurchasePaymentInput) => Promise<void>;
  onCancel: () => void;
};

type ImportState = {
  tone: "info" | "success" | "warning" | "danger";
  message: string;
};

export function PurchasePaymentForm({
  ownerUserId,
  accounts,
  saving,
  onSave,
  onCancel,
}: PurchasePaymentFormProps) {
  const expenseAccounts = accounts.filter((account) =>
    account.is_active && (account.category === "expense" || account.category === "asset"),
  );
  const companyAccounts = accounts.filter((account) =>
    account.is_active && (account.system_key === "bank" || account.system_key === "company_card"),
  );
  const privateAccounts = accounts
    .filter((account) => account.is_active && (account.system_key === "private_outlay" || account.system_key === "private_equity"))
    .sort((left, right) => Number(right.system_key === "private_outlay") - Number(left.system_key === "private_outlay"));
  const fallbackExpenseAccount = expenseAccounts.find((account) => account.account_number === "7790")
    ?? expenseAccounts[0];
  const [paymentSource, setPaymentSource] = useState<PurchasePaymentSource>("company");
  const [settlementAccountId, setSettlementAccountId] = useState(companyAccounts[0]?.id ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [supplierOrgNumber, setSupplierOrgNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [attested, setAttested] = useState(false);
  const [lines, setLines] = useState<SupplierInvoiceDraftLine[]>([
    createDraftLine(fallbackExpenseAccount?.id ?? ""),
  ]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateSupplierInvoiceTotals(lines), [lines]);
  const settlementAccounts = paymentSource === "company" ? companyAccounts : privateAccounts;

  function choosePaymentSource(source: PurchasePaymentSource) {
    setPaymentSource(source);
    const available = source === "company" ? companyAccounts : privateAccounts;
    setSettlementAccountId(available[0]?.id ?? "");
    setError("");
  }

  function updateLine(localId: string, patch: Partial<SupplierInvoiceDraftLine>) {
    setLines((current) => current.map((line) => line.localId === localId ? { ...line, ...patch } : line));
    setError("");
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const selectedFiles = Array.from(fileList);
    const combined = [...attachments, ...selectedFiles];
    const attachmentError = validateAttachmentFiles(combined);
    if (attachmentError) {
      setError(attachmentError);
      return;
    }
    setAttachments(combined);
    setError("");

    const pdf = selectedFiles.find(isPdfFile);
    if (!pdf) {
      setImportState({ tone: "info", message: "Dokumentet er lagt ved." });
      return;
    }

    setImportState({ tone: "info", message: `Leser ${pdf.name} ...` });
    try {
      const result = await readSupplierInvoicePdf(pdf);
      if (!result.textFound) {
        setImportState({ tone: "warning", message: "PDF-en har ikke lesbar tekst. Fyll ut kjøpet manuelt." });
        return;
      }
      const fields = result.fields;
      if (fields.supplierName?.value) setSupplierName(fields.supplierName.value);
      if (fields.orgNumber?.value) setSupplierOrgNumber(fields.orgNumber.value);
      if (fields.invoiceDate?.value) setPurchaseDate(fields.invoiceDate.value);
      if (fields.description?.value) {
        setDescription(fields.description.value);
        setLines((current) => current.map((line, index) => index === 0
          ? { ...line, description: fields.description!.value }
          : line));
      }
      if (fields.grossAmount?.value) {
        setLines((current) => current.map((line, index) => index === 0
          ? { ...line, grossAmount: fields.grossAmount!.value }
          : line));
      }
      const foreignCurrency = fields.currency?.value && fields.currency.value !== "NOK";
      setLines((current) => current.map((line, index) => index === 0
        ? { ...line, vatRate: foreignCurrency ? 0 : fields.vatRate?.value ?? line.vatRate }
        : line));
      setImportState({
        tone: foreignCurrency || result.warnings.length > 0 ? "warning" : "success",
        message: foreignCurrency
          ? `Feltene er lest inn. Før beløpet som faktisk ble belastet i NOK; utenlandsk VAT er satt til 0 % norsk MVA.`
          : `Feltene er lest inn fra ${result.pageCount} ${result.pageCount === 1 ? "side" : "sider"}.`,
      });
    } catch (readError) {
      setImportState({
        tone: "danger",
        message: readError instanceof Error ? readError.message : "Kunne ikke lese PDF-en.",
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (attachments.length === 0) throw new Error("Legg ved kvittering eller salgsdokument.");
      const attachmentError = validateAttachmentFiles(attachments);
      if (attachmentError) throw new Error(attachmentError);
      if (!supplierName.trim()) throw new Error("Skriv inn leverandørens navn.");
      if (!description.trim()) throw new Error("Skriv inn formålet med kjøpet.");
      if (!settlementAccountId) throw new Error("Velg konto eller kort som ble brukt.");
      if (paymentSource === "private" && !paidBy.trim()) throw new Error("Oppgi hvem som la ut privat.");
      if (paymentSource === "private" && !attested) throw new Error("Bekreft at det private utlegget gjelder virksomheten.");
      if (lines.some((line) => !line.description.trim() || !line.expenseAccountId || line.grossAmount <= 0)) {
        throw new Error("Alle kostnadslinjer må ha tekst, konto og et beløp over 0.");
      }
      await onSave({
        ownerUserId,
        supplierName,
        supplierOrgNumber,
        purchaseDate,
        description,
        paymentSource,
        settlementAccountId,
        paidBy,
        lines,
        attachments,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke bokføre kjøpet.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-950">Betalt med</h3>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Velg hvem som betalte">
          <Button
            variant={paymentSource === "company" ? "primary" : "secondary"}
            className="min-h-12 justify-start"
            onClick={() => choosePaymentSource("company")}
          >
            <CreditCard size={19} /> Betalt med selskapets bankkonto/kort
          </Button>
          <Button
            variant={paymentSource === "private" ? "primary" : "secondary"}
            className="min-h-12 justify-start"
            onClick={() => choosePaymentSource("private")}
          >
            <User size={19} /> Betalt med privat konto/kort
          </Button>
        </div>
        <FormField label={paymentSource === "company" ? "Belastet konto/kort" : "Oppgjørskonto"}>
          <Select
            ariaLabel="Velg bokføringskonto for betalingen"
            value={settlementAccountId}
            options={settlementAccounts.map((account) => ({
              value: account.id,
              label: accountLabel(account),
            }))}
            onChange={setSettlementAccountId}
          />
        </FormField>
      </section>

      <section className="space-y-3 border-t border-blue-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">Kvittering eller salgsdokument</h3>
          <input
            id="purchase-payment-files"
            type="file"
            className="sr-only"
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={(event) => {
              void addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <AnimatedIconButton icon={Upload} variant="secondary" size="sm" onClick={() => document.getElementById("purchase-payment-files")?.click()}>
            Velg dokument
          </AnimatedIconButton>
        </div>
        {importState && <p className={`rounded-md border px-3 py-2 text-sm ${importStateClass(importState.tone)}`}>{importState.message}</p>}
        {attachments.length > 0 && (
          <ul className="divide-y divide-blue-100 rounded-md border border-blue-100 px-3">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText size={18} className="shrink-0 text-blue-700" />
                  <span className="min-w-0"><span className="block truncate font-medium">{file.name}</span><span className="text-xs text-slate-500">{formatFileSize(file.size)}</span></span>
                </span>
                <Button size="xs" variant="ghost" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Fjern</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 border-t border-blue-100 pt-5 sm:grid-cols-2">
        <FormField label="Leverandør">
          <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required />
        </FormField>
        <FormField label="Organisasjonsnummer">
          <Input inputMode="numeric" value={supplierOrgNumber} onChange={(event) => setSupplierOrgNumber(event.target.value)} />
        </FormField>
        <FormField label="Kjøpsdato">
          <Input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required />
        </FormField>
        <FormField label="Formål med kjøpet">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} required />
        </FormField>
        {paymentSource === "private" && (
          <FormField label="Utlegg gjort av">
            <Input value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required />
          </FormField>
        )}
      </section>

      <section className="space-y-4 border-t border-blue-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">Kostnadslinjer</h3>
          <AnimatedIconButton icon={Plus} variant="secondary" size="sm" onClick={() => setLines((current) => [...current, createDraftLine(fallbackExpenseAccount?.id ?? "")])}>
            Ny linje
          </AnimatedIconButton>
        </div>
        <div className="space-y-3">
          {lines.map((line, index) => {
            const calculated = calculateSupplierLine(line);
            return (
              <div key={line.localId} className="grid gap-3 rounded-md border border-blue-100 bg-blue-50/40 p-4 lg:grid-cols-[1.5fr_1.3fr_130px_100px_auto] lg:items-end">
                <FormField label={`Beskrivelse ${index + 1}`}>
                  <Input value={line.description} onChange={(event) => updateLine(line.localId, { description: event.target.value })} required />
                </FormField>
                <FormField label="Kostnadskonto">
                  <Select ariaLabel={`Kostnadskonto for linje ${index + 1}`} value={line.expenseAccountId} options={expenseAccounts.map((account) => ({ value: account.id, label: `${account.account_number} ${account.name}` }))} onChange={(value) => updateLine(line.localId, { expenseAccountId: value })} />
                </FormField>
                <FormField label="Beløp inkl. MVA">
                  <Input inputMode="decimal" value={line.grossAmount || ""} onChange={(event) => updateLine(line.localId, { grossAmount: parseLocalizedMoney(event.target.value) ?? 0 })} required />
                </FormField>
                <FormField label="MVA-sats">
                  <Select ariaLabel={`MVA-sats for linje ${index + 1}`} value={line.vatRate} options={[25, 15, 12, 0].map((rate) => ({ value: rate, label: `${rate} %` }))} onChange={(value) => updateLine(line.localId, { vatRate: Number(value) })} />
                </FormField>
                <div className="flex items-center justify-between gap-3 lg:block">
                  <div className="text-xs text-slate-600 lg:mb-2 lg:text-right"><span className="block">Netto {formatCurrency(calculated.netAmount)}</span><span className="block">MVA {formatCurrency(calculated.vatAmount)}</span></div>
                  <AnimatedIconButton icon={Trash2} variant="danger" size="xs" className="h-9 w-9 !p-0" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.localId !== line.localId))} title="Fjern linje"><span className="sr-only">Fjern linje</span></AnimatedIconButton>
                </div>
              </div>
            );
          })}
        </div>
        <dl className="ml-auto grid max-w-sm grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-slate-600">Netto</dt><dd className="text-right">{formatCurrency(totals.subtotal)}</dd>
          <dt className="text-slate-600">MVA</dt><dd className="text-right">{formatCurrency(totals.vatTotal)}</dd>
          <dt className="border-t border-blue-100 pt-2 font-semibold">Totalt</dt><dd className="border-t border-blue-100 pt-2 text-right font-semibold">{formatCurrency(totals.total)}</dd>
        </dl>
      </section>

      {paymentSource === "private" && (
        <label className="flex items-start gap-3 rounded-md border border-blue-100 bg-slate-50 p-4">
          <Input type="checkbox" className="mt-1 h-4 w-4 accent-blue-700" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
          <span className="text-sm text-slate-700">Jeg bekrefter at kjøpet gjelder virksomheten, og at opplysningene og originaldokumentet er korrekte.</span>
        </label>
      )}

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-blue-100 bg-white py-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Avbryt</Button>
        <Button type="submit" disabled={saving || totals.total <= 0}>{saving ? "Bokfører..." : "Bokfør betaling"}</Button>
      </div>
    </form>
  );
}

function createDraftLine(expenseAccountId: string): SupplierInvoiceDraftLine {
  return { localId: crypto.randomUUID(), description: "", expenseAccountId, grossAmount: 0, vatRate: 25 };
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function accountLabel(account: AccountingAccount) {
  if (account.system_key === "private_outlay") return `${account.account_number} ${account.name} (AS / ansatt)`;
  if (account.system_key === "private_equity") return `${account.account_number} ${account.name} (ENK)`;
  return `${account.account_number} ${account.name}`;
}

function importStateClass(tone: ImportState["tone"]) {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}
