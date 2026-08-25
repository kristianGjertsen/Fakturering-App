import { useMemo, useRef, useState, type FormEvent } from "react";
import { FileText, Plus, RefreshCw, Trash2, Upload } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { formatFileSize, ATTACHMENT_ACCEPT, validateAttachmentFiles } from "../../../lib/attachments";
import {
  calculateSupplierInvoiceNokTotals,
  calculateSupplierInvoiceTotals,
  calculateSupplierLine,
} from "../../../lib/accounting";
import type {
  AccountingAccount,
  Supplier,
  SupplierInvoiceDraftLine,
} from "../../../types";
import type { SupplierInput, SupplierInvoiceInput } from "../../../lib/data";
import { formatCurrency, formatMoney, todayInputValue } from "../../../lib/format";
import { readSupplierInvoicePdf } from "../../../lib/supplierInvoicePdf";
import { parseLocalizedMoney, type ExtractedValue, type SupplierInvoicePdfFields } from "../../../lib/supplierInvoiceParser";
import { fetchNorgesBankExchangeRate } from "../../../lib/exchangeRates";

type SupplierInvoiceFormProps = {
  ownerUserId: string;
  accounts: AccountingAccount[];
  suppliers: Supplier[];
  saving: boolean;
  onCreateSupplier: (input: SupplierInput) => Promise<Supplier>;
  onSave: (input: SupplierInvoiceInput) => Promise<void>;
  onCancel: () => void;
};

type NewSupplierFields = {
  name: string;
  orgNumber: string;
  email: string;
  bankAccount: string;
};

type PdfFieldKey =
  | "supplierName"
  | "orgNumber"
  | "supplierEmail"
  | "bankAccount"
  | "invoiceNumber"
  | "invoiceDate"
  | "dueDate"
  | "kid"
  | "currency"
  | "description"
  | "lineDescription"
  | "grossAmount"
  | "vatRate";

type PdfFieldSource = {
  fileName: string;
  evidence: string;
  confidence: ExtractedValue<unknown>["confidence"];
};

type PdfImportState = {
  status: "idle" | "reading" | "success" | "warning" | "no-text" | "error";
  message: string;
  fileName?: string;
};

type ExchangeRateState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

const currencyOptions = [
  ["NOK", "NOK - Norske kroner"],
  ["USD", "USD - Amerikanske dollar"],
  ["EUR", "EUR - Euro"],
  ["GBP", "GBP - Britiske pund"],
  ["SEK", "SEK - Svenske kroner"],
  ["DKK", "DKK - Danske kroner"],
  ["CHF", "CHF - Sveitsiske franc"],
  ["CAD", "CAD - Kanadiske dollar"],
  ["AUD", "AUD - Australske dollar"],
  ["JPY", "JPY - Japanske yen"],
  ["PLN", "PLN - Polske zloty"],
].map(([value, label]) => ({ value, label }));

const emptySupplier: NewSupplierFields = {
  name: "",
  orgNumber: "",
  email: "",
  bankAccount: "",
};

