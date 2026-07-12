import type { Company, InvoiceScheduleWithDetails, InvoiceWithDetails, Product } from "../types";
import { formatCurrency, formatDateTime } from "../lib/format";
import { StatCard } from "./StatCard";
import { EmptyState } from "./EmptyState";

type DashboardViewProps = {
  companies: Company[];
  products: Product[];
  invoices: InvoiceWithDetails[];
  schedules: InvoiceScheduleWithDetails[];
  onCreateInvoice: () => void;
};

export function DashboardView({ companies, products, invoices, schedules, onCreateInvoice }: DashboardViewProps) {
  const totalOutstanding = invoices
    .filter((invoice) => !invoice.paid && invoice.status !== "cancelled")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const nextSchedule = schedules.find((schedule) => schedule.next_run_at);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Selskaper" value={companies.length} helper="Registrerte fakturamottakere" />
        <StatCard label="Produkter" value={products.length} helper="Aktive produkter og tjenester" />
        <StatCard label="Fakturaer" value={invoices.length} helper="Lagret i Supabase" />
        <StatCard label="Utestående" value={formatCurrency(totalOutstanding)} helper="Ikke markert betalt" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Siste fakturaer</h2>
              <p className="text-sm text-slate-600">De nyeste fakturaene du har opprettet.</p>
            </div>
            <button
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              type="button"
              onClick={onCreateInvoice}
            >
              Ny faktura
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            {invoices.length === 0 ? (
              <EmptyState title="Ingen fakturaer ennå" description="Opprett den første fakturaen når selskap og produkter er registrert." />
            ) : (
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-blue-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-4 font-semibold">Faktura</th>
                    <th className="py-3 pr-4 font-semibold">Selskap</th>
                    <th className="py-3 pr-4 font-semibold">Status</th>
                    <th className="py-3 pr-4 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {invoices.slice(0, 6).map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="py-3 pr-4 font-medium text-slate-950">{invoice.invoice_number}</td>
                      <td className="py-3 pr-4 text-slate-600">{invoice.company?.name ?? "Ukjent"}</td>
                      <td className="py-3 pr-4 text-slate-600">{invoice.paid ? "Betalt" : invoice.status}</td>
                      <td className="py-3 pr-4 text-right font-medium text-slate-950">{formatCurrency(invoice.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Neste gjentakelse</h2>
          {nextSchedule ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">{nextSchedule.company?.name}</p>
              <p className="text-2xl font-semibold text-slate-950">{formatDateTime(nextSchedule.next_run_at)}</p>
              <p className="text-sm text-slate-600">{nextSchedule.title}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">Ingen aktive gjentakende fakturaer er planlagt.</p>
          )}
        </div>
      </section>
    </div>
  );
}
