import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend";

type SendInvoiceEmailPayload = {
  from?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachmentFilename?: string;
  attachmentContent?: string;
};

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const defaultFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? "Fakturering <faktura@dittdomene.no>";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    if (!resendApiKey) {
      return jsonResponse(
        { error: "Missing RESEND_API_KEY environment variable." },
        500
      );
    }

    const resend = new Resend(resendApiKey);
    const payload = (await request.json()) as SendInvoiceEmailPayload;

    if (!payload.to || !payload.subject || !payload.html) {
      return jsonResponse(
        {
          error: "Missing required fields",
          required: ["to", "subject", "html"],
        },
        400
      );
    }

    const attachments =
      payload.attachmentFilename && payload.attachmentContent
        ? [
            {
              filename: payload.attachmentFilename,
              content: payload.attachmentContent,
            },
          ]
        : undefined;

    const result = await resend.emails.send({
      from: payload.from ?? defaultFrom,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
      cc: payload.cc,
      bcc: payload.bcc,
      attachments,
    });

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});
