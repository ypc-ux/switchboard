import type { Vapi } from "@vapi-ai/server-sdk";

export const checkAvailabilityTool: Vapi.CreateFunctionToolDto = {
  async: false,
  function: {
    name: "check_availability",
    description:
      "Check available appointment slots for a specific service. Returns a list of open times the caller can choose from.",
    parameters: {
      type: "object" as const,
      properties: {
        service_name: {
          type: "string",
          description: "Name of the service to book (e.g., 'Consultation', 'Haircut')",
        },
        preferred_date: {
          type: "string",
          description: "Caller's preferred date in YYYY-MM-DD format, or null to see next available",
        },
      },
      required: ["service_name"],
    },
  },
  server: {
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/vapi/tools/check-availability`,
  },
};

export const bookAppointmentTool: Vapi.CreateFunctionToolDto = {
  async: false,
  function: {
    name: "book_appointment",
    description:
      "Book an appointment at a specific time for the caller. Call this after they've confirmed a time.",
    parameters: {
      type: "object" as const,
      properties: {
        service_name: {
          type: "string",
          description: "Name of the service being booked",
        },
        start_time: {
          type: "string",
          description: "ISO 8601 format (e.g., '2026-09-15T14:00:00Z')",
        },
        contact_name: {
          type: "string",
          description: "Caller's name",
        },
        contact_phone: {
          type: "string",
          description: "Caller's phone number",
        },
        notes: {
          type: "string",
          description: "Any special requests or notes from the caller",
        },
        requested_window: {
          type: "string",
          description: "Caller's stated preference in their own words",
        },
      },
      required: ["service_name", "start_time", "contact_name", "contact_phone"],
    },
  },
  server: {
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/vapi/tools/book-appointment`,
  },
};

export const escalateTool: Vapi.CreateFunctionToolDto = {
  async: false,
  function: {
    name: "escalate",
    description:
      "Escalate the call to a human representative if you cannot help or the caller requests to speak with someone.",
    parameters: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for escalation",
        },
      },
      required: ["reason"],
    },
  },
  server: {
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/vapi/tools/escalate`,
  },
};
