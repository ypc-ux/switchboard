import twilio from "twilio";
import { env } from "./env";

let cached: twilio.Twilio | null = null;

export function twilioClient(): twilio.Twilio {
  if (cached) return cached;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = env();
  cached = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return cached;
}

/** Parse an application/x-www-form-urlencoded Twilio webhook body. */
export async function readFormBody(req: Request): Promise<Record<string, string>> {
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Verify the request genuinely came from Twilio.
 *
 * Without this, anyone who discovers the webhook URL can forge calls and
 * messages and spend the client's Twilio balance. The URL is rebuilt from
 * PUBLIC_BASE_URL rather than request headers on purpose — Host and
 * X-Forwarded-* are attacker-controlled behind a proxy.
 */
export function verifyTwilioSignature(
  req: Request,
  path: string,
  params: Record<string, string>,
): boolean {
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;
  const { TWILIO_AUTH_TOKEN, PUBLIC_BASE_URL } = env();
  const url = new URL(path, PUBLIC_BASE_URL).toString();
  return twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, params);
}

/** Empty TwiML — acknowledges the webhook and ends the call leg. */
export function emptyTwiml(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}
