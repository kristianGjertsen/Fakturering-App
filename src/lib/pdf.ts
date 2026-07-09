import type { InvoiceItem, InvoiceWithDetails } from "../types";
import { formatCurrency, formatDate } from "./format";

type PdfLine = Pick<
  InvoiceItem,
  "description" | "quantity" | "unit" | "unit_price" | "vat_rate" | "line_total"
>;

const pageWidth = 595;
const pageHeight = 842;

export function createInvoicePdfBlob(invoice: InvoiceWithDetails) {
  const items = [...(invoice.invoice_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const pageLineLimit = 15;
  const pages = chunkItems(items.length > 0 ? items : [], pageLineLimit);
  const pageContents = pages.length > 0 ? pages : [[]];

  return buildPdf(
    pageContents.map((pageItems, pageIndex) =>
      buildInvoicePage(invoice, pageItems, pageIndex + 1, pageContents.length, pageIndex === pageContents.length - 1)
    )
  );
}

export function openInvoicePdf(invoice: InvoiceWithDetails) {
  const blob = createInvoicePdfBlob(invoice);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  return url;
}

export async function createInvoicePdfBase64(invoice: InvoiceWithDetails) {
  const blob = createInvoicePdfBlob(invoice);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function buildInvoicePage(
  invoice: InvoiceWithDetails,
  items: PdfLine[],
  pageNumber: number,
  pageCount: number,
  includeTotals: boolean
) {
  const company = invoice.company;
  const content: Uint8Array[] = [];

  drawRect(content, 0, 790, pageWidth, 52, [0.06, 0.22, 0.44]);
  drawText(content, 45, 812, 22, "Faktura", [1, 1, 1]);
  drawText(content, 445, 815, 10, `Side ${pageNumber} av ${pageCount}`, [0.9, 0.95, 1]);

  drawText(content, 45, 752, 9, "Fakturanummer", [0.32, 0.39, 0.48]);
  drawText(content, 45, 735, 16, invoice.invoice_number, [0.03, 0.1, 0.22]);
  drawText(content, 240, 752, 9, "Fakturadato", [0.32, 0.39, 0.48]);
  drawText(content, 240, 735, 12, formatDate(invoice.issue_date), [0.03, 0.1, 0.22]);
  drawText(content, 400, 752, 9, "Forfallsdato", [0.32, 0.39, 0.48]);
  drawText(content, 400, 735, 12, formatDate(invoice.due_date), [0.03, 0.1, 0.22]);

  drawText(content, 45, 690, 9, "Kunde", [0.32, 0.39, 0.48]);
  drawText(content, 45, 673, 14, company?.name ?? "Ukjent kunde", [0.03, 0.1, 0.22]);
  drawText(content, 45, 655, 10, company?.org_number ? `Org.nr. ${company.org_number}` : "", [0.12, 0.18, 0.28]);
  drawText(content, 45, 640, 10, [company?.email, company?.city, company?.country].filter(Boolean).join(" · "), [
    0.12, 0.18, 0.28,
  ]);

  drawLine(content, 45, 604, 550, 604, [0.78, 0.84, 0.91]);
  drawText(content, 45, 582, 9, "Beskrivelse", [0.32, 0.39, 0.48]);
  drawText(content, 303, 582, 9, "Antall", [0.32, 0.39, 0.48]);
  drawText(content, 362, 582, 9, "Pris", [0.32, 0.39, 0.48]);
  drawText(content, 430, 582, 9, "MVA", [0.32, 0.39, 0.48]);
  drawText(content, 500, 582, 9, "Sum", [0.32, 0.39, 0.48]);
  drawLine(content, 45, 570, 550, 570, [0.78, 0.84, 0.91]);

  let y = 548;
  for (const item of items) {
    const description = item.description.length > 46 ? `${item.description.slice(0, 43)}...` : item.description;
    drawText(content, 45, y, 10, description, [0.03, 0.1, 0.22]);
    drawText(content, 303, y, 10, `${formatQuantity(item.quantity)} ${item.unit}`, [0.12, 0.18, 0.28]);
    drawText(content, 362, y, 10, formatCurrency(item.unit_price), [0.12, 0.18, 0.28]);
    drawText(content, 430, y, 10, `${formatQuantity(item.vat_rate)}%`, [0.12, 0.18, 0.28]);
    drawText(content, 500, y, 10, formatCurrency(item.line_total), [0.03, 0.1, 0.22]);
    y -= 27;
  }

  if (includeTotals) {
    const totalsY = Math.min(y - 20, 180);
    drawLine(content, 335, totalsY + 50, 550, totalsY + 50, [0.78, 0.84, 0.91]);
    drawText(content, 360, totalsY + 28, 10, "Eks. mva", [0.32, 0.39, 0.48]);
    drawText(content, 485, totalsY + 28, 10, formatCurrency(invoice.subtotal), [0.03, 0.1, 0.22]);
    drawText(content, 360, totalsY + 8, 10, "MVA", [0.32, 0.39, 0.48]);
    drawText(content, 485, totalsY + 8, 10, formatCurrency(invoice.vat_total), [0.03, 0.1, 0.22]);
    drawText(content, 360, totalsY - 18, 14, "Total", [0.03, 0.1, 0.22]);
    drawText(content, 485, totalsY - 18, 14, formatCurrency(invoice.total), [0.03, 0.1, 0.22]);
  }

  if (invoice.notes) {
    drawText(content, 45, 110, 9, "Notat", [0.32, 0.39, 0.48]);
    drawText(content, 45, 92, 10, invoice.notes.slice(0, 95), [0.12, 0.18, 0.28]);
  }

  drawText(content, 45, 38, 8, "Generert i Fakturering App", [0.45, 0.51, 0.6]);

  return concat(content);
}

function buildPdf(pageStreams: Uint8Array[]) {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let offset = 0;

  function append(chunk: Uint8Array) {
    chunks.push(chunk);
    offset += chunk.length;
  }

  function addObject(id: number, body: Uint8Array) {
    offsets[id] = offset;
    append(ascii(`${id} 0 obj\n`));
    append(body);
    append(ascii("\nendobj\n"));
  }

  append(ascii("%PDF-1.4\n"));

  const fontObjectId = 3;
  const pageObjectIds = pageStreams.map((_, index) => 4 + index * 2);
  const contentObjectIds = pageStreams.map((_, index) => 5 + index * 2);
  const objectCount = 3 + pageStreams.length * 2;

  addObject(1, ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  addObject(2, ascii(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageStreams.length} >>`));
  addObject(fontObjectId, ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));

  pageStreams.forEach((stream, index) => {
    addObject(
      pageObjectIds[index],
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`
      )
    );
    addObject(contentObjectIds[index], concat([ascii(`<< /Length ${stream.length} >>\nstream\n`), stream, ascii("endstream")]));
  });

  const xrefOffset = offset;
  append(ascii(`xref\n0 ${objectCount + 1}\n`));
  append(ascii("0000000000 65535 f \n"));

  for (let id = 1; id <= objectCount; id += 1) {
    append(ascii(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`));
  }

  append(ascii(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

  return new Blob([concat(chunks)], { type: "application/pdf" });
}

function chunkItems(items: PdfLine[], size: number) {
  const chunks: PdfLine[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function drawText(target: Uint8Array[], x: number, y: number, size: number, text: string, color: [number, number, number]) {
  if (!text) {
    return;
  }

  target.push(ascii(`${color.join(" ")} rg BT /F1 ${size} Tf ${x} ${y} Td `));
  target.push(pdfLiteral(text));
  target.push(ascii(" Tj ET\n"));
}

function drawRect(target: Uint8Array[], x: number, y: number, width: number, height: number, color: [number, number, number]) {
  target.push(ascii(`${color.join(" ")} rg ${x} ${y} ${width} ${height} re f\n`));
}

function drawLine(target: Uint8Array[], x1: number, y1: number, x2: number, y2: number, color: [number, number, number]) {
  target.push(ascii(`${color.join(" ")} RG 0.8 w ${x1} ${y1} m ${x2} ${y2} l S\n`));
}

function pdfLiteral(text: string) {
  const bytes: number[] = [40];

  for (const byte of toWinAnsiBytes(text)) {
    if (byte === 40 || byte === 41 || byte === 92) {
      bytes.push(92, byte);
    } else if (byte === 10) {
      bytes.push(92, 110);
    } else if (byte === 13) {
      bytes.push(92, 114);
    } else {
      bytes.push(byte);
    }
  }

  bytes.push(41);
  return new Uint8Array(bytes);
}

function toWinAnsiBytes(text: string) {
  const map: Record<string, number> = {
    æ: 230,
    ø: 248,
    å: 229,
    Æ: 198,
    Ø: 216,
    Å: 197,
    é: 233,
    è: 232,
    ä: 228,
    ö: 246,
    ü: 252,
    " ": 32,
  };

  return Array.from(text).map((char) => {
    const mapped = map[char];
    if (mapped) {
      return mapped;
    }

    const code = char.charCodeAt(0);
    return code >= 32 && code <= 126 ? code : 63;
  });
}

function ascii(text: string) {
  const bytes = new Uint8Array(text.length);

  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }

  return bytes;
}

function concat(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 2,
  }).format(value);
}
