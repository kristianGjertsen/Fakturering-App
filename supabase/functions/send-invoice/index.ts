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

if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY environment variable.");
}

const resend = new Resend(resendApiKey);

serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const payload = (await request.json()) as SendInvoiceEmailPayload;

  if (!payload.to || !payload.subject || !payload.html) {
    return Response.json(
      {
        error: "Missing required fields",
        required: ["to", "subject", "html"],
      },
      { status: 400 }
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

  return Response.json(result);
});
