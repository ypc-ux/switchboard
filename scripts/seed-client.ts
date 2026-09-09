/**
 * Add a client. This is the whole onboarding step on our side — the rest
 * is buying a number and pointing its webhooks (see docs/PER-CLIENT-SETUP.md).
 *
 *   npx tsx scripts/seed-client.ts \
 *     --slug=acme-hvac --name="Acme HVAC" \
 *     --twilio=+14045550100 --forward=+14045550199 \
 *     --booking=https://acme.example.com/book --tz=America/New_York
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function required(name: string): string {
  const v = arg(name);
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

async function main() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("clients")
    .upsert(
      {
        slug: required("slug"),
        name: required("name"),
        twilio_number: required("twilio"),
        forward_number: required("forward"),
        owner_alert_number: arg("alert") ?? null,
        booking_url: arg("booking") ?? null,
        timezone: arg("tz") ?? "America/New_York",
        // Stays true until A2P 10DLC clears for this client.
        sms_dry_run: arg("live") !== "true",
        crm_provider: arg("crm") ?? "supabase",
      },
      { onConflict: "slug" },
    )
    .select("id, slug, sms_dry_run")
    .single();

  if (error) throw new Error(error.message);
  const client = data as { id: string; slug: string; sms_dry_run: boolean };

  await db.from("business_knowledge").upsert(
    {
      client_id: client.id,
      services: [],
      hours: {},
      prices: {},
      faqs: [],
      booking_rules: {},
    },
    { onConflict: "client_id" },
  );

  console.log(`seeded ${client.slug} (${client.id})`);
  console.log(
    client.sms_dry_run
      ? "sms_dry_run=TRUE — messages will be recorded, not sent. Flip with --live=true once 10DLC clears."
      : "sms_dry_run=FALSE — this client sends live SMS.",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
