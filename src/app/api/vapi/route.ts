import { z } from "zod";
import type { Vapi } from "@vapi-ai/server-sdk";
import { db } from "@/lib/supabase";
import { claimEvent } from "@/lib/idempotency";
import { upsertContact } from "@/lib/clients";
import { loadKnowledge, resolveSlotMinutes } from "@/lib/knowledge";
import { buildAssistant } from "@/lib/vapi/assistant";
import { resolveTenant, consumeHandoffToken } from "@/lib/vapi/handoff";
import { availableSlots } from "@/lib/availability";
import { sendTextback } from "@/lib/textback";
import { scoreCallAndTrackLead, updateCallWithLeadScore } from "@/lib/vapi/lead-qualifier-integration";

export const dynamic = "force-dynamic";

/**
 * Vapi webhook handler for all message types.
 * Every branch is idempotent via claimEvent.
 */
export async function POST(req: Request) {
  let message: Vapi.ServerMessage;
  try {
    const body = await req.json();
    message = body as Vapi.ServerMessage;
  } catch (e) {
    return new Response("invalid json", { status: 400 });
  }

  if (!message.message?.type) {
    return new Response("missing message type", { status: 400 });
  }

  const messagePayload = message.message as any;
  const messageId = messagePayload?.id as string | undefined;
  if (!messageId) {
    return new Response("missing message id", { status: 400 });
  }

  try {
    const msgAny = message as any;
    switch (messagePayload.type) {
      case "assistant-request":
        return handleAssistantRequest(msgAny, messageId);
      case "tool-calls":
        return handleToolCalls(msgAny, messageId);
      case "end-of-call-report":
        return handleEndOfCallReport(msgAny, messageId);
      default:
        console.warn("unknown message type", { type: messagePayload.type });
        return new Response("ok", { status: 200 });
    }
  } catch (e) {
    console.error("vapi webhook error", { messageId, error: String(e) });
    return new Response("internal error", { status: 500 });
  }
}

