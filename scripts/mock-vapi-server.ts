/**
 * Mock Vapi server that simulates webhook calls to test the voice agent system.
 * Run this in one terminal, then run simulate-voice.ts or make HTTP calls in another.
 *
 * Usage:
 *   npx tsx scripts/mock-vapi-server.ts
 *
 * Then in another terminal:
 *   curl -X POST http://localhost:3001/test/scenario?name=happy-path
 */

import http from "http";
import { randomUUID } from "crypto";

const PORT = 3001;
const API_BASE = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

interface Scenario {
  name: string;
  description: string;
  clientId: string;
  callerId: string;
  vapiCallId: string;
  token: string;
  run: (server: MockVapiServer) => Promise<void>;
}

class MockVapiServer {
  private server: http.Server | null = null;
  private callLog: Array<{ timestamp: Date; type: string; payload: any }> = [];

  async start() {
    return new Promise<void>((resolve) => {
      this.server = http.createServer(async (req, res) => {
        const method = req.method;
        const url = new URL(req.url || "", `http://localhost:${PORT}`);
        const path = url.pathname;

        console.log(`\n[${new Date().toISOString()}] ${method} ${path}`);

        if (method === "POST" && path === "/test/scenario") {
          const scenario = url.searchParams.get("name");
          await this.handleScenarioRequest(scenario, res);
        } else if (method === "GET" && path === "/log") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(this.callLog, null, 2));
        } else if (method === "GET" && path === "/scenarios") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(scenarios.map((s) => ({ name: s.name, description: s.description }))));
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });

