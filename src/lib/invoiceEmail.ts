import { supabase } from "../supabaseClient";
import type { InvoiceAttachment, InvoiceItem, InvoiceStatus } from "../types";
import {
  ATTACHMENT_BUCKET,
  attachmentFileName,
  referenceInvoiceAttachments,
} from "./attachments";
import { blobToBase64 } from "./base64";

type EmailAttachment = {
  filename: string;
  content: string;
};

type SendInvoiceEmailInput = {
  recipientEmail: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
  markStatus?: {
    invoiceId: string;
    status: Extract<InvoiceStatus, "sent" | "reminded">;
  };
};

export async function sendInvoiceEmail(input: SendInvoiceEmailInput) {
  const { data, error } = await supabase.functions.invoke("send-invoice", {
    body: {
      to: input.recipientEmail,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    },
  });

  if (error) {
    throw error;
  }

  if (input.markStatus) {
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: input.markStatus.status })
      .eq("id", input.markStatus.invoiceId);

    if (updateError) {
      throw updateError;
    }
  }

  return data;
}

export async function loadInvoiceEmailAttachments(
  attachments: InvoiceAttachment[],
  lines: InvoiceItem[],
): Promise<EmailAttachment[]> {
  const referencedAttachments = referenceInvoiceAttachments(lines, attachments);

  return Promise.all(
    referencedAttachments.map(async ({ attachment, reference }) => {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .download(attachment.storage_path);

      if (error) {
        throw new Error(`Kunne ikke hente vedlegget ${attachment.original_name}: ${error.message}`);
      }

      return {
        filename: attachmentFileName(attachment.original_name, reference),
        content: await blobToBase64(data),
      };
    }),
  );
}

export async function downloadInvoiceAttachment(
  attachment: InvoiceAttachment,
  reference: string,
) {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .download(attachment.storage_path);

  if (error) {
    throw error;
  }

  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachmentFileName(attachment.original_name, reference);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
