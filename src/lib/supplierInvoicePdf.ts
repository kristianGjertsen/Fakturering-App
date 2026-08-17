import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  parseSupplierInvoiceText,
  type SupplierInvoicePdfExtraction,
} from "./supplierInvoiceParser";

export type SupplierInvoicePdfResult = SupplierInvoicePdfExtraction & {
  fileName: string;
  pageCount: number;
};

export type PdfTextResult = {
  fileName: string;
  pageCount: number;
  text: string;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

export async function readSupplierInvoicePdf(file: File): Promise<SupplierInvoicePdfResult> {
  const result = await readPdfText(file);

  return {
    fileName: result.fileName,
    pageCount: result.pageCount,
    ...parseSupplierInvoiceText(result.text),
  };
}

export async function readPdfText(file: File): Promise<PdfTextResult> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Automatisk utfylling krever en PDF-fil.");
  }

  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });

  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pdfItemsToText(content.items as PdfTextItem[]));
    }

    return {
      fileName: file.name,
      pageCount: document.numPages,
      text: pages.join("\n"),
    };
  } finally {
    await loadingTask.destroy();
  }
}

function pdfItemsToText(items: PdfTextItem[]) {
  const positioned = items
    .filter((item) => item.str?.trim())
    .map((item, index) => ({
      text: item.str!.trim(),
      x: item.transform?.[4] ?? index,
      y: item.transform?.[5] ?? 0,
    }));

  const rows: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }

  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => row.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "))
    .join("\n");
}
