import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { deliver, sendTextback } from "@/lib/textback";
import { claimEvent } from "@/lib/idempotency";
import { upsertContact } from "@/lib/clients";
import type { Client } from "@/lib/clients";

export const dynamic = "force-dynamic";

/**
 * Drains messages that quiet hours deferred, and sweeps for orphaned
 * voice handoffs that never reported (SIP failed, Vapi down).
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

  // Sweep for orphaned voice handoffs (never got end-of-call-report).
  // These are handoffs older than the client's agent_max_seconds with no report.
  const orphanedResults: Record<string, number> = {};

  const { data: orphanedHandoffs, error: orphanError } = await db()
    .from("voice_handoffs")
    .select("id, client_id, caller_number, created_at, client:clients(*)")
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (orphanError) {
    console.error("orphaned handoff query failed", { error: orphanError.message });
  } else if (orphanedHandoffs) {
    for (const row of orphanedHandoffs) {
      const handoff = row as any;
      const clientData = (handoff.client as any)?.[0] || handoff.client;
      if (!clientData) continue;

      const now = new Date();
      const handoffAge = (now.getTime() - new Date(handoff.created_at).getTime()) / 1000;
      const maxSeconds = (clientData as any).agent_max_seconds || 300;

      if (handoffAge > maxSeconds) {
        // Only text once per handoff
        const eventId = `orphaned_handoff:${handoff.id}`;
        const first = await claimEvent(handoff.id, eventId, "vapi");
        if (!first) continue;

        try {
          await upsertContact(handoff.client_id, handoff.caller_number);
          await sendTextback({
            client: clientData as Client,
            toNumber: handoff.caller_number,
            callId: null,
          });
          orphanedResults["textback_sent"] = (orphanedResults["textback_sent"] ?? 0) + 1;
          console.info("orphaned handoff text-back sent", { handoffId: handoff.id });
        } catch (e) {
          orphanedResults["textback_failed"] = (orphanedResults["textback_failed"] ?? 0) + 1;
          console.error("orphaned handoff text-back failed", {
            handoffId: handoff.id,
            error: String(e),
          });
        }
      }
    }
  }

  return Response.json({
    drained: rows.length,
    results,
    orphaned: Object.keys(orphanedResults).length > 0 ? orphanedResults : undefined,
  });
}
