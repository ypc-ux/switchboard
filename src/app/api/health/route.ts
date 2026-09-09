export const dynamic = "force-dynamic";

/** Liveness only. Deliberately reveals nothing about clients or config. */
export async function GET() {
  return Response.json({ ok: true, service: "switchboard" });
}
