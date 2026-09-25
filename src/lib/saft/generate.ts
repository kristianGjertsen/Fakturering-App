import { resolveAccountMapping, resolveTaxMapping } from "./mappings.ts";
import type { AccountingAccount, AccountingTaxCode, Company, JournalEntry, JournalLine, Profile, Supplier } from "../../types";

export type SaftData = {
  profile: Profile | null;
  accounts: AccountingAccount[];
  taxCodes: AccountingTaxCode[];
  customers: Company[];
  suppliers: Supplier[];
  entries: JournalEntry[];
};
export class SaftValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "SaftValidationError";
    this.issues = issues;
  }
}
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const tag = (name: string, value: unknown) => `<${name}>${esc(value)}</${name}>`;
const node = (name: string, content: string) => `<${name}>${content}</${name}>`;
const optional = (name: string, value: unknown) => value == null || value === "" ? "" : tag(name, value);
const cents = (value: number) => Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toFixed(2);
const balance = (prefix: string, value: number) => tag(`${prefix}${value < 0 ? "Credit" : "Debit"}Balance`, money(Math.abs(value)));
const amount = (name: string, value: number) => node(name, tag("Amount", money(value)));
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

export function validateSaftPeriod(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end || start.slice(0, 4) !== end.slice(0, 4) || +start.slice(0, 4) < 1970 || +end.slice(0, 4) > 2100) {
    throw new SaftValidationError(["Velg gyldige fra- og til-datoer innenfor samme regnskapsår (1970–2100)."]);
  }
}

