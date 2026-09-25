import type { AccountingAccount, AccountingTaxCode } from "../../types";

// Verified against Skatteetaten's Grouping Category Code 2025-2026 and Standard Tax Codes.
// Match the app's known account semantics, never just the first digits of an account number.
const defaults: Array<[string, string, string, string, string, string | null]> = [
  ["1500", "Kundefordringer", "asset", "balanseverdiForOmloepsmiddel", "1500", "accounts_receivable"],
  ["1920", "Bankinnskudd", "asset", "balanseverdiForOmloepsmiddel", "1920", "bank"],
  ["2000", "Egenkapital", "equity", "egenkapital", "2000", "equity"],
  ["2057", "Privat innskudd og uttak", "equity", "egenkapital", "2050", "private_equity"],
  ["2400", "Leverandørgjeld", "liability", "kortsiktigGjeld", "2400", "accounts_payable"],
  ["2740", "Oppgjørskonto merverdiavgift", "liability", "kortsiktigGjeld", "2740", "vat_settlement"],
  ["2910", "Gjeld ved private utlegg", "liability", "kortsiktigGjeld", "2910", "private_outlay"],
  ["4000", "Varekostnad", "expense", "varekostnad", "4005", null],
  ["4300", "Innkjøp for videresalg", "expense", "varekostnad", "4005", null],
  ["5000", "Lønn", "expense", "loennskostnad", "5000", null],
  ["5400", "Arbeidsgiveravgift", "expense", "loennskostnad", "5400", null],
  ["6300", "Leie lokale", "expense", "annenDriftskostnad", "6300", null],
  ["6500", "Verktøy og inventar", "expense", "annenDriftskostnad", "6500", null],
  ["6540", "Datautstyr", "expense", "annenDriftskostnad", "6500", null],
  ["6550", "Driftsmaterialer", "expense", "annenDriftskostnad", "6500", null],
  ["6700", "Regnskap og juridisk bistand", "expense", "annenDriftskostnad", "6700", null],
  ["6800", "Kontorrekvisita", "expense", "annenDriftskostnad", "6995", null],
  ["6900", "Telefon og internett", "expense", "annenDriftskostnad", "6995", null],
  ["7140", "Reisekostnader", "expense", "annenDriftskostnad", "7165", null],
  ["7320", "Reklame og markedsføring", "expense", "annenDriftskostnad", "7330", null],
  ["7770", "Bank- og kortgebyrer", "expense", "annenDriftskostnad", "7700", null],
  ["7790", "Annen driftskostnad", "expense", "annenDriftskostnad", "7700", null],
  ["8060", "Valutagevinst", "revenue", "finansinntekt", "8060", null],
  ["8160", "Valutatap", "expense", "finanskostnad", "8160", null],
];
for (const [rate, index] of [[25, 0], [15, 1], [12, 2]]) {
  defaults.push(
    [`270${index}`, `Utgående MVA, ${rate} %`, "liability", "kortsiktigGjeld", "2740", `output_vat_${rate}`],
    [`271${index}`, `Inngående MVA, ${rate} %`, "asset", "kortsiktigGjeld", "2740", `input_vat_${rate}`],
    [`3${index}00`, `Salgsinntekt, ${rate} % MVA`, "revenue", "salgsinntekt", "3000", `sales_${rate}`],
  );
}

export function resolveAccountMapping(account: AccountingAccount, taxCodes: AccountingTaxCode[] = []): AccountingAccount {
  // Explicit/imported values win. Do not complete a partial mapping with another category.
  if (account.saft_grouping_category?.trim() || account.saft_grouping_code?.trim()) return account;
  if (account.is_system && account.system_key === "sales_0" && account.account_number === "3220" && account.category === "revenue") {
    const tax = taxCodes.find((t) => t.is_system && t.code === "OUTPUT_0" && t.direction === "output" && Number(t.rate) === 0);
    const code = tax?.saft_standard_tax_code;
    if (code && ["5", "51", "52", "6"].includes(code)) return { ...account, saft_grouping_category: "salgsinntekt", saft_grouping_code: code === "6" ? "3200" : "3100" };
  }
  const match = defaults.find(([number, name, category, , , key]) => account.account_number === number
    && account.category === category && (key ? account.is_system && account.system_key === key : account.name === name));
  return match ? { ...account, saft_grouping_category: match[3], saft_grouping_code: match[4] } : account;
}

export function resolveTaxMapping(tax: AccountingTaxCode): AccountingTaxCode {
  if (tax.saft_standard_tax_code?.trim()) return { ...tax, saft_tax_type: tax.saft_tax_type || "MVA" };
  // Imported/custom taxes can have the same rate but different treatment (e.g. reverse charge).
  if (!tax.is_system) return tax;
  const key = `${tax.direction.toUpperCase()}_${Number(tax.rate)}`;
  if (!tax.is_system || tax.code !== key || (tax.saft_tax_type && tax.saft_tax_type !== "MVA")) return tax;
  const codes: Record<string, string> = { OUTPUT_25: "3", OUTPUT_15: "31", OUTPUT_12: "33", INPUT_25: "1", INPUT_15: "11", INPUT_12: "13", INPUT_0: "0", NONE_0: "0" };
  const code = codes[key];
  // OUTPUT_0 cannot distinguish exempt, outside scope, exports or reverse charge.
  return code ? { ...tax, saft_standard_tax_code: code, saft_tax_type: "MVA" } : tax;
}
