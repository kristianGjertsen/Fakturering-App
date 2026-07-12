import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type InvoicePdfData = {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  notes?: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company?: {
    name: string;
    org_number?: string | null;
    email?: string | null;
    city?: string | null;
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
  details: { flexDirection: "row", marginBottom: 28 },
  detail: { width: "33.333%" },
  label: { marginBottom: 5, fontSize: 8, color: colors.muted, textTransform: "uppercase" },
  value: { fontSize: 12, fontFamily: "Helvetica-Bold" },
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
});

export function InvoicePdfTemplate({ invoice }: { invoice: InvoicePdfData }) {
  const items = [...(invoice.invoice_items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const customerDetails = [
    invoice.company?.org_number ? `Org.nr. ${invoice.company.org_number}` : null,
    invoice.company?.email,
    invoice.company?.city,
    invoice.company?.country,
  ].filter(Boolean).join(" · ");

  return (
    <Document title={`Faktura ${invoice.invoice_number}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.title}>Faktura</Text>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `Side ${pageNumber} av ${totalPages}`} />
        </View>

        <View style={styles.details}>
          <Detail label="Fakturanummer" value={invoice.invoice_number} />
          <Detail label="Fakturadato" value={formatDate(invoice.issue_date)} />
          <Detail label="Forfallsdato" value={formatDate(invoice.due_date)} />
        </View>

        <View style={styles.customer}>
          <Text style={styles.label}>Kunde</Text>
          <Text style={styles.customerName}>{invoice.company?.name ?? "Ukjent kunde"}</Text>
          {customerDetails && <Text style={styles.customerDetails}>{customerDetails}</Text>}
        </View>

        <View style={styles.table}>
          <InvoiceRow header description="Beskrivelse" quantity="Antall" price="Pris" vat="MVA" sum="Sum" />
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
          <TotalRow label="Total" value={formatCurrency(invoice.total)} grand />
        </View>

        {invoice.notes && (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.label}>Notat</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Generert i AutoFaktura</Text>
          <Text>{invoice.invoice_number}</Text>
        </View>
      </Page>
    </Document>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function InvoiceRow({ header = false, description, quantity, price, vat, sum }: { header?: boolean; description: string; quantity: string; price: string; vat: string; sum: string }) {
  return <View style={[styles.row, ...(header ? [styles.tableHeader] : [])]} wrap={false}><Text style={styles.description}>{description}</Text><Text style={styles.quantity}>{quantity}</Text><Text style={styles.price}>{price}</Text><Text style={styles.vat}>{vat}</Text><Text style={styles.sum}>{sum}</Text></View>;
}

function TotalRow({ label, value, grand = false }: { label: string; value: string; grand?: boolean }) {
  return <View style={[styles.totalRow, ...(grand ? [styles.grandTotal] : [])]}><Text>{label}</Text><Text>{value}</Text></View>;
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
