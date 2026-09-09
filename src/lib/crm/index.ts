import type { Client } from "../clients";
import { supabaseCrm } from "./supabase";
import { hubspotCrm } from "./hubspot";
import { noopCrm } from "./noop";

export interface CrmContact {
  phone: string;
  name?: string | null;
}

export interface CrmActivity {
  phone: string;
  /** Short machine-ish label, e.g. "missed_call" or "textback_sent". */
  type: string;
  body: string;
  occurredAt?: Date;
}

export interface CrmAdapter {
  readonly provider: string;
  /** Returns the CRM's own id when the backend has one. */
  upsertContact(client: Client, contact: CrmContact): Promise<{ externalId?: string }>;
  logActivity(client: Client, activity: CrmActivity): Promise<void>;
}

/**
 * The whole point of the adapter: the call flow never knows which CRM a
 * client runs, so switching one is a column change, not a rewrite.
 */
export function getCrm(client: Client): CrmAdapter {
  switch (client.crm_provider) {
    case "hubspot":
      return hubspotCrm;
    case "noop":
      return noopCrm;
    case "supabase":
    default:
      return supabaseCrm;
  }
}
