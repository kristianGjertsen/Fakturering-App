import { useEffect, useState } from "react";
import type { InvoiceWithDetails } from "../../../types";
import { createInvoicePdfBlob, openInvoicePdf } from "../../../lib/pdf";
import { Button } from "../../../components/Button";

type PdfPreviewProps = {
  invoice: InvoiceWithDetails;
};

export function PdfPreview({ invoice }: PdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState("");

  useEffect(() => {
    const blob = createInvoicePdfBlob(invoice);
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [invoice]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">PDF-forhåndsvisning</h3>
        <Button variant="secondary" onClick={() => openInvoicePdf(invoice)}>
          Åpne PDF
        </Button>
      </div>

      {pdfUrl && (
        <iframe
          className="h-[720px] w-full rounded-lg border border-blue-100 bg-white"
          src={pdfUrl}
          title={`PDF ${invoice.invoice_number}`}
        />
      )}
    </div>
  );
}
