import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createInvoicePdfBase64 } from "../_shared/invoice-pdf.ts";

type Schedule = {
  id: string;
  next_run_at: string;
  owner_user_id: string;
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

      const attachmentContent = createInvoicePdfBase64(invoice);

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
      if (cronDebugEmailsEnabled) {
        await sendCronDebugEmail(supabase, schedule, invoice, debugStatus, debugMessage);
      }
    }
  }

  return jsonResponse({
    processed,
    sent,
    failed: failures.length,
    failures,
  });
});

async function sendCronDebugEmail(
  supabase: ReturnType<typeof createClient>,
  schedule: Schedule,
  invoice: ClaimedInvoice | null,
  status: string,
  message: string,
) {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", schedule.owner_user_id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.email) {
      console.warn(`Cron debug email skipped for schedule ${schedule.id}: owner has no email`);
      return;
    }

    const { error } = await supabase.functions.invoke("send-invoice", {
      body: {
        to: profile.email,
        subject: `Cron debug: ${status} (${schedule.id.slice(0, 8)})`,
        html: [
          "<h2>Invoice cron report</h2>",
          `<p><strong>Status:</strong> ${escapeHtml(status)}</p>`,
          `<p><strong>Schedule:</strong> ${escapeHtml(schedule.id)}</p>`,
          `<p><strong>Scheduled for:</strong> ${escapeHtml(schedule.next_run_at)}</p>`,
          `<p><strong>Invoice:</strong> ${escapeHtml(invoice?.invoice_number ?? "not created")}</p>`,
          `<p><strong>Result:</strong> ${escapeHtml(message)}</p>`,
          `<p><strong>Processed at:</strong> ${escapeHtml(new Date().toISOString())}</p>`,
        ].join(""),
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error(`Failed to send cron debug email for schedule ${schedule.id}`, error);
  }
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
