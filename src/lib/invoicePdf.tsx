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
