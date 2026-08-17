import type { Profile } from "../types";
import { readPdfText } from "./supplierInvoicePdf";
import {
  parseSupplierInvoiceText,
  type ExtractedValue,
} from "./supplierInvoiceParser";

export type HistoricalInvoicePdfFields = {
  recipientName?: ExtractedValue<string>;
  recipientOrgNumber?: ExtractedValue<string>;
  recipientEmail?: ExtractedValue<string>;
  invoiceNumber?: ExtractedValue<string>;
  invoiceDate?: ExtractedValue<string>;
  dueDate?: ExtractedValue<string>;
  description?: ExtractedValue<string>;
  grossAmount?: ExtractedValue<number>;
  vatAmount?: ExtractedValue<number>;
  vatRate?: ExtractedValue<number>;
};

export type HistoricalInvoicePdfResult = {
  fileName: string;
  pageCount: number;
  textFound: boolean;
  fields: HistoricalInvoicePdfFields;
  warnings: string[];
};

const RECIPIENT_LABEL = /(?:faktura\s*til|fakturamottaker|mottaker|kunde(?:navn)?|customer|bill\s+to|invoice\s+to|kjøper|buyer)/i;
const FIELD_LABEL = /^(?:faktura(?:nummer|nr|dato)?|invoice|dato|date|forfall|due|org(?:anisasjons)?(?:nummer|nr)?|e-?post|email|telefon|phone|adresse|address|kundenr|customer\s*(?:id|no))\b/i;
const LEGAL_SUFFIX = /\b(?:AS|ASA|ENK|DA|ANS|SA|NUF|AB|A\/S|LTD|LIMITED|GMBH|INC|LLC|OY)\b/i;

export async function readHistoricalInvoicePdf(
  file: File,
  sellerProfile: Pick<Profile, "company_name" | "org_number" | "email">,
): Promise<HistoricalInvoicePdfResult> {
  const pdf = await readPdfText(file);
  const parsed = parseHistoricalInvoiceText(pdf.text, sellerProfile);

  return {
    fileName: pdf.fileName,
    pageCount: pdf.pageCount,
    ...parsed,
  };
}

export function parseHistoricalInvoiceText(
  text: string,
  sellerProfile: Pick<Profile, "company_name" | "org_number" | "email">,
) {
  const lines = normalizeLines(text);
  if (lines.length === 0) {
    return { textFound: false, fields: {}, warnings: [] };
  }

  const common = parseSupplierInvoiceText(text);
  const recipientSectionIndex = lines.findIndex((line) => RECIPIENT_LABEL.test(line));
  const recipientName = findRecipientName(lines, recipientSectionIndex, sellerProfile.company_name);
  const recipientOrgNumber = findRecipientOrgNumber(
    lines,
    recipientSectionIndex,
    sellerProfile.org_number,
    common.fields.orgNumber,
  );
  const recipientEmail = findRecipientEmail(
    lines,
    recipientSectionIndex,
    sellerProfile.email,
  );
  const warnings = [...common.warnings];

  if (!recipientName) {
    warnings.push("Fant ikke mottakernavnet sikkert. Fyll det inn manuelt fra PDF-en.");
  }

  return {
    textFound: true,
    warnings,
    fields: {
      recipientName,
      recipientOrgNumber,
      recipientEmail,
      invoiceNumber: common.fields.invoiceNumber,
      invoiceDate: common.fields.invoiceDate,
      dueDate: common.fields.dueDate,
      description: common.fields.description,
      grossAmount: common.fields.grossAmount,
      vatAmount: common.fields.vatAmount,
      vatRate: common.fields.vatRate,
    },
  };
}

function normalizeLines(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findRecipientName(
  lines: string[],
  sectionIndex: number,
  sellerName: string | null,
): ExtractedValue<string> | undefined {
  if (sectionIndex >= 0) {
    const labelLine = lines[sectionIndex];
    const labelMatch = labelLine.match(RECIPIENT_LABEL);
    const sameLine = labelMatch?.index === undefined
      ? ""
      : cleanName(labelLine.slice(labelMatch.index + labelMatch[0].length));
    if (isNameCandidate(sameLine, sellerName)) {
      return { value: sameLine, confidence: "high", evidence: labelLine };
    }

    const nearby = lines.slice(sectionIndex + 1, sectionIndex + 6);
    const legalName = nearby.find((line) => LEGAL_SUFFIX.test(line) && isNameCandidate(line, sellerName));
    if (legalName) {
      return { value: cleanName(legalName), confidence: "high", evidence: legalName };
    }
    const firstCandidate = nearby.find((line) => isNameCandidate(line, sellerName));
    if (firstCandidate) {
      return { value: cleanName(firstCandidate), confidence: "medium", evidence: firstCandidate };
    }
  }

  const otherLegalName = lines.find((line) =>
    LEGAL_SUFFIX.test(line) && isNameCandidate(line, sellerName));
  return otherLegalName
    ? { value: cleanName(otherLegalName), confidence: "low", evidence: otherLegalName }
    : undefined;
}

function findRecipientOrgNumber(
  lines: string[],
  sectionIndex: number,
  sellerOrgNumber: string | null,
  commonOrgNumber: ExtractedValue<string> | undefined,
): ExtractedValue<string> | undefined {
  const sellerDigits = digitsOnly(sellerOrgNumber);
  const searchLines = sectionIndex >= 0
    ? [...lines.slice(sectionIndex, sectionIndex + 9), ...lines]
    : lines;

  for (const line of searchLines) {
    const matches = line.match(/(?:\d[ .-]?){9}/g) ?? [];
    for (const match of matches) {
      const digits = digitsOnly(match);
      if (digits.length === 9 && digits !== sellerDigits) {
        return {
          value: digits,
          confidence: sectionIndex >= 0 && lines.indexOf(line) < sectionIndex + 9 ? "medium" : "low",
          evidence: line,
        };
      }
    }
  }

  if (commonOrgNumber && commonOrgNumber.value !== sellerDigits) return commonOrgNumber;
  return undefined;
}

function findRecipientEmail(
  lines: string[],
  sectionIndex: number,
  sellerEmail: string | null,
): ExtractedValue<string> | undefined {
  const normalizedSellerEmail = sellerEmail?.trim().toLowerCase();
  const searchLines = sectionIndex >= 0
    ? [...lines.slice(sectionIndex, sectionIndex + 9), ...lines]
    : lines;

  for (const line of searchLines) {
    const email = line.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
    if (email && email.toLowerCase() !== normalizedSellerEmail) {
      return {
        value: email,
        confidence: sectionIndex >= 0 && lines.indexOf(line) < sectionIndex + 9 ? "medium" : "low",
        evidence: line,
      };
    }
  }
  return undefined;
}

function isNameCandidate(value: string, sellerName: string | null): boolean {
  const cleaned = cleanName(value);
  if (cleaned.length < 2 || cleaned.length > 120 || !/[A-Za-zÆØÅæøå]/.test(cleaned)) return false;
  if (FIELD_LABEL.test(cleaned) || RECIPIENT_LABEL.test(cleaned)) return false;
  if (/^(?:til|fra|side|page|norge|norway)$/i.test(cleaned)) return false;
  if (/^\d|@|\b\d{4}\b/.test(cleaned)) return false;
  if (sellerName && normalizeName(cleaned) === normalizeName(sellerName)) return false;
  return true;
}

function cleanName(value: string) {
  return value
    .replace(/^[\s:|,.-]+/, "")
    .replace(/[|,;]+$/, "")
    .trim();
}

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]/gi, "")
    .toLowerCase();
}

function digitsOnly(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}
