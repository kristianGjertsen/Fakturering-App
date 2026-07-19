export type PdfTemplate = "classic" | "modern" | "minimal";

export type PdfInvoice = {
  pdf_template?: PdfTemplate;
  invoice_number: string;
  issue_date: string;
  delivery_date?: string | null;
  delivery_place?: string | null;
  due_date: string | null;
  notes?: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company: {
    name: string;
    address?: string | null;
    postal_address?: string | null;
    org_number?: string | null;
    email: string | null;
    country?: string | null;
  } | null;
  invoice_items: Array<{
    id?: string;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    line_total: number;
    sort_order?: number;
  }>;
  invoice_attachments?: Array<{
    invoice_item_id: string;
  }>;
};

const fallbackInvoice = {
  seller: {
    name: "Kristian Gjertsen ENK",
    address: "Adresseveien 1",
    postalAddress: "0001 Oslo",
    country: "NO",
    orgNumber: "123 456 789",
  },
  customer: {
    name: "Testfirma Kristian AS",
    address: "Kundegata 2",
    postalAddress: "0123 Oslo",
    country: "NO",
    orgNumber: "987 654 321",
  },
  invoiceNumber: "1001",
  issueDate: "2026-07-18",
  deliveryDate: "2026-07-18",
  deliveryPlace: "Digital levering",
  dueDate: "2026-08-17",
};

type Theme = {
  pageBackground?: string;
  headerBackground?: string;
  headerText: string;
  accent: string;
  muted: string;
  tableHeaderBackground?: string;
  tableHeaderText: string;
  footerText: string;
};

const encoder = new TextEncoder();

const themes: Record<PdfTemplate, Theme> = {
  classic: {
    headerBackground: "0.059 0.220 0.435",
    headerText: "1 1 1",
    accent: "0.059 0.220 0.435",
    muted: "0.392 0.455 0.541",
    tableHeaderBackground: "0.937 0.965 1",
    tableHeaderText: "0.392 0.455 0.541",
    footerText: "0.392 0.455 0.541",
  },
  modern: {
    pageBackground: "0.973 0.980 0.988",
    headerBackground: "0.145 0.388 0.922",
    headerText: "1 1 1",
    accent: "0.145 0.388 0.922",
    muted: "0.294 0.416 0.635",
    tableHeaderBackground: "0.145 0.388 0.922",
    tableHeaderText: "1 1 1",
    footerText: "0.114 0.306 0.847",
  },
  minimal: {
    headerText: "0.059 0.220 0.435",
    accent: "0.059 0.220 0.435",
    muted: "0.392 0.455 0.541",
    tableHeaderText: "0.059 0.220 0.435",
    footerText: "0.392 0.455 0.541",
  },
};

