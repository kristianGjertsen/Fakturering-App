import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { downloadSaftExport } from "../../../lib/saftExport";
import { SaftValidationError } from "../../../lib/saft/generate";

import { exportStageLabels, type ExportStage } from "../../../lib/saft/exportJob";
import { SaftMappings } from "./SaftMappings";
import type { AccountingData } from "../../../lib/accountingData";

export function SaftExport({ year, accounting, onRefresh }: { year: number; accounting: AccountingData; onRefresh: () => Promise<void> }) {
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const controller = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<ExportStage>("loading");
  useEffect(() => () => controller.current?.abort(), []);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  async function download() {
    controller.current = new AbortController();
    setStage("loading");
    setBusy(true); setErrors([]); setDone(false);
    try {
      await downloadSaftExport(start, end, { signal: controller.current.signal, onProgress: setStage });
      setDone(true);
    } catch (error) {
      setErrors(error instanceof SaftValidationError ? error.issues : [error instanceof Error ? error.message : "Eksporten mislyktes."]);
    } finally { controller.current = null; setBusy(false); }
  }
  return <section className="my-4 rounded-lg border border-blue-200 bg-white p-4" aria-label="SAF-T-eksport">
    <h2 className="font-semibold text-slate-900">Eksporter SAF-T Financial 1.40</h2>
    <p className="mt-1 text-sm text-slate-600">Last ned kontoplan, saldoer og bokførte bilag for hele året eller en valgt periode. Filen valideres før nedlasting.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-sm">Fra dato<Input type="date" value={start} min={`${year}-01-01`} max={`${year}-12-31`} disabled={busy} onChange={(e) => { setStart(e.target.value); setDone(false); }} /></label>
      <label className="text-sm">Til dato<Input type="date" value={end} min={`${year}-01-01`} max={`${year}-12-31`} disabled={busy} onChange={(e) => { setEnd(e.target.value); setDone(false); }} /></label>
      <Button disabled={busy || !start || !end} onClick={() => void download()}>{busy ? exportStageLabels[stage] : "Last ned SAF-T"}</Button>
      {busy && <Button variant="secondary" onClick={() => controller.current?.abort()}>Avbryt</Button>}
    </div>
    {busy && <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600">{exportStageLabels[stage]}</p>}
    <SaftMappings accounts={accounting.accounts} taxCodes={accounting.taxCodes} entries={accounting.journalEntries} start={start} end={end} onRefresh={onRefresh} />
    {errors.length > 0 && <div role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
      <p className="font-semibold">Eksporten ble stoppet. Rett følgende før du prøver igjen:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error, i) => <li key={i} className="whitespace-pre-wrap break-words">{error}</li>)}</ul>
    </div>}
    {done && <p role="status" className="mt-3 text-sm text-emerald-800">SAF-T-filen er validert og nedlastingen er startet.</p>}
  </section>;
}
