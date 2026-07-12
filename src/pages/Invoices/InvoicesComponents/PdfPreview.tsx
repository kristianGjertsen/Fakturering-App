import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import type { InvoiceWithDetails } from "../../../types";
import { createInvoicePdfBlob, openInvoicePdf } from "../../../lib/pdf";
import { Button } from "../../../components/Button";

type PdfPreviewProps = {
  invoice: InvoiceWithDetails;
  compact?: boolean;
};

type PreviewSize = {
  width: number;
  height: number;
};

export function PdfPreview({ invoice, compact = false }: PdfPreviewProps) {
  const previewPadding = compact ? 6 : 16;
  const previewPaddingClass = compact ? "p-[6px]" : "p-4";
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [size, setSize] = useState<PreviewSize>({ width: 0, height: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setLoading(true);

    const timeout = window.setTimeout(() => {
      void createInvoicePdfBlob(invoice)
        .then((blob) => blob.arrayBuffer())
        .then((buffer) => {
          if (!cancelled) setPdfBytes(new Uint8Array(buffer));
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
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdfBytes || !canvas || !size.width || !size.height) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    void import("pdfjs-dist")
      .then(async ({ GlobalWorkerOptions, getDocument }) => {
        GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = getDocument({ data: new Uint8Array(pdfBytes) });
        const document = await loadingTask.promise;
        const page = await document.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const displayScale = Math.min(
          (size.width - previewPadding * 2) / baseViewport.width,
          (size.height - previewPadding * 2) / baseViewport.height,
        );
        const pixelRatio = window.devicePixelRatio || 1;
        const renderViewport = page.getViewport({ scale: displayScale * pixelRatio });
        const context = canvas.getContext("2d");

        if (!context || cancelled) return;

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(baseViewport.width * displayScale)}px`;
        canvas.style.height = `${Math.floor(baseViewport.height * displayScale)}px`;

        renderTask = page.render({ canvas, canvasContext: context, viewport: renderViewport });
        await renderTask.promise;
        if (!cancelled) setLoading(false);
      })
      .catch((renderError) => {
        if (!cancelled && renderError?.name !== "RenderingCancelledException") {
          setError(renderError instanceof Error ? renderError.message : "Kunne ikke vise PDF.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [pdfBytes, size, previewPadding]);

  return (
    <section className="space-y-3" aria-label="PDF-forhåndsvisning">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">PDF-forhåndsvisning</h3>
          <p className="text-xs text-slate-500">Første side tilpasses automatisk til previewen.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void openInvoicePdf(invoice)}>
          Åpne PDF
        </Button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div
        ref={containerRef}
        className={`relative grid aspect-[210/297] w-full place-items-center overflow-hidden rounded-lg border border-blue-200 bg-slate-200 shadow-inner ${previewPaddingClass}`}
      >
        {loading && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-blue-700 px-3 py-1 text-xs font-medium text-white shadow">
            Oppdaterer …
          </span>
        )}
        <canvas ref={canvasRef} className="block max-h-full max-w-full bg-white shadow-md" />
        {!pdfBytes && !error && <span className="text-sm text-slate-500">Lager PDF-forhåndsvisning …</span>}
      </div>
    </section>
  );
}
