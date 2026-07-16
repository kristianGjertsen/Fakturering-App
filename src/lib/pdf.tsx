import type { InvoiceWithDetails } from "../types";

export async function createInvoicePdfBlob(invoice: InvoiceWithDetails) {
  const [{ pdf }, { InvoicePdfTemplate }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../pdf/InvoicePdfTemplate"),
  ]);

  return pdf(<InvoicePdfTemplate invoice={invoice} />).toBlob();
}

export async function openInvoicePdf(invoice: InvoiceWithDetails) {
  const blob = await createInvoicePdfBlob(invoice);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function createInvoicePdfBase64(invoice: InvoiceWithDetails) {
  const blob = await createInvoicePdfBlob(invoice);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}
