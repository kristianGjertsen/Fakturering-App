import type {
  AccountingAccount,
  AccountingAccountCategory,
  JournalEntry,
  JournalLine,
  SupplierInvoiceDraftLine,
} from "../types";

export type AccountBalance = {
  account: AccountingAccount;
  debit: number;
  credit: number;
  balance: number;
};

export type AccountingReport = {
  periodEntries: JournalEntry[];
  profitAndLoss: {
    revenue: AccountBalance[];
    expenses: AccountBalance[];
    totalRevenue: number;
    totalExpenses: number;
    result: number;
  };
  balanceSheet: {
    assets: AccountBalance[];
    liabilities: AccountBalance[];
    equity: AccountBalance[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    controlDifference: number;
  };
  vat: {
    output: AccountBalance[];
    input: AccountBalance[];
    outputVat: number;
    inputVat: number;
    payable: number;
  };
  trialBalance: AccountBalance[];
};

export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateSupplierLine(
  line: Pick<SupplierInvoiceDraftLine, "grossAmount" | "vatRate">,
) {
  const grossAmount = roundMoney(Math.max(0, Number(line.grossAmount) || 0));
  const vatRate = Number(line.vatRate) || 0;
  const netAmount = vatRate > 0
    ? roundMoney(grossAmount / (1 + vatRate / 100))
    : grossAmount;
  const vatAmount = roundMoney(grossAmount - netAmount);

  return { grossAmount, netAmount, vatAmount, vatRate };
}

export function calculateSupplierInvoiceTotals(lines: SupplierInvoiceDraftLine[]) {
  return lines.reduce(
    (totals, line) => {
      const calculated = calculateSupplierLine(line);
      totals.subtotal = roundMoney(totals.subtotal + calculated.netAmount);
      totals.vatTotal = roundMoney(totals.vatTotal + calculated.vatAmount);
      totals.total = roundMoney(totals.total + calculated.grossAmount);
      return totals;
    },
    { subtotal: 0, vatTotal: 0, total: 0 },
  );
}

export function accountingYearBounds(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

export function buildAccountingReport(
  entries: JournalEntry[],
  accounts: AccountingAccount[],
  year: number,
): AccountingReport {
  const { start, end } = accountingYearBounds(year);
  const periodEntries = entries.filter((entry) => entry.entry_date >= start && entry.entry_date <= end);
  const throughPeriodEntries = entries.filter((entry) => entry.entry_date <= end);
  const periodBalances = accountBalances(periodEntries, accounts);
  const throughPeriodBalances = accountBalances(throughPeriodEntries, accounts);

  const revenue = balancesForCategory(periodBalances, "revenue");
  const expenses = balancesForCategory(periodBalances, "expense");
  const assets = balancesForCategory(throughPeriodBalances, "asset");
  const liabilities = balancesForCategory(throughPeriodBalances, "liability");
  const equity = balancesForCategory(throughPeriodBalances, "equity");
  const output = periodBalances.filter(({ account }) => account.system_key?.startsWith("output_vat_"));
  const input = periodBalances.filter(({ account }) => account.system_key?.startsWith("input_vat_"));

  const totalRevenue = roundMoney(revenue.reduce((sum, row) => sum + row.balance, 0));
  const totalExpenses = roundMoney(expenses.reduce((sum, row) => sum + row.balance, 0));
  const totalAssets = roundMoney(assets.reduce((sum, row) => sum + row.balance, 0));
  const totalLiabilities = roundMoney(liabilities.reduce((sum, row) => sum + row.balance, 0));
  const totalEquity = roundMoney(equity.reduce((sum, row) => sum + row.balance, 0));
  const outputVat = roundMoney(output.reduce((sum, row) => sum + row.balance, 0));
  const inputVat = roundMoney(input.reduce((sum, row) => sum + row.balance, 0));
  const result = roundMoney(totalRevenue - totalExpenses);

  return {
    periodEntries,
    profitAndLoss: {
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      result,
    },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      controlDifference: roundMoney(totalAssets - totalLiabilities - totalEquity - result),
    },
    vat: {
      output,
      input,
      outputVat,
      inputVat,
      payable: roundMoney(outputVat - inputVat),
    },
    trialBalance: throughPeriodBalances,
  };
}

export function sourceTypeLabel(sourceType: JournalEntry["source_type"]) {
  const labels: Record<JournalEntry["source_type"], string> = {
    sales_invoice: "Utgående faktura",
    sales_payment: "Innbetaling",
    supplier_invoice: "Inngående faktura",
    supplier_payment: "Utbetaling",
    manual: "Manuelt bilag",
    correction: "Korrigering",
  };
  return labels[sourceType];
}

export function categoryLabel(category: AccountingAccountCategory) {
  const labels: Record<AccountingAccountCategory, string> = {
    asset: "Eiendeler",
    liability: "Gjeld",
    equity: "Egenkapital",
    revenue: "Inntekter",
    expense: "Kostnader",
  };
  return labels[category];
}

export function journalEntryTotal(entry: JournalEntry) {
  return roundMoney(
    (entry.journal_lines ?? []).reduce((sum, line) => sum + Number(line.debit), 0),
  );
}

function accountBalances(entries: JournalEntry[], accounts: AccountingAccount[]) {
  const totals = new Map<string, { debit: number; credit: number }>();

  entries.forEach((entry) => {
    (entry.journal_lines ?? []).forEach((line: JournalLine) => {
      const current = totals.get(line.account_id) ?? { debit: 0, credit: 0 };
      current.debit = roundMoney(current.debit + Number(line.debit));
      current.credit = roundMoney(current.credit + Number(line.credit));
      totals.set(line.account_id, current);
    });
  });

  return accounts
    .map((account) => {
      const total = totals.get(account.id) ?? { debit: 0, credit: 0 };
      const debitNormal = account.category === "asset" || account.category === "expense";
      return {
        account,
        debit: total.debit,
        credit: total.credit,
        balance: roundMoney(debitNormal
          ? total.debit - total.credit
          : total.credit - total.debit),
      };
    })
    .filter((row) => row.debit !== 0 || row.credit !== 0)
    .sort((left, right) => left.account.account_number.localeCompare(right.account.account_number));
}

function balancesForCategory(rows: AccountBalance[], category: AccountingAccountCategory) {
  return rows.filter(({ account }) => account.category === category);
}
