import { findExactLogoDomain } from "../server/logoSearch";

type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  json(body: unknown): VercelResponse;
};

declare const process: {
  env: Record<string, string | undefined>;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  const queryValue = request.query.q;
  const companyName = (Array.isArray(queryValue) ? queryValue[0] : queryValue)?.trim() ?? "";

  if (companyName.length < 2 || companyName.length > 180) {
    return response.status(400).json({ error: "Ugyldig firmanavn." });
  }

  const secretKey = process.env.LOGO_DEV_SECRET_KEY ?? "";
  if (!secretKey) {
    return response.status(503).json({ error: "Logo-søk er ikke konfigurert." });
  }

  try {
    const domain = await findExactLogoDomain(companyName, secretKey);
    response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return response.status(200).json({ domain });
  } catch {
    return response.status(502).json({ error: "Kunne ikke søke etter logo." });
  }
}
