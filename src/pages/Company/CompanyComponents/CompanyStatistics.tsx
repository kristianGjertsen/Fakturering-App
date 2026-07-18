import { SummaryCard } from "../../../components/SummaryCard";
import { StatisticsGrid } from "../../../components/layout/PageLayout";
import { formatCurrency } from "../../../lib/format";
import type { InvoiceWithDetails } from "../../../types";

type CompanyStatisticsProps = {
  invoices: InvoiceWithDetails[];
};

function hasBeenSent(invoice: InvoiceWithDetails) {
  return invoice.paid || ["sent", "reminded", "paid"].includes(invoice.status);
}

export function CompanyStatistics({ invoices }: CompanyStatisticsProps) {
  const sentInvoices = invoices.filter(hasBeenSent);
  const unpaidInvoices = sentInvoices.filter(
    (invoice) => !invoice.paid && invoice.status !== "paid",
  );
  const paidInvoices = sentInvoices.filter(
    (invoice) => invoice.paid || invoice.status === "paid",
  );

  const totalPaid = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const totalOutstanding = unpaidInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total),
    0,
  );

  return (
    <section aria-labelledby="company-statistics-title">
      <h2 id="company-statistics-title" className="sr-only">
        Selskapsstatistikk
      </h2>
      <StatisticsGrid>
        <SummaryCard
          label="Sendte fakturaer"
          value={sentInvoices.length}
          description="Sendt, purret eller betalt"
        />
        <SummaryCard
          label="Ubetalte fakturaer"
          value={unpaidInvoices.length}
          description="Sendt, men ikke markert betalt"
        />
        <SummaryCard
          label="Betalt"
          value={formatCurrency(totalPaid)}
          description="Totalt registrert innbetalt"
        />
        <SummaryCard
          label="Skyldig"
          value={formatCurrency(totalOutstanding)}
          description="Totalt utestående beløp"
        />
      </StatisticsGrid>
    </section>
  );
}
