import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { countryLabel } from "../lib/countries";

export type InvoicePdfData = {
  pdf_template?: "classic" | "modern" | "minimal";
  invoice_number: string;
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
  invoice_items?: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    line_total: number;
    sort_order?: number;
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

const colors = {
  navy: "#0f386f",
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  pale: "#eff6ff",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: { padding: 42, paddingBottom: 54, fontFamily: "Helvetica", fontSize: 10, color: colors.text },
  header: { margin: -42, marginBottom: 34, paddingHorizontal: 42, paddingVertical: 22, backgroundColor: colors.navy, color: colors.white, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  pageNumber: { fontSize: 9, color: "#dbeafe" },
  details: { flexDirection: "row", flexWrap: "wrap", marginBottom: 22 },
  detail: { width: "20%", marginBottom: 10 },
  label: { marginBottom: 5, fontSize: 8, color: colors.muted, textTransform: "uppercase" },
  value: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  parties: { flexDirection: "row", gap: 14, marginBottom: 28 },
  party: { flexGrow: 1, flexBasis: 0, padding: 14, backgroundColor: colors.pale, borderRadius: 4 },
  customer: { marginBottom: 28, padding: 14, backgroundColor: colors.pale, borderRadius: 4 },
  customerName: { marginBottom: 5, fontSize: 14, fontFamily: "Helvetica-Bold" },
  customerDetails: { color: colors.muted, lineHeight: 1.5 },
  table: { width: "100%" },
  row: { flexDirection: "row", minHeight: 28, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeader: { minHeight: 26, backgroundColor: colors.pale, fontSize: 8, fontFamily: "Helvetica-Bold", color: colors.muted, textTransform: "uppercase" },
  description: { width: "44%", paddingHorizontal: 7 },
  quantity: { width: "14%", paddingHorizontal: 5, textAlign: "right" },
  price: { width: "17%", paddingHorizontal: 5, textAlign: "right" },
  vat: { width: "10%", paddingHorizontal: 5, textAlign: "right" },
  sum: { width: "15%", paddingHorizontal: 7, textAlign: "right" },
  totals: { marginTop: 20, marginLeft: "55%", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  grandTotal: { marginTop: 5, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.navy, fontSize: 14, fontFamily: "Helvetica-Bold" },
  notes: { marginTop: 24, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 4 },
  notesText: { marginTop: 5, color: colors.muted, lineHeight: 1.5 },
  footer: { position: "absolute", left: 42, right: 42, bottom: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: colors.muted },
  modernPage: { padding: 36, paddingBottom: 54, backgroundColor: "#f8fafc" },
  modernHeader: { margin: -36, marginBottom: 30, paddingHorizontal: 36, paddingVertical: 26, backgroundColor: "#2563eb" },
  modernCustomer: { backgroundColor: "#dbeafe", borderLeftWidth: 4, borderLeftColor: "#2563eb", borderRadius: 0 },
  modernTableHeader: { backgroundColor: "#2563eb", color: colors.white },
  modernGrandTotal: { borderTopColor: "#2563eb", color: "#1d4ed8" },
  modernFooter: { left: 36, right: 36, color: "#1d4ed8" },
  minimalPage: { paddingHorizontal: 52, paddingTop: 44 },
  minimalHeader: { margin: 0, marginBottom: 42, paddingHorizontal: 0, paddingVertical: 0, paddingBottom: 16, backgroundColor: colors.white, color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.navy },
  minimalTitle: { color: colors.navy, fontSize: 20 },
  minimalPageNumber: { color: colors.muted },
  minimalCustomer: { paddingHorizontal: 0, paddingVertical: 12, backgroundColor: colors.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, borderRadius: 0 },
  minimalTableHeader: { backgroundColor: colors.white, color: colors.navy, borderBottomWidth: 2, borderBottomColor: colors.navy },
  minimalGrandTotal: { borderTopColor: colors.navy, color: colors.navy },
  minimalFooter: { left: 52, right: 52 },
});

export function InvoicePdfTemplate({ invoice }: { invoice: InvoicePdfData }) {
  const template = invoice.pdf_template ?? "classic";
  const items = [...(invoice.invoice_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const invoiceNumber = invoice.invoice_number || fallbackInvoice.invoiceNumber;
  const issueDate = invoice.issue_date || fallbackInvoice.issueDate;
  const dueDate = invoice.due_date || fallbackInvoice.dueDate;
  const deliveryDate = invoice.delivery_date || issueDate || fallbackInvoice.deliveryDate;
  const deliveryPlace = invoice.delivery_place || fallbackInvoice.deliveryPlace;
  const customerName = invoice.company?.name || fallbackInvoice.customer.name;
  const customerDetails = [
    invoice.company?.address || fallbackInvoice.customer.address,
    invoice.company?.postal_address || fallbackInvoice.customer.postalAddress,
    invoice.company?.org_number ? `Org.nr. ${invoice.company.org_number}` : `Org.nr. ${fallbackInvoice.customer.orgNumber}`,
    invoice.company?.email,
    countryLabel(invoice.company?.country ?? fallbackInvoice.customer.country),
  ].filter(Boolean);
  const sellerDetails = [
    fallbackInvoice.seller.address,
    fallbackInvoice.seller.postalAddress,
    countryLabel(fallbackInvoice.seller.country),
    `Org.nr. ${fallbackInvoice.seller.orgNumber}`,
  ];

  return (
    <Document title={`Faktura ${invoiceNumber}`}>
      <Page size="A4" style={[styles.page, ...(template === "modern" ? [styles.modernPage] : template === "minimal" ? [styles.minimalPage] : [])]} wrap>
        <View style={[styles.header, ...(template === "modern" ? [styles.modernHeader] : template === "minimal" ? [styles.minimalHeader] : [])]} fixed>
          <Text style={[styles.title, ...(template === "minimal" ? [styles.minimalTitle] : [])]}>Faktura</Text>
          <Text style={[styles.pageNumber, ...(template === "minimal" ? [styles.minimalPageNumber] : [])]} render={({ pageNumber, totalPages }) => `Side ${pageNumber} av ${totalPages}`} />
        </View>

        <View style={styles.details}>
          <Detail label="Fakturanummer" value={invoiceNumber} />
          <Detail label="Fakturadato" value={formatDate(issueDate)} />
          <Detail label="Leveringsdato" value={formatDate(deliveryDate)} />
          <Detail label="Leveringssted" value={deliveryPlace} />
          <Detail label="Forfallsdato" value={formatDate(dueDate)} />
        </View>

        <View style={styles.parties}>
          <View style={[styles.party, ...(template === "modern" ? [styles.modernCustomer] : template === "minimal" ? [styles.minimalCustomer] : [])]}>
            <Text style={styles.label}>Selger</Text>
            <Text style={styles.customerName}>{fallbackInvoice.seller.name}</Text>
            {sellerDetails.map((detail) => (
              <Text key={detail} style={styles.customerDetails}>{detail}</Text>
            ))}
          </View>
          <View style={[styles.party, ...(template === "modern" ? [styles.modernCustomer] : template === "minimal" ? [styles.minimalCustomer] : [])]}>
            <Text style={styles.label}>Kunde</Text>
            <Text style={styles.customerName}>{customerName}</Text>
            {customerDetails.map((detail) => (
              <Text key={detail} style={styles.customerDetails}>{detail}</Text>
            ))}
          </View>
        </View>

        <View style={styles.table}>
          <InvoiceRow template={template} header description="Beskrivelse" quantity="Antall" price="Pris" vat="MVA" sum="Sum" />
          {items.map((item, index) => (
            <InvoiceRow
              key={`${item.description}-${index}`}
              description={item.description}
              quantity={`${formatNumber(item.quantity)} ${item.unit}`}
              price={formatCurrency(item.unit_price)}
              vat={`${formatNumber(item.vat_rate)} %`}
              sum={formatCurrency(item.line_total)}
            />
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          <TotalRow label="Eks. MVA" value={formatCurrency(invoice.subtotal)} />
          <TotalRow label="MVA" value={formatCurrency(invoice.vat_total)} />
          <TotalRow template={template} label="Total" value={formatCurrency(invoice.total)} grand />
        </View>

        {invoice.notes && (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.label}>Notat</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        <View style={[styles.footer, ...(template === "modern" ? [styles.modernFooter] : template === "minimal" ? [styles.minimalFooter] : [])]} fixed>
          <Text>Generert i AutoFaktura</Text>
          <Text>{invoiceNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function InvoiceRow({ template = "classic", header = false, description, quantity, price, vat, sum }: { template?: "classic" | "modern" | "minimal"; header?: boolean; description: string; quantity: string; price: string; vat: string; sum: string }) {
  const headerStyles = header ? [styles.tableHeader, ...(template === "modern" ? [styles.modernTableHeader] : template === "minimal" ? [styles.minimalTableHeader] : [])] : [];
  return <View style={[styles.row, ...headerStyles]} wrap={false}><Text style={styles.description}>{description}</Text><Text style={styles.quantity}>{quantity}</Text><Text style={styles.price}>{price}</Text><Text style={styles.vat}>{vat}</Text><Text style={styles.sum}>{sum}</Text></View>;
}

function TotalRow({ template = "classic", label, value, grand = false }: { template?: "classic" | "modern" | "minimal"; label: string; value: string; grand?: boolean }) {
  const grandStyles = grand ? [styles.grandTotal, ...(template === "modern" ? [styles.modernGrandTotal] : template === "minimal" ? [styles.minimalGrandTotal] : [])] : [];
  return <View style={[styles.totalRow, ...grandStyles]}><Text>{label}</Text><Text>{value}</Text></View>;
}

function formatDate(value: string | null) {
  if (!value) return "–";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatCurrency(value: number) {
  return `${formatNumber(value)} kr`;
}
