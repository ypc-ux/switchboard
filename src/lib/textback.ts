import { db } from "./supabase";
import { env } from "./env";
import { twilioClient } from "./twilio";
import { inQuietHours, nextAllowedSendTime } from "./quiet-hours";
import { getCrm } from "./crm";
import type { Client } from "./clients";

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type SendOutcome =
  | "sent"
  | "deferred"
  | "suppressed"
  | "duplicate"
  | "dry_run"
  | "failed";

interface SendArgs {
  client: Client;
  toNumber: string;
  callId?: string | null;
  contactId?: string | null;
  optedOut?: boolean;
  kind?: "textback" | "reply" | "owner_alert";
  bodyOverride?: string;
}

/**
 * The money path. Ordering matters:
 *   opt-out  → never send, ever
 *   quiet    → defer, never drop
 *   dry-run  → record so it is auditable, but do not hand to Twilio
 */
export async function sendTextback(args: SendArgs): Promise<SendOutcome> {
  const {
    client,
    toNumber,
    callId = null,
    contactId = null,
    optedOut = false,
    kind = "textback",
  } = args;

  const body =
    args.bodyOverride ??
    renderTemplate(client.textback_template, {
      business: client.name,
      booking_url: client.booking_url ?? "",
      caller: toNumber,
    });

  const base = {
    client_id: client.id,
    contact_id: contactId,
    call_id: callId,
    direction: "outbound" as const,
    from_number: client.twilio_number,
    to_number: toNumber,
    body,
    kind,
  };

  // 1. Opt-out is absolute. STOP means stop.
  if (optedOut) {
    await db().from("messages").insert({ ...base, status: "suppressed" });
    return "suppressed";
  }

  // 2. Quiet hours: hold it, do not lose it.
  if (
    inQuietHours(client.timezone, client.quiet_hours_start, client.quiet_hours_end)
  ) {
    const when = nextAllowedSendTime(
      client.timezone,
      client.quiet_hours_start,
      client.quiet_hours_end,
    );
    await db()
      .from("messages")
      .insert({ ...base, status: "deferred", scheduled_for: when.toISOString() });
    return "deferred";
  }

  return deliver(client, base, callId, contactId);
}

/** Shared by the immediate path and the deferred drain. */
export async function deliver(
  client: Client,
  base: Record<string, unknown>,
  callId: string | null,
  _contactId: string | null,
  existingMessageId?: string,
): Promise<SendOutcome> {
  const dryRun = client.sms_dry_run || env().SMS_DRY_RUN;

  if (dryRun) {
    const row = { ...base, status: "sent", dry_run: true, sent_at: new Date().toISOString() };
    if (existingMessageId) {
      await db().from("messages").update(row).eq("id", existingMessageId);
    } else {
      await db().from("messages").insert(row);
    }
    return "dry_run";
  }

  try {
    const msg = await twilioClient().messages.create({
      to: base["to_number"] as string,
      from: client.twilio_number,
      body: base["body"] as string,
    });

    const row = {
      ...base,
      status: "sent",
      dry_run: false,
      twilio_message_sid: msg.sid,
      sent_at: new Date().toISOString(),
    };
    if (existingMessageId) {
      await db().from("messages").update(row).eq("id", existingMessageId);
    } else {
      await db().from("messages").insert(row);
    }

    // Best effort: a CRM outage must not lose the text we just sent.
    try {
      const crm = getCrm(client);
      await crm.upsertContact(client, { phone: base["to_number"] as string });
      await crm.logActivity(client, {
        phone: base["to_number"] as string,
        type: "textback_sent",
        body: base["body"] as string,
      });
    } catch (e) {
      console.error("crm sync failed after send", { client: client.slug, error: String(e) });
    }

    return "sent";
  } catch (e) {
    const row = { ...base, status: "failed", error: String(e) };
    if (existingMessageId) {
      await db().from("messages").update(row).eq("id", existingMessageId);
    } else {
      await db().from("messages").insert(row);
    }
    // A failed text-back is a lost lead — make it visible, not just logged.
    await db().from("escalations").insert({
      client_id: client.id,
      call_id: callId,
      reason: `Text-back to ${base["to_number"]} failed: ${String(e).slice(0, 200)}`,
    });
    return "failed";
  }
}
