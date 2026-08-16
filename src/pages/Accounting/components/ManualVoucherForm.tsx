import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { FormField } from "../../../components/FormField";
import { Input } from "../../../components/Input";
import { Select } from "../../../components/Select";
import { roundMoney } from "../../../lib/accounting";
import type { ManualJournalLineInput } from "../../../lib/data";
import { formatCurrency, todayInputValue } from "../../../lib/format";
import type { AccountingAccount } from "../../../types";

type DraftLine = ManualJournalLineInput & { localId: string };

type ManualVoucherFormProps = {
  accounts: AccountingAccount[];
  saving: boolean;
  onSave: (date: string, description: string, lines: ManualJournalLineInput[]) => Promise<void>;
  onCancel: () => void;
};

export function ManualVoucherForm({ accounts, saving, onSave, onCancel }: ManualVoucherFormProps) {
  const activeAccounts = accounts.filter((account) => account.is_active);
  const [date, setDate] = useState(todayInputValue());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    newLine(activeAccounts[0]?.id ?? ""),
    newLine(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? ""),
  ]);
  const [error, setError] = useState("");
  const totals = useMemo(() => lines.reduce(
    (result, line) => ({
      debit: roundMoney(result.debit + line.debit),
      credit: roundMoney(result.credit + line.credit),
    }),
    { debit: 0, credit: 0 },
  ), [lines]);
  const difference = roundMoney(totals.debit - totals.credit);

  function updateLine(localId: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.localId === localId ? { ...line, ...patch } : line));
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!description.trim()) return setError("Skriv inn en beskrivelse av bilaget.");
    if (totals.debit <= 0 || difference !== 0) return setError("Debet og kredit må være like og større enn 0.");

    try {
      await onSave(date, description, lines.map(({ localId: _localId, ...line }) => line));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke bokføre bilaget.");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <FormField label="Bilagsdato">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </FormField>
        <FormField label="Beskrivelse">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Hva gjelder bilaget?" required />
        </FormField>
      </div>

      <div className="overflow-x-auto rounded-md border border-blue-100">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3 font-semibold">Konto</th>
              <th className="px-3 py-3 font-semibold">Linjetekst</th>
              <th className="px-3 py-3 text-right font-semibold">Debet</th>
              <th className="px-3 py-3 text-right font-semibold">Kredit</th>
              <th className="w-12 px-2 py-3"><span className="sr-only">Handling</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100">
            {lines.map((line, index) => (
              <tr key={line.localId}>
                <td className="w-64 p-2">
                  <Select
                    ariaLabel={`Konto for bilagslinje ${index + 1}`}
                    value={line.accountId}
                    options={activeAccounts.map((account) => ({
                      value: account.id,
                      label: `${account.account_number} ${account.name}`,
                    }))}
                    onChange={(value) => updateLine(line.localId, { accountId: value })}
                  />
                </td>
                <td className="p-2">
                  <Input value={line.description} onChange={(event) => updateLine(line.localId, { description: event.target.value })} />
                </td>
                <td className="w-32 p-2">
                  <Input
                    className="text-right"
                    inputMode="decimal"
                    value={line.debit || ""}
                    onChange={(event) => updateLine(line.localId, { debit: parseMoney(event.target.value), credit: 0 })}
                  />
                </td>
                <td className="w-32 p-2">
                  <Input
                    className="text-right"
                    inputMode="decimal"
                    value={line.credit || ""}
                    onChange={(event) => updateLine(line.localId, { credit: parseMoney(event.target.value), debit: 0 })}
                  />
                </td>
                <td className="p-2">
                  <AnimatedIconButton
                    icon={Trash2}
                    variant="ghost"
                    size="xs"
                    className="h-9 w-9 !p-0"
                    disabled={lines.length <= 2}
                    onClick={() => setLines((current) => current.filter((item) => item.localId !== line.localId))}
                    title="Fjern linje"
                  >
                    <span className="sr-only">Fjern linje</span>
                  </AnimatedIconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-blue-200 bg-blue-50/50 font-semibold">
            <tr>
              <td colSpan={2} className="px-3 py-3">Sum</td>
              <td className="px-3 py-3 text-right">{formatCurrency(totals.debit)}</td>
              <td className="px-3 py-3 text-right">{formatCurrency(totals.credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AnimatedIconButton
          icon={Plus}
          variant="secondary"
          size="sm"
          onClick={() => setLines((current) => [...current, newLine(activeAccounts[0]?.id ?? "")])}
        >
          Ny linje
        </AnimatedIconButton>
        <p className={`text-sm font-semibold ${difference === 0 ? "text-emerald-700" : "text-red-700"}`}>
          Differanse: {formatCurrency(difference)}
        </p>
      </div>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-blue-100 pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Avbryt</Button>
        <Button type="submit" disabled={saving || difference !== 0 || totals.debit <= 0}>
          {saving ? "Bokfører..." : "Bokfør bilag"}
        </Button>
      </div>
    </form>
  );
}

function newLine(accountId: string): DraftLine {
  return { localId: crypto.randomUUID(), accountId, description: "", debit: 0, credit: 0 };
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? roundMoney(Math.max(0, parsed)) : 0;
}