async function handleAssistantRequest(
  msg: any,
  messageId: string,
): Promise<Response> {
  // Idempotent: only first delivery processes
  const first = await claimEvent(messageId, "assistant-request", "vapi");
  if (!first) {
    console.info("duplicate assistant-request ignored", { messageId });
    return new Response("ok", { status: 200 });
  }

  // Resolve tenant from token, dialed number, or recent handoff
  const assistantReq = msg.message?.assistantRequest as any;
  const token = assistantReq?.assistantOverride?.isActive as string | undefined;
  const dialedNumber = assistantReq?.dialledNumber as string | undefined;
  const callerNumber = assistantReq?.callerNumber as string | undefined;

  const { client, signal } = await resolveTenant(token, dialedNumber, callerNumber);
  console.info("tenant resolved", { messageId, clientId: client.id, signal });

  // Load knowledge and build assistant
  const knowledge = await loadKnowledge(client.id);
  const assistant = buildAssistant(client, knowledge);

  // Mark token consumed if it was used
  if (token && signal === "token") {
    try {
      await consumeHandoffToken(token);
    } catch (e) {
      console.error("failed to consume token", { token, error: String(e) });
    }
  }

  return new Response(
    JSON.stringify({
      assistant,
    } as Vapi.ServerMessageResponseAssistantRequest),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function handleToolCalls(
  msg: any,
  messageId: string,
): Promise<Response> {
  const first = await claimEvent(messageId, "tool-calls", "vapi");
  if (!first) {
    console.info("duplicate tool-calls ignored", { messageId });
    return new Response("ok", { status: 200 });
  }

  const toolCallList = msg.message?.toolCalls?.toolCallList as Array<Record<string, unknown>> | undefined;

  if (!toolCallList || !Array.isArray(toolCallList)) {
    return new Response(JSON.stringify({ results: [] } as Vapi.ServerMessageResponseToolCalls), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const call of toolCallList) {
    const callAny = call as any;
    const toolName = callAny.function?.name as string | undefined;
    const toolCallId = callAny.toolCallId as string | undefined;
    const args = callAny.function?.arguments as Record<string, unknown> | undefined;

    if (!toolName || !toolCallId) continue;

    try {
      if (toolName === "check_availability") {
        const serviceName = args?.service_name as string | undefined;
        const preferredDate = args?.preferred_date as string | undefined;

        if (!serviceName) {
          results.push({
            toolCallId,
            error: "service_name is required",
          });
          continue;
        }

        // Get client from recent handoff (tool context needs to know who's calling)
        const callerNumber = (msg.message as Record<string, unknown>)?.callerNumber as
          | string
          | undefined;
        if (!callerNumber) {
          results.push({
            toolCallId,
            error: "no caller information",
          });
          continue;
        }

        const { data: handoffData } = await db()
          .from("voice_handoffs")
          .select("client_id, client:clients(*)")
          .eq("caller_number", callerNumber)
          .is("consumed_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const handoff = handoffData as any;
        if (!handoff?.client) {
          results.push({
            toolCallId,
            error: "could not resolve client",
          });
          continue;
        }

        const client = (Array.isArray(handoff.client) ? handoff.client[0] : handoff.client) as any;
        const clientId = handoff.client_id as string;
        const knowledge = await loadKnowledge(clientId);
        const slotMinutes = resolveSlotMinutes(knowledge, serviceName);

        const slots = await availableSlots(
          clientId,
          client.timezone as string,
          knowledge.hours,
          knowledge.booking_rules,
          slotMinutes,
        );

        // Filter by preferred date if provided
        const filtered = preferredDate
          ? slots.filter((s) => s.start.toISOString().startsWith(preferredDate))
          : slots;

        const slotObjects = filtered.slice(0, 5).map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          label: s.label,
        }));

        results.push({
          toolCallId,
          result: {
            slots: slotObjects.length > 0 ? slotObjects : [],
          },
        });
      } else if (toolName === "book_appointment") {
        const serviceName = args?.service_name as string | undefined;
        const startTimeStr = args?.start_time as string | undefined;
        const contactName = args?.contact_name as string | undefined;
        const contactPhone = args?.contact_phone as string | undefined;

        if (!serviceName || !startTimeStr || !contactName || !contactPhone) {
          results.push({
            toolCallId,
            error: "missing required fields",
          });
          continue;
        }

        // Resolve client
        const callerNumber = (msg.message as Record<string, unknown>)?.callerNumber as
          | string
          | undefined;
        if (!callerNumber) {
          results.push({
            toolCallId,
            error: "no caller information",
          });
          continue;
        }

        const { data: handoffData } = await db()
          .from("voice_handoffs")
          .select("client_id")
          .eq("caller_number", callerNumber)
          .is("consumed_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const handoff = handoffData as any;
        if (!handoff?.client_id) {
          results.push({
            toolCallId,
            error: "could not resolve client",
          });
          continue;
        }

        const startTime = new Date(startTimeStr);
        const knowledge = await loadKnowledge(handoff.client_id);
        const slotMinutes = resolveSlotMinutes(knowledge, serviceName);
        const endTime = new Date(startTime.getTime() + slotMinutes * 60000);

        const { error } = await db().from("bookings").insert({
          client_id: handoff.client_id,
          service: serviceName,
          starts_at: startTime.toISOString(),
          ends_at: endTime.toISOString(),
          contact_name: contactName,
          contact_phone: contactPhone,
          notes: (args?.notes as string) || null,
          requested_window: (args?.requested_window as string) || null,
          source: "voice_agent",
        });

        if (error) {
          results.push({
            toolCallId,
            error: `booking failed: ${error.message}`,
          });
        } else {
          results.push({
            toolCallId,
            result: `Appointment confirmed for ${contactName} on ${startTime.toISOString()}`,
          });
        }
      } else if (toolName === "escalate") {
        const reason = args?.reason as string | undefined;
        results.push({
          toolCallId,
          result: `Escalating to human: ${reason || "no reason provided"}`,
        });
      }
    } catch (e) {
      results.push({
        toolCallId,
        error: String(e),
      });
    }
  }

  return new Response(JSON.stringify({ results } as any), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function handleEndOfCallReport(
  msg: any,
  messageId: string,
): Promise<Response> {
  const first = await claimEvent(messageId, "end-of-call-report", "vapi");
  if (!first) {
    console.info("duplicate end-of-call-report ignored", { messageId });
    return new Response("ok", { status: 200 });
  }

  const report = msg.message as any;
  const vapiCallId = report?.vapiCallId as string | undefined;
  const callerNumber = report?.callerNumber as string | undefined;
  const transcript = report?.transcript as string | undefined;
  const summary = report?.summary as string | undefined;
  const endedReason = report?.endedReason as string | undefined;
  const cost = (report?.cost as number | undefined) ?? 0;

  if (!callerNumber) {
    console.warn("end-of-call-report missing caller number");
    return new Response("ok", { status: 200 });
  }

  // Find the handoff and client
  const { data: handoffData } = await db()
    .from("voice_handoffs")
    .select("client_id, call_id, client:clients(*)")
    .eq("caller_number", callerNumber)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const handoff = handoffData as any;
  if (!handoff?.client_id) {
    console.warn("could not resolve client for end-of-call-report");
    return new Response("ok", { status: 200 });
  }

  const clientData = (Array.isArray(handoff.client) ? handoff.client[0] : handoff.client) as any;
  const clientId = handoff.client_id;
  const callId = handoff.call_id;

  // Get client services for lead qualification
  const knowledge = await loadKnowledge(clientId);
  const clientServices = knowledge.services || [];

  // Update the call record
  if (callId) {
    await db()
      .from("calls")
      .update({
        vapi_call_id: vapiCallId,
        transcript,
        summary,
        agent_ended_reason: endedReason,
        agent_cost: cost > 0 ? cost : null,
        answered_by: "agent",
      })
      .eq("id", callId);
  }

  // Score the call and track as qualified lead
  const qualificationResult = await scoreCallAndTrackLead(
    db(),
    {
      vapi_call_id: vapiCallId || "",
      client_id: clientId,
      call_id: callId || null,
      caller_number: callerNumber,
      transcript: transcript || "",
      summary: summary || "",
      duration_seconds: 0, // TODO: Extract from Vapi report if available
    },
    clientServices,
  );

  // Update call with lead score
  if (callId) {
    await updateCallWithLeadScore(db(), callId, qualificationResult);
  }

  // Log qualification results
  console.info("call qualified", {
    clientId,
    callId,
    qualified: qualificationResult.qualified,
    score: qualificationResult.score.total,
    decision: qualificationResult.score.decision,
    trackingId: qualificationResult.tracking_id,
  });

  // Check if a booking was made
  const { data: bookings } = await db()
    .from("bookings")
    .select("id")
    .eq("client_id", clientId)
    .gte("created_at", new Date(Date.now() - 5 * 60000).toISOString()) // Last 5 minutes
    .limit(1);

  const bookingMade = bookings && bookings.length > 0;

  if (bookingMade) {
    // Send confirmation text
    await upsertContact(clientId, callerNumber);
    await sendTextback({
      client: clientData as any,
      toNumber: callerNumber,
      callId: callId || null,
      bodyOverride: `Great! Your appointment is confirmed. We'll see you soon!`,
    });
  } else if (qualificationResult.qualified) {
    // Qualified lead - send transfer confirmation
    await upsertContact(clientId, callerNumber);
    await sendTextback({
      client: clientData as any,
      toNumber: callerNumber,
      callId: callId || null,
      bodyOverride: `Thanks for calling! You've been transferred to our specialist team. Someone will follow up shortly.`,
    });
  } else if (qualificationResult.score.decision === "queue") {
    // Borderline lead - queue for human review
    await upsertContact(clientId, callerNumber);
    await sendTextback({
      client: clientData as any,
      toNumber: callerNumber,
      callId: callId || null,
      bodyOverride: `Thanks for your interest! You'll hear from us shortly to discuss your needs.`,
    });
  } else {
    // Non-qualified - send booking link via default text-back
    await upsertContact(clientId, callerNumber);
    await sendTextback({
      client: clientData as any,
      toNumber: callerNumber,
      callId: callId || null,
    });
  }

  console.info("end-of-call-report processed", { clientId, bookingMade, endedReason, qualified: qualificationResult.qualified });
  return new Response("ok", { status: 200 });
}
