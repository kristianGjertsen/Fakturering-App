import type { BrregCompany } from "./types";

const BRREG_API_URL = "/api/brreg-search";
const MAX_RESULTS = 8;

type BrregAddress = {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
};

type BrregEntity = {
  navn?: string;
  organisasjonsnummer?: string;
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  epostadresse?: string;
  telefon?: string;
  mobil?: string;
};

type BrregSearchResponse = {
  _embedded?: {
    enheter?: BrregEntity[];
  };
};

export async function searchBrregCompanies(
  query: string,
  signal?: AbortSignal,
): Promise<BrregCompany[]> {
  const normalizedQuery = query.trim();
  const digits = normalizedQuery.replace(/\D/g, "");
  const parameters = new URLSearchParams({ size: String(MAX_RESULTS) });

  if (digits.length === 9 && digits.length === normalizedQuery.replace(/\s/g, "").length) {
    parameters.set("organisasjonsnummer", digits);
  } else {
    parameters.set("navn", normalizedQuery);
    parameters.set("navnMetodeForSoek", "FORTLOEPENDE");
  }

  const response = await fetch(`${BRREG_API_URL}?${parameters.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error("Kunne ikke søke i Brønnøysundregistrene.");
  }

  const data = await response.json() as BrregSearchResponse;
  return (data._embedded?.enheter ?? []).slice(0, MAX_RESULTS).map(mapBrregCompany);
}

export function formatOrganizationNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 9
    ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    : value;
}

function mapBrregCompany(entity: BrregEntity): BrregCompany {
  const address = entity.forretningsadresse ?? entity.postadresse;
  const postalAddress = [address?.postnummer, address?.poststed].filter(Boolean).join(" ");

  return {
    name: entity.navn ?? "",
    organizationNumber: entity.organisasjonsnummer ?? "",
    address: address?.adresse?.join(", ") ?? "",
    postalAddress,
    email: entity.epostadresse?.trim() ?? "",
    phone: entity.telefon?.trim() || entity.mobil?.trim() || "",
  };
}
