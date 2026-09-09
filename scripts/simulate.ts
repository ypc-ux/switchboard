/**
 * Drive the full flow locally with correctly signed Twilio payloads. No
 * real phone calls, no Twilio account activity, no SMS.
 *
 *   npx tsx scripts/simulate.ts --to=+14045550100 --from=+14045551234
 *
 * Checks, in order:
 *   1. answered call        → no text
 *   2. no-answer            → exactly one text
 *   3. same webhook replayed → still exactly one text  (the one that matters)
 *   4. tampered signature   → 403
 */
import twilio from "twilio";

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const v = hit?.split("=").slice(1).join("=") ?? fallback;
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

const BASE = arg("base", process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000");
const TOKEN = process.env["TWILIO_AUTH_TOKEN"];
if (!TOKEN) throw new Error("set TWILIO_AUTH_TOKEN (any value works locally, it just has to match the server)");

const to = arg("to");
const from = arg("from");

async function post(path: string, params: Record<string, string>, tamper = false) {
  const url = new URL(path, BASE).toString();
  const signature = twilio.getExpectedTwilioSignature(TOKEN!, url, params);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": tamper ? "deadbeef" : signature,
    },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

async function main() {
  const answeredSid = `CA${Date.now()}answered`;
  const missedSid = `CA${Date.now()}missed`;

  console.log("1. incoming call →", await post("/api/voice/incoming", { CallSid: answeredSid, From: from, To: to }));
  console.log("   answered      →", await post("/api/voice/status", { CallSid: answeredSid, From: from, To: to, DialCallStatus: "completed", DialCallDuration: "42" }));

  console.log("2. incoming call →", await post("/api/voice/incoming", { CallSid: missedSid, From: from, To: to }));
  const missedParams = { CallSid: missedSid, From: from, To: to, DialCallStatus: "no-answer" };
  console.log("   no-answer     →", await post("/api/voice/status", missedParams));

  console.log("3. replay        →", await post("/api/voice/status", missedParams), "(must not send a second text)");

  console.log("4. bad signature →", await post("/api/voice/status", missedParams, true), "(must be 403)");

  console.log("\nNow check the DB:");
  console.log("  select to_number, kind, status, dry_run from messages order by created_at desc limit 5;");
  console.log("  → expect exactly ONE textback row for", from);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