      this.server.listen(PORT, () => {
        console.log(`\n🎙️  Mock Vapi Server listening on port ${PORT}`);
        console.log(`📋 View scenarios: curl http://localhost:${PORT}/scenarios`);
        console.log(`📊 View call log: curl http://localhost:${PORT}/log\n`);
        resolve();
      });
    });
  }

  private async handleScenarioRequest(name: string | null, res: http.ServerResponse) {
    const scenario = scenarios.find((s) => s.name === name);

    if (!scenario) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Scenario not found" }));
      return;
    }

    console.log(`Running scenario: ${scenario.name}`);
    console.log(`Description: ${scenario.description}\n`);

    try {
      await scenario.run(this);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, scenario: scenario.name }));
    } catch (error) {
      console.error("Scenario failed:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  async makeRequest(endpoint: string, method: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, API_BASE);
      const options = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          this.logCall(method, endpoint, body);
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  private logCall(method: string, endpoint: string, payload: any) {
    this.callLog.push({
      timestamp: new Date(),
      type: endpoint,
      payload,
    });
  }

  stop() {
    this.server?.close();
  }
}

const scenarios: Scenario[] = [
  {
    name: "happy-path",
    description: "Agent books a haircut for caller",
    clientId: "8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a",
    callerId: "+14155552671",
    vapiCallId: "call_" + randomUUID(),
    token: "token_" + randomUUID(),
    run: async (server) => {
      const scenario = scenarios[0];
      console.log("Step 1: Assistant request\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "assistant-request",
          assistantRequest: {
            name: "test-assistant",
            token: scenario.token,
          },
        },
      });

      await delay(500);

      console.log("\nStep 2: Agent checks availability\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: "call_" + randomUUID(),
                type: "function",
                function: {
                  name: "check_availability",
                  arguments: JSON.stringify({
                    service_name: "Haircut",
                    preferred_date: "2026-09-10",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 3: Agent books appointment\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: "call_" + randomUUID(),
                type: "function",
                function: {
                  name: "book_appointment",
                  arguments: JSON.stringify({
                    service_name: "Haircut",
                    start_time: "2026-09-10T14:00:00Z",
                    contact_name: "John Doe",
                    contact_phone: "+14155552671",
                    notes: "First time customer",
                    requested_window: "Thursday afternoon",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 4: Call ends\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "end-of-call-report",
          endOfCallReport: {
            vapiCallId: scenario.vapiCallId,
            summary: "Successfully booked a haircut appointment",
            transcript:
              "Agent: Hi, welcome to our salon. Contact: I'd like to book a haircut. Agent: Sure! We have openings Thursday afternoon. Contact: Perfect, Thursday at 2pm works for me.",
            cost: 0.42,
            duration: 85,
          },
        },
      });

      console.log("✅ Happy path scenario complete\n");
    },
  },

  {
    name: "escalation",
    description: "Caller needs human, agent escalates",
    clientId: "8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a",
    callerId: "+14155552672",
    vapiCallId: "call_" + randomUUID(),
    token: "token_" + randomUUID(),
    run: async (server) => {
      const scenario = scenarios[1];

      console.log("Step 1: Assistant request\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "assistant-request",
          assistantRequest: {
            name: "test-assistant",
            token: scenario.token,
          },
        },
      });

      await delay(500);

      console.log("\nStep 2: Agent escalates (caller has complex request)\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: "call_" + randomUUID(),
                type: "function",
                function: {
                  name: "escalate",
                  arguments: JSON.stringify({
                    reason: "Caller needs custom package consultation",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 3: Call ends (no booking made)\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "end-of-call-report",
          endOfCallReport: {
            vapiCallId: scenario.vapiCallId,
            summary: "Call escalated to human representative",
            transcript:
              "Agent: I can help book standard services. For custom packages, let me connect you with our manager. Contact: That would be great, thanks!",
            cost: 0.28,
            duration: 45,
          },
        },
      });

      console.log("✅ Escalation scenario complete\n");
    },
  },

  {
    name: "retry-safety",
    description: "Vapi retries tool-calls, only books once",
    clientId: "8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a",
    callerId: "+14155552673",
    vapiCallId: "call_" + randomUUID(),
    token: "token_" + randomUUID(),
    run: async (server) => {
      const scenario = scenarios[2];

      console.log("Step 1: Assistant request\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "assistant-request",
          assistantRequest: {
            name: "test-assistant",
            token: scenario.token,
          },
        },
      });

      await delay(500);

      console.log("\nStep 2: First booking attempt\n");
      const toolCallId = "call_" + randomUUID();
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: toolCallId,
                type: "function",
                function: {
                  name: "book_appointment",
                  arguments: JSON.stringify({
                    service_name: "Consultation",
                    start_time: "2026-09-11T10:00:00Z",
                    contact_name: "Jane Smith",
                    contact_phone: "+14155552673",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 3: Vapi retries (network hiccup)\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: toolCallId, // Same tool call ID = retry
                type: "function",
                function: {
                  name: "book_appointment",
                  arguments: JSON.stringify({
                    service_name: "Consultation",
                    start_time: "2026-09-11T10:00:00Z",
                    contact_name: "Jane Smith",
                    contact_phone: "+14155552673",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 4: Call ends\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "end-of-call-report",
          endOfCallReport: {
            vapiCallId: scenario.vapiCallId,
            summary: "Booked consultation (idempotent test)",
            transcript: "...",
            cost: 0.35,
            duration: 60,
          },
        },
      });

      console.log("✅ Retry safety scenario complete (check DB: only 1 booking)\n");
    },
  },

  {
    name: "no-answer-then-agent",
    description: "Caller rings business (no answer), agent picks up",
    clientId: "8a8a8a8a-8a8a-8a8a-8a8a-8a8a8a8a8a8a",
    callerId: "+14155552674",
    vapiCallId: "call_" + randomUUID(),
    token: "token_" + randomUUID(),
    run: async (server) => {
      console.log("Step 1: Simulating Twilio call flow\n");
      console.log("  Caller dials Twilio number");
      console.log("  TwiML dials business (no answer)");
      console.log("  Status webhook triggers (DialCallStatus)");
      console.log("  System mints handoff token\n");

      const scenario = scenarios[3];

      console.log("Step 2: Vapi receives SIP URI with token\n");
      console.log(`  sip://sip.vapi.ai?token=${scenario.token}\n`);

      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "assistant-request",
          assistantRequest: {
            name: "test-assistant",
            token: scenario.token,
          },
        },
      });

      await delay(500);

      console.log("\nStep 3: Agent greets caller\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: "call_" + randomUUID(),
                type: "function",
                function: {
                  name: "check_availability",
                  arguments: JSON.stringify({
                    service_name: "Haircut",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 4: Booking made\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "tool-calls",
          toolCalls: {
            toolCallList: [
              {
                id: "call_" + randomUUID(),
                type: "function",
                function: {
                  name: "book_appointment",
                  arguments: JSON.stringify({
                    service_name: "Haircut",
                    start_time: "2026-09-12T15:30:00Z",
                    contact_name: "Alice",
                    contact_phone: "+14155552674",
                  }),
                },
              },
            ],
          },
        },
      });

      await delay(500);

      console.log("\nStep 5: End of call\n");
      await server.makeRequest("/api/vapi", "POST", {
        message: {
          type: "end-of-call-report",
          endOfCallReport: {
            vapiCallId: scenario.vapiCallId,
            summary: "Haircut booked, caller satisfied",
            transcript: "...",
            cost: 0.38,
            duration: 75,
          },
        },
      });

      console.log("✅ No-answer scenario complete\n");
    },
  },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start server
const server = new MockVapiServer();
server.start().catch(console.error);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.stop();
  process.exit(0);
});