export function SupplierInvoiceForm({
  ownerUserId,
  accounts,
  suppliers,
  saving,
  onCreateSupplier,
  onSave,
  onCancel,
}: SupplierInvoiceFormProps) {
  const expenseAccounts = accounts.filter((account) =>
    account.is_active && (account.category === "expense" || account.category === "asset"),
  );
  const bankAccounts = accounts.filter((account) =>
    account.is_active && account.category === "asset" && account.system_key === "bank",
  );
  const fallbackExpenseAccount = expenseAccounts.find((account) => account.account_number === "7790")
    ?? expenseAccounts[0];
  const today = todayInputValue();
  const [supplierMode, setSupplierMode] = useState<"existing" | "new">(
    suppliers.length > 0 ? "existing" : "new",
  );
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [createdSupplier, setCreatedSupplier] = useState<Supplier | null>(null);
  const [newSupplier, setNewSupplier] = useState<NewSupplierFields>(emptySupplier);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 14));
  const [kid, setKid] = useState("");
  const [currency, setCurrency] = useState("NOK");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [exchangeRateDate, setExchangeRateDate] = useState(today);
  const [exchangeRateSource, setExchangeRateSource] = useState("NOK");
  const [exchangeRateInvoiceDate, setExchangeRateInvoiceDate] = useState(today);
  const [exchangeRateState, setExchangeRateState] = useState<ExchangeRateState>({ status: "idle", message: "" });
  const exchangeRateRequest = useRef(0);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<SupplierInvoiceDraftLine[]>([
    createDraftLine(fallbackExpenseAccount?.id ?? ""),
  ]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [pdfFieldSources, setPdfFieldSources] = useState<Partial<Record<PdfFieldKey, PdfFieldSource>>>({});
  const [pdfImport, setPdfImport] = useState<PdfImportState>({ status: "idle", message: "" });
  const manuallyEditedFields = useRef(new Set<PdfFieldKey>());
  const pdfReadSequence = useRef(0);
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentAmountNok, setPaymentAmountNok] = useState("");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateSupplierInvoiceTotals(lines), [lines]);
  const numericExchangeRate = currency === "NOK" ? 1 : parseRate(exchangeRate);
  const nokTotals = useMemo(
    () => calculateSupplierInvoiceNokTotals(lines, numericExchangeRate),
    [lines, numericExchangeRate],
  );
  const availableSuppliers = createdSupplier
    ? [...suppliers.filter((supplier) => supplier.id !== createdSupplier.id), createdSupplier]
    : suppliers;

  function markFieldEdited(field: PdfFieldKey) {
    manuallyEditedFields.current.add(field);
    setPdfFieldSources((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateLine(
    localId: string,
    patch: Partial<SupplierInvoiceDraftLine>,
    editedField?: PdfFieldKey,
  ) {
    if (editedField) markFieldEdited(editedField);
    setLines((current) => current.map((line) => line.localId === localId ? { ...line, ...patch } : line));
    setError("");
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const selectedFiles = Array.from(fileList);
    const combinedFiles = [...attachments, ...selectedFiles];
    const attachmentError = validateAttachmentFiles(combinedFiles);
    if (attachmentError) {
      setError(attachmentError);
      return;
    }

    setAttachments(combinedFiles);
    setError("");
    const pdf = selectedFiles.find(isPdfFile);
    if (pdf) {
      await importPdfFields(pdf);
    } else {
      setPdfImport({
        status: "no-text",
        message: "Filen er lagt ved. Automatisk utfylling krever en tekstbasert PDF.",
      });
    }
  }

  async function refreshExchangeRate(nextCurrency: string, nextDate: string) {
    const request = ++exchangeRateRequest.current;
    if (nextCurrency === "NOK") {
      setExchangeRate("1");
      setExchangeRateDate(nextDate);
      setExchangeRateSource("NOK");
      setExchangeRateInvoiceDate(nextDate);
      setExchangeRateState({ status: "idle", message: "" });
      return;
    }

    setExchangeRateInvoiceDate("");
    if (nextCurrency !== currency || exchangeRateSource === "NOK") setExchangeRate("");
    setExchangeRateState({ status: "loading", message: `Henter ${nextCurrency}-kurs fra Norges Bank ...` });
    try {
      const result = await fetchNorgesBankExchangeRate(nextCurrency, nextDate);
      if (request !== exchangeRateRequest.current) return;
      setExchangeRate(String(result.nokPerUnit));
      setExchangeRateDate(result.rateDate);
      setExchangeRateSource(result.source);
      setExchangeRateInvoiceDate(nextDate);
      setExchangeRateState({
        status: "success",
        message: `Kurs fra ${result.source} ${formatDateForMessage(result.rateDate)}.`,
      });
    } catch (rateError) {
      if (request !== exchangeRateRequest.current) return;
      setExchangeRateState({
        status: "error",
        message: rateError instanceof Error ? rateError.message : "Kunne ikke hente valutakurs.",
      });
    }
  }

  async function importPdfFields(file: File) {
    const sequence = ++pdfReadSequence.current;
    setPdfImport({ status: "reading", message: "Leser tekst og leter etter fakturafelt ...", fileName: file.name });
    setError("");

    try {
      const result = await readSupplierInvoicePdf(file);
      if (sequence !== pdfReadSequence.current) return;
      if (!result.textFound) {
        setPdfImport({
          status: "no-text",
          message: "PDF-en inneholder ikke lesbar tekst. Fyll ut feltene manuelt og behold filen som originaldokument.",
          fileName: file.name,
        });
        return;
      }

      const appliedCount = applyExtractedFields(result.fields, file.name);
      const extractedCurrency = manuallyEditedFields.current.has("currency")
        ? currency
        : supportedCurrency(result.fields.currency?.value) ?? currency;
      const extractedDate = manuallyEditedFields.current.has("invoiceDate")
        ? invoiceDate
        : result.fields.invoiceDate?.value ?? invoiceDate;
      if (extractedCurrency !== "NOK") await refreshExchangeRate(extractedCurrency, extractedDate);
      const extractedMessage = appliedCount > 0
        ? `Fant og fylte ut ${appliedCount} felt fra ${result.pageCount} ${result.pageCount === 1 ? "side" : "sider"}. Kontroller og endre forslagene før bokføring.`
        : "Teksten ble lest, men ingen sikre fakturafelt ble funnet. Fyll ut feltene manuelt.";
      setPdfImport({
        status: result.warnings.length > 0 ? "warning" : appliedCount > 0 ? "success" : "no-text",
        message: [extractedMessage, ...result.warnings].join(" "),
        fileName: file.name,
      });
    } catch (readError) {
      if (sequence !== pdfReadSequence.current) return;
      setPdfImport({
        status: "error",
        message: readError instanceof Error
          ? `Kunne ikke lese PDF-en: ${readError.message}`
          : "Kunne ikke lese PDF-en.",
        fileName: file.name,
      });
    }
  }

  function applyExtractedFields(fields: SupplierInvoicePdfFields, fileName: string) {
    const nextSources: Partial<Record<PdfFieldKey, PdfFieldSource>> = {};
    let appliedCount = 0;

    const apply = <T,>(field: PdfFieldKey, extracted: ExtractedValue<T> | undefined, setter: (value: T) => void) => {
      if (!extracted || manuallyEditedFields.current.has(field)) return;
      setter(extracted.value);
      nextSources[field] = sourceFor(fileName, extracted);
      appliedCount += 1;
    };

    if (
      !manuallyEditedFields.current.has("supplierName")
      && (fields.supplierName || fields.orgNumber)
    ) {
      const matchingSupplier = findMatchingSupplier(availableSuppliers, fields);
      if (matchingSupplier) {
        setSupplierMode("existing");
        setSupplierId(matchingSupplier.id);
        nextSources.supplierName = sourceFor(fileName, fields.supplierName ?? fields.orgNumber!);
        appliedCount += 1;
        if (matchingSupplier.default_expense_account_id) {
          setLines((current) => current.map((line, index) => index === 0
            ? { ...line, expenseAccountId: matchingSupplier.default_expense_account_id! }
            : line));
        }
      } else {
        setSupplierMode("new");
        if (fields.supplierName) {
          apply("supplierName", fields.supplierName, (value) =>
            setNewSupplier((current) => ({ ...current, name: value })));
        }
      }
    }

    apply("orgNumber", fields.orgNumber, (value) =>
      setNewSupplier((current) => ({ ...current, orgNumber: value })));
    apply("supplierEmail", fields.supplierEmail, (value) =>
      setNewSupplier((current) => ({ ...current, email: value })));
    apply("bankAccount", fields.bankAccount, (value) =>
      setNewSupplier((current) => ({ ...current, bankAccount: value })));
    apply("invoiceNumber", fields.invoiceNumber, setInvoiceNumber);
    apply("invoiceDate", fields.invoiceDate, setInvoiceDate);
    apply("dueDate", fields.dueDate, setDueDate);
    apply("kid", fields.kid, setKid);
    const extractedCurrency = supportedCurrency(fields.currency?.value);
    if (extractedCurrency) apply("currency", fields.currency, setCurrency);
    const effectiveCurrency = manuallyEditedFields.current.has("currency")
      ? currency
      : extractedCurrency ?? currency;
    apply("description", fields.description, setDescription);
    apply("lineDescription", fields.description, (value) =>
      setLines((current) => current.map((line, index) => index === 0 ? { ...line, description: value } : line)));
    apply("grossAmount", fields.grossAmount, (value) =>
      setLines((current) => current.map((line, index) => index === 0 ? { ...line, grossAmount: value } : line)));
    if (effectiveCurrency !== "NOK") {
      if (!manuallyEditedFields.current.has("vatRate")) {
        setLines((current) => current.map((line, index) => index === 0 ? { ...line, vatRate: 0 } : line));
      }
    } else {
      apply("vatRate", fields.vatRate, (value) =>
        setLines((current) => current.map((line, index) => index === 0 ? { ...line, vatRate: value } : line)));
    }

    setPdfFieldSources((current) => ({ ...current, ...nextSources }));
    return appliedCount;
  }

  function removeAttachment(index: number) {
    const removedFile = attachments[index];
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (removedFile && pdfImport.fileName === removedFile.name) {
      pdfReadSequence.current += 1;
      setPdfImport({ status: "idle", message: "" });
      setPdfFieldSources((current) => Object.fromEntries(
        Object.entries(current).filter(([, source]) => source?.fileName !== removedFile.name),
      ));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (dueDate && dueDate < invoiceDate) {
        throw new Error("Forfallsdato kan ikke være før fakturadato.");
      }
      if (attachments.length === 0) {
        throw new Error("Legg ved den mottatte fakturaen som originaldokument.");
      }
      const attachmentError = validateAttachmentFiles(attachments);
      if (attachmentError) throw new Error(attachmentError);
      if (lines.some((line) => !line.description.trim() || !line.expenseAccountId || line.grossAmount <= 0)) {
        throw new Error("Alle kostnadslinjer må ha tekst, konto og et beløp over 0.");
      }
      if (currency !== "NOK" && numericExchangeRate <= 0) {
        throw new Error("Legg inn en gyldig valutakurs i NOK før bokføring.");
      }
      if (currency !== "NOK" && exchangeRateInvoiceDate !== invoiceDate) {
        throw new Error("Hent eller legg inn valutakursen på nytt for valgt fakturadato.");
      }
      const parsedPaymentAmountNok = parseRate(paymentAmountNok);
      if (markPaid && currency !== "NOK" && parsedPaymentAmountNok <= 0) {
        throw new Error("Legg inn NOK-beløpet som faktisk ble belastet bank eller kort.");
      }
      let selectedSupplierId = supplierId;
      if (supplierMode === "new") {
        if (!newSupplier.name.trim()) throw new Error("Skriv inn leverandørens navn.");
        const createdSupplier = await onCreateSupplier({
          ownerUserId,
          name: newSupplier.name,
          orgNumber: newSupplier.orgNumber,
          email: newSupplier.email,
          bankAccount: newSupplier.bankAccount,
          notes: "",
          defaultExpenseAccountId: lines[0]?.expenseAccountId || null,
        });
        selectedSupplierId = createdSupplier.id;
        setCreatedSupplier(createdSupplier);
        setSupplierId(createdSupplier.id);
        setSupplierMode("existing");
      }

      await onSave({
        ownerUserId,
        supplierId: selectedSupplierId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        kid,
        currency,
        exchangeRate: numericExchangeRate,
        exchangeRateDate,
        exchangeRateSource,
        description,
        lines,
        attachments,
        markPaid,
        paymentDate,
        bankAccountId: bankAccountId || null,
        paymentAmountNok: markPaid
          ? currency === "NOK" ? nokTotals.total : parsedPaymentAmountNok
          : 0,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke lagre fakturaen.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-3" aria-labelledby="supplier-invoice-document-heading">
        <div>
          <h3 id="supplier-invoice-document-heading" className="text-base font-semibold text-slate-950">
            Fakturafil / originaldokument <span className="text-red-600">*</span>
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Legg inn den mottatte fakturaen først. Tekst i PDF-en brukes til å foreslå feltene under.
          </p>
        </div>

        <input
          id="supplier-invoice-files"
          type="file"
          className="sr-only"
          accept={ATTACHMENT_ACCEPT}
          multiple
          onChange={(event) => {
            void addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-4">
          <AnimatedIconButton
            icon={Upload}
            variant="secondary"
            size="sm"
            onClick={() => document.getElementById("supplier-invoice-files")?.click()}
          >
            Velg fakturafil
          </AnimatedIconButton>
          <span className="text-xs text-slate-500">PDF, JPG eller PNG. Maks 10 MB per fil og 20 MB totalt.</span>
        </div>

        {pdfImport.status !== "idle" && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${pdfStatusClass(pdfImport.status)}`}
            role={pdfImport.status === "error" ? "alert" : "status"}
          >
            {pdfImport.status === "reading" && <span className="font-medium">Leser {pdfImport.fileName}</span>}
            {pdfImport.status !== "reading" && pdfImport.message}
            {pdfImport.status === "reading" && <span className="ml-1 text-slate-600">{pdfImport.message}</span>}
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="divide-y divide-blue-100 rounded-md border border-blue-100 bg-white px-3">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={18} className="shrink-0 text-blue-700" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{file.name}</span>
                    <span className="text-xs text-slate-500">{formatFileSize(file.size)}</span>
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  {isPdfFile(file) && (
                    <AnimatedIconButton
                      icon={RefreshCw}
                      size="xs"
                      variant="ghost"
                      disabled={pdfImport.status === "reading"}
                      onClick={() => void importPdfFields(file)}
                    >
                      Les inn
                    </AnimatedIconButton>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => removeAttachment(index)}>Fjern</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex rounded-md border border-blue-200 bg-white p-0.5 sm:w-fit">
          <Button
            variant={supplierMode === "existing" ? "primary" : "ghost"}
            size="sm"
            className="flex-1 shadow-none sm:flex-none"
            disabled={availableSuppliers.length === 0}
            onClick={() => {
              markFieldEdited("supplierName");
              setSupplierMode("existing");
            }}
          >
            Lagret leverandør
          </Button>
          <Button
            variant={supplierMode === "new" ? "primary" : "ghost"}
            size="sm"
            className="flex-1 shadow-none sm:flex-none"
            onClick={() => {
              markFieldEdited("supplierName");
              setSupplierMode("new");
            }}
          >
            Ny leverandør
          </Button>
        </div>

        {supplierMode === "existing" ? (
          <FormField label={<PdfFieldLabel label="Leverandør" source={pdfFieldSources.supplierName} />}>
            <Select
              ariaLabel="Velg leverandør"
              value={supplierId}
              options={availableSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              onChange={(value) => {
                markFieldEdited("supplierName");
                setSupplierId(value);
                const supplier = availableSuppliers.find((item) => item.id === value);
                if (supplier?.default_expense_account_id) {
                  updateLine(lines[0].localId, { expenseAccountId: supplier.default_expense_account_id });
                }
              }}
            />
          </FormField>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={<PdfFieldLabel label="Leverandørnavn" source={pdfFieldSources.supplierName} />}>
              <Input
                value={newSupplier.name}
                onChange={(event) => {
                  markFieldEdited("supplierName");
                  setNewSupplier((current) => ({ ...current, name: event.target.value }));
                }}
                required
              />
            </FormField>
            <FormField label={<PdfFieldLabel label="Organisasjonsnummer" source={pdfFieldSources.orgNumber} />}>
              <Input
                inputMode="numeric"
                value={newSupplier.orgNumber}
                onChange={(event) => {
                  markFieldEdited("orgNumber");
                  setNewSupplier((current) => ({ ...current, orgNumber: event.target.value }));
                }}
              />
            </FormField>
            <FormField label={<PdfFieldLabel label="E-post" source={pdfFieldSources.supplierEmail} />}>
              <Input
                type="email"
                value={newSupplier.email}
                onChange={(event) => {
                  markFieldEdited("supplierEmail");
                  setNewSupplier((current) => ({ ...current, email: event.target.value }));
                }}
              />
            </FormField>
            <FormField label={<PdfFieldLabel label="Kontonummer" source={pdfFieldSources.bankAccount} />}>
              <Input
                inputMode="numeric"
                value={newSupplier.bankAccount}
                onChange={(event) => {
                  markFieldEdited("bankAccount");
                  setNewSupplier((current) => ({ ...current, bankAccount: event.target.value }));
                }}
              />
            </FormField>
          </div>
        )}
      </section>

      <section className="grid gap-4 border-t border-blue-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label={<PdfFieldLabel label="Leverandørens fakturanummer" source={pdfFieldSources.invoiceNumber} />}>
          <Input
            value={invoiceNumber}
            onChange={(event) => {
              markFieldEdited("invoiceNumber");
              setInvoiceNumber(event.target.value);
            }}
            required
          />
        </FormField>
        <FormField label={<PdfFieldLabel label="Fakturadato" source={pdfFieldSources.invoiceDate} />}>
          <Input
            type="date"
            value={invoiceDate}
            onChange={(event) => {
              markFieldEdited("invoiceDate");
              const nextDate = event.target.value;
              setInvoiceDate(nextDate);
              if (currency !== "NOK" && nextDate) void refreshExchangeRate(currency, nextDate);
            }}
            required
          />
        </FormField>
        <FormField label={<PdfFieldLabel label="Forfallsdato" source={pdfFieldSources.dueDate} />}>
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => {
              markFieldEdited("dueDate");
              setDueDate(event.target.value);
            }}
          />
        </FormField>
        <FormField label={<PdfFieldLabel label="KID" source={pdfFieldSources.kid} />}>
          <Input
            inputMode="numeric"
            value={kid}
            onChange={(event) => {
              markFieldEdited("kid");
              setKid(event.target.value);
            }}
            placeholder="Betalingsreferanse"
          />
        </FormField>
        <FormField label={<PdfFieldLabel label="Valuta" source={pdfFieldSources.currency} />}>
          <Select
            ariaLabel="Fakturaens valuta"
            value={currency}
            options={currencyOptions}
            onChange={(value) => {
              markFieldEdited("currency");
              setCurrency(value);
              if (value !== "NOK" && !manuallyEditedFields.current.has("vatRate")) {
                setLines((current) => current.map((line, index) => index === 0 ? { ...line, vatRate: 0 } : line));
              } else if (value === "NOK" && !manuallyEditedFields.current.has("vatRate")) {
                setLines((current) => current.map((line, index) => index === 0 ? { ...line, vatRate: 25 } : line));
              }
              void refreshExchangeRate(value, invoiceDate);
            }}
          />
        </FormField>
        <FormField label={<PdfFieldLabel label="Kort beskrivelse" source={pdfFieldSources.description} />}>
          <Input
            value={description}
            onChange={(event) => {
              markFieldEdited("description");
              setDescription(event.target.value);
            }}
            placeholder="For eksempel programvare"
          />
        </FormField>
      </section>

      {currency !== "NOK" && (
        <section className="space-y-4 border-t border-blue-100 pt-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Beløpene registreres i {currency} og bokføres i NOK. MVA settes til 0 % ved automatisk innlesing av utenlandske fakturaer. Utenlandsk VAT er ikke norsk inngående MVA; kontroller om kjøpet krever særskilt MVA-behandling.
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <FormField
              label={`Valutakurs - NOK per 1 ${currency}`}
              helper={`${exchangeRateSource || "Manuelt oppgitt"}${exchangeRateDate ? ` · kursdato ${formatDateForMessage(exchangeRateDate)}` : ""}`}
            >
              <Input
                inputMode="decimal"
                value={exchangeRate}
                onChange={(event) => {
                  exchangeRateRequest.current += 1;
                  setExchangeRate(event.target.value);
                  setExchangeRateDate(invoiceDate);
                  setExchangeRateSource("Manuelt oppgitt");
                  setExchangeRateInvoiceDate(invoiceDate);
                  setExchangeRateState({ status: "idle", message: "" });
                }}
                required
              />
            </FormField>
            <AnimatedIconButton
              icon={RefreshCw}
              variant="secondary"
              size="sm"
              disabled={exchangeRateState.status === "loading"}
              onClick={() => void refreshExchangeRate(currency, invoiceDate)}
            >
              {exchangeRateState.status === "loading" ? "Henter kurs ..." : "Hent kurs"}
            </AnimatedIconButton>
          </div>
          {exchangeRateState.message && (
            <p className={`text-sm ${exchangeRateState.status === "error" ? "text-red-700" : "text-slate-600"}`}>
              {exchangeRateState.message}
            </p>
          )}
        </section>
      )}

      <section className="border-t border-blue-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Kostnadslinjer</h3>
            <p className="text-sm text-slate-600">Beløpet legges inn i {currency} inkludert eventuell MVA. Bokført NOK-verdi beregnes med kursen over.</p>
          </div>
          <AnimatedIconButton
            icon={Plus}
            variant="secondary"
            size="sm"
            onClick={() => setLines((current) => [...current, createDraftLine(fallbackExpenseAccount?.id ?? "")])}
          >
            Ny linje
          </AnimatedIconButton>
        </div>

        <div className="mt-4 space-y-3">
          {lines.map((line, index) => {
            const calculated = calculateSupplierLine(line);
            const calculatedNok = calculateSupplierInvoiceNokTotals([line], numericExchangeRate);
            return (
              <div key={line.localId} className="grid gap-3 rounded-md border border-blue-100 bg-blue-50/40 p-4 lg:grid-cols-[1.5fr_1.3fr_120px_110px_auto] lg:items-end">
                <FormField label={index === 0
                  ? <PdfFieldLabel label="Beskrivelse 1" source={pdfFieldSources.lineDescription} />
                  : `Beskrivelse ${index + 1}`}>
                  <Input
                    value={line.description}
                    onChange={(event) => updateLine(
                      line.localId,
                      { description: event.target.value },
                      index === 0 ? "lineDescription" : undefined,
                    )}
                    required
                  />
                </FormField>
                <FormField label="Kostnadskonto">
                  <Select
                    ariaLabel={`Kostnadskonto for linje ${index + 1}`}
                    value={line.expenseAccountId}
                    options={expenseAccounts.map((account) => ({
                      value: account.id,
                      label: `${account.account_number} ${account.name}`,
                    }))}
                    onChange={(value) => updateLine(line.localId, { expenseAccountId: value })}
                  />
                </FormField>
                <FormField label={index === 0
                  ? <PdfFieldLabel label={`Beløp inkl. MVA (${currency})`} source={pdfFieldSources.grossAmount} />
                  : `Beløp inkl. MVA (${currency})`}>
                  <Input
                    inputMode="decimal"
                    value={line.grossAmount || ""}
                    onChange={(event) => updateLine(
                      line.localId,
                      { grossAmount: parseMoney(event.target.value) },
                      index === 0 ? "grossAmount" : undefined,
                    )}
                    required
                  />
                </FormField>
                <FormField label={index === 0
                  ? <PdfFieldLabel label="MVA-sats" source={pdfFieldSources.vatRate} />
                  : "MVA-sats"}>
                  <Select
                    ariaLabel={`MVA-sats for linje ${index + 1}`}
                    value={line.vatRate}
                    options={[25, 15, 12, 0].map((rate) => ({ value: rate, label: `${rate} %` }))}
                    onChange={(value) => updateLine(
                      line.localId,
                      { vatRate: Number(value) },
                      index === 0 ? "vatRate" : undefined,
                    )}
                  />
                </FormField>
                <div className="flex items-center justify-between gap-3 lg:block">
                  <div className="text-xs text-slate-600 lg:mb-2 lg:text-right">
                    <span className="block">Netto {formatMoney(calculated.netAmount, currency)}</span>
                    <span className="block">MVA {formatMoney(calculated.vatAmount, currency)}</span>
                    {currency !== "NOK" && (
                      <span className="mt-1 block text-slate-500">
                        Bokført {formatCurrency(calculatedNok.total)}
                      </span>
                    )}
                  </div>
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
          <dt className="text-slate-600">Netto</dt><dd className="text-right">{formatMoney(totals.subtotal, currency)}</dd>
          <dt className="text-slate-600">MVA</dt><dd className="text-right">{formatMoney(totals.vatTotal, currency)}</dd>
          <dt className="border-t border-blue-100 pt-2 font-semibold">Totalt</dt>
          <dd className="border-t border-blue-100 pt-2 text-right font-semibold">{formatMoney(totals.total, currency)}</dd>
          {currency !== "NOK" && (
            <>
              <dt className="mt-2 border-t border-blue-100 pt-2 font-semibold">Bokført i NOK</dt>
              <dd className="mt-2 border-t border-blue-100 pt-2 text-right font-semibold">{formatCurrency(nokTotals.total)}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="border-t border-blue-100 pt-5">
        <div className="rounded-md border border-blue-100 bg-slate-50 p-4">
          <label className="flex items-start gap-3">
            <Input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-blue-700"
              checked={markPaid}
              onChange={(event) => setMarkPaid(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">Fakturaen er allerede betalt</span>
              <span className="block text-xs text-slate-500">Oppretter et eget betalingsbilag mot bank.</span>
            </span>
          </label>
          {markPaid && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <FormField label="Betalingsdato">
                <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
              </FormField>
              <FormField label="Betalt fra konto">
                <Select
                  ariaLabel="Betalingskonto"
                  value={bankAccountId}
                  options={bankAccounts.map((account) => ({ value: account.id, label: `${account.account_number} ${account.name}` }))}
                  onChange={setBankAccountId}
                />
              </FormField>
              {currency !== "NOK" && (
                <FormField
                  label="Faktisk belastet bank (NOK)"
                  helper="Bruk NOK-beløpet fra bank- eller kortutskriften. Differansen bokføres som valutagevinst eller valutatap."
                >
                  <Input
                    inputMode="decimal"
                    value={paymentAmountNok}
                    onChange={(event) => setPaymentAmountNok(event.target.value)}
                    placeholder={String(nokTotals.total)}
                    required
                  />
                </FormField>
              )}
            </div>
          )}
        </div>
      </section>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-blue-100 bg-white py-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Avbryt</Button>
        <Button type="submit" disabled={saving || totals.total <= 0 || nokTotals.total <= 0}>
          {saving ? "Bokfører..." : "Bokfør inngående faktura"}
        </Button>
      </div>
    </form>
  );
}

function PdfFieldLabel({ label, source }: { label: string; source?: PdfFieldSource }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{label}</span>
      {source && (
        <span
          className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${source.confidence === "low" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-800"}`}
          title={`Hentet fra ${source.fileName} (${confidenceLabel(source.confidence)} sikkerhet): ${source.evidence}`}
        >
          Hentet fra PDF
        </span>
      )}
    </span>
  );
}

function sourceFor<T>(fileName: string, extracted: ExtractedValue<T>): PdfFieldSource {
  return {
    fileName,
    evidence: extracted.evidence,
    confidence: extracted.confidence,
  };
}

function findMatchingSupplier(suppliers: Supplier[], fields: SupplierInvoicePdfFields) {
  const orgNumber = fields.orgNumber?.value.replace(/\D/g, "");
  if (orgNumber) {
    const orgMatch = suppliers.find((supplier) => supplier.org_number?.replace(/\D/g, "") === orgNumber);
    if (orgMatch) return orgMatch;
  }

  const supplierName = fields.supplierName?.value;
  if (!supplierName) return undefined;
  const normalizedName = normalizeSupplierName(supplierName);
  return suppliers.find((supplier) => normalizeSupplierName(supplier.name) === normalizedName);
}

function normalizeSupplierName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]/gi, "")
    .toLowerCase();
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function pdfStatusClass(status: PdfImportState["status"]) {
  if (status === "error") return "border-red-200 bg-red-50 text-red-800";
  if (status === "warning" || status === "no-text") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function confidenceLabel(confidence: PdfFieldSource["confidence"]) {
  if (confidence === "high") return "høy";
  if (confidence === "medium") return "middels";
  return "lav";
}

function createDraftLine(expenseAccountId: string): SupplierInvoiceDraftLine {
  return {
    localId: crypto.randomUUID(),
    description: "",
    expenseAccountId,
    grossAmount: 0,
    vatRate: 25,
  };
}

function parseMoney(value: string) {
  return parseLocalizedMoney(value) ?? 0;
}

function parseRate(value: string) {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function supportedCurrency(value: string | undefined) {
  const normalized = value?.toUpperCase();
  return currencyOptions.some((option) => option.value === normalized) ? normalized : undefined;
}

function formatDateForMessage(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