/** Amounts are booked NOK. Do not convert them using current exchange rates. */
export function generateSaft(data: SaftData, start: string, end: string, now = new Date()) {
  validateSaftPeriod(start, end);
  const usedAccountIds = new Set(data.entries.filter((e) => e.entry_date <= end).flatMap((e) => (e.journal_lines ?? []).map((l) => l.account_id)));
  data = { ...data, accounts: data.accounts.map((a) => resolveAccountMapping(a, data.taxCodes)).filter((a) => usedAccountIds.has(a.id) || (a.saft_grouping_category && a.saft_grouping_code)), taxCodes: data.taxCodes.map(resolveTaxMapping) };
  const errors: string[] = [];
  const requireText = (value: unknown, label: string) => {
    if (typeof value !== "string" || !value.trim()) errors.push(`${label} mangler.`);
  };
  const profile = data.profile;
  if (!profile) throw new SaftValidationError(["Selskapsprofil mangler."]);
  requireText(profile.company_name, "Selskapsnavn i firmainnstillinger");
  const org = (profile.org_number ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(org)) errors.push("Organisasjonsnummer må inneholde ni sifre.");
  const contact = (profile.saft_contact_person || profile.full_name || "").trim().split(/\s+/);
  if (contact.length < 2) errors.push("Kontaktperson må ha fornavn og etternavn i firmainnstillinger.");
  if (profile.saft_default_currency_code !== "NOK") errors.push("Bokføringen er i NOK. Standardvaluta i selskapsprofilen må være NOK.");
  if (profile.country && !/^[A-Z]{2}$/.test(profile.country)) errors.push("Selskapets land må være en ISO-landkode med to bokstaver.");
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const taxes = new Map(data.taxCodes.map((t) => [t.id, t]));
  const accountNumbers = new Set<string>();
  for (const a of data.accounts) {
    requireText(a.account_number, "Kontonummer");
    requireText(a.name, `Navn på konto ${a.account_number}`);
    requireText(a.saft_grouping_category, `SAF-T-grupperingskategori på konto ${a.account_number}`);
    requireText(a.saft_grouping_code, `SAF-T-grupperingskode på konto ${a.account_number}`);
    if (accountNumbers.has(a.account_number)) errors.push(`Kontonummer ${a.account_number} finnes flere ganger.`);
    accountNumbers.add(a.account_number);
  }
  if (!accounts.size) errors.push("Kontoplan mangler.");
  const entries = data.entries.filter((e) => e.entry_date <= end);
  const selected = entries.filter((e) => e.entry_date >= start);
  const usedTaxes = new Set<string>();
  const ids = new Set<string>();
  const validateMoney = (v: unknown, label: string) => {
    const n = Number(v);
    if (v == null || !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100)) || Math.abs(n * 100 - Math.round(n * 100)) > 0.0001) errors.push(`${label}: ugyldig beløp.`);
  };
  for (const e of entries) {
    const label = `Bilag ${e.voucher_number}`;
    if (!validDate(e.entry_date)) errors.push(`${label}: ugyldig bokføringsdato.`);
    requireText(e.description, `${label}: beskrivelse`);
    if (!e.journal_lines?.length) errors.push(`${label}: posteringer mangler.`);
    let net = 0;
    for (const l of e.journal_lines ?? []) {
      validateMoney(l.debit, `${label}, debet`); validateMoney(l.credit, `${label}, kredit`);
      if (Number(l.debit) > 0 && Number(l.credit) > 0) errors.push(`${label}: en linje har både debet og kredit.`);
      if (!accounts.has(l.account_id)) errors.push(`${label}: konto ${l.account_id} finnes ikke i kontoplanen.`);
      net += cents(l.debit) - cents(l.credit);
      if ((!l.customer_id && l.customer_name) || (!l.supplier_id && l.supplier_name)) errors.push(`${label}: kunde- eller leverandørkobling mangler. Gjenopprett koblingen før eksport.`);
      if (l.tax_code_id) {
        const tax = taxes.get(l.tax_code_id);
        if (!tax) errors.push(`${label}: avgiftskode mangler i avgiftstabellen.`);
        else if (e.entry_date >= start) {
          usedTaxes.add(tax.id);
          requireText(tax.saft_standard_tax_code, `Standard SAF-T-avgiftskode for ${tax.code}`);
          if (tax.saft_tax_type !== "MVA") errors.push(`Avgiftskode ${tax.code}: SAF-T-avgiftstype må være MVA.`);
          if (l.tax_amount != null) validateMoney(l.tax_amount, `${label}, avgiftsbeløp`);
          if (l.tax_base_amount != null) validateMoney(l.tax_base_amount, `${label}, avgiftsgrunnlag`);
          if (l.tax_amount == null && l.tax_base_amount == null) errors.push(`${label}: avgiftsgrunnlag og avgiftsbeløp mangler.`);
        }
      } else if (Number(l.vat_rate) > 0 || Number(l.tax_amount) > 0) errors.push(`${label}: SAF-T-avgiftskode mangler.`);
    }
    if (net !== 0) errors.push(`${label}: debet og kredit er ikke i balanse.`);
    if (e.entry_date >= start) {
      const id = `${e.saft_journal_id}/${e.saft_transaction_id || e.voucher_number}`;
      if (ids.has(id)) errors.push(`${label}: duplikat transaksjonsnummer i journalen.`);
      ids.add(id);
      if (!validDate(e.created_at?.slice(0, 10) ?? "")) errors.push(`${label}: registreringsdato mangler.`);
      if (!["SALES", "PURCHASE", "BANK", "GENERAL"].includes(e.saft_journal_id)) errors.push(`${label}: SAF-T-journal mangler.`);
    }
  }
  // Derive balances from the complete booked history. No invented year-end postings.
  const balances = (predicate: (l: JournalLine) => boolean) => {
    let opening = 0, closing = 0;
    for (const e of entries) for (const l of e.journal_lines ?? []) if (predicate(l)) {
      const net = cents(l.debit) - cents(l.credit);
      closing += net;
      if (e.entry_date < start) opening += net;
    }
    return balance("Opening", opening) + balance("Closing", closing);
  };
  const partyId = (kind: "Customer" | "Supplier", id: string) => {
    const mapped = kind === "Customer" ? data.customers.find((p) => p.id === id)?.saft_customer_id : data.suppliers.find((p) => p.id === id)?.saft_supplier_id;
    return mapped || id.replace(/-/g, "");
  };
  const partyXml = (kind: "Customer" | "Supplier") => {
    const customer = kind === "Customer";
    const source = customer ? data.customers : data.suppliers;
    const field = customer ? "customer_id" : "supplier_id";
    const used = new Set(entries.flatMap((e) => (e.journal_lines ?? []).map((l) => l[field]).filter((id): id is string => Boolean(id))));
    const exportedIds = new Set<string>();
    return [...used].sort().map((id) => {
      const exportedId = partyId(kind, id);
      if (exportedIds.has(exportedId)) errors.push(`${kind}: duplikat SAF-T-ID ${exportedId}.`);
      exportedIds.add(exportedId);
      const party = source.find((p) => p.id === id);
      if (!party) { errors.push(`${customer ? "Kunde" : "Leverandør"} ${id} mangler i registeret.`); return ""; }
      requireText(party.name, `${kind} ${id}: navn`);
      const accountIds = new Set(entries.flatMap((e) => (e.journal_lines ?? []).filter((l) => l[field] === id).map((l) => l.account_id)));
      return node(kind, optional("RegistrationNumber", party.org_number) + tag("Name", party.name) + tag(`${kind}ID`, exportedId)
        + [...accountIds].sort().map((accountId) => node("BalanceAccount", tag("AccountID", accounts.get(accountId)?.account_number) + balances((l) => l[field] === id && l.account_id === accountId))).join(""));
    }).join("");
  };
  const customers = partyXml("Customer"), suppliers = partyXml("Supplier");
  if (errors.length) throw new SaftValidationError([...new Set(errors)]);
  const address = optional("StreetName", profile.saft_street_name || profile.address) + optional("Number", profile.saft_street_number) + optional("AdditionalAddressDetail", profile.postal_address)
    + optional("City", profile.saft_city) + optional("PostalCode", profile.saft_postal_code) + optional("Region", profile.saft_region);
  const header = node("Header", tag("AuditFileVersion", "1.40") + tag("AuditFileCountry", "NO") + tag("AuditFileDateCreated", now.toISOString().slice(0, 10))
    + tag("SoftwareCompanyName", "Autofaktura") + tag("SoftwareID", "Autofaktura") + tag("SoftwareVersion", "0.0.1")
    + node("Company", tag("RegistrationNumber", org) + tag("Name", profile.company_name)
      + (address ? node("Address", address + tag("Country", profile.country || "NO")) : "")
      + node("Contact", node("ContactPerson", tag("FirstName", contact.slice(0, -1).join(" ")) + tag("LastName", contact[contact.length - 1]))
        + optional("Telephone", profile.saft_contact_phone) + optional("Email", profile.email))
      + (profile.is_vat_registered ? node("TaxRegistration", tag("TaxRegistrationNumber", org + "MVA") + tag("TaxType", "MVA")) : ""))
    + tag("DefaultCurrencyCode", "NOK") + node("SelectionCriteria", tag("SelectionStartDate", start) + tag("SelectionEndDate", end)) + tag("TaxAccountingBasis", "A"));
  const taxTable = [...usedTaxes].sort().map((id) => {
    const t = taxes.get(id)!;
    return node("TaxCodeDetails", tag("TaxCode", t.code) + tag("Description", t.description) + tag("TaxPercentage", t.rate)
      + tag("Country", "NO") + tag("StandardTaxCode", t.saft_standard_tax_code) + tag("BaseRate", 100));
  }).join("");
  const master = node("MasterFiles", node("GeneralLedgerAccounts", [...data.accounts].sort((a, b) => a.account_number.localeCompare(b.account_number)).map((a) => node("Account",
    tag("AccountID", a.account_number) + tag("AccountDescription", a.name) + tag("GroupingCategory", a.saft_grouping_category)
      + tag("GroupingCode", a.saft_grouping_code) + tag("AccountType", "GL") + balances((l) => l.account_id === a.id))).join(""))
    + (customers ? node("Customers", customers) : "") + (suppliers ? node("Suppliers", suppliers) : "")
    + (taxTable ? node("TaxTable", node("TaxTableEntry", tag("TaxType", "MVA") + tag("Description", "Merverdiavgift") + taxTable)) : ""));
  const lineXml = (l: JournalLine, e: JournalEntry, index: number) => {
    const debit = Number(l.debit) > 0;
    let taxXml = "";
    if (l.tax_code_id) {
      const t = taxes.get(l.tax_code_id)!;
      // Tax summary lines hold VAT; base lines hold the taxable base. Do not duplicate VAT.
      taxXml = node("TaxInformation", tag("TaxType", t.saft_tax_type) + tag("TaxCode", t.code)
        + tag("TaxPercentage", l.vat_rate ?? t.rate) + optional("TaxBase", l.tax_base_amount)
        + amount(debit ? "DebitTaxAmount" : "CreditTaxAmount", cents(l.tax_amount ?? 0)));
    }
    return node("Line", tag("RecordID", index + 1) + tag("AccountID", accounts.get(l.account_id)!.account_number)
      + (l.customer_id ? tag("CustomerID", partyId("Customer", l.customer_id)) : "") + (l.supplier_id ? tag("SupplierID", partyId("Supplier", l.supplier_id)) : "") + tag("Description", l.description || e.description)
      + amount(debit ? "DebitAmount" : "CreditAmount", cents(debit ? l.debit : l.credit)) + taxXml);
  };
  const journals = ["SALES", "PURCHASE", "BANK", "GENERAL"].map((journal) => {
    const group = selected.filter((e) => e.saft_journal_id === journal).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.voucher_number - b.voucher_number);
    return group.length ? node("Journal", tag("JournalID", journal) + tag("Description", journal) + tag("Type", journal)
      + group.map((e) => node("Transaction", tag("TransactionID", e.saft_transaction_id || e.voucher_number) + tag("Period", +e.entry_date.slice(5, 7))
        + tag("PeriodYear", +e.entry_date.slice(0, 4)) + tag("TransactionDate", e.entry_date) + tag("Description", e.description)
        + tag("SystemEntryDate", e.created_at.slice(0, 10)) + tag("GLPostingDate", e.entry_date)
        + e.journal_lines!.map((l, i) => lineXml(l, e, i)).join(""))).join("")) : "";
  }).join("");
  const lines = selected.flatMap((e) => e.journal_lines!);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO">'
    + header + master + node("GeneralLedgerEntries", tag("NumberOfEntries", selected.length)
      + tag("TotalDebit", money(lines.reduce((n, l) => n + cents(l.debit), 0)))
      + tag("TotalCredit", money(lines.reduce((n, l) => n + cents(l.credit), 0))) + journals) + "</AuditFile>";
}
