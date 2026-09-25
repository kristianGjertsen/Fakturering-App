import { SaftValidationError, type SaftData } from "./generate.ts";

export type ExportStage = "loading" | "starting" | "generating" | "initializing" | "validating" | "downloading";
export const exportStageLabels: Record<ExportStage, string> = {
  loading: "Henter regnskapsdata …",
  starting: "Starter eksport …",
  generating: "Genererer SAF-T-fil …",
  initializing: "Starter filvalidering …",
  validating: "Validerer SAF-T-fil …",
  downloading: "Starter nedlasting …",
};
export type ExportRequest = { data: SaftData; start: string; end: string };
export type WorkerReply =
  | { type: "ready" }
  | { type: "progress"; stage: "generating" | "initializing" | "validating" }
  | { type: "complete"; xml: string }
  | { type: "error"; issues: string[] };

export const cancelled = () => new Error("Eksporten ble avbrutt.");

/** Also bounds waits before fetch starts, e.g. while the auth client acquires its lock. */
export async function loadWithDeadline<T>(load: (signal: AbortSignal) => PromiseLike<T>, signal: AbortSignal, timeoutMs = 30_000): Promise<T> {
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: () => void = () => {};
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        stop = () => { request.abort(); reject(cancelled()); };
        signal.addEventListener("abort", stop, { once: true });
        if (signal.aborted) { stop(); return; }
        timer = setTimeout(() => {
          request.abort();
          reject(new Error("Henting av regnskapsdata tok for lang tid. Kontroller tilkoblingen og prøv igjen."));
        }, timeoutMs);
      }),
      Promise.resolve().then(() => {
        if (request.signal.aborted) throw cancelled();
        return load(request.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

export function runExportWorker(
  worker: Worker,
  request: ExportRequest,
  signal: AbortSignal,
  onProgress: (stage: ExportStage) => void,
  timeouts = { starting: 15_000, generating: 60_000, initializing: 20_000, validating: 60_000 },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    let finished = false;
    const finish = (error?: Error, xml?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error); else resolve(xml!);
    };
    const abort = () => finish(cancelled());
    const progress = (stage: keyof typeof timeouts) => {
      clearTimeout(timer);
      onProgress(stage);
      timer = setTimeout(() => finish(new Error(`${exportStageLabels[stage].replace(" …", "")} tok for lang tid. Filen ble ikke lastet ned. Prøv igjen.`)), timeouts[stage]);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(new Error(`SAF-T-eksporten kunne ikke kjøres: ${event.message || "Arbeidsprosessen kunne ikke starte."}`));
    };
    worker.onmessageerror = () => finish(new Error("Kunne ikke lese svaret fra SAF-T-eksporten. Prøv igjen."));
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (finished) return;
      const reply = event.data;
      if (reply.type === "ready" && !sent) {
        sent = true;
        progress("generating");
        try { worker.postMessage(request); }
        catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      } else if (reply.type === "progress") {
        progress(reply.stage);
      } else if (reply.type === "error") {
        finish(new SaftValidationError(reply.issues));
      } else if (reply.type === "complete") {
        finish(undefined, reply.xml);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    progress("starting");
  });
}
