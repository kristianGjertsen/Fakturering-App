export type ExtractionConfidence = "high" | "medium" | "low";

export type ExtractedValue<T> = {
  value: T;
  confidence: ExtractionConfidence;
  evidence: string;
};

export type SupplierInvoicePdfFields = {
  supplierName?: ExtractedValue<string>;
  orgNumber?: ExtractedValue<string>;
  supplierEmail?: ExtractedValue<string>;
  bankAccount?: ExtractedValue<string>;
  invoiceNumber?: ExtractedValue<string>;
  invoiceDate?: ExtractedValue<string>;
  dueDate?: ExtractedValue<string>;
  kid?: ExtractedValue<string>;
  description?: ExtractedValue<string>;
  currency?: ExtractedValue<string>;
  grossAmount?: ExtractedValue<number>;
  vatAmount?: ExtractedValue<number>;
  vatRate?: ExtractedValue<number>;
};

export type SupplierInvoicePdfExtraction = {
  fields: SupplierInvoicePdfFields;
  textFound: boolean;
  lineCount: number;
  warnings: string[];
};

const INVOICE_NUMBER_LABEL = /(?:faktura[\s.]*(?:nummer|nr\.?|no\.?|#)|invoice\s*(?:number|no\.?|id|#))/i;
const INVOICE_DATE_LABEL = /(?:faktura\s*dato|fakturadato|invoice\s*date|date\s+of\s+issue|issue\s*date|billing\s*date)/i;
const DUE_DATE_LABEL = /(?:forfalls?dato|forfall|betalingsfrist|due\s*date|payment\s+due|pay\s+by)/i;
const ORG_NUMBER_LABEL = /(?:org(?:anisasjons)?[\s.]*(?:nummer|nr\.?)|organisation\s*no\.?|organization\s*no\.?)/i;
const BANK_ACCOUNT_LABEL = /(?:bankkonto|konto[\s.]*(?:nummer|nr\.?)|account\s*(?:number|no\.?))/i;
const KID_LABEL = /\bkid(?:-?(?:nummer|nr\.?)|\s*reference)?\b/i;
const DESCRIPTION_LABEL = /(?:beskrivelse|description|gjelder)/i;
const TOTAL_LABEL = /(?:bel(?:ø|o)p\s+(?:å|aa)\s+betale|sum\s+(?:å|aa)\s+betale|til\s+betaling|\btotalbel(?:ø|o)p\b|\btotalt?\b|\bamount\s+due\b)/i;
const VAT_LABEL = /\b(?:merverdiavgift|mva|vat)\b/i;
const CURRENCY_LABEL = /\b(?:valuta|currency)\b/i;
const SUPPORTED_CURRENCIES = new Set([
  "NOK", "USD", "EUR", "GBP", "SEK", "DKK", "CHF", "CAD", "AUD", "JPY", "PLN",
]);
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januar: 1,
  feb: 2, february: 2, februar: 2,
  mar: 3, march: 3, mars: 3,
  apr: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, des: 12, desember: 12,
};

export function parseSupplierInvoiceText(text: string): SupplierInvoicePdfExtraction {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) return { fields: {}, textFound: false, lineCount: 0, warnings: [] };

  const currency = findCurrency(lines);
  const preferMonthFirst = currency?.value === "USD";
  const invoiceDate = findLabeledDate(lines, INVOICE_DATE_LABEL, preferMonthFirst);
  const dueDate = findLabeledDate(lines, DUE_DATE_LABEL, preferMonthFirst);
  const invoiceNumber = findLabeledText(lines, INVOICE_NUMBER_LABEL, parseInvoiceNumber);
  const orgNumber = findLabeledText(lines, ORG_NUMBER_LABEL, parseOrgNumber);
  const supplierEmail = findSupplierEmail(lines);
  const bankAccount = findLabeledText(lines, BANK_ACCOUNT_LABEL, parseBankAccount);
  const kid = findLabeledText(lines, KID_LABEL, parseKid);
  const grossAmount = findLabeledMoney(lines, TOTAL_LABEL, (line) =>
    !/\b(?:(?:total|totalt)\s+(?:mva|vat)|(?:mva|vat)\s+(?:total|totalt))\b/i.test(line),
  );
  const vatAmount = findLabeledMoney(lines, VAT_LABEL, () => true, true);
  const explicitVatRates = findVatRates(lines);
  const explicitVatRate = explicitVatRates.length === 1 ? explicitVatRates[0] : undefined;
  const inferredVatRate = explicitVatRates.length === 0 && grossAmount && vatAmount
    ? inferVatRate(grossAmount.value, vatAmount.value, vatAmount.evidence)
    : undefined;
  const supplierName = findSupplierName(lines, orgNumber?.evidence);
  const description = findLabeledText(lines, DESCRIPTION_LABEL, parseDescription);
  const warnings = explicitVatRates.length > 1
    ? [`PDF-en inneholder flere MVA-satser (${explicitVatRates.map((rate) => `${rate.value} %`).join(" og ")}). Del beløpet i egne kostnadslinjer og kontroller MVA.`]
    : [];
  if (currency && currency.value !== "NOK" && (explicitVatRates.length > 0 || (vatAmount?.value ?? 0) > 0)) {
    warnings.push("Fakturaen er i utenlandsk valuta. Kontroller MVA-behandlingen før bokføring; utenlandsk VAT er ikke automatisk norsk inngående MVA.");
  }
  if (invoiceDate?.confidence === "low") {
    warnings.push(`Fakturadatoen «${invoiceDate.evidence}» har et tvetydig dag/måned-format. Kontroller datoen.`);
  }
  if (dueDate?.confidence === "low") {
    warnings.push(`Forfallsdatoen «${dueDate.evidence}» har et tvetydig dag/måned-format. Kontroller datoen.`);
  }

  return {
    textFound: true,
    lineCount: lines.length,
    warnings,
    fields: {
      supplierName,
      orgNumber,
      supplierEmail,
      bankAccount,
      invoiceNumber,
      invoiceDate,
      dueDate,
      kid,
      description,
      currency,
      grossAmount,
      vatAmount,
      vatRate: explicitVatRate ?? inferredVatRate,
    },
  };
}

