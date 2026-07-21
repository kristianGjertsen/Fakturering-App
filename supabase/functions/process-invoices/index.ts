import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createInvoicePdfBase64, type PdfTemplate } from "../_shared/invoice-pdf.ts";

type SupabaseClient = ReturnType<typeof createClient>;

type Schedule = {
  id: string;
  next_run_at: string;
  owner_user_id: string;
  title: string;
};

type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
  sort_order?: number;
};

type StoredAttachment = {
  id: string;
  invoice_item_id: string;
  storage_path: string;
  original_name: string;
  created_at: string;
};

type ClaimedInvoice = {
  id: string;
  owner_user_id: string;
  pdf_template?: PdfTemplate;
  invoice_number: string;
  pdf_storage_path?: string | null;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company: {
    name: string;
    email: string | null;
  } | null;
  invoice_items: InvoiceItem[];
  invoice_attachments: StoredAttachment[];
};

type Failure = {
  scheduleId: string;
  message: string;
};

type RunItem = {
  schedule_title: string;
  scheduled_for: string;
  status: string;
  reason: string | null;
};

type RunSummary = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  due_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  deferred_count: number;
  interrupted_count: number;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRON_SECRET");
const cronDebugEmailsEnabled = Deno.env.get("CRON_DEBUG_EMAILS") === "true";
const batchLimit = 100;
const pageSize = 1000;
const staleRunAgeMs = 5 * 60 * 1000;

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

    const schedulesToProcess = schedules.slice(0, batchLimit);
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const failures: Failure[] = [];

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
          if (pdfDownloadError) throw pdfDownloadError;
          attachmentContent = bytesToBase64(new Uint8Array(await storedPdf.arrayBuffer()));
        } else {
          attachmentContent = createInvoicePdfBase64(invoice);
          const pdfPath = `${invoice.owner_user_id}/${invoice.id}.pdf`;
          const { error: pdfUploadError } = await supabase.storage
            .from("invoice-pdfs")
            .upload(pdfPath, base64ToBytes(attachmentContent), {
              contentType: "application/pdf",
              upsert: false,
            });
          if (pdfUploadError) throw pdfUploadError;

          const { error: pdfLockError } = await supabase
            .from("invoices")
            .update({ pdf_storage_path: pdfPath, pdf_locked_at: new Date().toISOString() })
            .eq("id", invoice.id)
            .is("pdf_storage_path", null);
          if (pdfLockError) throw pdfLockError;
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
        const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-invoice", {
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
        });

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
    const finalStatus = failures.length > 0 || skipped > 0 || deferred > 0 ? "partial" : "completed";
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

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function fetchDueSchedules(supabase: SupabaseClient, cutoffAt: string) {
  const schedules: Schedule[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("invoice_schedules")
      .select("id,next_run_at,owner_user_id,title")
      .eq("is_active", true)
      .eq("auto_send", true)
      .not("next_run_at", "is", null)
      .lte("next_run_at", cutoffAt)
      .order("next_run_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as Schedule[];
    schedules.push(...page);

    if (page.length < pageSize) {
      return schedules;
    }
  }
}

async function createRunSnapshot(
  supabase: SupabaseClient,
  runId: string,
  schedules: Schedule[],
) {
  const { error: countError } = await supabase
    .from("invoice_cron_runs")
    .update({ due_count: schedules.length })
    .eq("id", runId);

  if (countError) {
    throw countError;
  }

  for (let from = 0; from < schedules.length; from += 500) {
    const rows = schedules.slice(from, from + 500).map((schedule, index) => {
      const position = from + index;
      const deferred = position >= batchLimit;

      return {
        run_id: runId,
        owner_user_id: schedule.owner_user_id,
        schedule_id: schedule.id,
        schedule_title: schedule.title,
        scheduled_for: schedule.next_run_at,
        status: deferred ? "deferred" : "pending",
        reason: deferred
          ? `Utsatt til neste cron-kjøring fordi denne kjøringen behandler maksimalt ${batchLimit} planer.`
          : null,
        finished_at: deferred ? new Date().toISOString() : null,
      };
    });

    const { error } = await supabase.from("invoice_cron_run_items").insert(rows);

    if (error) {
      throw error;
    }
  }

  const owners = [...new Set(schedules.map((schedule) => schedule.owner_user_id))];

  if (owners.length > 0) {
    const { error } = await supabase.from("invoice_cron_run_reports").insert(
      owners.map((ownerUserId) => ({ run_id: runId, owner_user_id: ownerUserId })),
    );

    if (error) {
      throw error;
    }
  }
}

async function updateRunItem(
  supabase: SupabaseClient,
  runId: string,
  scheduleId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("invoice_cron_run_items")
    .update(values)
    .eq("run_id", runId)
    .eq("schedule_id", scheduleId);

  if (error) {
    console.error(`Failed to update cron log for schedule ${scheduleId}`, error);
  }
}

async function finalizeRun(
  supabase: SupabaseClient,
  runId: string,
  status: "completed" | "partial" | "interrupted" | "failed",
  errorMessage: string | null = null,
) {
  const { error } = await supabase.rpc("finalize_invoice_cron_run", {
    p_run_id: runId,
    p_status: status,
    p_error_message: errorMessage,
  });

  if (error) {
    console.error(`Failed to finalize cron run ${runId}`, error);
  }
}

async function reconcileInterruptedRuns(supabase: SupabaseClient) {
  const staleBefore = new Date(Date.now() - staleRunAgeMs).toISOString();
  const { data, error } = await supabase
    .from("invoice_cron_runs")
    .select("id")
    .eq("status", "running")
    .lt("started_at", staleBefore);

  if (error) {
    console.error("Failed to find interrupted cron runs", error);
    return [];
  }

  const runIds = (data ?? []).map((run) => run.id as string);

  for (const runId of runIds) {
    const { error: itemError } = await supabase
      .from("invoice_cron_run_items")
      .update({
        status: "interrupted",
        reason: "Cron-kjøringen ble avsluttet før planen fikk et endelig resultat.",
        finished_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .in("status", ["pending", "processing"]);

    if (itemError) {
      console.error(`Failed to mark cron run ${runId} as interrupted`, itemError);
      continue;
    }

    await finalizeRun(
      supabase,
      runId,
      "interrupted",
      "Kjøringen overskred tids- eller ressursgrensen og ble avsluttet.",
    );
  }

  return runIds;
}

async function sendCronRunReports(supabase: SupabaseClient, runIds: string[]) {
  if (runIds.length === 0) {
    return;
  }

  const { data: reports, error: reportsError } = await supabase
    .from("invoice_cron_run_reports")
    .select("run_id,owner_user_id")
    .in("run_id", runIds)
    .eq("status", "pending");

  if (reportsError) {
    console.error("Failed to fetch pending cron reports", reportsError);
    return;
  }

  for (const report of reports ?? []) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", report.owner_user_id)
      .maybeSingle();

    const { data: run, error: runError } = await supabase
      .from("invoice_cron_runs")
      .select("id,started_at,finished_at,status,due_count,sent_count,failed_count,skipped_count,deferred_count,interrupted_count")
      .eq("id", report.run_id)
      .single();

    let items: RunItem[] = [];
    let itemsError: Error | null = null;

    try {
      items = await fetchRunItems(supabase, report.run_id, report.owner_user_id);
    } catch (error) {
      itemsError = error instanceof Error ? error : new Error(String(error));
    }

    const preparationError = profileError ?? runError ?? itemsError;

    if (preparationError || !profile?.email || !run) {
      const message = preparationError?.message ?? "Eieren mangler e-postadresse.";
      console.error(`Failed to prepare cron report ${report.run_id}`, preparationError ?? message);
      await markReportFailed(supabase, report.run_id, report.owner_user_id, message);
      continue;
    }

    const summary = run as RunSummary;
    const ownerItems = items;
    const ownerCounts = {
      sent: ownerItems.filter((item) => item.status === "sent").length,
      failed: ownerItems.filter((item) => item.status === "failed").length,
      skipped: ownerItems.filter((item) => item.status === "skipped").length,
      deferred: ownerItems.filter((item) => item.status === "deferred").length,
      interrupted: ownerItems.filter((item) => item.status === "interrupted").length,
    };
    const rows = ownerItems.map((item) => `<tr>
      <td style="padding:6px;border:1px solid #ddd">${escapeHtml(item.schedule_title)}</td>
      <td style="padding:6px;border:1px solid #ddd">${escapeHtml(item.scheduled_for)}</td>
      <td style="padding:6px;border:1px solid #ddd">${escapeHtml(statusLabel(item.status))}</td>
      <td style="padding:6px;border:1px solid #ddd">${escapeHtml(item.reason ?? "-")}</td>
    </tr>`).join("");

    const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-invoice", {
      body: {
        to: profile.email,
        subject: `Cron-rapport: ${ownerItems.length} planlagte utsendinger`,
        html: `<h2>Cron-rapport</h2>
          <p>Startet: ${escapeHtml(summary.started_at)}</p>
          <p>Status: ${escapeHtml(statusLabel(summary.status))}</p>
          <p>Skulle kjøre: ${ownerItems.length}. Sendt: ${ownerCounts.sent}. Feilet: ${ownerCounts.failed}. Hoppet over: ${ownerCounts.skipped}. Utsatt: ${ownerCounts.deferred}. Avbrutt: ${ownerCounts.interrupted}.</p>
          <table style="border-collapse:collapse;width:100%">
            <thead><tr><th>Plan</th><th>Planlagt</th><th>Status</th><th>Årsak</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`,
      },
    });

    const reportError = sendError?.message ?? (
      sendResult?.error
        ? typeof sendResult.error === "string"
          ? sendResult.error
          : sendResult.error.message
        : null
    );

    if (reportError) {
      console.error(`Failed to send cron report ${report.run_id}`, reportError);
      await markReportFailed(supabase, report.run_id, report.owner_user_id, reportError);
      continue;
    }

    const { error: updateError } = await supabase
      .from("invoice_cron_run_reports")
      .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
      .eq("run_id", report.run_id)
      .eq("owner_user_id", report.owner_user_id);

    if (updateError) {
      console.error(`Failed to mark cron report ${report.run_id} as sent`, updateError);
    }
  }
}

