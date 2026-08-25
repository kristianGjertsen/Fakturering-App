export type ExchangeRateResult = {
  currency: string;
  nokPerUnit: number;
  rateDate: string;
  source: "Norges Bank";
};

type NorgesBankSeries = {
  attributes?: number[];
  observations?: Record<string, [string]>;
};

type NorgesBankResponse = {
  data?: {
    dataSets?: Array<{ series?: Record<string, NorgesBankSeries> }>;
    structure?: {
      dimensions?: {
        observation?: Array<{ id?: string; values?: Array<{ id?: string }> }>;
      };
      attributes?: {
        series?: Array<{
          id?: string;
          values?: Array<{ id?: string }>;
        }>;
      };
    };
  };
};

const rateCache = new Map<string, ExchangeRateResult>();

export async function fetchNorgesBankExchangeRate(
  currency: string,
  invoiceDate: string,
): Promise<ExchangeRateResult> {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency === "NOK") {
    return { currency: "NOK", nokPerUnit: 1, rateDate: invoiceDate, source: "Norges Bank" };
  }
  if (!/^[A-Z]{3}$/.test(normalizedCurrency) || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    throw new Error("Valuta eller fakturadato er ugyldig.");
  }

  const cacheKey = `${normalizedCurrency}:${invoiceDate}`;
  const cached = rateCache.get(cacheKey);
  if (cached) return cached;

  const startPeriod = addDays(invoiceDate, -10);
  const url = new URL(`https://data.norges-bank.no/api/data/EXR/B.${normalizedCurrency}.NOK.SP`);
  url.searchParams.set("format", "sdmx-json");
  url.searchParams.set("startPeriod", startPeriod);
  url.searchParams.set("endPeriod", invoiceDate);
  url.searchParams.set("locale", "no");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Norges Bank svarte med status ${response.status}.`);
  const payload = await response.json() as NorgesBankResponse;
  const dataset = payload.data?.dataSets?.[0];
  const structure = payload.data?.structure;
  const series = Object.values(dataset?.series ?? {})[0];
  const timeDimension = structure?.dimensions?.observation?.find((dimension) => dimension.id === "TIME_PERIOD");
  const unitMultiplierDefinition = structure?.attributes?.series?.find((attribute) => attribute.id === "UNIT_MULT");
  const unitMultiplierPosition = structure?.attributes?.series?.findIndex((attribute) => attribute.id === "UNIT_MULT") ?? -1;
  const unitMultiplierValueIndex = unitMultiplierPosition >= 0
    ? series?.attributes?.[unitMultiplierPosition]
    : undefined;
  const unitMultiplier = Number(
    unitMultiplierValueIndex === undefined
      ? 0
      : unitMultiplierDefinition?.values?.[unitMultiplierValueIndex]?.id ?? 0,
  );

  const observations = Object.entries(series?.observations ?? {})
    .map(([index, observation]) => ({
      date: timeDimension?.values?.[Number(index)]?.id ?? "",
      value: Number(observation[0]),
    }))
    .filter((observation) => observation.date && observation.date <= invoiceDate && Number.isFinite(observation.value))
    .sort((left, right) => right.date.localeCompare(left.date));
  const latest = observations[0];
  if (!latest) throw new Error(`Fant ingen publisert ${normalizedCurrency}-kurs på eller før fakturadatoen.`);

  const nokPerUnit = Number((latest.value / (10 ** unitMultiplier)).toFixed(8));
  if (!Number.isFinite(nokPerUnit) || nokPerUnit <= 0) throw new Error("Valutakursen fra Norges Bank var ugyldig.");

  const result: ExchangeRateResult = {
    currency: normalizedCurrency,
    nokPerUnit,
    rateDate: latest.date,
    source: "Norges Bank",
  };
  rateCache.set(cacheKey, result);
  return result;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