function findLabeledDate(
  lines: string[],
  label: RegExp,
  preferMonthFirst: boolean,
): ExtractedValue<string> | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(label);
    if (!match || match.index === undefined) continue;

    const remainder = lines[index]
      .slice(match.index + match[0].length)
      .replace(/^[\s:#.-]+/, "")
      .trim();
    const sameLine = parseDateValue(remainder, preferMonthFirst);
    if (sameLine) {
      return { ...sameLine, evidence: lines[index] };
    }

    const nextLine = lines[index + 1];
    const nextLineDate = nextLine ? parseDateValue(nextLine, preferMonthFirst) : null;
    if (nextLineDate) {
      return {
        value: nextLineDate.value,
        confidence: lowerConfidence(nextLineDate.confidence),
        evidence: `${lines[index]} ${nextLine}`,
      };
    }
  }
  return undefined;
}

function findCurrency(lines: string[]): ExtractedValue<string> | undefined {
  const prioritized = [
    ...lines.filter((line) => TOTAL_LABEL.test(line) || CURRENCY_LABEL.test(line)),
    ...lines,
  ];

  for (const line of prioritized) {
    const explicit = line.match(/\b(NOK|USD|EUR|GBP|SEK|DKK|CHF|CAD|AUD|JPY|PLN)\b/i)?.[1]?.toUpperCase();
    if (explicit && SUPPORTED_CURRENCIES.has(explicit)) {
      return { value: explicit, confidence: "high", evidence: line };
    }
    if (/\bUS\$|\$\s*US\b/i.test(line)) return { value: "USD", confidence: "high", evidence: line };
    if (/\b(?:CA|C)\$/i.test(line)) return { value: "CAD", confidence: "high", evidence: line };
    if (/\b(?:AU|A)\$/i.test(line)) return { value: "AUD", confidence: "high", evidence: line };
    if (line.includes("€")) return { value: "EUR", confidence: "high", evidence: line };
    if (line.includes("£")) return { value: "GBP", confidence: "high", evidence: line };
    if (line.includes("$")) return { value: "USD", confidence: "medium", evidence: line };
  }
  return undefined;
}

function findLabeledText<T>(
  lines: string[],
  label: RegExp,
  parser: (value: string) => T | null,
): ExtractedValue<T> | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(label);
    if (!match || match.index === undefined) continue;

    const remainder = lines[index]
      .slice(match.index + match[0].length)
      .replace(/^[\s:#.-]+/, "")
      .trim();
    const sameLineValue = parser(remainder);
    if (sameLineValue !== null) {
      return { value: sameLineValue, confidence: "high", evidence: lines[index] };
    }

    const nextLine = lines[index + 1];
    if (nextLine) {
      const nextLineValue = parser(nextLine);
      if (nextLineValue !== null) {
        return { value: nextLineValue, confidence: "medium", evidence: `${lines[index]} ${nextLine}` };
      }
    }
  }
  return undefined;
}

