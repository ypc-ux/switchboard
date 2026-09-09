/**
 * Tests for Vapi assistant building
 */

import { buildAssistant } from "../assistant";
import type { Client } from "../../clients";
import type { Knowledge } from "../../knowledge";

describe("buildAssistant", () => {
  const testClient: Client = {
    id: "test-client",
    slug: "test-salon",
    name: "Test Salon",
    timezone: "America/New_York",
    twilio_number: "+16505550100",
    forward_number: "+16505550101",
    booking_url: "https://salon.example.com/book",
    textback_template: "Thanks for calling {{business}}",
    quiet_hours_start: 21,
    quiet_hours_end: 8,
    dial_timeout_seconds: 20,
    crm_provider: "noop",
    crm_config: {},
    sms_dry_run: true,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    voice_agent_enabled: true,
    vapi_sip_domain: "sip.vapi.ai",
    voice_provider: "vapi",
    voice_id: "echo",
    agent_greeting: "Hi there! Welcome to Test Salon.",
    agent_instructions: "Be friendly and helpful.",
    agent_max_seconds: 300,
  };

  const testKnowledge: Knowledge = {
    services: [
      { name: "Haircut", description: "Classic haircut", duration_minutes: 60, price: "$35" },
      { name: "Color", description: "Hair coloring", duration_minutes: 90, price: "$80" },
    ],
    hours: {
      mon: [["09:00", "18:00"]],
      tue: [["09:00", "18:00"]],
      wed: [["09:00", "18:00"]],
      thu: [["09:00", "18:00"]],
      fri: [["09:00", "18:00"]],
      sat: [["10:00", "16:00"]],
      sun: [],
    },
    faqs: [
      {
        q: "Do you offer walk-ins?",
        a: "Yes, we welcome walk-ins. You may have a short wait during peak hours.",
      },
      { q: "Do you have parking?", a: "Yes, free parking is available in our lot." },
    ],
    booking_rules: {
      lead_time_minutes: 30,
      buffer_minutes: 15,
      max_days_out: 90,
      max_per_day: 10,
      slot_minutes: 60,
    },
  };

  it("should create a valid assistant DTO", () => {
    const assistant = buildAssistant(testClient, testKnowledge);

    expect(assistant).toBeDefined();
    expect(assistant.name).toContain(testClient.name);
    expect(assistant.firstMessage).toBe(testClient.agent_greeting);
    expect(assistant.voice?.voiceId).toBe(testClient.voice_id);
  });

  it("should include all services in system prompt", () => {
    const assistant = buildAssistant(testClient, testKnowledge);
    const prompt = assistant.model.messages[0].content;

    testKnowledge.services.forEach((service) => {
      expect(prompt).toContain(service.name);
      if (service.description) {
        expect(prompt).toContain(service.description);
      }
      if (service.duration_minutes) {
        expect(prompt).toContain(service.duration_minutes.toString());
      }
      if (service.price) {
        expect(prompt).toContain(service.price);
      }
    });
  });

  it("should include business hours in system prompt", () => {
    const assistant = buildAssistant(testClient, testKnowledge);
    const prompt = assistant.model.messages[0].content;

    expect(prompt).toContain("Business hours");
    expect(prompt).toContain("Monday");
    expect(prompt).toContain("09:00-18:00");
  });

  it("should include FAQs in system prompt", () => {
    const assistant = buildAssistant(testClient, testKnowledge);
    const prompt = assistant.model.messages[0].content;

    testKnowledge.faqs.forEach((faq) => {
      expect(prompt).toContain(faq.q);
      expect(prompt).toContain(faq.a);
    });
  });

  it("should include agent instructions", () => {
    const assistant = buildAssistant(testClient, testKnowledge);
    const prompt = assistant.model.messages[0].content;

    expect(prompt).toContain(testClient.agent_instructions);
  });

  it("should include all three tools", () => {
    const assistant = buildAssistant(testClient, testKnowledge);

    const toolNames = (assistant.tools as any).map((t: any) => t.function.name);

    expect(toolNames).toContain("check_availability");
    expect(toolNames).toContain("book_appointment");
    expect(toolNames).toContain("escalate");
  });

  it("should handle missing optional fields gracefully", () => {
    const minimalClient: Client = {
      ...testClient,
      agent_greeting: undefined,
      agent_instructions: undefined,
    };

    const emptyKnowledge: Knowledge = {
      services: [],
      hours: {},
      faqs: [],
      booking_rules: {},
    };

    const assistant = buildAssistant(minimalClient, emptyKnowledge);

    expect(assistant).toBeDefined();
    expect(assistant.firstMessage).toBeDefined();
    expect(assistant.model.messages[0].content).toContain("appointment");
  });

  it("should use client's voice settings", () => {
    const customClient: Client = {
      ...testClient,
      voice_id: "alloy",
    };

    const assistant = buildAssistant(customClient, testKnowledge);

    expect(assistant.voice?.voiceId).toBe("alloy");
  });

  it("should set correct message filtering", () => {
    const assistant = buildAssistant(testClient, testKnowledge);

    expect(assistant.clientMessages).toBe("only_initial_and_tool_calls");
    expect((assistant.serverMessages as any).includes("tool_calls")).toBe(true);
    expect((assistant.serverMessages as any).includes("end_of_call_report")).toBe(true);
  });
});
