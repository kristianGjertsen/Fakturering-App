import { useEffect, useState } from "react";
import type { InvoiceWithDetails } from "../../../types";
import { createInvoicePdfBlob, openInvoicePdf } from "../../../lib/pdf";
import { Button } from "../../../components/Button";

type PdfPreviewProps = {
  invoice: InvoiceWithDetails;
};

export function PdfPreview({ invoice }: PdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let url = "";
    let cancelled = false;

    setPdfUrl("");
    setError("");

    void createInvoicePdfBlob(invoice)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((pdfError) => {
        if (!cancelled) setError(pdfError instanceof Error ? pdfError.message : "Kunne ikke lage PDF.");
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [invoice]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">PDF-forhåndsvisning</h3>
        <Button variant="secondary" onClick={() => void openInvoicePdf(invoice)}>
          Åpne PDF
        </Button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!pdfUrl && !error && <p className="text-sm text-slate-500">Lager PDF-forhåndsvisning...</p>}
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
