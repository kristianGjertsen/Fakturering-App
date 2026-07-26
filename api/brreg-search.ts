const BRREG_API_URL = "https://data.brreg.no/enhetsregisteret/api/enheter";

type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  json(body: unknown): VercelResponse;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const name = firstQueryValue(request.query.navn)?.trim() ?? "";
  const organizationNumber = firstQueryValue(request.query.organisasjonsnummer)
    ?.replace(/\D/g, "") ?? "";

  if (!organizationNumber && name.length < 2) {
    return response.status(400).json({ error: "Søket må inneholde minst to tegn." });
  }

  const parameters = new URLSearchParams({ size: "8" });
  if (organizationNumber.length === 9) {
    parameters.set("organisasjonsnummer", organizationNumber);
  } else {
    parameters.set("navn", name.slice(0, 180));
    parameters.set("navnMetodeForSoek", "FORTLOEPENDE");
  }

  try {
    const brregResponse = await fetch(`${BRREG_API_URL}?${parameters.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!brregResponse.ok) {
      return response.status(502).json({ error: "Brønnøysundregistrene svarte med en feil." });
    }

    const data = await brregResponse.json();
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return response.status(200).json(data);
  } catch {
    return response.status(502).json({ error: "Kunne ikke kontakte Brønnøysundregistrene." });
  }
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
