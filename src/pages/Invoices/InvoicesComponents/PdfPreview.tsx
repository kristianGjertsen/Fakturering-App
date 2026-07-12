import { useEffect, useRef, useState } from "react";
import type { InvoiceWithDetails } from "../../../types";
import { createInvoicePdfBlob, openInvoicePdf } from "../../../lib/pdf";
import { Button } from "../../../components/Button";

type PdfPreviewProps = {
  invoice: InvoiceWithDetails;
  compact?: boolean;
};

export function PdfPreview({ invoice, compact = false }: PdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const currentUrlRef = useRef("");

  useEffect(() => {
    let cancelled = false;

    setError("");
    setLoading(true);

    const timeout = window.setTimeout(() => {
      void createInvoicePdfBlob(invoice)
        .then((blob) => {
          const nextUrl = URL.createObjectURL(blob);

          if (cancelled) {
            URL.revokeObjectURL(nextUrl);
            return;
          }

          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
          }

          currentUrlRef.current = nextUrl;
          setPdfUrl(nextUrl);
          setLoading(false);
        })
        .catch((pdfError) => {
          if (!cancelled) {
            setError(pdfError instanceof Error ? pdfError.message : "Kunne ikke lage PDF.");
            setLoading(false);
          }
        });
    }, compact ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [invoice, compact]);

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">PDF-forhåndsvisning</h3>
        <Button variant="secondary" onClick={() => void openInvoicePdf(invoice)}>
          Åpne PDF
        </Button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Oppdaterer forhåndsvisning...</p>}
      {pdfUrl && (
        <iframe
          className={`${compact ? "h-[420px]" : "h-[720px]"} w-full rounded-lg border border-blue-100 bg-white`}
          src={pdfUrl}
          title={`PDF ${invoice.invoice_number}`}
        />
      )}
    </div>
  );
}
