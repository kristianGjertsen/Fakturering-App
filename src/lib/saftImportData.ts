import { supabase } from "../supabaseClient";
import type { SaftImportFile } from "../types";

export const SAFT_IMPORT_BUCKET = "saft-imports";
export const SAFT_IMPORT_ACCEPT = ".xml,.zip,application/xml,text/xml,application/zip,application/x-zip-compressed";

const MAX_SAFT_IMPORT_BYTES = 50 * 1024 * 1024;
const ALLOWED_SAFT_IMPORT_MIME_TYPES = new Set([
  "application/xml",
  "text/xml",
  "application/zip",
  "application/x-zip-compressed",
]);

export function validateSaftImportFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = lowerName.endsWith(".xml") || lowerName.endsWith(".zip");
  const hasSupportedMimeType = !file.type || ALLOWED_SAFT_IMPORT_MIME_TYPES.has(file.type);

  if (!hasSupportedExtension || !hasSupportedMimeType) {
    return "SAF-T-filen må være XML eller ZIP.";
  }

  if (file.size <= 0 || file.size > MAX_SAFT_IMPORT_BYTES) {
    return "SAF-T-filen må være større enn 0 byte og maksimalt 50 MB.";
  }

  return null;
}

export async function fetchSaftImportFiles() {
  const { data, error } = await supabase
    .from("saft_import_files")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as SaftImportFile[];
}

export async function uploadSaftImportFile(userId: string, file: File) {
  const validationError = validateSaftImportFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const importId = crypto.randomUUID();
  const extension = file.name.toLowerCase().endsWith(".zip") ? "zip" : "xml";
  const storagePath = `${userId}/saft-imports/${importId}.${extension}`;
  const mimeType = normalizeSaftMimeType(file);

  const { error: uploadError } = await supabase.storage
    .from(SAFT_IMPORT_BUCKET)
    .upload(storagePath, file, { contentType: mimeType, upsert: false });

  if (uploadError) {
    throw new Error(`Kunne ikke laste opp SAF-T-filen: ${uploadError.message}`);
  }

  const { data, error: insertError } = await supabase
    .from("saft_import_files")
    .insert({
      id: importId,
      owner_user_id: userId,
      storage_path: storagePath,
      original_name: file.name,
      mime_type: mimeType,
      size_bytes: file.size,
    })
    .select("*")
    .single();

  if (insertError) {
    await supabase.storage.from(SAFT_IMPORT_BUCKET).remove([storagePath]);
    throw insertError;
  }

  return data as SaftImportFile;
}

export async function uploadAndImportSaftFile(userId: string, file: File) {
  const uploadedFile = await uploadSaftImportFile(userId, file);

  if (file.name.toLowerCase().endsWith(".zip")) {
    return {
      file: uploadedFile,
      summary: null,
      message: "SAF-T ZIP-filen er lagret. Pakk ut XML-filen og last den opp for automatisk import.",
    };
  }

  const payload = await parseSaftXmlFile(file);
  const summary = await importSaftFilePayload(uploadedFile.id, payload);

  return {
    file: { ...uploadedFile, status: "imported" as const, import_summary: summary },
    summary,
    message: importSummaryMessage(summary),
  };
}

export async function importSaftFilePayload(importFileId: string, payload: SaftImportPayload) {
  const { data, error } = await supabase.rpc("import_saft_file_payload", {
    p_import_file_id: importFileId,
    p_payload: payload,
  });

  if (error) {
    throw error;
  }

  return data as SaftImportSummary;
}

