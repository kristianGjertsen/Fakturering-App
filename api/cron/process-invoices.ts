export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing required environment variables for invoice processing");

    return Response.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/process-invoices`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const body = await response.text();
    const result = body ? parseResponseBody(body) : null;

    return Response.json(result, { status: response.status });
  } catch (error) {
    console.error("Failed to trigger the process-invoices Edge Function", error);

    return Response.json(
      { error: "Failed to trigger invoice processing" },
      { status: 502 },
    );
  }
}

function parseResponseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return { message: body };
  }
}
