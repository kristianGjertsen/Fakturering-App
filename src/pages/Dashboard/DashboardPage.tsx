import { SectionHeader } from "../../components/SectionHeader";
import { SummaryCard } from "../../components/SummaryCard";
import { StatisticsGrid } from "../../components/layout/PageLayout";
import { formatCurrency } from "../../lib/format";
import type {
  Company,
  InvoiceScheduleWithDetails,
  InvoiceWithDetails,
  Product,
} from "../../types";
import { NextSchedulePanel } from "./components/NextSchedulePanel";
import { RecentInvoicesPanel } from "./components/RecentInvoicesPanel";

type DashboardPageProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  schedules: InvoiceScheduleWithDetails[];
  onCreateInvoice: () => void;
};

export default function DashboardPage({
  companies,
  products,
  invoices,
  schedules,
  onCreateInvoice,
}: DashboardPageProps) {
  const totalOutstanding = invoices
    .filter((invoice) => !invoice.paid && invoice.status !== "cancelled")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const nextSchedule = schedules.find((schedule) => schedule.next_run_at);

  return (
    <>
      <SectionHeader
        title="Oversikt"
        description="Nøkkeltall og de nyeste aktivitetene i faktureringen."
      />

      <StatisticsGrid>
        <SummaryCard
          label="Selskaper"
          value={companies.length}
          description="Registrerte fakturamottakere"
        />
        <SummaryCard
          label="Produkter"
          value={products.length}
          description="Registrerte produkter og tjenester"
        />
        <SummaryCard
          label="Fakturaer"
          value={invoices.length}
          description="Lagret i Supabase"
        />
        <SummaryCard
          label="Utestående"
          value={formatCurrency(totalOutstanding)}
          description="Ikke markert betalt"
        />
      </StatisticsGrid>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <RecentInvoicesPanel invoices={invoices} onCreateInvoice={onCreateInvoice} />
        <NextSchedulePanel schedule={nextSchedule} />
      </section>
    </>
  );
}
