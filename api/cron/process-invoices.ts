export const config = {
  maxDuration: 120,
};

type VercelRequest = {
  method?: string;
  headers: {
    authorization?: string;
  };
};



type VercelResponse = {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
};

declare const process: {
  env: Record<string, string | undefined>;
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  try {
    if (request.method !== "GET") {
      return response.status(405).json({
        error: "Method not allowed",
      });
    }

    const cronSecret = process.env.CRON_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;

    if (!cronSecret || !supabaseUrl) {
      console.error("Missing required environment variables for invoice processing");

      return response.status(500).json({
        error: "Server configuration error",
      });
    }

    const authorization = request.headers.authorization;

    if (authorization !== `Bearer ${cronSecret}`) {
      return response.status(401).json({
        error: "Unauthorized",
      });
    }

    const edgeResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/process-invoices`,
      {
        method: "POST",
        headers: {
          "x-cron-secret": cronSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ triggeredBy: "vercel-cron" }),
      }
    );

    const responseBody = await edgeResponse.text();
    const result = parseResponseBody(responseBody);

    return response.status(edgeResponse.status).json(result);
  } catch (error) {
    console.error("Cron failed:", error);

    return response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function parseResponseBody(body: string): unknown {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return { message: body };
  }
}
