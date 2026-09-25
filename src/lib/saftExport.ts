import { supabase } from "../supabaseClient";
import { validateSaftPeriod, type SaftData } from "./saft/generate";
import { cancelled, loadWithDeadline, runExportWorker, type ExportStage } from "./saft/exportJob";
import ValidationWorker from "./saft/validate.worker?worker";

export async function downloadSaftExport(start: string, end: string, options: {
  signal?: AbortSignal;
  onProgress?: (stage: ExportStage) => void;
} = {}) {
  validateSaftPeriod(start, end);
  const signal = options.signal ?? new AbortController().signal;
  const onProgress = options.onProgress ?? (() => {});
  onProgress("loading");
  const { data, error } = await loadWithDeadline(
    (requestSignal) => supabase.rpc("get_saft_export_data", { p_end_date: end }).abortSignal(requestSignal), signal,
  );
  if (error) throw new Error(`Kunne ikke hente SAF-T-grunnlaget: ${error.message}`);
  if (!data) throw new Error("Ingen tilgang til regnskapsdata. Logg inn på nytt.");
  if (signal.aborted) throw cancelled();
  const snapshot = data as SaftData;
  const xml = await runExportWorker(new ValidationWorker(), { data: snapshot, start, end }, signal, onProgress);
  if (signal.aborted) throw cancelled();
  onProgress("downloading");
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `SAF-T Financial_${snapshot.profile!.org_number!.replace(/\s/g, "")}_${start}_${end}.xml`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
