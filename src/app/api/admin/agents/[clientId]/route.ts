/**
 * Individual Agent Configuration API
 * GET /api/admin/agents/[clientId] - Get agent config
 * PUT /api/admin/agents/[clientId] - Update agent config
 */

import { getAgentConfig, updateAgentConfig, AgentConfig } from "@/lib/agents";

export async function GET(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const config = await getAgentConfig(params.clientId);
    if (!config) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }
    return Response.json({ config });
  } catch (error) {
    console.error("Failed to get agent config:", error);
    return Response.json(
      { error: "Failed to get agent config" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const body = (await request.json()) as Partial<AgentConfig>;
    const config = await updateAgentConfig(params.clientId, body);
    return Response.json({ config });
  } catch (error) {
    console.error("Failed to update agent config:", error);
    return Response.json(
      { error: "Failed to update agent config" },
      { status: 500 }
    );
  }
}
