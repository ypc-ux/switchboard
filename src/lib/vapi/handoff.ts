import { randomUUID } from "crypto";
import { db } from "../supabase";
import { clientByInboundNumber } from "../clients";
import type { Client } from "../clients";

/**
 * Mint a single-use token to hand off from Twilio to Vapi.
 * The token is embedded in the SIP URI and redeemed on assistant-request.
 */
export async function mintHandoffToken(
  client: Client,
  callId: string | null,
  callerNumber: string,
  twilioCallSid: string,
): Promise<string> {
  const token = randomUUID();

  const { error } = await db().from("voice_handoffs").insert({
    token,
    client_id: client.id,
    call_id: callId,
    caller_number: callerNumber,
    twilio_call_sid: twilioCallSid,
  });

  if (error) throw new Error(`handoff token mint failed: ${error.message}`);
  return token;
}

export interface TenantResolution {
  client: Client;
  /** Which signal matched: 'token', 'dialed_number', or 'recent_handoff' */
  signal: "token" | "dialed_number" | "recent_handoff";
}

/**
 * Resolve tenant on assistant-request from Vapi.
 *
 * Tries three signals in order (token → dialed number → recent handoff),
 * logs which one matched. The redundant paths will be deleted once a real
 * Vapi account confirms what round-trips.
 */
export async function resolveTenant(
  token?: string,
  dialedNumber?: string,
  callerNumber?: string,
): Promise<TenantResolution> {
  // Try 1: token from the SIP URI
  if (token) {
    const { data: handoff, error } = await db()
      .from("voice_handoffs")
      .select("client_id, client:clients(*)")
      .eq("token", token)
      .is("consumed_at", null)
      .maybeSingle();

    if (error) throw new Error(`handoff token lookup failed: ${error.message}`);
    if (handoff?.client) {
      const clientData = (Array.isArray(handoff.client) ? handoff.client[0] : handoff.client) as any;
      console.info("tenant resolved via token", { signal: "token", clientId: handoff.client_id });
      return { client: clientData as Client, signal: "token" };
    }
  }

  // Try 2: dialed number (the Twilio number)
  if (dialedNumber) {
    const client = await clientByInboundNumber(dialedNumber);
    if (client) {
      console.info("tenant resolved via dialed number", {
        signal: "dialed_number",
        clientId: client.id,
      });
      return { client, signal: "dialed_number" };
    }
  }

  // Try 3: caller's most recent live handoff
  if (callerNumber) {
    const { data: handoffs, error } = await db()
      .from("voice_handoffs")
      .select("client_id, client:clients(*)")
      .eq("caller_number", callerNumber)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(`recent handoff lookup failed: ${error.message}`);
    if (handoffs && handoffs.length > 0 && handoffs[0]?.client) {
      const clientData = (Array.isArray(handoffs[0].client) ? handoffs[0].client[0] : handoffs[0].client) as any;
      console.info("tenant resolved via recent handoff", {
        signal: "recent_handoff",
        clientId: handoffs[0].client_id,
      });
      return { client: clientData as Client, signal: "recent_handoff" };
    }
  }

  throw new Error("no tenant resolved");
}

/**
 * Mark a handoff token as consumed after the call is handled.
 */
export async function consumeHandoffToken(token: string): Promise<void> {
  const { error } = await db()
    .from("voice_handoffs")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token);

  if (error) throw new Error(`handoff token consume failed: ${error.message}`);
}