async function fetchRunItems(
  supabase: SupabaseClient,
  runId: string,
  ownerUserId: string,
) {
  const items: RunItem[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("invoice_cron_run_items")
      .select("schedule_title,scheduled_for,status,reason")
      .eq("run_id", runId)
      .eq("owner_user_id", ownerUserId)
      .order("scheduled_for", { ascending: true })
      .order("schedule_title", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as RunItem[];
    items.push(...page);

    if (page.length < pageSize) {
      return items;
    }
  }
}

async function markReportFailed(
  supabase: SupabaseClient,
  runId: string,
  ownerUserId: string,
  message: string,
) {
  const { error } = await supabase
    .from("invoice_cron_run_reports")
    .update({ status: "failed", error_message: message })
    .eq("run_id", runId)
    .eq("owner_user_id", ownerUserId);

  if (error) {
    console.error(`Failed to record cron report error for ${runId}`, error);
  }
}

async function loadStoredAttachments(
  supabase: SupabaseClient,
  attachments: StoredAttachment[],
  lines: InvoiceItem[],
) {
  const sortedLines = [...lines].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const lineIndexes = new Map(sortedLines.map((line, index) => [line.id, index]));
  const attachmentIndexes = new Map<string, number>();
  const referencedAttachments = [...attachments]
    .sort((left, right) => {
      const lineDifference =
        (lineIndexes.get(left.invoice_item_id) ?? Number.MAX_SAFE_INTEGER) -
        (lineIndexes.get(right.invoice_item_id) ?? Number.MAX_SAFE_INTEGER);

      return (
        lineDifference ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id)
      );
    })
    .map((attachment) => {
      const lineIndex = lineIndexes.get(attachment.invoice_item_id) ?? 0;
      const attachmentIndex = attachmentIndexes.get(attachment.invoice_item_id) ?? 0;
      attachmentIndexes.set(attachment.invoice_item_id, attachmentIndex + 1);

      return {
        attachment,
        reference: attachmentReference(lineIndex, attachmentIndex),
      };
    });

  return Promise.all(
    referencedAttachments.map(async ({ attachment, reference }) => {
      const { data, error } = await supabase.storage
        .from("invoice-attachments")
        .download(attachment.storage_path);

      if (error) {
        throw new Error(`Kunne ikke hente vedlegget ${attachment.original_name}: ${error.message}`);
      }

      return {
        filename: `${reference} - ${attachment.original_name}`,
        content: await blobToBase64(data),
      };
    }),
  );
}

function attachmentReference(lineIndex: number, attachmentIndex: number) {
  return `${lineLetter(lineIndex)}${attachmentIndex + 1}`;
}

function lineLetter(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    running: "kjører",
    completed: "fullført",
    partial: "delvis fullført",
    interrupted: "avbrutt",
    failed: "feilet",
    pending: "venter",
    processing: "behandles",
    sent: "sendt",
    skipped: "hoppet over",
    deferred: "utsatt",
  };

  return labels[status] ?? status;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };

    return entities[character];
  });
}
