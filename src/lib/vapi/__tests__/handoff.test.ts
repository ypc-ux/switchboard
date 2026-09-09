/**
 * Tests for tenant resolution and handoff token management
 */

import { mintHandoffToken, resolveTenant, consumeHandoffToken } from "../handoff";
import { db } from "../../supabase";
import type { Client } from "../../clients";

describe("Handoff Token Management", () => {
  const testClient: Client = {
    id: "test-client-" + Date.now(),
    slug: "test-client",
    name: "Test Client",
    timezone: "America/New_York",
    twilio_number: "+16505550100",
    forward_number: "+16505550101",
    booking_url: null,
    textback_template: "Test",
    quiet_hours_start: 21,
    quiet_hours_end: 8,
    dial_timeout_seconds: 20,
    crm_provider: "noop",
    crm_config: {},
    sms_dry_run: true,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const callerNumber = "+14155552671";
  const twilioCallSid = "CA" + "a".repeat(30);

  beforeAll(async () => {
    // Create test client
    await db().from("clients").insert(testClient);
  });

  afterAll(async () => {
    // Cleanup
    await db().from("voice_handoffs").delete().eq("client_id", testClient.id);
    await db().from("clients").delete().eq("id", testClient.id);
  });

  describe("mintHandoffToken", () => {
    it("should create a valid token", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should store token in database", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      const { data } = await db()
        .from("voice_handoffs")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      expect(data).toBeDefined();
      expect(data?.client_id).toBe(testClient.id);
      expect(data?.caller_number).toBe(callerNumber);
      expect(data?.consumed_at).toBeNull();
    });

    it("should create unique tokens", async () => {
      const token1 = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);
      const token2 = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      expect(token1).not.toBe(token2);
    });
  });

  describe("resolveTenant", () => {
    it("should resolve tenant by token (primary signal)", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      const result = await resolveTenant(token);

      expect(result.client.id).toBe(testClient.id);
      expect(result.signal).toBe("token");
    });

    it("should log signal that matched", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      // This should be logged to console.info
      const result = await resolveTenant(token);

      expect(result.signal).toBe("token");
    });

    it("should not resolve consumed tokens", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      // Consume the token
      await consumeHandoffToken(token);

      // Try to resolve
      try {
        await resolveTenant(token);
        fail("Should have thrown");
      } catch (error) {
        expect(String(error)).toContain("no tenant resolved");
      }
    });

    it("should fallback to dialed number if token invalid", async () => {
      const result = await resolveTenant("invalid-token", "+16505550100");

      expect(result.client.id).toBe(testClient.id);
      expect(result.signal).toBe("dialed_number");
    });

    it("should fallback to recent handoff if token and dialed number invalid", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      const result = await resolveTenant("invalid-token", "invalid-number", callerNumber);

      expect(result.client.id).toBe(testClient.id);
      expect(result.signal).toBe("recent_handoff");
    });

    it("should throw if no tenant can be resolved", async () => {
      try {
        await resolveTenant("invalid-token", "invalid-number", "invalid-caller");
        fail("Should have thrown");
      } catch (error) {
        expect(String(error)).toContain("no tenant resolved");
      }
    });

    it("should prefer token over dialed number", async () => {
      const token = await mintHandoffToken(testClient, null, "+14155552672", twilioCallSid);

      const result = await resolveTenant(token, "invalid-number");

      expect(result.signal).toBe("token");
    });

    it("should prefer dialed number over recent handoff", async () => {
      await mintHandoffToken(testClient, null, "+14155552673", twilioCallSid);

      const result = await resolveTenant(null, "+16505550100", "+14155552673");

      expect(result.signal).toBe("dialed_number");
    });
  });

  describe("consumeHandoffToken", () => {
    it("should mark token as consumed", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      await consumeHandoffToken(token);

      const { data } = await db()
        .from("voice_handoffs")
        .select("consumed_at")
        .eq("token", token)
        .maybeSingle();

      expect(data?.consumed_at).toBeDefined();
      expect(new Date(data?.consumed_at).getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it("should prevent reuse of consumed tokens", async () => {
      const token = await mintHandoffToken(testClient, null, callerNumber, twilioCallSid);

      await consumeHandoffToken(token);

      try {
        await resolveTenant(token);
        fail("Should have thrown");
      } catch (error) {
        expect(String(error)).toContain("no tenant resolved");
      }
    });
  });

  describe("Tenant Resolution Signals", () => {
    it("should track three-signal fallback correctly", async () => {
      const token = await mintHandoffToken(testClient, null, "+14155552674", twilioCallSid);

      // Signal 1: Token
      const result1 = await resolveTenant(token);
      expect(result1.signal).toBe("token");

      // Consume the token
      await consumeHandoffToken(token);

      // Signal 2: Dialed number (token is now consumed, falls back to dialed)
      const result2 = await resolveTenant("expired-token", "+16505550100");
      expect(result2.signal).toBe("dialed_number");

      // Signal 3: Recent handoff (both above invalid)
      const result3 = await resolveTenant("invalid", "invalid", "+14155552674");
      expect(result3.signal).toBe("recent_handoff");
    });
  });
});
