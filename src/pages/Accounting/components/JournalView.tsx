import { useMemo, useState } from "react";
import { Plus, Download } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../../components/AnimatedIconButton";
import { Input } from "../../../components/Input";
import { Panel } from "../../../components/layout/Panel";
import { formatCurrency, formatDate } from "../../../lib/format";
import { journalEntryTotal, sourceTypeLabel } from "../../../lib/accounting";
import type { JournalEntry } from "../../../types";

type JournalViewProps = {
  year: number;
  entries: JournalEntry[];
  onOpenManualVoucher: () => void;
};

export function JournalView({ year, entries, onOpenManualVoucher }: JournalViewProps) {
  const [search, setSearch] = useState("");
  const [openEntryId, setOpenEntryId] = useState("");
  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (!entry.entry_date.startsWith(String(year))) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [entry.voucher_number, entry.description, sourceTypeLabel(entry.source_type),
      ...(entry.journal_lines ?? []).flatMap((line) => [line.account?.account_number, line.account?.name, line.description])]
      .some((value) => String(value ?? "").toLowerCase().includes(term));
  }), [entries, search, year]);

  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-blue-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-950">Bilagsjournal {year}</h3>
          <p className="text-xs text-slate-500">{filteredEntries.length} bokførte bilag. Åpne et bilag for å se debet og kredit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnimatedIconButton icon={Download} variant="secondary" size="sm" onClick={() => downloadJournalCsv(filteredEntries, year)} disabled={filteredEntries.length === 0}>
            Last ned CSV
          </AnimatedIconButton>
          <AnimatedIconButton icon={Plus} size="sm" onClick={onOpenManualVoucher}>
            Manuelt bilag
          </AnimatedIconButton>
        </div>
      </div>
      <div className="border-b border-blue-100 p-4">
        <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk på bilagsnummer, tekst eller konto" />
      </div>

      {filteredEntries.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-500">Ingen bilag i valgt år.</p>
      ) : (
        <div className="divide-y divide-blue-100">
          {filteredEntries.map((entry) => {
            const open = openEntryId === entry.id;
            const debit = (entry.journal_lines ?? []).reduce((sum, line) => sum + Number(line.debit), 0);
            const credit = (entry.journal_lines ?? []).reduce((sum, line) => sum + Number(line.credit), 0);
            return (
              <article key={entry.id}>
                <button
                  type="button"
                  className={`grid w-full grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-blue-50 sm:grid-cols-[80px_110px_minmax(0,1fr)_150px_120px] ${open ? "bg-blue-50" : "bg-white"}`}
                  onClick={() => setOpenEntryId(open ? "" : entry.id)}
                  aria-expanded={open}
                >
                  <span className="font-semibold text-blue-800">#{entry.voucher_number}</span>
                  <span className="hidden text-sm text-slate-600 sm:block">{formatDate(entry.entry_date)}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-950">{entry.description}</span><span className="block text-xs text-slate-500 sm:hidden">{formatDate(entry.entry_date)} · {sourceTypeLabel(entry.source_type)}</span></span>
                  <span className="hidden text-sm text-slate-600 sm:block">{sourceTypeLabel(entry.source_type)}</span>
                  <span className="whitespace-nowrap text-right text-sm font-semibold">{formatCurrency(journalEntryTotal(entry))}</span>
                </button>
                {open && (
                  <div className="border-t border-blue-100 bg-slate-50 px-4 py-4 sm:px-8">
                    <div className="overflow-x-auto rounded-md border border-blue-100 bg-white">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <tr><th className="px-3 py-2 font-semibold">Konto</th><th className="px-3 py-2 font-semibold">Tekst</th><th className="px-3 py-2 text-right font-semibold">Debet</th><th className="px-3 py-2 text-right font-semibold">Kredit</th></tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50">
                          {(entry.journal_lines ?? []).map((line) => (
                            <tr key={line.id}>
                              <td className="px-3 py-2 font-medium">{line.account?.account_number} {line.account?.name}</td>
                              <td className="px-3 py-2 text-slate-600">{line.description || "-"}</td>
                              <td className="px-3 py-2 text-right">{Number(line.debit) > 0 ? formatCurrency(Number(line.debit)) : "-"}</td>
                              <td className="px-3 py-2 text-right">{Number(line.credit) > 0 ? formatCurrency(Number(line.credit)) : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-blue-200 bg-blue-50 font-semibold">
                          <tr><td colSpan={2} className="px-3 py-2">Kontroll</td><td className="px-3 py-2 text-right">{formatCurrency(debit)}</td><td className="px-3 py-2 text-right">{formatCurrency(credit)}</td></tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className={`mt-2 text-right text-xs font-semibold ${Math.abs(debit - credit) < 0.005 ? "text-emerald-700" : "text-red-700"}`}>
                      {Math.abs(debit - credit) < 0.005 ? "Bilaget balanserer" : `Avvik ${formatCurrency(debit - credit)}`}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function downloadJournalCsv(entries: JournalEntry[], year: number) {
  const rows = [
    ["Bilag", "Dato", "Type", "Beskrivelse", "Konto", "Kontonavn", "Linjetekst", "Debet", "Kredit"],
    ...entries.flatMap((entry) => (entry.journal_lines ?? []).map((line) => [
      entry.voucher_number,
      entry.entry_date,
      sourceTypeLabel(entry.source_type),
      entry.description,
      line.account?.account_number ?? "",
      line.account?.name ?? "",
      line.description ?? "",
      Number(line.debit).toFixed(2),
      Number(line.credit).toFixed(2),
    ])),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bilagsjournal-${year}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
