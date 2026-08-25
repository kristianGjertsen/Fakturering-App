import { Button } from "../../../components/Button";
import { SummaryCard } from "../../../components/SummaryCard";
import { Panel, PanelHeader } from "../../../components/layout/Panel";
import { StatisticsGrid } from "../../../components/layout/PageLayout";
import type { AccountingReport } from "../../../lib/accounting";
import { formatCurrency } from "../../../lib/format";
import type {
  AccountingAccount,
  AccountingPeriod,
  InvoiceWithDetails,
  JournalEntry,
  SupplierInvoiceWithDetails,
} from "../../../types";
import {
  MONTH_NAMES,
  openSalesInvoices,
  openSupplierInvoices,
  sumInvoiceAmounts,
} from "../accountingPresentation";

type AccountingOverviewProps = {
  year: number;
  report: AccountingReport;
  entries: JournalEntry[];
  salesInvoices: InvoiceWithDetails[];
  supplierInvoices: SupplierInvoiceWithDetails[];
};

export function AccountingOverview({
  year,
  report,
  entries,
  salesInvoices,
  supplierInvoices,
}: AccountingOverviewProps) {
  const receivables = openSalesInvoices(salesInvoices);
  const payables = openSupplierInvoices(supplierInvoices);
  const monthly = monthlyResults(entries, year);

  return (
    <div className="space-y-5">
      <StatisticsGrid>
        <SummaryCard label={`Resultat ${year}`} value={formatCurrency(report.profitAndLoss.result)} description="Inntekter minus kostnader" />
        <SummaryCard label="MVA å betale" value={formatCurrency(report.vat.payable)} description="Utgående MVA minus inngående MVA" />
        <SummaryCard label="Kundefordringer" value={formatCurrency(sumInvoiceAmounts(receivables))} description={`${receivables.length} ubetalte salgsfakturaer`} />
        <SummaryCard label="Leverandørgjeld" value={formatCurrency(sumInvoiceAmounts(payables))} description={`${payables.length} ubetalte inngående fakturaer`} />
      </StatisticsGrid>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel padding="none" className="overflow-hidden">
          <div className="border-b border-blue-100 px-5 py-4">
            <h3 className="font-semibold text-slate-950">Resultat per måned</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Måned</th>
                  <th className="px-4 py-3 text-right font-semibold">Inntekter</th>
                  <th className="px-4 py-3 text-right font-semibold">Kostnader</th>
                  <th className="px-4 py-3 text-right font-semibold">Resultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50">
                {monthly.map((month) => (
                  <tr key={month.name}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{month.name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatCurrency(month.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatCurrency(month.expenses)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${month.result < 0 ? "text-red-700" : "text-slate-950"}`}>{formatCurrency(month.result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Slik er tallene regnet ut" description={`Alle summer gjelder bokføringsdatoer i ${year}.`} />
          <dl className="mt-5 space-y-4 text-sm">
            <FormulaRow label="Inntekter" formula="Kredit − debet på inntektskontoer" value={report.profitAndLoss.totalRevenue} />
            <FormulaRow label="Kostnader" formula="Debet − kredit på kostnadskontoer" value={report.profitAndLoss.totalExpenses} />
            <FormulaRow label="Resultat" formula="Inntekter − kostnader" value={report.profitAndLoss.result} strong />
            <FormulaRow label="Utgående MVA" formula="Kredit − debet på konto 2700–2702" value={report.vat.outputVat} />
            <FormulaRow label="Inngående MVA" formula="Debet − kredit på konto 2710–2712" value={report.vat.inputVat} />
            <FormulaRow label="MVA å betale" formula="Utgående − inngående MVA" value={report.vat.payable} strong />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

type DetailedReportsProps = {
  year: number;
  report: AccountingReport;
  periods: AccountingPeriod[];
  salesInvoices: InvoiceWithDetails[];
  supplierInvoices: SupplierInvoiceWithDetails[];
  updatingPeriod: string;
  onSetPeriodStatus: (month: number, status: "open" | "closed") => void;
};

export function DetailedReports({
  year,
  report,
  periods,
  salesInvoices,
  supplierInvoices,
  updatingPeriod,
  onSetPeriodStatus,
}: DetailedReportsProps) {
  const receivables = openSalesInvoices(salesInvoices);
  const payables = openSupplierInvoices(supplierInvoices);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportTable
          title={`Resultatregnskap ${year}`}
          sections={[
            { title: "Inntekter", rows: report.profitAndLoss.revenue },
            { title: "Kostnader", rows: report.profitAndLoss.expenses },
          ]}
          footerLabel="Årsresultat"
          footerValue={report.profitAndLoss.result}
        />
        <ReportTable
          title={`Balanse per 31.12.${year}`}
          description="Viser akkumulerte saldoer til og med valgt år. Årets resultat vises separat."
          sections={[
            { title: "Eiendeler", rows: report.balanceSheet.assets },
            { title: "Gjeld", rows: report.balanceSheet.liabilities },
            { title: "Egenkapital", rows: report.balanceSheet.equity },
          ]}
          footerLabel="Eiendeler"
          footerValue={report.balanceSheet.totalAssets}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <ReportTable
          title={`MVA-grunnlag ${year}`}
          description="MVA-kontoene er summert fra bokførte salgs- og kjøpsbilag."
          sections={[
            { title: "Utgående MVA", rows: report.vat.output },
            { title: "Inngående MVA", rows: report.vat.input },
          ]}
          footerLabel={report.vat.payable >= 0 ? "MVA å betale" : "MVA til gode"}
          footerValue={Math.abs(report.vat.payable)}
        />

        <Panel>
          <PanelHeader title="Åpne poster" description="Disse er basert på registrert betalingsstatus, ikke forfallsdato alene." />
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <OpenItems title="Kundefordringer" items={receivables.map((invoice) => ({ id: invoice.id, name: invoice.recipient_name, number: invoice.invoice_number ?? "Uten nummer", amount: Number(invoice.total) }))} />
            <OpenItems title="Leverandørgjeld" items={payables.map((invoice) => ({ id: invoice.id, name: invoice.supplier?.name ?? "Ukjent", number: invoice.invoice_number, amount: Number(invoice.total) }))} />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title={`Regnskapsperioder ${year}`}
          description="En låst måned avviser nye fakturaer, betalinger, manuelle bilag og korrigeringer med dato i perioden."
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MONTH_NAMES.map((name, index) => {
            const month = index + 1;
            const period = periods.find((item) => item.year === year && item.month === month);
            const closed = period?.status === "closed";
            const key = `${year}-${month}`;
            return (
              <div key={name} className="flex items-center justify-between gap-3 rounded-md border border-blue-100 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-slate-900">{name}</span>
                  <span className={`text-xs ${closed ? "text-red-700" : "text-emerald-700"}`}>{closed ? "Låst" : "Åpen"}</span>
                </span>
                <Button
                  size="xs"
                  variant={closed ? "secondary" : "ghost"}
                  disabled={updatingPeriod === key}
                  onClick={() => onSetPeriodStatus(month, closed ? "open" : "closed")}
                  help={closed ? "Åpner perioden igjen, slik at nye bilag og korrigeringer kan bokføres med dato i måneden." : "Låser perioden. Nye fakturaer, betalinger, bilag og korrigeringer med dato i måneden blir avvist."}
                >
                  {updatingPeriod === key ? "Lagrer..." : closed ? "Åpne" : "Lås"}
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function FormulaRow({ label, formula, value, strong = false }: { label: string; formula: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${strong ? "border-t border-blue-100 pt-3" : ""}`}>
      <div>
        <dt className={strong ? "font-semibold text-slate-950" : "font-medium text-slate-800"}>{label}</dt>
        <dd className="text-xs text-slate-500">{formula}</dd>
      </div>
      <dd className={`whitespace-nowrap text-right ${strong ? "text-base font-semibold" : "font-medium"}`}>{formatCurrency(value)}</dd>
    </div>
  );
}

function ReportTable({ title, description, sections, footerLabel, footerValue }: {
  title: string;
  description?: string;
  sections: Array<{ title: string; rows: AccountingReport["trialBalance"] }>;
  footerLabel: string;
  footerValue: number;
}) {
  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="border-b border-blue-100 px-5 py-4">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      <div className="divide-y divide-blue-100">
        {sections.map((section) => (
          <section key={section.title} className="px-5 py-4">
            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">{section.title}</h4>
            {section.rows.length === 0 ? (
              <p className="text-sm text-slate-500">Ingen posteringer.</p>
            ) : (
              <dl className="space-y-2 text-sm">
                {section.rows.map((row) => (
                  <div key={row.account.id} className="flex justify-between gap-4">
                    <dt className="min-w-0 truncate text-slate-700">{row.account.account_number} {row.account.name}</dt>
                    <dd className="whitespace-nowrap font-medium">{formatCurrency(row.balance)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>
      <div className="flex justify-between gap-4 border-t border-blue-200 bg-blue-50 px-5 py-4 font-semibold">
        <span>{footerLabel}</span><span>{formatCurrency(footerValue)}</span>
      </div>
    </Panel>
  );
}

function OpenItems({ title, items }: { title: string; items: Array<{ id: string; name: string; number: string; amount: number }> }) {
  return (
    <section>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Ingen åpne poster.</p>
      ) : (
        <ul className="mt-2 divide-y divide-blue-100 border-y border-blue-100">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{item.name}</span><span className="text-xs text-slate-500">{item.number}</span></span>
              <span className="whitespace-nowrap font-semibold">{formatCurrency(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function monthlyResults(entries: JournalEntry[], year: number) {
  return MONTH_NAMES.map((name, monthIndex) => {
    let revenue = 0;
    let expenses = 0;
    entries
      .filter((entry) => Number(entry.entry_date.slice(0, 4)) === year && Number(entry.entry_date.slice(5, 7)) === monthIndex + 1)
      .forEach((entry) => (entry.journal_lines ?? []).forEach((line) => {
        if (line.account?.category === "revenue") revenue += Number(line.credit) - Number(line.debit);
        if (line.account?.category === "expense") expenses += Number(line.debit) - Number(line.credit);
      }));
    return { name, revenue, expenses, result: revenue - expenses };
  });
}