export function createInvoicePdfBase64(invoice: PdfInvoice) {
  const items = [...invoice.invoice_items].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
  );
  const pages = paginateItems(items, invoice);
  const pageItems = pages.length > 0 ? pages : [{ items: [], lineOffset: 0 }];
  const template = invoice.pdf_template ?? "classic";
  const streams = pageItems.map((page, index) =>
    createPage(
      invoice,
      page.items,
      index + 1,
      pageItems.length,
      template,
      page.lineOffset,
    ),
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
  template: PdfTemplate,
  lineOffset: number,
) {
  const theme = themes[template];
  const commands: string[] = [];
  const invoiceNumber = invoice.invoice_number || fallbackInvoice.invoiceNumber;
  const issueDate = invoice.issue_date || fallbackInvoice.issueDate;
  const dueDate = invoice.due_date || fallbackInvoice.dueDate;
  const deliveryDate = invoice.delivery_date || issueDate || fallbackInvoice.deliveryDate;
  const deliveryPlace = invoice.delivery_place || fallbackInvoice.deliveryPlace;
  const customerName = invoice.company?.name || fallbackInvoice.customer.name;
  const customerAddress = invoice.company?.address || fallbackInvoice.customer.address;
  const customerPostalAddress = invoice.company?.postal_address || fallbackInvoice.customer.postalAddress;
  const customerCountry = countryLabel(invoice.company?.country ?? fallbackInvoice.customer.country);
  const customerOrgNumber = invoice.company?.org_number || fallbackInvoice.customer.orgNumber;

  if (theme.pageBackground) {
    commands.push(`${theme.pageBackground} rg 0 0 595 842 re f`);
  }

  if (theme.headerBackground) {
    commands.push(`${theme.headerBackground} rg 0 790 595 52 re f`);
  } else {
    commands.push(`${theme.accent} RG 1.5 w 45 790 m 550 790 l S`);
  }

  if (template === "modern") {
    commands.push("0.859 0.918 1 rg 35 592 525 112 re f");
  } else if (template === "minimal") {
    commands.push(
      "0.796 0.835 0.882 RG 0.8 w 45 705 m 550 705 l S",
      "0.796 0.835 0.882 RG 0.8 w 45 592 m 550 592 l S",
    );
  }

  commands.push(
    text(45, 812, template === "minimal" ? 20 : 22, "Faktura", theme.headerText),
    text(455, 815, 10, `Side ${page} av ${pageCount}`, template === "minimal" ? theme.muted : theme.headerText),
    text(45, 752, 9, "Fakturanummer", theme.muted),
    text(45, 733, 15, invoiceNumber),
    text(155, 752, 9, "Fakturadato", theme.muted),
    text(155, 733, 11, formatDate(issueDate)),
    text(260, 752, 9, "Leveringsdato", theme.muted),
    text(260, 733, 11, formatDate(deliveryDate)),
    text(365, 752, 9, "Leveringssted", theme.muted),
    text(365, 733, 11, deliveryPlace),
    text(475, 752, 9, "Forfallsdato", theme.muted),
    text(475, 733, 11, formatDate(dueDate)),
    text(45, 690, 9, "Selger", theme.muted),
    text(45, 671, 13, fallbackInvoice.seller.name),
    text(45, 653, 10, fallbackInvoice.seller.address, "0.12 0.18 0.28"),
    text(45, 637, 10, fallbackInvoice.seller.postalAddress, "0.12 0.18 0.28"),
    text(45, 621, 10, countryLabel(fallbackInvoice.seller.country), "0.12 0.18 0.28"),
    text(45, 605, 10, `Org.nr. ${fallbackInvoice.seller.orgNumber}`, "0.12 0.18 0.28"),
    text(310, 690, 9, "Kunde", theme.muted),
    text(310, 671, 13, customerName),
    text(310, 653, 10, customerAddress, "0.12 0.18 0.28"),
    text(310, 637, 10, customerPostalAddress, "0.12 0.18 0.28"),
    text(310, 621, 10, customerCountry, "0.12 0.18 0.28"),
    text(310, 605, 10, `Org.nr. ${customerOrgNumber}`, "0.12 0.18 0.28"),
    text(310, 589, 10, invoice.company?.email ?? "", "0.12 0.18 0.28"),
  );

  if (theme.tableHeaderBackground) {
    commands.push(`${theme.tableHeaderBackground} rg 45 540 505 28 re f`);
  }

  commands.push(
    text(52, 550, 9, "Beskrivelse", theme.tableHeaderText),
    text(247, 550, 9, "Vedlegg", theme.tableHeaderText),
    text(325, 550, 9, "Antall", theme.tableHeaderText),
    text(390, 550, 9, "Pris", theme.tableHeaderText),
    text(450, 550, 9, "MVA", theme.tableHeaderText),
    text(510, 550, 9, "Sum", theme.tableHeaderText),
    `${theme.accent} RG 0.8 w 45 540 m 550 540 l S`,
  );

  let y = 516;
  for (const [itemIndex, item] of items.entries()) {
    const attachmentCount = item.id
      ? (invoice.invoice_attachments ?? []).filter(
        (attachment) => attachment.invoice_item_id === item.id
      ).length
      : 0;
    const attachmentReferences = attachmentCount > 0
      ? Array.from(
        { length: attachmentCount },
        (_, attachmentIndex) =>
          attachmentReference(lineOffset + itemIndex, attachmentIndex),
      )
      : ["NEI"];
    const referenceLines = chunk(attachmentReferences, 3).map(
      (references) => references.join(", "),
    );
    const rowHeight = invoiceRowHeight(attachmentCount);

    commands.push(
      text(52, y, 9, truncate(item.description, 31)),
      text(325, y, 9, `${formatNumber(item.quantity)} ${item.unit}`, "0.12 0.18 0.28"),
      text(390, y, 9, formatCurrency(item.unit_price), "0.12 0.18 0.28"),
      text(450, y, 9, `${formatNumber(item.vat_rate)}%`, "0.12 0.18 0.28"),
      text(510, y, 9, formatCurrency(item.line_total)),
      ...referenceLines.map((line, index) =>
        text(260, y - index * 10, 9, line, "0.12 0.18 0.28")
      ),
      "0.89 0.91 0.94 RG 0.4 w 45 " + (y - rowHeight + 16) + " m 550 " + (y - rowHeight + 16) + " l S",
    );
    y -= rowHeight;
  }

  if (page === pageCount) {
    const totalsY = Math.min(y - 20, 160);
    commands.push(
      `${theme.accent} RG 0.8 w 335 ${totalsY + 54} m 550 ${totalsY + 54} l S`,
      text(360, totalsY + 32, 10, "Eks. MVA", theme.muted),
      text(480, totalsY + 32, 10, formatCurrency(invoice.subtotal)),
      text(360, totalsY + 12, 10, "MVA", theme.muted),
      text(480, totalsY + 12, 10, formatCurrency(invoice.vat_total)),
      text(360, totalsY - 16, 14, "Total", theme.accent),
      text(480, totalsY - 16, 14, formatCurrency(invoice.total), theme.accent),
    );

    if (invoice.notes) {
      commands.push(
        text(45, 112, 9, "Notat", theme.muted),
        text(45, 94, 9, truncate(invoice.notes, 95), "0.12 0.18 0.28"),
      );
    }
  }

  commands.push(
    text(45, 38, 8, "Generert i AutoFaktura", theme.footerText),
    text(475, 38, 8, invoiceNumber, theme.footerText),
  );

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
  const special: Record<string, number> = {
    æ: 230,
    ø: 248,
    å: 229,
    Æ: 198,
    Ø: 216,
    Å: 197,
    é: 233,
  };
  return new Uint8Array(
    Array.from(value).map((character) =>
      special[character] ?? (character.charCodeAt(0) <= 255 ? character.charCodeAt(0) : 63)
    ),
  );
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
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

function paginateItems(items: PdfInvoice["invoice_items"], invoice: PdfInvoice) {
  const pages: Array<{
    items: PdfInvoice["invoice_items"];
    lineOffset: number;
  }> = [];
  let currentItems: PdfInvoice["invoice_items"] = [];
  let currentHeight = 0;
  let lineOffset = 0;

  items.forEach((item, index) => {
    const attachmentCount = item.id
      ? (invoice.invoice_attachments ?? []).filter(
        (attachment) => attachment.invoice_item_id === item.id
      ).length
      : 0;
    const rowHeight = invoiceRowHeight(attachmentCount);

    if (currentItems.length > 0 && currentHeight + rowHeight > 350) {
      pages.push({ items: currentItems, lineOffset });
      currentItems = [];
      currentHeight = 0;
      lineOffset = index;
    }

    currentItems.push(item);
    currentHeight += rowHeight;
  });

  if (currentItems.length > 0) {
    pages.push({ items: currentItems, lineOffset });
  }

  return pages;
}

function invoiceRowHeight(attachmentCount: number) {
  return 25 + Math.max(0, Math.ceil(attachmentCount / 3) - 1) * 10;
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

function attachmentReference(lineIndex: number, attachmentIndex: number) {
  return `${lineLetter(lineIndex)}${attachmentIndex + 1}`;
}

function lineLetter(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
}

function countryLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    NO: "Norge",
    SE: "Sverige",
    DK: "Danmark",
    FI: "Finland",
    IS: "Island",
    DE: "Tyskland",
    NL: "Nederland",
    GB: "Storbritannia",
    US: "USA",
    FR: "Frankrike",
    ES: "Spania",
    IT: "Italia",
    PL: "Polen",
  };

  return value ? labels[value] ?? value : "";
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}
