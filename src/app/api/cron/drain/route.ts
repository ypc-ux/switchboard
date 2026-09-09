import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { deliver } from "@/lib/textback";
import type { Client } from "@/lib/clients";

export const dynamic = "force-dynamic";

/**
 * Drains messages that quiet hours deferred. Without this, "deferred"
 * would quietly mean "dropped".
 *
 * Point Vercel Cron at this every 15 minutes. Auth is a bearer secret
 * because the route sends real SMS.
 */
export async function POST(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return new Response("cron not configured", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data, error } = await db()
    .from("messages")
    .select("id, client_id, contact_id, call_id, from_number, to_number, body, kind")
    .eq("status", "deferred")
    .lte("scheduled_for", new Date().toISOString())
    .limit(100);

  if (error) return new Response(`query failed: ${error.message}`, { status: 500 });

  const rows = (data ?? []) as Array<{
    id: string;
    client_id: string;
    contact_id: string | null;
    call_id: string | null;
    from_number: string;
    to_number: string;
    body: string;
    kind: string;
  }>;

  const results: Record<string, number> = {};

  for (const row of rows) {
    const { data: c } = await db()
      .from("clients")
      .select("*")
      .eq("id", row.client_id)
      .maybeSingle();
    if (!c) continue;

    // Re-check opt-out: the caller may have sent STOP while deferred.
    if (row.contact_id) {
      const { data: contact } = await db()
        .from("contacts")
        .select("opted_out")
        .eq("id", row.contact_id)
        .maybeSingle();
      if ((contact as { opted_out: boolean } | null)?.opted_out) {
        await db().from("messages").update({ status: "suppressed" }).eq("id", row.id);
        results["suppressed"] = (results["suppressed"] ?? 0) + 1;
        continue;
      }
    }

    const outcome = await deliver(
      c as Client,
      {
        client_id: row.client_id,
        contact_id: row.contact_id,
        call_id: row.call_id,
        direction: "outbound",
        from_number: row.from_number,
        to_number: row.to_number,
        body: row.body,
        kind: row.kind,
      },
      row.call_id,
      row.contact_id,
      row.id,
    );
    results[outcome] = (results[outcome] ?? 0) + 1;
  }

  return Response.json({ drained: rows.length, results });
}
