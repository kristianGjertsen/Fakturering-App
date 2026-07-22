import type { InvoiceWithDetails } from "../../types";
import { blobToBase64 } from "../../lib/base64";
import {
  fetchInvoices,
  finalizeInvoice,
  loadInvoiceEmailAttachments,
  lockInvoicePdf,
} from "../../lib/data";
import { createInvoicePdfBlob } from "../../lib/invoicePdf";
import { supabase } from "../../supabaseClient";

export type InvoiceDeliveryAction = "send" | "remind";

export async function prepareInvoiceEmailDelivery(
  invoice: InvoiceWithDetails,
  action: InvoiceDeliveryAction,
  recipientName: string,
) {
  const invoiceToSend = await resolveInvoiceForDelivery(invoice, action);

  if (!invoiceToSend.invoice_number) {
    throw new Error("Fakturaen mangler fakturanummer.");
  }

  const pdfBlob = await loadOrCreateInvoicePdf(invoiceToSend);
  const attachmentContent = await blobToBase64(pdfBlob);
  const storedAttachments = await loadInvoiceEmailAttachments(
    invoiceToSend.invoice_attachments ?? [],
    invoiceToSend.invoice_items ?? [],
  );
  const attachments = [
    {
      filename: `00_Faktura.nr:${invoiceToSend.invoice_number}.pdf`,
      content: attachmentContent,
    },
    ...storedAttachments,
  ];
  const subject = `Faktura ${invoiceToSend.invoice_number}`;
  const attachmentText = storedAttachments.length > 0
    ? ` og ${storedAttachments.length} vedlegg`
    : "";
  const greetingName = recipientName ? ` ${recipientName}` : "";
  const html = `<p>Hei${greetingName}, vedlagt ligger faktura ${invoiceToSend.invoice_number}${attachmentText}.</p>`;

  return { attachments, html, subject };
}

async function resolveInvoiceForDelivery(
  invoice: InvoiceWithDetails,
  action: InvoiceDeliveryAction,
) {
  if (action !== "send" || invoice.status !== "draft") return invoice;

  await finalizeInvoice(invoice.id);
  const finalizedInvoice = (await fetchInvoices()).find(
    (candidate) => candidate.id === invoice.id,
  );

  if (!finalizedInvoice?.invoice_number) {
    throw new Error("Fakturaen ble ikke ferdigstilt korrekt.");
  }

  return finalizedInvoice;
}

async function loadOrCreateInvoicePdf(invoice: InvoiceWithDetails) {
  if (invoice.pdf_storage_path) {
    const { data, error } = await supabase.storage
      .from("invoice-pdfs")
      .download(invoice.pdf_storage_path);

    if (error) throw error;
    return data;
  }

  const pdfBlob = await createInvoicePdfBlob(invoice);
  await lockInvoicePdf(invoice.id, invoice.owner_user_id, pdfBlob);
  return pdfBlob;
}
