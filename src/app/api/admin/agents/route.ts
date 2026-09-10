/**
 * Agent Configuration API
 * GET /api/admin/agents - List all agents
 * POST /api/admin/agents - Create agent config
 */

import { listClients } from "@/lib/agents";

export async function GET() {
  try {
    const clients = await listClients();
    return Response.json({ clients });
  } catch (error) {
    console.error("Failed to list agents:", error);
    return Response.json(
      { error: "Failed to list agents" },
      { status: 500 }
    );
  }
}
