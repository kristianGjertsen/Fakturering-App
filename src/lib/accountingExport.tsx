import { createElement } from "react";
import type { InvoiceWithDetails, Profile } from "../types";
import {
  ATTACHMENT_BUCKET,
  attachmentFileName,
  referenceInvoiceAttachments,
} from "./attachments";
import { createInvoicePdfBlob } from "./invoicePdf";
import { supabase } from "../supabaseClient";

type ZipFile = {
  path: string;
  data: Blob | Uint8Array | string;
};

const encoder = new TextEncoder();

export async function downloadAccountingExport(invoices: InvoiceWithDetails[], sellerProfile: Profile) {
  const paidInvoices = invoices
    .filter((invoice) => invoice.paid || invoice.status === "paid")
    .sort((left, right) => left.issue_date.localeCompare(right.issue_date));

  if (paidInvoices.length === 0) {
    throw new Error("Ingen betalte fakturaer å eksportere.");
  }

  const files: ZipFile[] = [
    {
      path: "README.md",
      data: `# Regnskapsgrunnlag

Denne ZIP-filen inneholder dokumentene du trenger for å føre betalte fakturaer i regnskapet.
Kun fakturaer som var markert som betalt ved nedlasting er inkludert.

Innhold:
- Fakturaoversikt.xlsx: samlet oversikt over betalte fakturaer.
- Fakturalinjer.xlsx: alle fakturalinjer fra de betalte fakturaene.
- Betalinger.xlsx: beløp, betalingsinformasjon og eventuell KID.
- Fakturajournal.pdf: enkel journal over eksporterte fakturaer.
- Fakturaer/: PDF-kopi av hver betalte faktura.
- Vedlegg/: vedlegg sortert per fakturanummer.

Antall betalte fakturaer i eksporten: ${paidInvoices.length}
`,
    },
    {
      path: "Fakturaoversikt.xlsx",
      data: await createXlsx([
        [
          "Fakturanummer",
          "Kunde",
          "Org.nr.",
          "E-post",
          "Fakturadato",
          "Forfall",
          "Eks. MVA",
          "MVA",
          "Total",
          "Status",
        ],
        ...paidInvoices.map((invoice) => [
          invoiceNumber(invoice),
          invoice.company?.name ?? invoice.recipient_name,
          invoice.company?.org_number ?? invoice.recipient_org_number ?? "",
          invoice.company?.email ?? invoice.recipient_email ?? "",
          invoice.issue_date,
          invoice.due_date ?? "",
          Number(invoice.subtotal),
          Number(invoice.vat_total),
          Number(invoice.total),
          "Betalt",
        ]),
      ]),
    },
    {
      path: "Fakturalinjer.xlsx",
      data: await createXlsx([
        [
          "Fakturanummer",
          "Kunde",
          "Linje",
          "Beskrivelse",
          "Antall",
          "Enhet",
          "Enhetspris",
          "MVA %",
          "Linjesum",
        ],
        ...paidInvoices.flatMap((invoice) =>
          [...(invoice.invoice_items ?? [])]
            .sort((left, right) => left.sort_order - right.sort_order)
            .map((line, index) => [
              invoiceNumber(invoice),
              invoice.company?.name ?? invoice.recipient_name,
              index + 1,
              line.description,
              Number(line.quantity),
              line.unit,
              Number(line.unit_price),
              Number(line.vat_rate),
              Number(line.line_total),
            ]),
        ),
      ]),
    },
    {
      path: "Betalinger.xlsx",
      data: await createXlsx([
        ["Fakturanummer", "Kunde", "Belop", "Markert betalt", "Forfall", "Betalingsinformasjon", "KID"],
        ...paidInvoices.map((invoice) => {
          const paymentDetails = extractPaymentDetails(invoice.notes);

          return [
            invoiceNumber(invoice),
            invoice.company?.name ?? invoice.recipient_name,
            Number(invoice.total),
            invoice.paid_at ?? invoice.updated_at.slice(0, 10),
            invoice.due_date ?? "",
            paymentDetails.paymentInfo,
            paymentDetails.kid,
          ];
        }),
      ]),
    },
    {
      path: "Fakturajournal.pdf",
      data: await createInvoiceJournalPdf(paidInvoices),
    },
  ];

  for (const invoice of paidInvoices) {
    const number = invoiceNumber(invoice);
    const invoicePrefix = Number(invoice.total) < 0 ? "Kreditnota" : "Faktura";
    files.push({
      path: `Fakturaer/${invoicePrefix}-${safePathPart(number)}.pdf`,
      data: await createInvoicePdfBlob(invoice, sellerProfile),
    });

    const referencedAttachments = referenceInvoiceAttachments(
      invoice.invoice_items ?? [],
      invoice.invoice_attachments ?? [],
    );

    for (const { attachment, reference } of referencedAttachments) {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .download(attachment.storage_path);

      if (error) {
        throw new Error(`Kunne ikke hente vedlegg ${attachment.original_name}: ${error.message}`);
      }

      files.push({
        path: `Vedlegg/${safePathPart(number)}/${safePathPart(attachmentFileName(attachment.original_name, reference))}`,
        data,
      });
    }
  }

  const zipBlob = await createZip(files);
  downloadBlob(zipBlob, `Fakturagrunnlag-${new Date().toISOString().slice(0, 7)}.zip`);
  return paidInvoices.length;
}

