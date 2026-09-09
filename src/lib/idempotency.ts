import { db } from "./supabase";

/**
 * Twilio retries webhooks on non-2xx and on timeouts. Without a ledger, a
 * retried status callback texts the same caller a second time.
 *
 * Returns true when this (sid, event) pair is being seen for the first
 * time. A duplicate insert violates the unique constraint and returns
 * false, so the caller can no-op.
 */
export async function claimEvent(
  resourceSid: string,
  eventType: string,
  provider = "twilio",
): Promise<boolean> {
  const { error } = await db()
    .from("webhook_events")
    .insert({ provider, resource_sid: resourceSid, event_type: eventType });

  if (!error) return true;
  // 23505 = unique_violation. Anything else is a real failure and should
  // surface rather than be swallowed into a silent duplicate send.
  if (error.code === "23505") return false;
  throw new Error(`idempotency claim failed: ${error.message}`);
}
