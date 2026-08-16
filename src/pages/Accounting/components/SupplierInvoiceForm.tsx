import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, Upload } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input, inputClass } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { formatFileSize, ATTACHMENT_ACCEPT, validateAttachmentFiles } from "../../../lib/attachments";
import {
  calculateSupplierInvoiceTotals,
  calculateSupplierLine,
} from "../../../lib/accounting";
import type {
  AccountingAccount,
  Supplier,
  SupplierInvoiceDraftLine,
} from "../../../types";
import type { SupplierInput, SupplierInvoiceInput } from "../../../lib/data";
import { formatCurrency, todayInputValue } from "../../../lib/format";

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
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<SupplierInvoiceDraftLine[]>([
    createDraftLine(fallbackExpenseAccount?.id ?? ""),
  ]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState(today);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateSupplierInvoiceTotals(lines), [lines]);
  const availableSuppliers = createdSupplier
    ? [...suppliers.filter((supplier) => supplier.id !== createdSupplier.id), createdSupplier]
    : suppliers;

  function updateLine(localId: string, patch: Partial<SupplierInvoiceDraftLine>) {
    setLines((current) => current.map((line) => line.localId === localId ? { ...line, ...patch } : line));
    setError("");
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setAttachments((current) => [...current, ...Array.from(fileList)]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (dueDate && dueDate < invoiceDate) {
        throw new Error("Forfallsdato kan ikke være før fakturadato.");
      }
      const attachmentError = validateAttachmentFiles(attachments);
      if (attachmentError) throw new Error(attachmentError);
      if (lines.some((line) => !line.description.trim() || !line.expenseAccountId || line.grossAmount <= 0)) {
        throw new Error("Alle kostnadslinjer må ha tekst, konto og et beløp over 0.");
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
        description,
        lines,
        attachments,
        markPaid,
        paymentDate,
        bankAccountId: bankAccountId || null,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke lagre fakturaen.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <div className="flex rounded-md border border-blue-200 bg-white p-0.5 sm:w-fit">
          <Button
            variant={supplierMode === "existing" ? "primary" : "ghost"}
            size="sm"
            className="flex-1 shadow-none sm:flex-none"
            disabled={availableSuppliers.length === 0}
            onClick={() => setSupplierMode("existing")}
          >
            Lagret leverandør
          </Button>
          <Button
            variant={supplierMode === "new" ? "primary" : "ghost"}
            size="sm"
            className="flex-1 shadow-none sm:flex-none"
            onClick={() => setSupplierMode("new")}
          >
            Ny leverandør
          </Button>
        </div>

        {supplierMode === "existing" ? (
          <FormField label="Leverandør">
            <Select
              ariaLabel="Velg leverandør"
              value={supplierId}
              options={availableSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              onChange={(value) => {
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
            <FormField label="Leverandørnavn">
              <Input
                value={newSupplier.name}
                onChange={(event) => setNewSupplier((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </FormField>
            <FormField label="Organisasjonsnummer">
              <Input
                inputMode="numeric"
                value={newSupplier.orgNumber}
                onChange={(event) => setNewSupplier((current) => ({ ...current, orgNumber: event.target.value }))}
              />
            </FormField>
            <FormField label="E-post">
              <Input
                type="email"
                value={newSupplier.email}
                onChange={(event) => setNewSupplier((current) => ({ ...current, email: event.target.value }))}
              />
            </FormField>
            <FormField label="Kontonummer">
              <Input
                inputMode="numeric"
                value={newSupplier.bankAccount}
                onChange={(event) => setNewSupplier((current) => ({ ...current, bankAccount: event.target.value }))}
              />
            </FormField>
          </div>
        )}
      </section>

      <section className="grid gap-4 border-t border-blue-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Leverandørens fakturanummer">
          <Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
        </FormField>
        <FormField label="Fakturadato">
          <Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
        </FormField>
        <FormField label="Forfallsdato">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
        <FormField label="Kort beskrivelse">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="For eksempel programvare" />
        </FormField>
      </section>

      <section className="border-t border-blue-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Kostnadslinjer</h3>
            <p className="text-sm text-slate-600">Beløpet legges inn inkludert MVA. Netto og MVA beregnes per linje.</p>
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
            return (
              <div key={line.localId} className="grid gap-3 rounded-md border border-blue-100 bg-blue-50/40 p-4 lg:grid-cols-[1.5fr_1.3fr_120px_110px_auto] lg:items-end">
                <FormField label={`Beskrivelse ${index + 1}`}>
                  <Input value={line.description} onChange={(event) => updateLine(line.localId, { description: event.target.value })} required />
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
                <FormField label="Beløp inkl. MVA">
                  <Input
                    inputMode="decimal"
                    value={line.grossAmount || ""}
                    onChange={(event) => updateLine(line.localId, { grossAmount: parseMoney(event.target.value) })}
                    required
                  />
                </FormField>
                <FormField label="MVA-sats">
                  <Select
                    ariaLabel={`MVA-sats for linje ${index + 1}`}
                    value={line.vatRate}
                    options={[25, 15, 12, 0].map((rate) => ({ value: rate, label: `${rate} %` }))}
                    onChange={(value) => updateLine(line.localId, { vatRate: Number(value) })}
                  />
                </FormField>
                <div className="flex items-center justify-between gap-3 lg:block">
                  <div className="text-xs text-slate-600 lg:mb-2 lg:text-right">
                    <span className="block">Netto {formatCurrency(calculated.netAmount)}</span>
                    <span className="block">MVA {formatCurrency(calculated.vatAmount)}</span>
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
          <dt className="text-slate-600">Netto</dt><dd className="text-right">{formatCurrency(totals.subtotal)}</dd>
          <dt className="text-slate-600">MVA</dt><dd className="text-right">{formatCurrency(totals.vatTotal)}</dd>
          <dt className="border-t border-blue-100 pt-2 font-semibold">Totalt</dt>
          <dd className="border-t border-blue-100 pt-2 text-right font-semibold">{formatCurrency(totals.total)}</dd>
        </dl>
      </section>

      <section className="grid gap-5 border-t border-blue-100 pt-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Originaldokumenter</h3>
          <p className="mt-1 text-xs text-slate-500">PDF, JPG eller PNG. Maks 10 MB per fil og 20 MB totalt.</p>
          <input
            id="supplier-invoice-files"
            type="file"
            className="sr-only"
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={(event) => {
              addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <AnimatedIconButton
            icon={Upload}
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => document.getElementById("supplier-invoice-files")?.click()}
          >
            Last opp filer
          </AnimatedIconButton>
          {attachments.length > 0 && (
            <ul className="mt-3 divide-y divide-blue-100 rounded-md border border-blue-100 bg-white px-3">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{file.name} <span className="text-slate-500">({formatFileSize(file.size)})</span></span>
                  <Button size="xs" variant="ghost" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Fjern</Button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
            </div>
          )}
        </div>
      </section>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-blue-100 bg-white py-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Avbryt</Button>
        <Button type="submit" disabled={saving || totals.total <= 0}>
          {saving ? "Bokfører..." : "Bokfør inngående faktura"}
        </Button>
      </div>
    </form>
  );
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
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
