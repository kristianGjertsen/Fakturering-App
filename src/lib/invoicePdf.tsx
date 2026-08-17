import type { InvoiceWithDetails, Profile } from "../types";
import { supabase } from "../supabaseClient";

export async function createInvoicePdfBlob(invoice: InvoiceWithDetails, sellerProfile: Profile) {
  if (invoice.is_historical && invoice.pdf_storage_path) {
    const { data, error } = await supabase.storage
      .from("invoice-pdfs")
      .download(invoice.pdf_storage_path);

    if (error) throw error;
    return data;
  }

  const [{ pdf }, { InvoicePdfTemplate }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../pdf/InvoicePdfTemplate"),
  ]);

  return pdf(<InvoicePdfTemplate invoice={invoice} seller={sellerProfile} />).toBlob();
}

export async function openInvoicePdf(invoice: InvoiceWithDetails, sellerProfile: Profile) {
  const blob = await createInvoicePdfBlob(invoice, sellerProfile);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