function findLabeledMoney(
  lines: string[],
  label: RegExp,
  lineFilter: (line: string) => boolean = () => true,
  includeZero = false,
) {
  const candidates: Array<ExtractedValue<number>> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labelMatch = line.match(label);
    if (!labelMatch || labelMatch.index === undefined || !lineFilter(line)) continue;

    const remainder = line.slice(labelMatch.index + labelMatch[0].length);
    const sameLineAmounts = extractMoneyValues(remainder, includeZero);
    if (sameLineAmounts.length > 0) {
      candidates.push({
        value: sameLineAmounts[sameLineAmounts.length - 1],
        confidence: "high",
        evidence: line,
      });
      continue;
    }

    const nextLine = lines[index + 1];
    const nextLineAmounts = nextLine ? extractMoneyValues(nextLine, includeZero) : [];
    if (nextLineAmounts.length > 0) {
      candidates.push({
        value: nextLineAmounts[nextLineAmounts.length - 1],
        confidence: "medium",
        evidence: `${line} ${nextLine}`,
      });
    }
  }

  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, candidate) => candidate.value > best.value ? candidate : best);
}

function findVatRates(lines: string[]): Array<ExtractedValue<number>> {
  const acceptedRates = new Set([0, 12, 15, 25]);
  const matches = new Map<number, string>();
  for (const line of lines) {
    if (!VAT_LABEL.test(line)) continue;
    const afterLabel = line.match(/(?:merverdiavgift|mva|vat)[^\n]{0,30}?\b(0|12|15|25)(?:[,.]0+)?\s*%/i);
    const beforeLabel = line.match(/\b(0|12|15|25)(?:[,.]0+)?\s*%[^\n]{0,20}(?:merverdiavgift|mva|vat)/i);
    const value = Number(afterLabel?.[1] ?? beforeLabel?.[1]);
    if (acceptedRates.has(value)) matches.set(value, line);
  }
  return [...matches.entries()].map(([value, evidence]) => ({
    value,
    confidence: "high",
    evidence,
  }));
}

function inferVatRate(gross: number, vat: number, evidence: string): ExtractedValue<number> | undefined {
  const net = gross - vat;
  if (net <= 0 || vat < 0) return undefined;
  const calculatedRate = (vat / net) * 100;
  const acceptedRates = [0, 12, 15, 25];
  const closest = acceptedRates.reduce((best, rate) =>
    Math.abs(rate - calculatedRate) < Math.abs(best - calculatedRate) ? rate : best,
  );
  if (Math.abs(closest - calculatedRate) > 1) return undefined;
  return { value: closest, confidence: "medium", evidence };
}

function findSupplierName(lines: string[], orgEvidence?: string): ExtractedValue<string> | undefined {
  if (orgEvidence) {
    const beforeOrgLabel = orgEvidence.split(ORG_NUMBER_LABEL)[0]?.trim().replace(/[,:|-]+$/, "").trim();
    if (isSupplierNameCandidate(beforeOrgLabel)) {
      return { value: beforeOrgLabel, confidence: "medium", evidence: orgEvidence };
    }
  }

  const legalName = lines.slice(0, 20).find((line) =>
    /\b(?:AS|ASA|ENK|DA|ANS|SA|NUF)\b/i.test(line) && isSupplierNameCandidate(line),
  );
  if (legalName) {
    return { value: cleanSupplierName(legalName), confidence: "medium", evidence: legalName };
  }

  const firstHeading = lines.slice(0, 10).find(isSupplierNameCandidate);
  return firstHeading
    ? { value: cleanSupplierName(firstHeading), confidence: "low", evidence: firstHeading }
    : undefined;
}

function findSupplierEmail(lines: string[]): ExtractedValue<string> | undefined {
  for (const line of lines.slice(0, 30)) {
    if (/\b(?:kunde|customer|mottaker)\b/i.test(line)) continue;
    const match = line.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    if (match) return { value: match[0], confidence: "low", evidence: line };
  }
  return undefined;
}

function isSupplierNameCandidate(value: string | undefined): value is string {
  if (!value || value.length < 3 || value.length > 100) return false;
  if (!/[A-Za-zÆØÅæøå]/.test(value)) return false;
  if (/^(?:faktura|invoice|kreditnota|side\s+\d|dato|kunde|til|fra)$/i.test(value)) return false;
  if (INVOICE_NUMBER_LABEL.test(value) || INVOICE_DATE_LABEL.test(value) || DUE_DATE_LABEL.test(value)) return false;
  if (ORG_NUMBER_LABEL.test(value) || BANK_ACCOUNT_LABEL.test(value) || KID_LABEL.test(value)) return false;
  if (TOTAL_LABEL.test(value) || VAT_LABEL.test(value)) return false;
  return true;
}

