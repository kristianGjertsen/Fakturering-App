import { useState } from "react";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { supabase } from "../../../supabaseClient";
import { resolveAccountMapping, resolveTaxMapping } from "../../../lib/saft/mappings";
import type { AccountingAccount, AccountingTaxCode, JournalEntry } from "../../../types";

export function SaftMappings({ accounts, taxCodes, entries, start, end, onRefresh }: {
  accounts: AccountingAccount[];
  taxCodes: AccountingTaxCode[];
  entries: JournalEntry[];
  start: string;
  end: string;
  onRefresh: () => Promise<void>;
}) {
  const usedAccounts = new Set(entries.filter((e) => e.entry_date <= end).flatMap((e) => (e.journal_lines ?? []).map((l) => l.account_id)));
  const usedTaxes = new Set(entries.filter((e) => e.entry_date >= start && e.entry_date <= end).flatMap((e) => (e.journal_lines ?? []).map((l) => l.tax_code_id)));
  const resolvedAccounts = accounts.map((a) => resolveAccountMapping(a, taxCodes));
  const resolvedTaxes = taxCodes.map(resolveTaxMapping);
  const missingAccounts = resolvedAccounts.filter((a) => usedAccounts.has(a.id) && (!a.saft_grouping_category || !a.saft_grouping_code));
  const missingTaxes = resolvedTaxes.filter((t) => usedTaxes.has(t.id) && !t.saft_standard_tax_code);
  const accountRow = (a: AccountingAccount) => <MappingRow key={`${a.id}-${a.saft_grouping_category}-${a.saft_grouping_code}`} table="accounting_accounts" id={a.id} label={`${a.account_number} ${a.name}`} category={a.saft_grouping_category ?? ""} code={a.saft_grouping_code ?? ""} onRefresh={onRefresh} />;
  const taxRow = (t: AccountingTaxCode) => <MappingRow key={`${t.id}-${t.saft_standard_tax_code}`} table="accounting_tax_codes" id={t.id} label={`MVA: ${t.code} – ${t.description}`} category="MVA" code={t.saft_standard_tax_code ?? ""} zeroOutput={t.direction === "output" && Number(t.rate) === 0} onRefresh={onRefresh} />;
  return <div className="mt-4 text-sm">
    <p className="text-slate-600">Standardkontoer og kjente MVA-koder kobles automatisk. Lagrede koblinger beholdes.</p>
    {(missingAccounts.length > 0 || missingTaxes.length > 0) && <details className="mt-3" open>
      <summary className="cursor-pointer font-medium text-amber-900">Koblinger som må avklares</summary>
      <p className="my-2 text-slate-600">Disse kontoene eller MVA-kodene kan ikke kobles sikkert automatisk. Ved salg uten MVA velger du hvorfor salget er uten MVA. Egendefinerte kontoer må knyttes til riktig SAF-T-gruppe.</p>
      <div className="max-h-96 space-y-3 overflow-auto">{missingAccounts.map((a) => a.system_key === "sales_0" && missingTaxes.some((t) => t.code === "OUTPUT_0") ? <p key={a.id} className="text-slate-600">{a.account_number} {a.name}: kontokoblingen følger MVA-behandlingen du velger nedenfor.</p> : accountRow(a))}{missingTaxes.map(taxRow)}</div>
    </details>}
    <details className="mt-3">
      <summary className="cursor-pointer font-medium text-blue-800">Vis eller overstyr SAF-T-koblinger</summary>
      <div className="mt-2 max-h-96 space-y-3 overflow-auto">
        {resolvedAccounts.filter((a) => a.saft_grouping_category && a.saft_grouping_code).map(accountRow)}
        {resolvedTaxes.filter((t) => t.saft_standard_tax_code).map(taxRow)}
      </div>
    </details>
  </div>;
}
function MappingRow({ table, id, label, category, code, zeroOutput = false, onRefresh }: {
  table: "accounting_accounts" | "accounting_tax_codes"; id: string; label: string; category: string; code: string; zeroOutput?: boolean; onRefresh: () => Promise<void>;
}) {
  const [group, setGroup] = useState(category);
  const [value, setValue] = useState(code);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isAccount = table === "accounting_accounts";
  async function save() {
    setBusy(true); setError("");
    try {
      const patch = isAccount ? { saft_grouping_category: group.trim(), saft_grouping_code: value.trim() }
        : { saft_tax_type: "MVA", saft_standard_tax_code: value.trim() };
      const result = await supabase.from(table).update(patch).eq("id", id).select("id").single();
      if (result.error) throw new Error(result.error.message);
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke lagre koblingen."); }
    finally { setBusy(false); }
  }
  return <div className="rounded border border-blue-100 p-2">
    <p className="mb-2 font-medium">{label}</p>
    <div className="flex flex-wrap items-end gap-2">
      {isAccount && <label>Grupperingskategori<Input value={group} maxLength={256} disabled={busy} onChange={(e) => setGroup(e.target.value)} /></label>}
      {zeroOutput ? <label>Hvorfor er salget uten MVA?
        <select className="block rounded border border-blue-200 p-2" value={value} disabled={busy} onChange={(e) => setValue(e.target.value)}>
          <option value="">Velg behandling</option>
          <option value="5">Fritatt innenlandsk omsetning (0 %)</option>
          <option value="6">Omsetning utenfor MVA-loven</option>
          <option value="52">Eksport av varer og tjenester</option>
          <option value="51">Innenlandsk omvendt avgiftsplikt</option>
          <option value="7">Inntekter som ikke er omsetning etter MVA-loven</option>
          {value && !["5", "6", "52", "51", "7"].includes(value) && <option value={value}>{value}</option>}
        </select>
      </label> : <label>{isAccount ? "Grupperingskode" : "Standard avgiftskode"}<Input value={value} maxLength={isAccount ? 35 : 2} disabled={busy} onChange={(e) => setValue(e.target.value)} /></label>}
      <Button size="sm" variant="secondary" disabled={busy || !group.trim() || !value.trim() || (group === category && value === code)} onClick={() => void save()}>{busy ? "Lagrer …" : "Lagre kobling"}</Button>
    </div>
    {error && <p role="alert" className="mt-2 text-red-800">{error}</p>}
  </div>;
}
