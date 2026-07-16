import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Schedule = {
  id: string;
  next_run_at: string;
  owner_user_id: string;
};

type DebugSchedule = {
  id: string;
  owner_user_id: string;
  title: string;
  next_run_at: string | null;
  is_active: boolean;
  auto_send: boolean;
};

type DebugResult = {
  status: string;
  message: string;
};

type InvoiceItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
};

type ClaimedInvoice = {
  id: string;
  invoice_number: string;
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
};

type Failure = {
  scheduleId: string;
  message: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRON_SECRET");
const pdfGeneratorUrl = Deno.env.get("PDF_GENERATOR_URL");
const pdfGeneratorSecret = Deno.env.get("PDF_GENERATOR_SECRET") ?? cronSecret;
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

  if (!supabaseUrl || !serviceRoleKey || !cronSecret || !pdfGeneratorUrl || !pdfGeneratorSecret) {
    return jsonResponse({ error: "Missing server configuration" }, 500);
  }

  if (request.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("invoice_schedules")
    .select("id,next_run_at,owner_user_id")
    .eq("is_active", true)
    .eq("auto_send", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Failed to fetch due invoice schedules", error);
    return jsonResponse({ error: "Failed to fetch due invoice schedules" }, 500);
  }

  const schedules = (data ?? []) as Schedule[];
  let processed = 0;
  let sent = 0;
  const failures: Failure[] = [];
  const debugResults = new Map<string, DebugResult>();

  for (const schedule of schedules) {
    let invoice: ClaimedInvoice | null = null;
    let emailSent = false;
    let debugStatus = "skipped";
    let debugMessage = "The schedule was due, but no invoice was claimed.";

    processed += 1;

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
        continue;
      }

      if (!invoice.company?.email) {
        throw new Error("Company has no recipient email address");
      }

      const attachmentContent = await generateInvoicePdf(invoice);

      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-invoice", {
        body: {
          to: invoice.company.email,
          subject: `Faktura ${invoice.invoice_number}`,
          html: `<p>Hei ${escapeHtml(invoice.company.name)}, vedlagt ligger faktura ${escapeHtml(invoice.invoice_number)}.</p>`,
          attachmentFilename: `faktura-${invoice.invoice_number}.pdf`,
          attachmentContent,
        },
      });

      if (sendError) {
        throw sendError;
      }

      if (sendResult?.error) {
        throw new Error(
          typeof sendResult.error === "string"
            ? sendResult.error
            : sendResult.error.message ?? "Email provider rejected the invoice",
        );
      }

      emailSent = true;

      const { error: completeError } = await supabase.rpc(
        "complete_scheduled_invoice",
        { p_invoice_id: invoice.id },
      );

      if (completeError) {
        throw completeError;
      }

      sent += 1;
      debugStatus = "sent";
      debugMessage = `Invoice ${invoice.invoice_number} was sent to ${invoice.company.email}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to process invoice schedule ${schedule.id}`, error);

      debugStatus = emailSent ? "sent, finalization failed" : "failed";
      debugMessage = emailSent
        ? `The invoice email was delivered, but completing the schedule failed: ${message}`
        : message;

      failures.push({ scheduleId: schedule.id, message });

      if (invoice && !emailSent) {
        const { error: releaseError } = await supabase.rpc(
          "release_scheduled_invoice",
          { p_invoice_id: invoice.id },
        );

        if (releaseError) {
          console.error(`Failed to release invoice ${invoice.id}`, releaseError);
        }
      }
    } finally {
      debugResults.set(schedule.id, { status: debugStatus, message: debugMessage });
    }
  }

  if (cronDebugEmailsEnabled) {
    await sendCronDebugSummaries(supabase, now, debugResults);
  }

  return jsonResponse({
    processed,
    sent,
    failed: failures.length,
    failures,
  });
});

