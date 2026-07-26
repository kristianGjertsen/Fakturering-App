const LOGO_SEARCH_URL = "https://api.logo.dev/search";

type LogoSearchResult = {
  name?: string;
  domain?: string;
};

const COMPANY_FORM_SUFFIXES = new Set([
  "a/s",
  "ab",
  "al",
  "ans",
  "as",
  "asa",
  "ba",
  "da",
  "enk",
  "fkf",
  "iks",
  "inc",
  "kf",
  "ks",
  "llc",
  "ltd",
  "nuf",
  "sa",
  "se",
  "sti",
]);

export async function findExactLogoDomain(companyName: string, secretKey: string) {
  if (!secretKey) {
    throw new Error("LOGO_DEV_SECRET_KEY mangler.");
  }

  const response = await fetch(
    `${LOGO_SEARCH_URL}?${new URLSearchParams({
      q: companyName,
      strategy: "match",
    }).toString()}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Logo.dev-søket feilet med status ${response.status}.`);
  }

  const results = await response.json() as LogoSearchResult[];
  const normalizedCompanyName = normalizeCompanyName(companyName);
  const exactMatch = results.find(
    (result) => normalizeCompanyName(result.name ?? "") === normalizedCompanyName,
  );

  return exactMatch?.domain ? hostnameFromDomain(exactMatch.domain) : null;
}

function normalizeCompanyName(companyName: string) {
  const nameParts = companyName.trim().toLowerCase().split(/\s+/);

  while (nameParts.length > 1) {
    const lastPart = nameParts[nameParts.length - 1].replace(/[.,]+$/g, "");
    if (!COMPANY_FORM_SUFFIXES.has(lastPart)) break;
    nameParts.pop();
  }

  return nameParts
    .join(" ")
    .replace(/&/g, "og")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function hostnameFromDomain(domain: string) {
  try {
    return new URL(`https://${domain}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}
