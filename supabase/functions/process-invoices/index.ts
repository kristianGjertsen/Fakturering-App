import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { base64ToBytes, bytesToBase64 } from "../_shared/base64.ts";
import { escapeHtml } from "../_shared/html.ts";
import { createInvoicePdfBase64 } from "../_shared/invoice-pdf.ts";
import {
  BATCH_LIMIT,
  createRunSnapshot,
  fetchDueSchedules,
  finalizeRun,
  reconcileInterruptedRuns,
  sendCronRunReports,
  updateRunItem,
} from "./cronRunTracking.ts";
import { loadStoredAttachments } from "./storedAttachments.ts";
import type { ClaimedInvoice, ProcessingFailure } from "./types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRON_SECRET");
const cronDebugEmailsEnabled = Deno.env.get("CRON_DEBUG_EMAILS") === "true";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    return jsonResponse({ error: "Missing server configuration" }, 500);
  }

  if (request.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const requestBody = await request.json().catch(() => ({})) as { triggeredBy?: string };
  const triggerSource = requestBody.triggeredBy?.slice(0, 100) || "unknown";
  const cutoffAt = new Date().toISOString();

  const interruptedRunIds = await reconcileInterruptedRuns(supabase);

  if (cronDebugEmailsEnabled && interruptedRunIds.length > 0) {
    await sendCronRunReports(supabase, interruptedRunIds);
  }

  const { data: run, error: runError } = await supabase
    .from("invoice_cron_runs")
    .insert({ cutoff_at: cutoffAt, trigger_source: triggerSource })
    .select("id")
    .single();

  if (runError || !run) {
    console.error("Failed to create invoice cron run", runError);
    return jsonResponse({ error: "Failed to create invoice cron run" }, 500);
  }

  const runId = run.id as string;

  try {
    const schedules = await fetchDueSchedules(supabase, cutoffAt);
    await createRunSnapshot(supabase, runId, schedules);

    const schedulesToProcess = schedules.slice(0, BATCH_LIMIT);
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const failures: ProcessingFailure[] = [];

    for (const schedule of schedulesToProcess) {
      let invoice: ClaimedInvoice | null = null;
      let emailSent = false;
      let resendEmailId: string | null = null;

      processed += 1;
      await updateRunItem(supabase, runId, schedule.id, {
        status: "processing",
        reason: null,
        started_at: new Date().toISOString(),
      });

      try {
        const { data: claimed, error: claimError } = await supabase.rpc(
          "claim_scheduled_invoice",
          {
            p_schedule_id: schedule.id,
            p_scheduled_for: schedule.next_run_at,
          },
        );

        if (claimError) {
          throw claimError;
        }

        invoice = claimed as ClaimedInvoice | null;

        if (!invoice) {
          skipped += 1;
          await updateRunItem(supabase, runId, schedule.id, {
            status: "skipped",
            reason: "Planen var ikke lenger tilgjengelig for behandling da forsøket startet.",
            finished_at: new Date().toISOString(),
          });
          continue;
        }

        await updateRunItem(supabase, runId, schedule.id, { invoice_id: invoice.id });

        if (!invoice.company?.email) {
          throw new Error("Kunden mangler e-postadresse.");
        }

        let attachmentContent: string;

        if (invoice.pdf_storage_path) {
          const { data: storedPdf, error: pdfDownloadError } = await supabase.storage
            .from("invoice-pdfs")
            .download(invoice.pdf_storage_path);

          if (pdfDownloadError) {
            throw pdfDownloadError;
          }

          attachmentContent = bytesToBase64(
            new Uint8Array(await storedPdf.arrayBuffer()),
          );
        } else {
          attachmentContent = createInvoicePdfBase64(invoice);
          const pdfPath = `${invoice.owner_user_id}/${invoice.id}.pdf`;
          const { error: pdfUploadError } = await supabase.storage
            .from("invoice-pdfs")
            .upload(pdfPath, base64ToBytes(attachmentContent), {
              contentType: "application/pdf",
              upsert: false,
            });

          if (pdfUploadError) {
            throw pdfUploadError;
          }

          const { error: pdfLockError } = await supabase
            .from("invoices")
            .update({
              pdf_storage_path: pdfPath,
              pdf_locked_at: new Date().toISOString(),
            })
            .eq("id", invoice.id)
            .is("pdf_storage_path", null);

          if (pdfLockError) {
            throw pdfLockError;
          }

          invoice.pdf_storage_path = pdfPath;
        }

        const storedAttachments = await loadStoredAttachments(
          supabase,
          invoice.invoice_attachments ?? [],
          invoice.invoice_items,
        );
        const receiptText = storedAttachments.length > 0
          ? ` og ${storedAttachments.length} vedlegg`
          : "";
        const { data: sendResult, error: sendError } = await supabase.functions.invoke(
          "send-invoice",
          {
            body: {
              to: invoice.company.email,
              subject: `Faktura ${invoice.invoice_number}`,
              html: `<p>Hei ${escapeHtml(invoice.company.name)}, vedlagt ligger faktura ${escapeHtml(invoice.invoice_number)}${receiptText}.</p>`,
              attachments: [
                {
                  filename: `00_Faktura.nr:${invoice.invoice_number}.pdf`,
                  content: attachmentContent,
                },
                ...storedAttachments,
              ],
            },
          },
        );

        if (sendError) {
          throw sendError;
        }

        if (sendResult?.error) {
          throw new Error(
            typeof sendResult.error === "string"
              ? sendResult.error
              : sendResult.error.message ?? "E-postleverandøren avviste fakturaen.",
          );
        }

        emailSent = true;
        resendEmailId = typeof sendResult?.id === "string" ? sendResult.id : null;

        const { error: completeError } = await supabase.rpc(
          "complete_scheduled_invoice",
          { p_invoice_id: invoice.id },
        );

        if (completeError) {
          throw completeError;
        }

        sent += 1;
        await updateRunItem(supabase, runId, schedule.id, {
          status: "sent",
          reason: "E-posten ble godtatt av Resend.",
          resend_email_id: resendEmailId,
          finished_at: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to process invoice schedule ${schedule.id}`, error);
        failures.push({ scheduleId: schedule.id, message });

        if (emailSent) {
          sent += 1;
          await updateRunItem(supabase, runId, schedule.id, {
            status: "sent",
            reason: `E-posten ble godtatt av Resend, men ferdigstilling av planen feilet: ${message}`,
            resend_email_id: resendEmailId,
            finished_at: new Date().toISOString(),
          });
        } else {
          await updateRunItem(supabase, runId, schedule.id, {
            status: "failed",
            reason: message,
            finished_at: new Date().toISOString(),
          });
        }

        if (invoice && !emailSent) {
          const { error: releaseError } = await supabase.rpc(
            "release_scheduled_invoice",
            { p_invoice_id: invoice.id },
          );

          if (releaseError) {
            console.error(`Failed to release invoice ${invoice.id}`, releaseError);
          }
        }
      }
    }

    const deferred = Math.max(0, schedules.length - schedulesToProcess.length);
    const finalStatus = failures.length > 0 || skipped > 0 || deferred > 0
      ? "partial"
      : "completed";
    await finalizeRun(supabase, runId, finalStatus);

    if (cronDebugEmailsEnabled && schedules.length > 0) {
      await sendCronRunReports(supabase, [runId]);
    }

    return jsonResponse({
      runId,
      due: schedules.length,
      processed,
      sent,
      failed: failures.length,
      skipped,
      deferred,
      failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Invoice cron run ${runId} failed`, error);

    await supabase
      .from("invoice_cron_run_items")
      .update({
        status: "interrupted",
        reason: `Cron-kjøringen stoppet før et endelig resultat ble registrert: ${message}`,
        finished_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .in("status", ["pending", "processing"]);

    await finalizeRun(supabase, runId, "failed", message);

    if (cronDebugEmailsEnabled) {
      await sendCronRunReports(supabase, [runId]);
    }

    return jsonResponse({ runId, error: message }, 500);
  }
});
