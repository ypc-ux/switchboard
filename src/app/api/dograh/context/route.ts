import { db } from "@/lib/supabase";
import { loadKnowledge } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

/**
 * Dograh context retrieval endpoint
 * Called by Dograh when a SIP call arrives to fetch the initial_context
 *
 * Query params:
 * - client_id: Client UUID
 * - caller_number: Caller phone number
 *
 * Response:
 * {
 *   "client_id": "...",
 *   "caller_number": "...",
 *   "client_name": "...",
 *   "business_hours": "...",
 *   ...
 * }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const callerNumber = url.searchParams.get("caller_number");

  if (!clientId) {
    return new Response(
      JSON.stringify({ error: "missing client_id" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    // Fetch client
    const { data: clientData } = await db()
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (!clientData) {
      return new Response(
        JSON.stringify({ error: "client not found" }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    const client = clientData as any;

    // Load knowledge
    const knowledge = await loadKnowledge(clientId);

    // Format business hours for LLM consumption
    const businessHours = formatBusinessHours(knowledge.hours);

    // Build context object
    const context = {
      client_id: clientId,
      caller_number: callerNumber || "unknown",
      client_name: client.name,
      client_timezone: client.timezone,
      business_hours: businessHours,
      services_json: JSON.stringify(knowledge.services),
      faqs_json: JSON.stringify(knowledge.faqs),
      agent_instructions: client.agent_instructions || "",
    };

    console.info("dograh context retrieved", { clientId, caller: callerNumber });

    return new Response(JSON.stringify(context), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("dograh context error", { error: String(e), clientId });
    return new Response(
      JSON.stringify({ error: "internal error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * Format business hours for LLM consumption
 * Input: { mon: [['09:00', '17:00']], tue: [...], ... }
 * Output: "Monday: 9:00 AM - 5:00 PM\nTuesday: 9:00 AM - 5:00 PM\n..."
 */
function formatBusinessHours(hours: Record<string, string[][]>): string {
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const displayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const lines: string[] = [];
  for (let i = 0; i < dayNames.length; i++) {
    const dayKey = dayNames[i];
    const dayName = displayNames[i];
    const dayHours = hours[dayKey] || [];

    if (dayHours.length === 0) {
      lines.push(`${dayName}: Closed`);
    } else {
      const intervals = dayHours.map(([open, close]) => `${open} - ${close}`).join(", ");
      lines.push(`${dayName}: ${intervals}`);
    }
  }

  return lines.join("\n");
}