export async function extractSaftImportPrefill(file: File) {
  const validationError = validateSaftImportFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (file.name.toLowerCase().endsWith(".zip")) {
    return {
      profile: null,
      summary: null,
      message: "ZIP-filen kan lagres ved opprettelse, men XML-en inni ZIP-en kan ikke forhåndsutfylle skjemaet ennå.",
    };
  }

  const payload = await parseSaftXmlFile(file);
  const summary = {
    accounts: payload.accounts.length,
    customers: payload.customers.length,
    suppliers: payload.suppliers.length,
    taxCodes: payload.taxCodes.length,
    journalEntries: payload.journalEntries.length,
    journalLines: payload.journalEntries.reduce((sum, entry) => sum + entry.lines.length, 0),
    openingBalanceLines: payload.accounts.filter(
      (account) => account.openingDebitBalance > 0 || account.openingCreditBalance > 0,
    ).length,
  };

  return {
    profile: payload.profile,
    summary,
    message: importSummaryMessage(summary),
  };
}

export async function downloadSaftImportFile(file: SaftImportFile) {
  const { data, error } = await supabase.storage
    .from(SAFT_IMPORT_BUCKET)
    .download(file.storage_path);

  if (error) {
    throw new Error(`Kunne ikke laste ned SAF-T-filen: ${error.message}`);
  }

  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.original_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function deleteSaftImportFile(file: SaftImportFile) {
  const { error: deleteRowError } = await supabase
    .from("saft_import_files")
    .delete()
    .eq("id", file.id);

  if (deleteRowError) {
    throw deleteRowError;
  }

  await supabase.storage.from(SAFT_IMPORT_BUCKET).remove([file.storage_path]);
}

function normalizeSaftMimeType(file: File) {
  if (file.type && ALLOWED_SAFT_IMPORT_MIME_TYPES.has(file.type)) {
    return file.type;
  }

  return file.name.toLowerCase().endsWith(".zip") ? "application/zip" : "application/xml";
}

export type SaftImportSummary = {
  accounts: number;
  customers: number;
  suppliers: number;
  taxCodes: number;
  journalEntries: number;
  journalLines: number;
  openingBalanceLines?: number;
};

type SaftImportPayload = {
  version: string | null;
  profile: {
    companyName: string | null;
    orgNumber: string | null;
    address: string | null;
    postalAddress: string | null;
    streetName: string | null;
    streetNumber: string | null;
    postalCode: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    currencyCode: string | null;
  };
  selectionCriteria: {
    periodStartDate: string | null;
    periodEndDate: string | null;
  };
  accounts: Array<{
    accountNumber: string;
    name: string;
    category: string;
    saftGroupingCategory: string | null;
    saftGroupingCode: string | null;
    openingDebitBalance: number;
    openingCreditBalance: number;
    closingDebitBalance: number;
    closingCreditBalance: number;
  }>;
  taxCodes: Array<{
    code: string;
    description: string;
    direction: "input" | "output" | "none";
    rate: number;
    saftStandardTaxCode: string | null;
    saftTaxType: string | null;
  }>;
  customers: SaftPartyPayload[];
  suppliers: SaftPartyPayload[];
  journalEntries: SaftJournalEntryPayload[];
};

type SaftPartyPayload = {
  saftCustomerId?: string | null;
  saftSupplierId?: string | null;
  name: string | null;
  orgNumber: string | null;
  email: string | null;
  address: string | null;
  postalAddress: string | null;
  streetName: string | null;
  streetNumber: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

type SaftJournalEntryPayload = {
  journalId: "SALES" | "PURCHASE" | "BANK" | "GENERAL";
  transactionId: string;
  date: string;
  description: string | null;
  lines: SaftJournalLinePayload[];
};

type SaftJournalLinePayload = {
  accountNumber: string;
  description: string | null;
  debit: number;
  credit: number;
  vatRate: number | null;
  taxCode: string | null;
  taxBaseAmount: number | null;
  taxAmount: number | null;
  customerId: string | null;
  customerName: string | null;
  customerOrgNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierOrgNumber: string | null;
};

async function parseSaftXmlFile(file: File): Promise<SaftImportPayload> {
  const xmlText = await file.text();
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = firstDescendant(document.documentElement, "parsererror");

  if (parseError) {
    throw new Error("SAF-T-filen er ikke gyldig XML.");
  }

  const auditFile = firstDescendant(document.documentElement, "AuditFile") ?? document.documentElement;
  const header = firstDirectChild(auditFile, "Header");
  const company = header ? firstDescendant(header, "Company") : null;
  const companyAddress = company ? firstDirectChild(company, "Address") : null;
  const selectionCriteria = header ? firstDirectChild(header, "SelectionCriteria") : null;
  const masterFiles = firstDirectChild(auditFile, "MasterFiles");
  const customers = parseParties(masterFiles, "Customers", "Customer", "saftCustomerId");
  const suppliers = parseParties(masterFiles, "Suppliers", "Supplier", "saftSupplierId");
  const customerById = new Map(customers.map((customer) => [customer.saftCustomerId, customer]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.saftSupplierId, supplier]));

  return {
    version: textFrom(header, "AuditFileVersion") ?? textFrom(header, "SoftwareVersion"),
    profile: {
      companyName: textFrom(company, "Name"),
      orgNumber: normalizedOrgNumber(textFrom(company, "RegistrationNumber")),
      address: addressText(companyAddress),
      postalAddress: postalAddressText(companyAddress),
      streetName: textFrom(companyAddress, "StreetName"),
      streetNumber: textFrom(companyAddress, "Number"),
      postalCode: textFrom(companyAddress, "PostalCode"),
      city: textFrom(companyAddress, "City"),
      region: textFrom(companyAddress, "Region"),
      country: textFrom(companyAddress, "Country"),
      currencyCode: textFrom(header, "DefaultCurrencyCode"),
    },
    selectionCriteria: parseSelectionCriteria(selectionCriteria),
    accounts: parseAccounts(masterFiles),
    taxCodes: parseTaxCodes(masterFiles),
    customers,
    suppliers,
    journalEntries: parseJournalEntries(auditFile, customerById, supplierById),
  };
}

function parseAccounts(masterFiles: Element | null): SaftImportPayload["accounts"] {
  const generalLedgerAccounts = firstDirectChild(masterFiles, "GeneralLedgerAccounts");

  return directChildren(generalLedgerAccounts, "Account")
    .map((account) => {
      const accountNumber = onlyDigits(textFrom(account, "AccountID")).slice(0, 4);
      return {
        accountNumber,
        name: textFrom(account, "AccountDescription") ?? accountNumber,
        category: inferAccountCategory(accountNumber),
        saftGroupingCategory: textFrom(account, "GroupingCategory"),
        saftGroupingCode: textFrom(account, "GroupingCode"),
        openingDebitBalance: parseAmount(textFrom(account, "OpeningDebitBalance")) ?? 0,
        openingCreditBalance: parseAmount(textFrom(account, "OpeningCreditBalance")) ?? 0,
        closingDebitBalance: parseAmount(textFrom(account, "ClosingDebitBalance")) ?? 0,
        closingCreditBalance: parseAmount(textFrom(account, "ClosingCreditBalance")) ?? 0,
      };
    })
    .filter((account) => account.accountNumber.length === 4);
}

function parseSelectionCriteria(selectionCriteria: Element | null) {
  const startMonth = parseInteger(textFrom(selectionCriteria, "PeriodStart"));
  const startYear = parseInteger(textFrom(selectionCriteria, "PeriodStartYear"));
  const endMonth = parseInteger(textFrom(selectionCriteria, "PeriodEnd"));
  const endYear = parseInteger(textFrom(selectionCriteria, "PeriodEndYear"));

  return {
    periodStartDate: startMonth && startYear ? isoMonthStart(startYear, startMonth) : null,
    periodEndDate: endMonth && endYear ? isoMonthEnd(endYear, endMonth) : null,
  };
}

function parseTaxCodes(masterFiles: Element | null): SaftImportPayload["taxCodes"] {
  const taxCodeDetails = descendants(masterFiles, "TaxCodeDetails");
  const taxNodes = taxCodeDetails.length > 0
    ? taxCodeDetails
    : descendants(masterFiles, "TaxTableEntry");

  return taxNodes
    .map((entry): SaftImportPayload["taxCodes"][number] | null => {
      const code = textFrom(entry, "TaxCode") ?? textFrom(entry, "StandardTaxCode");
      const description = textFrom(entry, "Description") ?? code;
      const rate = parseAmount(textFrom(entry, "TaxPercentage")) ?? 0;
      const taxType = textFrom(entry, "TaxType") ?? textFrom(entry.parentElement, "TaxType");

      return code
        ? {
            code,
            description: description ?? code,
            direction: inferTaxDirection(code, description, taxType),
            rate,
            saftStandardTaxCode: textFrom(entry, "StandardTaxCode") ?? code,
            saftTaxType: taxType,
          }
        : null;
    })
    .filter((entry): entry is SaftImportPayload["taxCodes"][number] => entry !== null);
}

function parseParties(
  masterFiles: Element | null,
  collectionName: "Customers" | "Suppliers",
  itemName: "Customer" | "Supplier",
  idKey: "saftCustomerId" | "saftSupplierId",
) {
  const collection = firstDirectChild(masterFiles, collectionName);

  return directChildren(collection, itemName).map((party) => {
    const address = firstDirectChild(party, "Address");
    const payload: SaftPartyPayload = {
      [idKey]: textFrom(party, itemName === "Customer" ? "CustomerID" : "SupplierID"),
      name: textFrom(party, "Name"),
      orgNumber: normalizedOrgNumber(textFrom(party, "RegistrationNumber")),
      email: textFrom(party, "Email"),
      address: addressText(address),
      postalAddress: postalAddressText(address),
      streetName: textFrom(address, "StreetName"),
      streetNumber: textFrom(address, "Number"),
      postalCode: textFrom(address, "PostalCode"),
      city: textFrom(address, "City"),
      region: textFrom(address, "Region"),
      country: textFrom(address, "Country"),
    };
    return payload;
  });
}

function parseJournalEntries(
  auditFile: Element,
  customerById: Map<string | null | undefined, SaftPartyPayload>,
  supplierById: Map<string | null | undefined, SaftPartyPayload>,
): SaftJournalEntryPayload[] {
  return descendants(auditFile, "Journal").flatMap((journal) => {
    const rawJournalId = textFrom(journal, "JournalID") ?? "";
    const journalId = normalizeJournalId(rawJournalId);

    return directChildren(journal, "Transaction")
      .map((transaction) => {
        const transactionId = textFrom(transaction, "TransactionID");
        const date = textFrom(transaction, "TransactionDate") ?? textFrom(transaction, "GLPostingDate");
        if (!transactionId || !date) {
          return null;
        }

        const lines = directChildren(transaction, "Line")
          .map((line) => parseJournalLine(line, customerById, supplierById))
          .filter((line): line is SaftJournalLinePayload => line !== null);

        return lines.length > 0
          ? {
              journalId,
              transactionId,
              date,
              description: textFrom(transaction, "Description"),
              lines,
            }
          : null;
      })
      .filter((entry): entry is SaftJournalEntryPayload => entry !== null);
  });
}

function parseJournalLine(
  line: Element,
  customerById: Map<string | null | undefined, SaftPartyPayload>,
  supplierById: Map<string | null | undefined, SaftPartyPayload>,
): SaftJournalLinePayload | null {
  const accountNumber = onlyDigits(textFrom(line, "AccountID")).slice(0, 4);
  if (accountNumber.length !== 4) {
    return null;
  }

  const debit = parseAmountFromElement(firstDirectChild(line, "DebitAmount")) ?? 0;
  const credit = parseAmountFromElement(firstDirectChild(line, "CreditAmount")) ?? 0;
  const taxInformation = firstDirectChild(line, "TaxInformation");
  const customerId = textFrom(line, "CustomerID");
  const supplierId = textFrom(line, "SupplierID");
  const customer = customerById.get(customerId);
  const supplier = supplierById.get(supplierId);

  return {
    accountNumber,
    description: textFrom(line, "Description"),
    debit,
    credit,
    vatRate: parseAmount(textFrom(taxInformation, "TaxPercentage")),
    taxCode: textFrom(taxInformation, "TaxCode") ?? textFrom(taxInformation, "StandardTaxCode"),
    taxBaseAmount: parseAmountFromElement(firstDirectChild(taxInformation, "TaxBase")),
    taxAmount:
      parseAmountFromElement(firstDirectChild(taxInformation, "TaxAmount"))
      ?? parseAmountFromElement(firstDirectChild(taxInformation, "DebitTaxAmount"))
      ?? parseAmountFromElement(firstDirectChild(taxInformation, "CreditTaxAmount")),
    customerId,
    customerName: customer?.name ?? null,
    customerOrgNumber: customer?.orgNumber ?? null,
    supplierId,
    supplierName: supplier?.name ?? null,
    supplierOrgNumber: supplier?.orgNumber ?? null,
  };
}

function importSummaryMessage(summary: SaftImportSummary) {
  const openingText = summary.openingBalanceLines
    ? `, inkludert ${summary.openingBalanceLines} åpningsbalanselinjer`
    : "";
  return `Importert ${summary.accounts} kontoer, ${summary.taxCodes} MVA-koder, ${summary.customers} kunder, ${summary.suppliers} leverandører og ${summary.journalEntries} bilag${openingText}.`;
}

function normalizeJournalId(journalId: string): SaftJournalEntryPayload["journalId"] {
  const upper = journalId.toUpperCase();
  if (upper.includes("SAL") || upper.includes("SALES")) return "SALES";
  if (upper.includes("PUR") || upper.includes("LEV") || upper.includes("SUPPL")) return "PURCHASE";
  if (upper.includes("BANK")) return "BANK";
  return "GENERAL";
}

function inferAccountCategory(accountNumber: string) {
  if (accountNumber.startsWith("1")) return "asset";
  if (accountNumber.startsWith("2")) return "liability";
  if (accountNumber.startsWith("3")) return "revenue";
  return "expense";
}

function inferTaxDirection(code: string, description: string | null, taxType: string | null): "input" | "output" | "none" {
  const value = `${code} ${description ?? ""} ${taxType ?? ""}`.toLowerCase();
  if (value.includes("inng") || value.includes("input")) return "input";
  if (value.includes("utg") || value.includes("output")) return "output";
  return "none";
}

function addressText(address: Element | null) {
  return [textFrom(address, "StreetName"), textFrom(address, "Number")]
    .filter(Boolean)
    .join(" ") || null;
}

function postalAddressText(address: Element | null) {
  return [textFrom(address, "PostalCode"), textFrom(address, "City")]
    .filter(Boolean)
    .join(" ") || null;
}

function textFrom(parent: Element | null | undefined, localName: string) {
  const value = firstDescendant(parent, localName)?.textContent?.trim();
  return value || null;
}

function firstDirectChild(parent: Element | null | undefined, localName: string) {
  return directChildren(parent, localName)[0] ?? null;
}

function firstDescendant(parent: Element | null | undefined, localName: string) {
  return descendants(parent, localName)[0] ?? null;
}

function directChildren(parent: Element | null | undefined, localName: string) {
  if (!parent) return [];
  return Array.from(parent.children).filter((element) => element.localName === localName);
}

function descendants(parent: Element | null | undefined, localName: string) {
  if (!parent) return [];
  return Array.from(parent.getElementsByTagName("*")).filter((element) => element.localName === localName);
}

function parseAmountFromElement(element: Element | null) {
  if (!element) return null;
  return parseAmount(textFrom(element, "Amount") ?? element.textContent);
}

function parseAmount(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseInteger(value: string | null | undefined) {
  if (!value) return null;
  const number = Number(value.trim());
  return Number.isInteger(number) ? number : null;
}

function isoMonthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function isoMonthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function normalizedOrgNumber(value: string | null | undefined) {
  const digits = onlyDigits(value);
  return digits || null;
}

function onlyDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}
