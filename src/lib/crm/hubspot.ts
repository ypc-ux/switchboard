import type { Client } from "../clients";
import type { CrmAdapter, CrmActivity, CrmContact } from "./index";

/**
 * HubSpot backend, per the stack named in the source video.
 *
 * NOT VERIFIED against a live HubSpot account — there were no credentials
 * available when this was written. The endpoints follow the documented v3
 * CRM API, but treat the first real run as a test and expect to adjust
 * property names to whatever the client's portal actually uses.
 *
 * Expects clients.crm_config = { "accessToken": "pat-..." }
 */
const API = "https://api.hubapi.com";

function token(client: Client): string {
  const t = (client.crm_config as { accessToken?: string }).accessToken;
  if (!t) {
    throw new Error(
      `client ${client.slug} has crm_provider=hubspot but no accessToken in crm_config`,
    );
  }
  return t;
}

async function hs(
  client: Client,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token(client)}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`hubspot ${path} ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

export const hubspotCrm: CrmAdapter = {
  provider: "hubspot",

  async upsertContact(client: Client, contact: CrmContact) {
    const found = (await hs(client, "/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "phone", operator: "EQ", value: contact.phone },
            ],
          },
        ],
        properties: ["phone"],
        limit: 1,
      }),
    })) as { results?: Array<{ id: string }> };

    const existing = found.results?.[0];
    if (existing) {
      if (contact.name) {
        await hs(client, `/crm/v3/objects/contacts/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: { firstname: contact.name } }),
        });
      }
      return { externalId: existing.id };
    }

    const created = (await hs(client, "/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          phone: contact.phone,
          ...(contact.name ? { firstname: contact.name } : {}),
        },
      }),
    })) as { id: string };

    return { externalId: created.id };
  },

  async logActivity(client: Client, activity: CrmActivity) {
    const { externalId } = await hubspotCrm.upsertContact(client, {
      phone: activity.phone,
    });
    if (!externalId) return;

    await hs(client, "/crm/v3/objects/notes", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_note_body: `[switchboard/${activity.type}] ${activity.body}`,
          hs_timestamp: (activity.occurredAt ?? new Date()).toISOString(),
        },
        associations: [
          {
            to: { id: externalId },
            // 202 = note→contact. Portal-specific type ids are a known
            // gotcha; verify against the client's portal on first run.
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202,
              },
            ],
          },
        ],
      }),
    });
  },
};
