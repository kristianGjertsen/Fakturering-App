declare const process: {
  env: Record<string, string | undefined>;
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing required environment variables for invoice processing");

    return Response.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/process-invoices`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ triggeredBy: "vercel-cron" }),
      },
    );

    const responseBody = await response.text();

    return new Response(responseBody || null, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to trigger the process-invoices Edge Function", error);

    return Response.json(
      { error: "Failed to trigger invoice processing" },
      { status: 502 },
    );
  }
}
