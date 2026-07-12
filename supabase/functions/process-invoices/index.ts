import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Schedule = {
  id: string;
  next_run_at: string;
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase server configuration" }, 500);
  }

  if (request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("invoice_schedules")
    .select("id,next_run_at")
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

      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-invoice", {
        body: {
          to: invoice.company.email,
          subject: `Faktura ${invoice.invoice_number}`,
          html: createInvoiceEmail(invoice),
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to process invoice schedule ${schedule.id}`, error);

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
    }
  }

  return jsonResponse({
    processed,
    sent,
    failed: failures.length,
    failures,
  });
});

function createInvoiceEmail(invoice: ClaimedInvoice) {
  const rows = invoice.invoice_items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(String(item.quantity))} ${escapeHtml(item.unit)}</td>
          <td>${formatCurrency(item.unit_price)}</td>
          <td>${escapeHtml(String(item.vat_rate))} %</td>
          <td>${formatCurrency(item.line_total)}</td>
        </tr>`,
    )
    .join("");

  return `
    <p>Hei ${escapeHtml(invoice.company?.name ?? "")},</p>
    <p>Her er faktura ${escapeHtml(invoice.invoice_number)}.</p>
    <p>Fakturadato: ${escapeHtml(invoice.issue_date)}<br>
    Forfallsdato: ${escapeHtml(invoice.due_date ?? "Ikke angitt")}</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">
      <thead><tr><th>Beskrivelse</th><th>Antall</th><th>Pris</th><th>MVA</th><th>Sum</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Netto: ${formatCurrency(invoice.subtotal)}<br>
    MVA: ${formatCurrency(invoice.vat_total)}<br>
    <strong>Totalt: ${formatCurrency(invoice.total)}</strong></p>
  `;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(Number(value));
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
