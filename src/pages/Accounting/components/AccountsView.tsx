import { useMemo, useState } from "react";
import { Plus } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Tag } from "../../../components/Tag";
import { Panel } from "../../../components/layout/Panel";
import { DetailModal } from "../../../components/layout/DetailModal";
import { FormField } from "../../../components/FormField";
import { Select } from "../../../components/Select";
import { categoryLabel, roundMoney } from "../../../lib/accounting";
import { formatCurrency, formatDate } from "../../../lib/format";
import type { AccountingAccount, AccountingAccountCategory, JournalEntry } from "../../../types";

type AccountsViewProps = {
  year: number;
  accounts: AccountingAccount[];
  entries: JournalEntry[];
  updatingAccountId: string;
  onToggleActive: (account: AccountingAccount) => void;
  onCreateAccount: (accountNumber: string, name: string, category: AccountingAccountCategory) => Promise<void>;
};

export function AccountsView({ year, accounts, entries, updatingAccountId, onToggleActive, onCreateAccount }: AccountsViewProps) {
  const [search, setSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountCategory, setAccountCategory] = useState<AccountingAccountCategory>("expense");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const filteredAccounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => !term || `${account.account_number} ${account.name} ${categoryLabel(account.category)}`.toLowerCase().includes(term));
  }, [accounts, search]);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:items-start">
      <Panel padding="none" className="overflow-hidden">
        <div className="border-b border-blue-100 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Kontoplan</h3><p className="mt-1 text-xs text-slate-500">Systemkontoene brukes av automatisk bokføring. Andre kontoer kan skjules fra nye bilag.</p></div><AnimatedIconButton icon={Plus} size="sm" onClick={() => setShowCreateAccount(true)}>Ny konto</AnimatedIconButton></div>
          <Input className="mt-4" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk etter kontonummer eller navn" />
        </div>
        <div className="divide-y divide-blue-100">
          {filteredAccounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-blue-50 ${selectedAccountId === account.id ? "bg-blue-50" : "bg-white"}`}
              onClick={() => setSelectedAccountId(account.id)}
            >
              <span className="font-semibold text-blue-800">{account.account_number}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-950">{account.name}</span><span className="text-xs text-slate-500">{categoryLabel(account.category)}</span></span>
              <span className="flex items-center gap-2">
                {account.is_system && <Tag tone="info">System</Tag>}
                <Tag tone={account.is_active ? "success" : "neutral"}>{account.is_active ? "Aktiv" : "Skjult"}</Tag>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="lg:sticky lg:top-6">
        {selectedAccount ? (
          <AccountLedger account={selectedAccount} entries={entries} year={year} updating={updatingAccountId === selectedAccount.id} onToggle={() => onToggleActive(selectedAccount)} />
        ) : (
          <div className="py-12 text-center"><p className="font-medium text-slate-800">Velg en konto</p><p className="mt-1 text-sm text-slate-500">Da vises alle posteringene som forklarer saldoen.</p></div>
        )}
      </Panel>

      <DetailModal open={showCreateAccount} onClose={() => !creating && setShowCreateAccount(false)} title="Ny konto" ariaLabel="Opprett konto i kontoplanen">
        <form className="mx-auto max-w-xl space-y-4" onSubmit={(event) => {
          event.preventDefault();
          setCreating(true);
          setFormError("");
          void onCreateAccount(accountNumber, accountName, accountCategory)
            .then(() => {
              setShowCreateAccount(false);
              setAccountNumber("");
              setAccountName("");
              setAccountCategory("expense");
            })
            .catch((error) => setFormError(error instanceof Error ? error.message : "Kunne ikke opprette kontoen."))
            .finally(() => setCreating(false));
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kontonummer"><Input inputMode="numeric" maxLength={4} value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, ""))} required /></FormField>
            <FormField label="Kontotype"><Select ariaLabel="Kontotype" value={accountCategory} options={(["asset", "liability", "equity", "revenue", "expense"] as AccountingAccountCategory[]).map((category) => ({ value: category, label: categoryLabel(category) }))} onChange={(value) => setAccountCategory(value as AccountingAccountCategory)} /></FormField>
          </div>
          <FormField label="Kontonavn"><Input value={accountName} onChange={(event) => setAccountName(event.target.value)} required /></FormField>
          {formError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-blue-100 pt-4"><Button variant="secondary" disabled={creating} onClick={() => setShowCreateAccount(false)}>Avbryt</Button><Button type="submit" disabled={creating}>{creating ? "Oppretter..." : "Opprett konto"}</Button></div>
        </form>
      </DetailModal>
    </div>
  );
}

function AccountLedger({ account, entries, year, updating, onToggle }: {
  account: AccountingAccount;
  entries: JournalEntry[];
  year: number;
  updating: boolean;
  onToggle: () => void;
}) {
  const rows = entries
    .filter((entry) => entry.entry_date <= `${year}-12-31`)
    .flatMap((entry) => (entry.journal_lines ?? [])
      .filter((line) => line.account_id === account.id)
      .map((line) => ({ entry, line })))
    .sort((left, right) => left.entry.entry_date.localeCompare(right.entry.entry_date)
      || left.entry.voucher_number - right.entry.voucher_number);
  const debit = rows.reduce((sum, row) => sum + Number(row.line.debit), 0);
  const credit = rows.reduce((sum, row) => sum + Number(row.line.credit), 0);
  const debitNormal = account.category === "asset" || account.category === "expense";
  const balance = roundMoney(debitNormal ? debit - credit : credit - debit);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-blue-800">{account.account_number}</p><h3 className="text-lg font-semibold text-slate-950">{account.name}</h3><p className="text-sm text-slate-500">Saldo til og med 31.12.{year}</p></div>
        {!account.is_system && <Button size="xs" variant="secondary" disabled={updating} onClick={onToggle}>{updating ? "Lagrer..." : account.is_active ? "Skjul" : "Aktiver"}</Button>}
      </div>
      <p className="mt-4 text-3xl font-semibold text-slate-950">{formatCurrency(balance)}</p>
      <div className="mt-5 max-h-[54vh] overflow-auto rounded-md border border-blue-100">
        {rows.length === 0 ? <p className="p-5 text-sm text-slate-500">Ingen posteringer på kontoen.</p> : (
          <table className="w-full min-w-[460px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Dato</th><th className="px-3 py-2">Bilag</th><th className="px-3 py-2">Tekst</th><th className="px-3 py-2 text-right">Debet</th><th className="px-3 py-2 text-right">Kredit</th></tr></thead>
            <tbody className="divide-y divide-blue-50">{rows.map(({ entry, line }) => <tr key={line.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(entry.entry_date)}</td><td className="px-3 py-2 font-medium">#{entry.voucher_number}</td><td className="px-3 py-2 text-slate-600">{line.description || entry.description}</td><td className="px-3 py-2 text-right">{Number(line.debit) ? formatCurrency(Number(line.debit)) : "-"}</td><td className="px-3 py-2 text-right">{Number(line.credit) ? formatCurrency(Number(line.credit)) : "-"}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Sum debet</dt><dd className="font-medium">{formatCurrency(debit)}</dd></div><div><dt className="text-slate-500">Sum kredit</dt><dd className="font-medium">{formatCurrency(credit)}</dd></div></dl>
    </>
  );
}
