import { escapeHtml } from "../_shared/html.ts";
import type { SupabaseClient } from "./types.ts";

type RunItem = {
  schedule_title: string;
  scheduled_for: string;
  status: string;
  reason: string | null;
};

type RunSummary = {
  started_at: string;
  status: string;
};

const PAGE_SIZE = 1000;
const STATUS_LABELS: Record<string, string> = {
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

export async function sendCronRunReports(
  supabase: SupabaseClient,
  runIds: string[],
) {
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
      .select("started_at,status")
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
      console.error(
        `Failed to prepare cron report ${report.run_id}`,
        preparationError ?? message,
      );
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

    const { data: sendResult, error: sendError } = await supabase.functions.invoke(
      "send-invoice",
      {
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
      },
    );

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
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      })
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

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("invoice_cron_run_items")
      .select("schedule_title,scheduled_for,status,reason")
      .eq("run_id", runId)
      .eq("owner_user_id", ownerUserId)
      .order("scheduled_for", { ascending: true })
      .order("schedule_title", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as RunItem[];
    items.push(...page);

    if (page.length < PAGE_SIZE) {
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

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}
