import { z } from "zod";
import { db } from "@/lib/supabase";
import { clientByInboundNumber, upsertContact } from "@/lib/clients";
import { readFormBody, verifyTwilioSignature, emptyTwiml } from "@/lib/twilio";
import { claimEvent } from "@/lib/idempotency";
import { sendTextback } from "@/lib/textback";
import { getCrm } from "@/lib/crm";
import { mintHandoffToken } from "@/lib/vapi/handoff";
import { shouldRouteToDograh } from "@/lib/feature-flags";
import { recordCallMetric } from "@/lib/metrics";
import { getDograhConfig, buildDograhDialTwiml } from "@/lib/dograh/handoff";

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

  // Only the first delivery of this event may proceed. Twilio retries.
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

  const callId = (call.data as { id: string } | null)?.id ?? null;

  // If voice agent is enabled, check canary flag to route to Dograh or Vapi
  if (client.voice_agent_enabled) {
    const routeToDograh = await shouldRouteToDograh(From);

    if (routeToDograh) {
      // Canary: route to Dograh (new voice agent)
      try {
        const dograhConfig = getDograhConfig();
        if (!dograhConfig.enabled || !dograhConfig.sipDomain) {
          console.warn("dograh not configured, falling back to textback", { client: client.slug });
          // Fall through to textback
        } else {
          const twiml = buildDograhDialTwiml(dograhConfig, client.id);
          console.info("handoff to dograh", { client: client.slug, domain: dograhConfig.sipDomain });
          await recordCallMetric({
            client_id: client.id,
            caller_number: From,
            call_sid: CallSid,
            routed_to: "dograh",
          });
          return new Response(twiml, { status: 200, headers: { "content-type": "application/xml" } });
        }
      } catch (e) {
        console.error("dograh handoff failed", { client: client.slug, error: String(e) });
        // Fall through to textback on error
      }
    } else {
      // Control: route to Vapi (existing voice agent)
      try {
        const handoffToken = await mintHandoffToken(client, callId, From, CallSid);
        const sipUri = `sip:${client.vapi_sip_domain}?token=${handoffToken}`;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;
        console.info("handoff to vapi", { client: client.slug, token: handoffToken });
        await recordCallMetric({
          client_id: client.id,
          caller_number: From,
          call_sid: CallSid,
          routed_to: "vapi",
        });
        return new Response(twiml, { status: 200, headers: { "content-type": "application/xml" } });
      } catch (e) {
        console.error("vapi handoff failed", { client: client.slug, error: String(e) });
        // Fall through to text-back if handoff fails
      }
    }
  }

  // Text-back: either agent is disabled or handoff failed
  const outcome = await sendTextback({
    client,
    toNumber: From,
    callId,
    contactId: contact.id,
    optedOut: contact.opted_out,
  });

  // Record textback metric
  await recordCallMetric({
    client_id: client.id,
    caller_number: From,
    call_sid: CallSid,
    routed_to: "textback",
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
