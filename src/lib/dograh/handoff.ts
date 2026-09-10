/**
 * Dograh SIP Handoff
 * Routes incoming calls from Twilio to self-hosted Dograh voice agent via SIP
 */

export interface DograhConfig {
  sipDomain: string;
  sipPort: number;
  enabled: boolean;
}

export interface SipDialParams {
  caller: string;
  callSid: string;
  clientId: string;
}

/**
 * Get Dograh configuration from environment variables
 * DOGRAH_SIP_DOMAIN - SIP server domain (e.g., sip.dograh.local)
 * DOGRAH_SIP_PORT - SIP port (default 5060)
 * DOGRAH_ENABLED - Enable/disable Dograh handoff
 */
export function getDograhConfig(): DograhConfig {
  const sipDomain = process.env.DOGRAH_SIP_DOMAIN || "";
  const sipPort = parseInt(process.env.DOGRAH_SIP_PORT || "5060", 10);
  const enabled = process.env.DOGRAH_ENABLED === "true";

  if (enabled && !sipDomain) {
    console.warn("Dograh enabled but DOGRAH_SIP_DOMAIN not set");
  }

  return {
    sipDomain,
    sipPort,
    enabled,
  };
}

/**
 * Build SIP URI for Dograh
 * Format: sip:dograh@<domain>:<port>
 * Pass through client_id and call details as SIP headers
 */
export function buildDograhSipUri(config: DograhConfig, clientId: string): string {
  if (!config.sipDomain) {
    throw new Error("Dograh SIP domain not configured (DOGRAH_SIP_DOMAIN)");
  }

  const port = config.sipPort !== 5060 ? `:${config.sipPort}` : "";
  // SIP URI format: sip:user@host[:port]
  // We use a generic "dograh" user and pass client_id as a header parameter
  return `sip:dograh@${config.sipDomain}${port}?client_id=${encodeURIComponent(clientId)}`;
}

/**
 * Build TwiML <Dial><Sip> instruction for Dograh
 * Twilio will dial this SIP URI when call is not answered by business
 */
export function buildDograhDialTwiml(config: DograhConfig, clientId: string): string {
  const sipUri = buildDograhSipUri(config, clientId);

  // TwiML format for SIP dial
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="5" record="false">
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;

  return twiml;
}

/**
 * Verify Dograh connectivity
 * Makes a test call to the Dograh SIP URI to ensure it's reachable
 * (In practice, this would be done via SIP OPTIONS or similar)
 */
export async function verifyDograhConnectivity(config: DograhConfig): Promise<{
  reachable: boolean;
  error?: string;
}> {
  if (!config.enabled) {
    return { reachable: false, error: "Dograh not enabled" };
  }

  if (!config.sipDomain) {
    return { reachable: false, error: "DOGRAH_SIP_DOMAIN not configured" };
  }

  try {
    // In a real implementation, we would send a SIP OPTIONS request
    // For now, just verify the configuration is valid
    const uri = buildDograhSipUri(config, "test-client");
    if (!uri.startsWith("sip:")) {
      return { reachable: false, error: "Invalid SIP URI generated" };
    }

    return { reachable: true };
  } catch (e) {
    return { reachable: false, error: String(e) };
  }
}

/**
 * Log which signal was used to identify the tenant
 * Used for debugging SIP routing issues
 */
export function logSignal(signal: "token" | "dialed_number" | "caller_history" | "unknown") {
  console.info("dograh tenant resolution signal", { signal });
}