function cleanSupplierName(value: string) {
  return value
    .replace(ORG_NUMBER_LABEL, "")
    .replace(/\b\d{9}\b.*$/, "")
    .replace(/[|,:-]+$/, "")
    .trim();
}

function parseInvoiceNumber(value: string) {
  const match = value.match(/^#?([A-ZÆØÅ0-9][A-ZÆØÅ0-9./_-]{1,39})\b/i);
  return match?.[1] ?? null;
}

function parseOrgNumber(value: string) {
  return findDigitSequence(value, 9, 9);
}

function parseBankAccount(value: string) {
  return findDigitSequence(value, 11, 11);
}

function parseKid(value: string) {
  return findDigitSequence(value, 2, 25);
}

function findDigitSequence(value: string, minimumLength: number, maximumLength: number) {
  const candidates = value.match(/[\d][\d .-]*/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= minimumLength && digits.length <= maximumLength) return digits;
  }
  return null;
}

function parseDescription(value: string) {
  const cleaned = value.replace(/^[\s:#.-]+/, "").trim();
  if (cleaned.length < 3 || cleaned.length > 160 || TOTAL_LABEL.test(cleaned)) return null;
  return cleaned;
}

function parseDateValue(
  value: string,
  preferMonthFirst: boolean,
): Omit<ExtractedValue<string>, "evidence"> | null {
  const isoMatch = value.match(/\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (isoMatch) return validDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), "high");

  const numericMatch = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (numericMatch) {
    const first = Number(numericMatch[1]);
    const second = Number(numericMatch[2]);
    const year = normalizeYear(Number(numericMatch[3]));
    if (first > 12) return validDate(year, second, first, "high");
    if (second > 12) return validDate(year, first, second, "high");
    return preferMonthFirst
      ? validDate(year, first, second, "low")
      : validDate(year, second, first, "low");
  }

  const monthPattern = Object.keys(MONTHS).sort((left, right) => right.length - left.length).join("|");
  const monthFirst = value.match(new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{2,4})\\b`, "i"));
  if (monthFirst) {
    return validDate(
      normalizeYear(Number(monthFirst[3])),
      MONTHS[monthFirst[1].toLowerCase()],
      Number(monthFirst[2]),
      "high",
    );
  }

  const dayFirst = value.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[.]?\\s+(${monthPattern})[,]?\\s+(\\d{2,4})\\b`, "i"));
  if (dayFirst) {
    return validDate(
      normalizeYear(Number(dayFirst[3])),
      MONTHS[dayFirst[2].toLowerCase()],
      Number(dayFirst[1]),
      "high",
    );
  }

  return null;
}

function validDate(
  year: number,
  month: number,
  day: number,
  confidence: ExtractionConfidence,
): Omit<ExtractedValue<string>, "evidence"> | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return null;
  return {
    value: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    confidence,
  };
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function lowerConfidence(confidence: ExtractionConfidence): ExtractionConfidence {
  if (confidence === "high") return "medium";
  return "low";
}

function extractMoneyValues(value: string, includeZero = false) {
  const matches = value.matchAll(/(?:NOK|USD|EUR|GBP|SEK|DKK|CHF|CAD|AUD|JPY|PLN|kr\.?|US\$|CA\$|AU\$|[$€£])?\s*(-?\d(?:[\d\s.,'’]*\d)?)/gi);
  const amounts: number[] = [];
  for (const match of matches) {
    const token = match[1];
    const endIndex = (match.index ?? 0) + match[0].length;
    if (/^\s*%/.test(value.slice(endIndex))) continue;
    const parsed = parseLocalizedMoney(token);
    if (parsed !== null && (parsed > 0 || (includeZero && parsed === 0))) amounts.push(parsed);
  }
  return amounts;
}

export function parseLocalizedMoney(value: string) {
  let normalized = value.replace(/[^\d,.-]/g, "").replace(/\s|['’]/g, "");
  if (!normalized || normalized === "-") return null;

  const commaIndex = normalized.lastIndexOf(",");
  const dotIndex = normalized.lastIndexOf(".");
  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else normalized = normalized.replace(/,/g, "");
  } else if (commaIndex >= 0) {
    const decimalDigits = normalized.length - commaIndex - 1;
    normalized = decimalDigits === 3
      ? normalized.replace(/,/g, "")
      : normalized.replace(/\./g, "").replace(",", ".");
  } else if (dotIndex >= 0) {
    const decimalDigits = normalized.length - dotIndex - 1;
    if (decimalDigits === 3) normalized = normalized.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
