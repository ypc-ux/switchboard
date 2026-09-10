/**
 * Dograh Handoff Tests
 * Verify SIP URI generation, TwiML creation, and connectivity checks
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  getDograhConfig,
  buildDograhSipUri,
  buildDograhDialTwiml,
  verifyDograhConnectivity,
} from "../handoff";

describe("Dograh Handoff", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Save original env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe("getDograhConfig", () => {
    it("should return default config when env vars not set", () => {
      delete process.env.DOGRAH_SIP_DOMAIN;
      delete process.env.DOGRAH_SIP_PORT;
      delete process.env.DOGRAH_ENABLED;

      const config = getDograhConfig();

      expect(config.sipDomain).toBe("");
      expect(config.sipPort).toBe(5060);
      expect(config.enabled).toBe(false);
    });

    it("should read SIP domain from env", () => {
      process.env.DOGRAH_SIP_DOMAIN = "sip.dograh.local";
      process.env.DOGRAH_ENABLED = "true";

      const config = getDograhConfig();

      expect(config.sipDomain).toBe("sip.dograh.local");
      expect(config.enabled).toBe(true);
    });

    it("should read custom SIP port from env", () => {
      process.env.DOGRAH_SIP_PORT = "5062";
      process.env.DOGRAH_SIP_DOMAIN = "sip.dograh.local";

      const config = getDograhConfig();

      expect(config.sipPort).toBe(5062);
    });

    it("should default to port 5060 if invalid", () => {
      process.env.DOGRAH_SIP_PORT = "not-a-number";
      process.env.DOGRAH_SIP_DOMAIN = "sip.dograh.local";

      const config = getDograhConfig();

      expect(config.sipPort).toBe(5060);
    });
  });

  describe("buildDograhSipUri", () => {
    it("should throw if domain not configured", () => {
      const config = { sipDomain: "", sipPort: 5060, enabled: true };

      expect(() => buildDograhSipUri(config, "test-client")).toThrow(
        "Dograh SIP domain not configured"
      );
    });

    it("should build SIP URI with default port 5060", () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5060, enabled: true };

      const uri = buildDograhSipUri(config, "client-123");

      expect(uri).toBe("sip:dograh@sip.dograh.local?client_id=client-123");
    });

    it("should build SIP URI with custom port", () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5062, enabled: true };

      const uri = buildDograhSipUri(config, "client-456");

      expect(uri).toBe("sip:dograh@sip.dograh.local:5062?client_id=client-456");
    });

    it("should URL-encode client_id in SIP URI", () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5060, enabled: true };

      const uri = buildDograhSipUri(config, "client/with-special@chars");

      expect(uri).toContain("client_id=client%2Fwith-special%40chars");
    });
  });

  describe("buildDograhDialTwiml", () => {
    it("should generate valid TwiML with SIP dial", () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5060, enabled: true };

      const twiml = buildDograhDialTwiml(config, "client-789");

      expect(twiml).toContain("<?xml version");
      expect(twiml).toContain("<Response>");
      expect(twiml).toContain("<Dial");
      expect(twiml).toContain("<Sip>");
      expect(twiml).toContain("sip:dograh@sip.dograh.local");
      expect(twiml).toContain("client-789");
      expect(twiml).toContain("</Sip>");
      expect(twiml).toContain("</Dial>");
      expect(twiml).toContain("</Response>");
    });

    it("should include timeout and record attributes", () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5060, enabled: true };

      const twiml = buildDograhDialTwiml(config, "client-789");

      expect(twiml).toContain('timeout="5"');
      expect(twiml).toContain('record="false"');
    });
  });

  describe("verifyDograhConnectivity", () => {
    it("should return unreachable if Dograh not enabled", async () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5060, enabled: false };

      const result = await verifyDograhConnectivity(config);

      expect(result.reachable).toBe(false);
      expect(result.error).toBe("Dograh not enabled");
    });

    it("should return unreachable if SIP domain not configured", async () => {
      const config = { sipDomain: "", sipPort: 5060, enabled: true };

      const result = await verifyDograhConnectivity(config);

      expect(result.reachable).toBe(false);
      expect(result.error).toBe("DOGRAH_SIP_DOMAIN not configured");
    });

    it("should return reachable if config is valid", async () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5060, enabled: true };

      const result = await verifyDograhConnectivity(config);

      expect(result.reachable).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should validate generated SIP URI", async () => {
      const config = { sipDomain: "sip.dograh.local", sipPort: 5062, enabled: true };

      const result = await verifyDograhConnectivity(config);

      expect(result.reachable).toBe(true);
    });
  });

  describe("Integration: environment to TwiML", () => {
    it("should flow from env vars to TwiML correctly", () => {
      process.env.DOGRAH_SIP_DOMAIN = "sip.dograh.example.com";
      process.env.DOGRAH_SIP_PORT = "5061";
      process.env.DOGRAH_ENABLED = "true";

      const config = getDograhConfig();
      const twiml = buildDograhDialTwiml(config, "integration-test-client");

      expect(twiml).toContain("sip:dograh@sip.dograh.example.com:5061");
      expect(twiml).toContain("integration-test-client");
    });

    it("should handle missing env vars gracefully", () => {
      delete process.env.DOGRAH_SIP_DOMAIN;
      delete process.env.DOGRAH_ENABLED;

      const config = getDograhConfig();

      expect(config.enabled).toBe(false);
      expect(config.sipDomain).toBe("");

      // Should not throw when building TwiML but config is disabled
      expect(() => buildDograhDialTwiml(config, "test")).toThrow();
    });
  });
});
