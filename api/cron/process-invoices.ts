export function GET() {
  return Response.json({
    ok: true,
    message: "Cron endpoint works",
  });
}