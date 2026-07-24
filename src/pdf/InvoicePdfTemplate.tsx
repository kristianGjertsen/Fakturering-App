import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { attachmentReference } from "../lib/attachments";
import { countryLabel } from "../lib/countries";
import type { PdfTemplate } from "../types";

type InvoicePdfItem = {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
  sort_order?: number;
};

type InvoicePdfAttachment = {
  invoice_item_id: string;
};

export type InvoicePdfData = {
  pdf_template?: PdfTemplate;
  invoice_number: string | null;
  issue_date: string;
  delivery_date?: string | null;
  delivery_place?: string | null;
  due_date: string | null;
  notes?: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company?: {
    name: string;
    address?: string | null;
    postal_address?: string | null;
    org_number?: string | null;
    email?: string | null;
    country?: string | null;
  } | null;
  invoice_items?: InvoicePdfItem[];
  invoice_attachments?: InvoicePdfAttachment[];
};

const INVOICE_PDF_DEFAULTS = {
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
  deliveryPlace: "Digital levering",
  dueDate: "2026-08-17",
};

const COLORS = {
  navy: "#0f386f",
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  pale: "#eff6ff",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: { padding: 42, paddingBottom: 54, fontFamily: "Helvetica", fontSize: 10, color: COLORS.text },
  header: { margin: -42, marginBottom: 34, paddingHorizontal: 42, paddingVertical: 22, backgroundColor: COLORS.navy, color: COLORS.white, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  pageNumber: { fontSize: 9, color: "#dbeafe" },
  details: { flexDirection: "row", flexWrap: "wrap", marginBottom: 22 },
  detail: { width: "20%", marginBottom: 10 },
  label: { marginBottom: 5, fontSize: 8, color: COLORS.muted, textTransform: "uppercase" },
  value: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  parties: { flexDirection: "row", gap: 14, marginBottom: 28 },
  party: { flexGrow: 1, flexBasis: 0, padding: 14, backgroundColor: COLORS.pale, borderRadius: 4 },
  partyName: { marginBottom: 5, fontSize: 14, fontFamily: "Helvetica-Bold" },
  partyDetails: { color: COLORS.muted, lineHeight: 1.5 },
  table: { width: "100%" },
  row: { flexDirection: "row", minHeight: 28, alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableHeader: { minHeight: 26, backgroundColor: COLORS.pale, fontSize: 8, fontFamily: "Helvetica-Bold", color: COLORS.muted, textTransform: "uppercase" },
  description: { width: "38%", paddingHorizontal: 7 },
  attachment: { width: "12%", paddingHorizontal: 4, textAlign: "center" },
  quantity: { width: "13%", paddingHorizontal: 5, textAlign: "right" },
  price: { width: "16%", paddingHorizontal: 5, textAlign: "right" },
  vat: { width: "9%", paddingHorizontal: 4, textAlign: "right" },
  sum: { width: "12%", paddingHorizontal: 7, textAlign: "right" },
  totals: { marginTop: 20, marginLeft: "55%", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  grandTotal: { marginTop: 5, paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.navy, fontSize: 14, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 24, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  notesText: { marginTop: 5, color: COLORS.muted, lineHeight: 1.5 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COLORS.muted },
  modernPage: { padding: 36, paddingBottom: 54, backgroundColor: "#f8fafc" },
  modernHeader: { margin: -36, marginBottom: 30, paddingHorizontal: 36, paddingVertical: 26, backgroundColor: "#2563eb" },
  modernParty: { backgroundColor: "#dbeafe", borderLeftWidth: 4, borderLeftColor: "#2563eb", borderRadius: 0 },
  modernTableHeader: { backgroundColor: "#2563eb", color: COLORS.white },
  modernGrandTotal: { borderTopColor: "#2563eb", color: "#1d4ed8" },
  modernFooter: { left: 36, right: 36, color: "#1d4ed8" },
  minimalPage: { paddingHorizontal: 52, paddingTop: 44 },
  minimalHeader: { margin: 0, marginBottom: 42, paddingHorizontal: 0, paddingVertical: 0, paddingBottom: 16, backgroundColor: COLORS.white, color: COLORS.text, borderBottomWidth: 2, borderBottomColor: COLORS.navy },
  minimalTitle: { color: COLORS.navy, fontSize: 20 },
  minimalPageNumber: { color: COLORS.muted },
  minimalParty: { paddingHorizontal: 0, paddingVertical: 12, backgroundColor: COLORS.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border, borderRadius: 0 },
  minimalTableHeader: { backgroundColor: COLORS.white, color: COLORS.navy, borderBottomWidth: 2, borderBottomColor: COLORS.navy },
  minimalGrandTotal: { borderTopColor: COLORS.navy, color: COLORS.navy },
  minimalFooter: { left: 52, right: 52 },
});

export function InvoicePdfTemplate({ invoice }: { invoice: InvoicePdfData }) {
  const template = invoice.pdf_template ?? "classic";
  const items = [...(invoice.invoice_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const { noteText, paymentText } = splitInvoiceNotes(invoice.notes);
  const invoiceNumber = invoice.invoice_number || INVOICE_PDF_DEFAULTS.invoiceNumber;
  const issueDate = invoice.issue_date || INVOICE_PDF_DEFAULTS.issueDate;
  const dueDate = invoice.due_date || INVOICE_PDF_DEFAULTS.dueDate;
  const deliveryDate = invoice.delivery_date || issueDate;
  const deliveryPlace = invoice.delivery_place || INVOICE_PDF_DEFAULTS.deliveryPlace;
  const customerName = invoice.company?.name || INVOICE_PDF_DEFAULTS.customer.name;
  const customerDetails = [
    invoice.company?.address || INVOICE_PDF_DEFAULTS.customer.address,
    invoice.company?.postal_address || INVOICE_PDF_DEFAULTS.customer.postalAddress,
    invoice.company?.org_number
      ? `Org.nr. ${invoice.company.org_number}`
      : `Org.nr. ${INVOICE_PDF_DEFAULTS.customer.orgNumber}`,
    invoice.company?.email,
    countryLabel(invoice.company?.country ?? INVOICE_PDF_DEFAULTS.customer.country),
  ].filter(Boolean);
  const sellerDetails = [
    INVOICE_PDF_DEFAULTS.seller.address,
    INVOICE_PDF_DEFAULTS.seller.postalAddress,
    countryLabel(INVOICE_PDF_DEFAULTS.seller.country),
    `Org.nr. ${INVOICE_PDF_DEFAULTS.seller.orgNumber}`,
  ];
  const pageStyles = [
    styles.page,
    ...(template === "modern"
      ? [styles.modernPage]
      : template === "minimal"
        ? [styles.minimalPage]
        : []),
  ];
  const headerStyles = [
    styles.header,
    ...(template === "modern"
      ? [styles.modernHeader]
      : template === "minimal"
        ? [styles.minimalHeader]
        : []),
  ];
  const titleStyles = [
    styles.title,
    ...(template === "minimal" ? [styles.minimalTitle] : []),
  ];
  const pageNumberStyles = [
    styles.pageNumber,
    ...(template === "minimal" ? [styles.minimalPageNumber] : []),
  ];
  const footerStyles = [
    styles.footer,
    ...(template === "modern"
      ? [styles.modernFooter]
      : template === "minimal"
        ? [styles.minimalFooter]
        : []),
  ];

  return (
    <Document title={`Faktura ${invoiceNumber}`}>
      <Page size="A4" style={pageStyles} wrap>
        <View style={headerStyles} fixed>
          <Text style={titleStyles}>Faktura</Text>
          <Text
            style={pageNumberStyles}
            render={({ pageNumber, totalPages }) => `Side ${pageNumber} av ${totalPages}`}
          />
        </View>

        <View style={styles.details}>
          <InvoiceMetadataItem label="Fakturanummer" value={invoiceNumber} />
          <InvoiceMetadataItem label="Fakturadato" value={formatPdfDate(issueDate)} />
          <InvoiceMetadataItem label="Leveringsdato" value={formatPdfDate(deliveryDate)} />
          <InvoiceMetadataItem label="Leveringssted" value={deliveryPlace} />
          <InvoiceMetadataItem label="Forfallsdato" value={formatPdfDate(dueDate)} />
        </View>

        <View style={styles.parties}>
          <InvoiceParty
            template={template}
            label="Selger"
            name={INVOICE_PDF_DEFAULTS.seller.name}
            details={sellerDetails}
          />
          <InvoiceParty
            template={template}
            label="Kunde"
            name={customerName}
            details={customerDetails}
          />
        </View>

        <InvoicePdfItemsTable
          template={template}
          items={items}
          attachments={invoice.invoice_attachments ?? []}
        />

        <View style={styles.totals} wrap={false}>
          <InvoicePdfTotalRow label="Eks. MVA" value={formatPdfCurrency(invoice.subtotal)} />
          <InvoicePdfTotalRow label="MVA" value={formatPdfCurrency(invoice.vat_total)} />
          <InvoicePdfTotalRow
            template={template}
            label="Total"
            value={formatPdfCurrency(invoice.total)}
            grand
          />
        </View>

        {paymentText && (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.label}>Betalingsinformasjon</Text>
            <Text style={styles.notesText}>{paymentText}</Text>
          </View>
        )}

        {noteText && (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.label}>Notater</Text>
            <Text style={styles.notesText}>{noteText}</Text>
          </View>
        )}

        <View style={footerStyles} fixed>
          <Text>Generert i AutoFaktura</Text>
          <Text>{invoiceNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}

function InvoiceMetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function splitInvoiceNotes(notes: string | null | undefined) {
  const sections = (notes ?? "")
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
  const paymentSections = sections.filter(isPaymentSection);
  const noteSections = sections.filter((section) => !isPaymentSection(section));

  return {
    paymentText: paymentSections.join("\n"),
    noteText: noteSections.join("\n\n"),
  };
}

function isPaymentSection(section: string) {
  return /^(Betaling til|KID:)/i.test(section);
}

function InvoiceParty({
  template,
  label,
  name,
  details,
}: {
  template: PdfTemplate;
  label: string;
  name: string;
  details: Array<string | null | undefined>;
}) {
  const partyStyles = [
    styles.party,
    ...(template === "modern"
      ? [styles.modernParty]
      : template === "minimal"
        ? [styles.minimalParty]
        : []),
  ];

  return (
    <View style={partyStyles}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.partyName}>{name}</Text>
      {details.map((detail) => (
        <Text key={detail} style={styles.partyDetails}>{detail}</Text>
      ))}
    </View>
  );
}

function InvoicePdfItemsTable({
  template,
  items,
  attachments,
}: {
  template: PdfTemplate;
  items: InvoicePdfItem[];
  attachments: InvoicePdfAttachment[];
}) {
  return (
    <View style={styles.table}>
      <InvoicePdfTableRow
        template={template}
        header
        description="Beskrivelse"
        attachment="Vedlegg"
        quantity="Antall"
        price="Pris"
        vat="MVA"
        sum="Sum"
      />
      {items.map((item, itemIndex) => {
        const attachmentCount = item.id
          ? attachments.filter((attachment) => attachment.invoice_item_id === item.id).length
          : 0;
        const attachmentReferences = attachmentCount > 0
          ? Array.from(
              { length: attachmentCount },
              (_, attachmentIndex) => attachmentReference(itemIndex, attachmentIndex),
            ).join(", ")
          : "NEI";

        return (
          <InvoicePdfTableRow
            key={`${item.description}-${itemIndex}`}
            description={item.description}
            attachment={attachmentReferences}
            quantity={`${formatPdfNumber(item.quantity)} ${item.unit}`}
            price={formatPdfCurrency(item.unit_price)}
            vat={`${formatPdfNumber(item.vat_rate)} %`}
            sum={formatPdfCurrency(item.line_total)}
          />
        );
      })}
    </View>
  );
}

type InvoicePdfTableRowProps = {
  template?: PdfTemplate;
  header?: boolean;
  description: string;
  attachment: string;
  quantity: string;
  price: string;
  vat: string;
  sum: string;
};

function InvoicePdfTableRow({
  template = "classic",
  header = false,
  description,
  attachment,
  quantity,
  price,
  vat,
  sum,
}: InvoicePdfTableRowProps) {
  const headerStyles = header
    ? [
        styles.tableHeader,
        ...(template === "modern"
          ? [styles.modernTableHeader]
          : template === "minimal"
            ? [styles.minimalTableHeader]
            : []),
      ]
    : [];

  return (
    <View style={[styles.row, ...headerStyles]} wrap={false}>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.attachment}>{attachment}</Text>
      <Text style={styles.quantity}>{quantity}</Text>
      <Text style={styles.price}>{price}</Text>
      <Text style={styles.vat}>{vat}</Text>
      <Text style={styles.sum}>{sum}</Text>
    </View>
  );
}

function InvoicePdfTotalRow({
  template = "classic",
  label,
  value,
  grand = false,
}: {
  template?: PdfTemplate;
  label: string;
  value: string;
  grand?: boolean;
}) {
  const grandTotalStyles = grand
    ? [
        styles.grandTotal,
        ...(template === "modern"
          ? [styles.modernGrandTotal]
          : template === "minimal"
            ? [styles.minimalGrandTotal]
            : []),
      ]
    : [];

  return (
    <View style={[styles.totalRow, ...grandTotalStyles]}>
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

function formatPdfDate(value: string | null) {
  if (!value) return "–";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function formatPdfNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatPdfCurrency(value: number) {
  return `${formatPdfNumber(value)} kr`;
}
