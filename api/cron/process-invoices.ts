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

    const authorization = request.headers.authorization;

    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return response.status(401).json({
        error: "Unauthorized",
      });
    }

    // Fakturalogikken din her

    return response.status(200).json({
      ok: true,
      message: "Cron completed",
    });
  } catch (error) {
    console.error("Cron failed:", error);

    return response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
