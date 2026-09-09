import { z } from "zod";
import { db } from "@/lib/supabase";
import { clientByInboundNumber, upsertContact } from "@/lib/clients";
import { readFormBody, verifyTwilioSignature, emptyTwiml } from "@/lib/twilio";
import { claimEvent } from "@/lib/idempotency";
import { sendTextback } from "@/lib/textback";

export const dynamic = "force-dynamic";

const Payload = z.object({
  MessageSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  Body: z.string().default(""),
});

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);

export async function POST(req: Request) {
  const params = await readFormBody(req);

  if (!verifyTwilioSignature(req, "/api/sms/incoming", params)) {
    return new Response("invalid signature", { status: 403 });
  }

  const parsed = Payload.safeParse(params);
  if (!parsed.success) return new Response("bad payload", { status: 400 });
  const { MessageSid, From, To, Body } = parsed.data;

  const client = await clientByInboundNumber(To);
  if (!client) return emptyTwiml();

  const first = await claimEvent(MessageSid, "sms_inbound");
  if (!first) return emptyTwiml();

  const contact = await upsertContact(client.id, From);
  const word = Body.trim().toLowerCase();

  await db().from("messages").insert({
    client_id: client.id,
    contact_id: contact.id,
    direction: "inbound",
    from_number: From,
    to_number: To,
    body: Body,
    status: "received",
    kind: "reply",
    twilio_message_sid: MessageSid,
  });

  // Twilio honours STOP at the carrier level too, but we must respect it in
  // our own data or the next missed call queues a message we cannot send.
  if (STOP_WORDS.has(word)) {
    await db()
      .from("contacts")
      .update({ opted_out: true, opted_out_at: new Date().toISOString() })
      .eq("id", contact.id);
    return emptyTwiml();
  }

  if (START_WORDS.has(word) && contact.opted_out) {
    await db()
      .from("contacts")
      .update({ opted_out: false, opted_out_at: null })
      .eq("id", contact.id);
  }

  // Slice 1 has no conversational agent, so a human decides. Slice 2
  // replaces this escalation with the booking agent.
  await db().from("escalations").insert({
    client_id: client.id,
    reason: `Reply from ${From}: ${Body.slice(0, 300)}`,
  });

  const alertTo = client.owner_alert_number ?? client.forward_number;
  await sendTextback({
    client,
    toNumber: alertTo,
    kind: "owner_alert",
    bodyOverride: `${client.name}: reply from ${From} — "${Body.slice(0, 120)}"`,
  });

  return emptyTwiml();
}