async function generateInvoicePdf(invoice: ClaimedInvoice) {
  const response = await fetch(pdfGeneratorUrl!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pdf-secret": pdfGeneratorSecret!,
    },
    body: JSON.stringify({ invoice }),
  });

  const result = await response.json().catch(() => null) as { pdfBase64?: string; error?: string } | null;

  if (!response.ok || !result?.pdfBase64) {
    throw new Error(result?.error ?? `PDF generator returned ${response.status}`);
  }

  return result.pdfBase64;
}

async function sendCronDebugSummaries(
  supabase: ReturnType<typeof createClient>,
  processedAt: string,
  results: Map<string, DebugResult>,
) {
  try {
    const { data, error: schedulesError } = await supabase
      .from("invoice_schedules")
      .select("id,owner_user_id,title,next_run_at,is_active,auto_send")
      .order("next_run_at", { ascending: true, nullsFirst: false });

    if (schedulesError) {
      throw schedulesError;
    }

    const schedulesByOwner = new Map<string, DebugSchedule[]>();

    for (const schedule of (data ?? []) as DebugSchedule[]) {
      const ownerSchedules = schedulesByOwner.get(schedule.owner_user_id) ?? [];
      ownerSchedules.push(schedule);
      schedulesByOwner.set(schedule.owner_user_id, ownerSchedules);
    }

    for (const [ownerUserId, ownerSchedules] of schedulesByOwner) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", ownerUserId)
        .maybeSingle();

      if (profileError) {
        console.error(`Failed to fetch cron debug recipient ${ownerUserId}`, profileError);
        continue;
      }

      if (!profile?.email) {
        console.warn(`Cron debug summary skipped for owner ${ownerUserId}: owner has no email`);
        continue;
      }

      const rows = ownerSchedules.map((schedule) => {
        const result = results.get(schedule.id) ?? explainUnprocessedSchedule(schedule, processedAt);

        return `<tr>
          <td style="padding:6px;border:1px solid #ddd">${escapeHtml(schedule.title)}</td>
          <td style="padding:6px;border:1px solid #ddd">${escapeHtml(schedule.next_run_at ?? "Ikke satt")}</td>
          <td style="padding:6px;border:1px solid #ddd">${escapeHtml(result.status)}</td>
          <td style="padding:6px;border:1px solid #ddd">${escapeHtml(result.message)}</td>
        </tr>`;
      }).join("");

      const { error: sendError } = await supabase.functions.invoke("send-invoice", {
        body: {
          to: profile.email,
          subject: `Cron-rapport: ${ownerSchedules.length} planlagte utsendinger`,
          html: `<h2>Cron-rapport</h2>
            <p>Kjørt: ${escapeHtml(processedAt)}</p>
            <table style="border-collapse:collapse">
              <thead><tr><th>Plan</th><th>Neste kjøring</th><th>Status</th><th>Beskrivelse</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`,
        },
      });

      if (sendError) {
        console.error(`Failed to send cron debug summary to owner ${ownerUserId}`, sendError);
      }
    }
  } catch (error) {
    console.error("Failed to send cron debug summaries", error);
  }
}

function explainUnprocessedSchedule(schedule: DebugSchedule, processedAt: string): DebugResult {
  if (!schedule.is_active) {
    return { status: "ikke behandlet", message: "Planen er deaktivert (is_active = false)." };
  }

  if (!schedule.auto_send) {
    return { status: "ikke behandlet", message: "Automatisk utsending er deaktivert (auto_send = false)." };
  }

  if (!schedule.next_run_at) {
    return { status: "ikke behandlet", message: "next_run_at er ikke satt." };
  }

  if (new Date(schedule.next_run_at).getTime() > new Date(processedAt).getTime()) {
    return { status: "venter", message: "Planlagt tidspunkt er fremdeles i fremtiden." };
  }

  return { status: "ikke behandlet", message: "Planen var forfalt, men kom ikke med blant de første 100 i denne kjøringen." };
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
