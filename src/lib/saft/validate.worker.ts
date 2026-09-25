import schema from "./Financial-1.40.xsd?raw";
import { generateSaft, SaftValidationError } from "./generate";
import type { ExportRequest, WorkerReply } from "./exportJob";

const reply = (message: WorkerReply) => self.postMessage(message);

// Install the listener before starting asynchronous WASM initialization. The caller
// waits for ready, so its first message cannot be lost during module evaluation.
self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    reply({ type: "progress", stage: "generating" });
    const { data, start, end } = event.data;
    const xml = generateSaft(data, start, end);
    reply({ type: "progress", stage: "initializing" });
    const { validateSaftXml } = await import("./validate");
    reply({ type: "progress", stage: "validating" });
    validateSaftXml(xml, schema);
    reply({ type: "complete", xml });
  } catch (error) {
    reply({ type: "error", issues: error instanceof SaftValidationError ? error.issues : [
      `SAF-T-filen kunne ikke valideres: ${error instanceof Error ? error.message : String(error)}`,
    ] });
  }
};
reply({ type: "ready" });
