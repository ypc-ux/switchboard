import { db } from "./supabase";

export interface Client {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  twilio_number: string;
  forward_number: string;
  owner_alert_number: string | null;
  booking_url: string | null;
  textback_template: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
  dial_timeout_seconds: number;
  crm_provider: "supabase" | "hubspot" | "noop";
  crm_config: Record<string, unknown>;
  sms_dry_run: boolean;
  active: boolean;
}

/**
 * Tenant resolution. The inbound Twilio number IS the tenant key, which is
 * what lets one deploy serve every client.
 */
export async function clientByInboundNumber(to: string): Promise<Client | null> {
  const { data, error } = await db()
    .from("clients")
    .select("*")
    .eq("twilio_number", to)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`client lookup failed for ${to}: ${error.message}`);
  return (data as Client | null) ?? null;
}

export async function upsertContact(
  clientId: string,
  phone: string,
): Promise<{ id: string; opted_out: boolean }> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("contacts")
    .upsert(
      { client_id: clientId, phone, last_seen_at: now },
      { onConflict: "client_id,phone" },
    )
    .select("id, opted_out")
    .single();

  if (error) throw new Error(`contact upsert failed: ${error.message}`);
  return data as { id: string; opted_out: boolean };
}
