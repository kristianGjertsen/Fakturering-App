export type PdfInvoice = {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  notes?: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company: { name: string; email: string | null } | null;
  invoice_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    line_total: number;
  }>;
};

const encoder = new TextEncoder();

export function createInvoicePdfBase64(invoice: PdfInvoice) {
  const lines = [...invoice.invoice_items];
  const pages = chunk(lines, 18);
  const pageLines = pages.length > 0 ? pages : [[]];
  const streams = pageLines.map((items, index) =>
    createPage(invoice, items, index + 1, pageLines.length),
  );
  const bytes = buildPdf(streams);
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}

function createPage(
  invoice: PdfInvoice,
  items: PdfInvoice["invoice_items"],
  page: number,
  pageCount: number,
) {
  const commands: string[] = [
    "0.06 0.22 0.44 rg 0 790 595 52 re f",
    text(45, 812, 22, "Faktura", "1 1 1"),
    text(455, 815, 10, `Side ${page} av ${pageCount}`, "0.9 0.95 1"),
    text(45, 752, 9, "Fakturanummer", "0.32 0.39 0.48"),
    text(45, 733, 16, invoice.invoice_number),
    text(240, 752, 9, "Fakturadato", "0.32 0.39 0.48"),
    text(240, 733, 12, formatDate(invoice.issue_date)),
    text(400, 752, 9, "Forfallsdato", "0.32 0.39 0.48"),
    text(400, 733, 12, formatDate(invoice.due_date)),
    text(45, 690, 9, "Kunde", "0.32 0.39 0.48"),
    text(45, 671, 14, invoice.company?.name ?? "Ukjent kunde"),
    text(45, 653, 10, invoice.company?.email ?? "", "0.12 0.18 0.28"),
    "0.78 0.84 0.91 RG 0.8 w 45 610 m 550 610 l S",
    text(45, 588, 9, "Beskrivelse", "0.32 0.39 0.48"),
    text(303, 588, 9, "Antall", "0.32 0.39 0.48"),
    text(370, 588, 9, "Pris", "0.32 0.39 0.48"),
    text(440, 588, 9, "MVA", "0.32 0.39 0.48"),
    text(500, 588, 9, "Sum", "0.32 0.39 0.48"),
    "0.78 0.84 0.91 RG 0.8 w 45 576 m 550 576 l S",
  ];

  let y = 553;
  for (const item of items) {
    commands.push(
      text(45, y, 9, truncate(item.description, 43)),
      text(303, y, 9, `${formatNumber(item.quantity)} ${item.unit}`, "0.12 0.18 0.28"),
      text(370, y, 9, formatCurrency(item.unit_price), "0.12 0.18 0.28"),
      text(440, y, 9, `${formatNumber(item.vat_rate)}%`, "0.12 0.18 0.28"),
      text(500, y, 9, formatCurrency(item.line_total)),
    );
    y -= 25;
  }

  if (page === pageCount) {
    const totalsY = Math.min(y - 20, 160);
    commands.push(
      "0.78 0.84 0.91 RG 0.8 w 335 " + (totalsY + 54) + " m 550 " + (totalsY + 54) + " l S",
      text(360, totalsY + 32, 10, "Eks. mva", "0.32 0.39 0.48"),
      text(480, totalsY + 32, 10, formatCurrency(invoice.subtotal)),
      text(360, totalsY + 12, 10, "MVA", "0.32 0.39 0.48"),
      text(480, totalsY + 12, 10, formatCurrency(invoice.vat_total)),
      text(360, totalsY - 16, 14, "Total"),
      text(480, totalsY - 16, 14, formatCurrency(invoice.total)),
    );
  }

  commands.push(text(45, 38, 8, "Generert i Fakturering App", "0.45 0.51 0.6"));
  return winAnsi(commands.filter(Boolean).join("\n") + "\n");
}

function buildPdf(streams: Uint8Array[]) {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const append = (value: Uint8Array) => {
    chunks.push(value);
    length += value.length;
  };
  const object = (id: number, value: Uint8Array) => {
    offsets[id] = length;
    append(encoder.encode(`${id} 0 obj\n`));
    append(value);
    append(encoder.encode("\nendobj\n"));
  };

  append(encoder.encode("%PDF-1.4\n"));
  const pageIds = streams.map((_, index) => 4 + index * 2);
  const contentIds = streams.map((_, index) => 5 + index * 2);
  const objectCount = 3 + streams.length * 2;
  object(1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${streams.length} >>`));
  object(3, encoder.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));

  streams.forEach((stream, index) => {
    object(pageIds[index], encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`));
    object(contentIds[index], concat([encoder.encode(`<< /Length ${stream.length} >>\nstream\n`), stream, encoder.encode("endstream")]));
  });

  const xref = length;
  append(encoder.encode(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`));
  for (let id = 1; id <= objectCount; id += 1) {
    append(encoder.encode(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`));
  }
  append(encoder.encode(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return concat(chunks);
}

function text(x: number, y: number, size: number, value: string, color = "0.03 0.1 0.22") {
  return value ? `${color} rg BT /F1 ${size} Tf ${x} ${y} Td ${literal(value)} Tj ET` : "";
}

function literal(value: string) {
  return `(${value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ")})`;
}

function winAnsi(value: string) {
  const special: Record<string, number> = { æ: 230, ø: 248, å: 229, Æ: 198, Ø: 216, Å: 197, é: 233 };
  return new Uint8Array(Array.from(value).map((char) => special[char] ?? (char.charCodeAt(0) <= 255 ? char.charCodeAt(0) : 63)));
}

function concat(values: Uint8Array[]) {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function chunk<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function formatCurrency(value: number) {
  return `${formatNumber(Number(value))} kr`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number(value));
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}
