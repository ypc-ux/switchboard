import { db } from "../supabase";
import type { Client } from "../clients";
import type { CrmAdapter, CrmActivity, CrmContact } from "./index";

/**
 * Default backend. Our own Postgres is the CRM — contacts already live
 * there, so this only has to record the activity trail.
 */
export const supabaseCrm: CrmAdapter = {
  provider: "supabase",

  async upsertContact(client: Client, contact: CrmContact) {
    const now = new Date().toISOString();
    const { data, error } = await db()
      .from("contacts")
      .upsert(
        {
          client_id: client.id,
          phone: contact.phone,
          ...(contact.name ? { name: contact.name } : {}),
          last_seen_at: now,
        },
        { onConflict: "client_id,phone" },
      )
      .select("id")
      .single();

    if (error) throw new Error(`supabase crm upsert failed: ${error.message}`);
    return { externalId: (data as { id: string }).id };
  },

  async logActivity(client: Client, activity: CrmActivity) {
    // Activity is already implicit in calls/messages rows for this backend.
    // Only genuinely out-of-band events need an escalation row.
    if (activity.type !== "needs_human") return;
    const { error } = await db().from("escalations").insert({
      client_id: client.id,
      reason: activity.body,
    });
    if (error) throw new Error(`escalation insert failed: ${error.message}`);
  },
};
