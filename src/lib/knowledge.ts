import { db } from "./supabase";

/**
 * The shared brain from the transcript: what the agent reads instead of
 * following a script. Every field is optional because a client can go live
 * with partial knowledge, and a thin knowledge base should degrade the
 * agent's answers rather than crash the call.
 */
export interface Service {
  name: string;
  description?: string;
  duration_minutes?: number;
  price?: string;
}

export interface BookingRules {
  slot_minutes?: number;
  lead_time_minutes?: number;
  max_days_out?: number;
  buffer_minutes?: number;
  max_per_day?: number;
}

/** { mon: [["08:00","12:00"],["13:00","17:00"]], sun: [] } */
export type Hours = Partial<Record<string, [string, string][]>>;

export interface Knowledge {
  services: Service[];
  hours: Hours;
  prices: Record<string, string>;
  faqs: { q: string; a: string }[];
  booking_rules: BookingRules;
}

const EMPTY: Knowledge = {
  services: [],
  hours: {},
  prices: {},
  faqs: [],
  booking_rules: {},
};

export async function loadKnowledge(clientId: string): Promise<Knowledge> {
  const { data, error } = await db()
    .from("business_knowledge")
    .select("services, hours, prices, faqs, booking_rules")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) throw new Error(`knowledge load failed: ${error.message}`);
  if (!data) return EMPTY;

  const row = data as Partial<Knowledge>;
  return {
    services: Array.isArray(row.services) ? row.services : [],
    hours: (row.hours as Hours) ?? {},
    prices: (row.prices as Record<string, string>) ?? {},
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
    booking_rules: (row.booking_rules as BookingRules) ?? {},
  };
}

export function resolveSlotMinutes(k: Knowledge, serviceName?: string): number {
  const svc = serviceName
    ? k.services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
    : undefined;
  return svc?.duration_minutes ?? k.booking_rules.slot_minutes ?? 60;
}
