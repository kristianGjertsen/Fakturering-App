import { useMemo, useState, type FormEvent } from "react";
import { Banknote } from "@animateicons/react/lucide";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { roundMoney } from "../../../lib/accounting";
import { purchaseReimbursementTotals } from "../../../lib/data";
import { formatCurrency, formatDate, todayInputValue } from "../../../lib/format";
import { parseLocalizedMoney } from "../../../lib/supplierInvoiceParser";
import type { AccountingAccount, PurchasePaymentWithDetails } from "../../../types";

type PurchaseReimbursementFormProps = {
  purchases: PurchasePaymentWithDetails[];
  accounts: AccountingAccount[];
  saving: boolean;
  onSave: (
    purchase: PurchasePaymentWithDetails,
    date: string,
    bankAccountId: string,
    amount: number,
  ) => Promise<void>;
  onCancel: () => void;
};

export function PurchaseReimbursementForm({
  purchases,
  accounts,
  saving,
  onSave,
  onCancel,
}: PurchaseReimbursementFormProps) {
  const eligiblePurchases = useMemo(() => purchases.filter((purchase) =>
    purchase.payment_source === "private"
    && purchase.status !== "cancelled"
    && purchaseReimbursementTotals(purchase).remaining > 0,
  ), [purchases]);
  const bankAccounts = accounts.filter((account) => account.is_active && account.system_key === "bank");
  const [purchaseId, setPurchaseId] = useState(eligiblePurchases[0]?.id ?? "");
  const [date, setDate] = useState(todayInputValue());
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const initialPurchase = eligiblePurchases[0];
  const [amountInput, setAmountInput] = useState(initialPurchase
    ? formatMoneyInput(purchaseReimbursementTotals(initialPurchase).remaining)
    : "");
  const [error, setError] = useState("");
  const selectedPurchase = eligiblePurchases.find((purchase) => purchase.id === purchaseId) ?? null;
  const totals = selectedPurchase ? purchaseReimbursementTotals(selectedPurchase) : { reimbursed: 0, remaining: 0 };
  const parsedAmount = parseLocalizedMoney(amountInput);
  const amount = parsedAmount === null ? null : roundMoney(parsedAmount);

  function selectPurchase(nextPurchaseId: string) {
    const nextPurchase = eligiblePurchases.find((purchase) => purchase.id === nextPurchaseId);
    setPurchaseId(nextPurchaseId);
    setAmountInput(nextPurchase ? formatMoneyInput(purchaseReimbursementTotals(nextPurchase).remaining) : "");
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (!selectedPurchase) throw new Error("Velg et privat utlegg.");
      if (!date) throw new Error("Velg tilbakebetalingsdato.");
      if (!bankAccountId) throw new Error("Velg bankkonto for utbetalingen.");
      if (amount === null || amount <= 0) throw new Error("Beløpet må være større enn 0.");
      if (amount > totals.remaining) throw new Error("Beløpet kan ikke være større enn gjenstående beløp.");
      await onSave(selectedPurchase, date, bankAccountId, amount);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke bokføre tilbakebetalingen.");
    }
  }

  if (eligiblePurchases.length === 0) {
    return (
      <div className="space-y-5">
        <p className="py-8 text-center text-sm text-slate-600">Ingen private utlegg har et utestående beløp.</p>
        <div className="flex justify-end border-t border-blue-100 pt-4">
          <Button variant="secondary" onClick={onCancel}>Lukk</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <FormField label="Privat utlegg">
        <Select
          ariaLabel="Velg privat utlegg som skal tilbakebetales"
          value={purchaseId}
          options={eligiblePurchases.map((purchase) => ({
            value: purchase.id,
            label: `${formatDate(purchase.purchase_date)} · ${purchase.supplier_name} · ${formatCurrency(purchaseReimbursementTotals(purchase).remaining)}`,
          }))}
          onChange={selectPurchase}
        />
      </FormField>

      {selectedPurchase && (
        <section className="border-y border-blue-100 bg-white/60 px-1 py-4">
          <div className="flex items-start gap-3">
            <Banknote size={22} className="mt-0.5 shrink-0 text-blue-700" />
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-950">{selectedPurchase.supplier_name}</h3>
              <p className="mt-0.5 text-sm text-slate-600">{selectedPurchase.description}</p>
              <p className="mt-1 text-xs text-slate-500">Lagt ut av {selectedPurchase.paid_by}</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <SummaryValue label="Utlegg" value={formatCurrency(Number(selectedPurchase.total))} />
            <SummaryValue label="Tilbakebetalt" value={formatCurrency(totals.reimbursed)} />
            <SummaryValue label="Gjenstår" value={formatCurrency(totals.remaining)} emphasized />
          </dl>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tilbakebetalingsdato">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </FormField>
        <FormField label="Utbetalt fra bank">
          <Select
            ariaLabel="Velg bankkonto for tilbakebetaling"
            value={bankAccountId}
            options={bankAccounts.map((account) => ({
              value: account.id,
              label: `${account.account_number} ${account.name}`,
            }))}
            onChange={setBankAccountId}
          />
        </FormField>
      </div>

      <FormField label="Beløp" helper={`Gjenstående: ${formatCurrency(totals.remaining)}`}>
        <Input
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => { setAmountInput(event.target.value); setError(""); }}
          onBlur={() => {
            const parsed = parseLocalizedMoney(amountInput);
            if (parsed !== null && parsed > 0) setAmountInput(formatMoneyInput(parsed));
          }}
          required
        />
      </FormField>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-blue-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Avbryt</Button>
        <Button type="submit" disabled={saving || !selectedPurchase || !bankAccountId || amount === null || amount <= 0 || amount > totals.remaining}>
          {saving ? "Bokfører..." : "Bokfør tilbakebetaling"}
        </Button>
      </div>
    </form>
  );
}

function SummaryValue({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 font-semibold ${emphasized ? "text-blue-900" : "text-slate-950"}`}>{value}</dd>
    </div>
  );
}

function formatMoneyInput(value: number) {
  return value.toLocaleString("nb-NO", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
