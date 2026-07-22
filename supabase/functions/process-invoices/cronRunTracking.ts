import type { Schedule, SupabaseClient } from "./types.ts";

export const BATCH_LIMIT = 100;

const PAGE_SIZE = 1000;
const STALE_RUN_AGE_MS = 5 * 60 * 1000;

export async function fetchDueSchedules(
  supabase: SupabaseClient,
  cutoffAt: string,
) {
  const schedules: Schedule[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("invoice_schedules")
      .select("id,next_run_at,owner_user_id,title")
      .eq("is_active", true)
      .eq("auto_send", true)
      .not("next_run_at", "is", null)
      .lte("next_run_at", cutoffAt)
      .order("next_run_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = (data ?? []) as Schedule[];
    schedules.push(...page);

    if (page.length < PAGE_SIZE) {
      return schedules;
    }
  }
}

export async function createRunSnapshot(
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
      const deferred = position >= BATCH_LIMIT;

      return {
        run_id: runId,
        owner_user_id: schedule.owner_user_id,
        schedule_id: schedule.id,
        schedule_title: schedule.title,
        scheduled_for: schedule.next_run_at,
        status: deferred ? "deferred" : "pending",
        reason: deferred
          ? `Utsatt til neste cron-kjøring fordi denne kjøringen behandler maksimalt ${BATCH_LIMIT} planer.`
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

export async function updateRunItem(
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

export async function finalizeRun(
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

export async function reconcileInterruptedRuns(supabase: SupabaseClient) {
  const staleBefore = new Date(Date.now() - STALE_RUN_AGE_MS).toISOString();
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
