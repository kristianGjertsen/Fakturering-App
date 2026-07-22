import type { InvoiceDraftLine } from "../types";

type CalculatedLine = {
  line_subtotal: number;
  line_vat: number;
  line_total: number;
};

type CalculatedTotals = {
  subtotal: number;
  vatTotal: number;
  total: number;
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLine(line: Pick<InvoiceDraftLine, "quantity" | "unitPrice" | "vatRate">): CalculatedLine {
  const subtotal = roundMoney(line.quantity * line.unitPrice);
  const vat = roundMoney(subtotal * (line.vatRate / 100));

  return {
    line_subtotal: subtotal,
    line_vat: vat,
    line_total: roundMoney(subtotal + vat),
  };
}

export function calculateTotals(lines: InvoiceDraftLine[]): CalculatedTotals {
  return lines.reduce<CalculatedTotals>(
    (totals, line) => {
      const calculated = calculateLine(line);

      return {
        subtotal: roundMoney(totals.subtotal + calculated.line_subtotal),
        vatTotal: roundMoney(totals.vatTotal + calculated.line_vat),
        total: roundMoney(totals.total + calculated.line_total),
      };
    },
    { subtotal: 0, vatTotal: 0, total: 0 }
  );
}

export function toNumber(value: string, fallback = 0) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}