function invoiceNumber(invoice: InvoiceWithDetails) {
  return invoice.invoice_number ?? invoice.id.slice(0, 8);
}

function extractPaymentDetails(notes: string | null) {
  const sections = (notes ?? "")
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
  const kid = sections.find((section) => section.toLowerCase().startsWith("kid:")) ?? "";

  return {
    paymentInfo: sections.find((section) => section.toLowerCase().startsWith("betaling til")) ?? "",
    kid: kid.replace(/^kid:\s*/i, ""),
  };
}

function createXlsx(rows: Array<Array<string | number>>) {
  return createZip([
    {
      path: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Ark1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      path: "xl/worksheets/sheet1.xml",
      data: worksheetXml(rows),
    },
  ]);
}

function worksheetXml(rows: Array<Array<string | number>>) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, cellIndex) => cellXml(cell, cellIndex, rowIndex)).join("")}</row>`).join("")}
  </sheetData>
</worksheet>`;
}

function cellXml(value: string | number, cellIndex: number, rowIndex: number) {
  const reference = `${columnName(cellIndex)}${rowIndex + 1}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }

  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}

async function createInvoiceJournalPdf(invoices: InvoiceWithDetails[]) {
  const { Document, Page, StyleSheet, Text, View, pdf } = await import("@react-pdf/renderer");
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.vat_total), 0);
  const styles = StyleSheet.create({
    page: { padding: 42, fontFamily: "Helvetica", fontSize: 9, color: "#0f172a" },
    title: { marginBottom: 16, fontSize: 18, fontFamily: "Helvetica-Bold" },
    summary: { marginBottom: 16, color: "#475569" },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingVertical: 6 },
    header: { fontFamily: "Helvetica-Bold", backgroundColor: "#eff6ff" },
    number: { width: "18%" },
    customer: { width: "30%" },
    date: { width: "16%" },
    amount: { width: "18%", textAlign: "right" },
    vat: { width: "18%", textAlign: "right" },
  });

  const row = (invoice: InvoiceWithDetails) =>
    createElement(
      View,
      { key: invoice.id, style: styles.row },
      createElement(Text, { style: styles.number }, invoiceNumber(invoice)),
      createElement(Text, { style: styles.customer }, invoice.company?.name ?? invoice.recipient_name),
      createElement(Text, { style: styles.date }, invoice.issue_date),
      createElement(Text, { style: styles.amount }, formatAmount(Number(invoice.total))),
      createElement(Text, { style: styles.vat }, formatAmount(Number(invoice.vat_total))),
    );

  return pdf(createElement(
    Document,
    { title: "Fakturajournal" },
    createElement(
      Page,
      { size: "A4", style: styles.page },
      createElement(Text, { style: styles.title }, "Fakturajournal"),
      createElement(
        Text,
        { style: styles.summary },
        `Kun fakturaer markert som betalt er inkludert. Antall: ${invoices.length}. Total: ${formatAmount(total)}. MVA: ${formatAmount(vat)}.`,
      ),
      createElement(
        View,
        { style: [styles.row, styles.header] },
        createElement(Text, { style: styles.number }, "Faktura"),
        createElement(Text, { style: styles.customer }, "Kunde"),
        createElement(Text, { style: styles.date }, "Dato"),
        createElement(Text, { style: styles.amount }, "Total"),
        createElement(Text, { style: styles.vat }, "MVA"),
      ),
      ...invoices.map(row),
    ),
  )).toBlob();
}

async function createZip(files: ZipFile[]) {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = await fileBytes(file.data);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    localHeader.set(name, 30);
    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  return new Blob(
    [...chunks, ...centralDirectory, end].map((chunk) => chunkToArrayBuffer(chunk)),
    { type: "application/zip" },
  );
}

async function fileBytes(data: Blob | Uint8Array | string) {
  if (typeof data === "string") {
    return encoder.encode(data);
  }

  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }

  return data;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function chunkToArrayBuffer(chunk: Uint8Array) {
  const copy = new Uint8Array(chunk.length);
  copy.set(chunk);
  return copy.buffer;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safePathPart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "uten-navn";
}

function formatAmount(value: number) {
  return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} kr`;
}
function createReadme(invoiceCount: number) {
  return `# Regnskapsgrunnlag

Denne ZIP-filen inneholder dokumentene du trenger for å føre betalte fakturaer i regnskapet.
Kun fakturaer som var markert som betalt ved nedlasting er inkludert.

Innhold:
- Fakturaoversikt.xlsx: samlet oversikt over betalte fakturaer.
- Fakturalinjer.xlsx: alle fakturalinjer fra de betalte fakturaene.
- Betalinger.xlsx: beløp, betalingsinformasjon og eventuell KID.
- Fakturajournal.pdf: enkel journal over eksporterte fakturaer.
- Fakturaer/: PDF-kopi av hver betalte faktura.
- Vedlegg/: vedlegg sortert per fakturanummer.

Antall betalte fakturaer i eksporten: ${invoiceCount}
`;
}
