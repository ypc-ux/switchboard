import twilio from "twilio";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { clientByInboundNumber, upsertContact } from "@/lib/clients";
import { readFormBody, verifyTwilioSignature, twimlResponse, emptyTwiml } from "@/lib/twilio";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const Payload = z.object({
  CallSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
});

/**
 * Twilio Voice webhook. Forwards the call to the business's real line and
 * asks Twilio to report the outcome to /api/voice/status, which is where
 * a miss becomes a text.
 */
export async function POST(req: Request) {
  const params = await readFormBody(req);

  if (!verifyTwilioSignature(req, "/api/voice/incoming", params)) {
    return new Response("invalid signature", { status: 403 });
  }

  const parsed = Payload.safeParse(params);
  if (!parsed.success) return new Response("bad payload", { status: 400 });
  const { CallSid, From, To } = parsed.data;

  const client = await clientByInboundNumber(To);
  if (!client) {
    console.error("no active client for inbound number", { To });
    return emptyTwiml();
  }

  const contact = await upsertContact(client.id, From);

  // Upsert so a Twilio retry of this same webhook does not duplicate the call.
  await db().from("calls").upsert(
    {
      client_id: client.id,
      contact_id: contact.id,
      twilio_call_sid: CallSid,
      from_number: From,
      to_number: To,
      direction: "inbound",
    },
    { onConflict: "twilio_call_sid" },
  );

  const twiml = new twilio.twiml.VoiceResponse();
  const dial = twiml.dial({
    timeout: client.dial_timeout_seconds,
    action: new URL("/api/voice/status", env().PUBLIC_BASE_URL).toString(),
    method: "POST",
    answerOnBridge: true,
  });
  dial.number(client.forward_number);

  return twimlResponse(twiml.toString());
}
