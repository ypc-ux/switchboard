import { z } from "zod";
import { db } from "@/lib/supabase";
import { clientByInboundNumber, upsertContact } from "@/lib/clients";
import { readFormBody, verifyTwilioSignature, emptyTwiml } from "@/lib/twilio";
import { claimEvent } from "@/lib/idempotency";
import { sendTextback } from "@/lib/textback";
import { getCrm } from "@/lib/crm";

export const dynamic = "force-dynamic";

const Payload = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  DialCallStatus: z.string().optional(),
  DialCallDuration: z.string().optional(),
});

/** A call the business did not pick up. This is where the money leaks. */
const MISSED = new Set(["no-answer", "busy", "failed", "canceled"]);

export async function POST(req: Request) {
  const params = await readFormBody(req);

  if (!verifyTwilioSignature(req, "/api/voice/status", params)) {
    return new Response("invalid signature", { status: 403 });
  }

  const parsed = Payload.safeParse(params);
  if (!parsed.success) return new Response("bad payload", { status: 400 });
  const { CallSid, From, To, DialCallStatus, DialCallDuration } = parsed.data;

  const client = await clientByInboundNumber(To);
  if (!client) return emptyTwiml();

  const status = DialCallStatus ?? "unknown";
  const missed = MISSED.has(status);

  await db()
    .from("calls")
    .update({
      dial_status: status,
      missed,
      ended_at: new Date().toISOString(),
      duration_seconds: DialCallDuration ? Number(DialCallDuration) : null,
    })
    .eq("twilio_call_sid", CallSid);

  if (!missed) return emptyTwiml();

  // Only the first delivery of this event may text. Twilio retries.
  const first = await claimEvent(CallSid, `dial_status:${status}`);
  if (!first) {
    console.info("duplicate dial status ignored", { CallSid, status });
    return emptyTwiml();
  }

  const contact = await upsertContact(client.id, From);
  const call = await db()
    .from("calls")
    .select("id")
    .eq("twilio_call_sid", CallSid)
    .maybeSingle();

  const outcome = await sendTextback({
    client,
    toNumber: From,
    callId: (call.data as { id: string } | null)?.id ?? null,
    contactId: contact.id,
    optedOut: contact.opted_out,
  });

  try {
    await getCrm(client).logActivity(client, {
      phone: From,
      type: "missed_call",
      body: `Missed call (${status}). Text-back: ${outcome}.`,
    });
  } catch (e) {
    console.error("crm activity failed", { client: client.slug, error: String(e) });
  }

  console.info("missed call handled", { client: client.slug, status, outcome });
  return emptyTwiml();
}
