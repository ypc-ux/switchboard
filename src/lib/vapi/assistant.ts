import type { Vapi } from "@vapi-ai/server-sdk";
import type { Client } from "../clients";
import type { Knowledge } from "../knowledge";
import { speakSlot } from "../time";
import { checkAvailabilityTool, bookAppointmentTool, escalateTool } from "./tools";

/**
 * Build a transient Vapi assistant for a specific client.
 * One Vapi number config serves all clients; the assistant is customized per call.
 */
export function buildAssistant(client: Client, knowledge: Knowledge): Vapi.CreateAssistantDto {
  const systemPrompt = composeSystemPrompt(client, knowledge);

  return {
    name: `Assistant for ${client.name}`,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
      ],
    },
    firstMessage: client.agent_greeting ?? "Hi! Thanks for calling. How can I help you today?",
    voice: {
      provider: "openai",
      voiceId: client.voice_id ?? "echo",
    },
    tools: [checkAvailabilityTool, bookAppointmentTool, escalateTool] as any,
    clientMessages: "only_initial_and_tool_calls" as any,
    serverMessages: ["tool_calls", "end_of_call_report"] as any,
  } as any;
}

function composeSystemPrompt(client: Client, knowledge: Knowledge): string {
  const parts: string[] = [];

  parts.push(
    `You are a professional appointment booking assistant for ${client.name}. Your role is to help callers schedule appointments.`,
  );

  if (knowledge.services.length > 0) {
    parts.push("\nServices offered:");
    for (const svc of knowledge.services) {
      let svcLine = `- ${svc.name}`;
      if (svc.description) svcLine += `: ${svc.description}`;
      if (svc.duration_minutes) svcLine += ` (${svc.duration_minutes} min)`;
      if (svc.price) svcLine += ` - ${svc.price}`;
      parts.push(svcLine);
    }
  }

  if (Object.keys(knowledge.hours).length > 0) {
    parts.push("\nBusiness hours:");
    const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    for (const day of dayOrder) {
      const slots = knowledge.hours[day];
      if (slots && slots.length > 0) {
        const timeRanges = slots.map((s) => `${s[0]}-${s[1]}`).join(", ");
        parts.push(`- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${timeRanges}`);
      }
    }
  }

  if (knowledge.faqs.length > 0) {
    parts.push("\nFrequently asked questions:");
    for (const faq of knowledge.faqs) {
      parts.push(`Q: ${faq.q}\nA: ${faq.a}`);
    }
  }

  parts.push(
    "\nYour workflow:\n" +
      "1. Listen to what the caller needs\n" +
      "2. Use check_availability to see open slots for their preferred service\n" +
      "3. Propose specific times and let them choose\n" +
      "4. Use book_appointment to confirm the booking\n" +
      "5. If you cannot help, use escalate to connect them with a human\n" +
      "Be friendly, professional, and concise. Always confirm the appointment details before booking.",
  );

  if (client.agent_instructions) {
    parts.push(`\nAdditional instructions:\n${client.agent_instructions}`);
  }

  return parts.join("\n");
}
