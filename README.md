# switchboard

An agentic call center for local-service businesses. One deploy serves many
clients; a client is resolved by the inbound Twilio number, so onboarding is
a database row plus a purchased number.

**Slice 1 (this repo, now): missed-call text-back.** A call the business does
not pick up becomes a text to the caller within seconds, with a booking link.
That is where the revenue leaks and it is the cheapest thing to fix.

Slices 2 and 3 — the Vapi voice agent that answers and books, and the
orchestrator that decides which calls need a human — are not built yet. The
schema already carries `business_knowledge`, `bookings` and `escalations` so
they land without a migration rewrite.

## How a call flows

```
caller dials the client's Twilio number
  → POST /api/voice/incoming     resolve client by To number, log the call,
                                 return TwiML <Dial> to the real business line
  → business answers?
      yes → POST /api/voice/status  log, stop
      no  → POST /api/voice/status  mark missed, claim the event for
                                    idempotency, send the text-back
  → caller replies
      → POST /api/sms/incoming     log, honour STOP, alert the owner
```

Quiet hours defer a text rather than drop it; `POST /api/cron/drain` sends
what was held.

## Setup

```bash
npm install
cp .env.example .env.local        # fill it in
npx supabase db push              # or apply supabase/migrations/0001_init.sql
npx tsx scripts/seed-client.ts --slug=acme-hvac --name="Acme HVAC" \
  --twilio=+1... --forward=+1... --booking=https://...
npm run dev
npx tsx scripts/simulate.ts --to=+1... --from=+1...
```

`scripts/simulate.ts` drives the whole flow with correctly signed payloads —
no real calls, no Twilio charges, no SMS.

## Two things that will bite you

**`sms_dry_run` defaults to `true`, per client and globally.** Nothing reaches
a real phone until you flip it. That is deliberate: US SMS needs A2P 10DLC
registration first, which takes days to weeks and can be rejected. See
`docs/PER-CLIENT-SETUP.md`.

**Every webhook verifies `X-Twilio-Signature`.** Without it, anyone who
discovers the URL can forge calls and messages and spend your client's
balance. The URL is rebuilt from `PUBLIC_BASE_URL`, not from request
headers, because headers are spoofable behind a proxy. If signature checks
start failing after a domain change, that env var is the first thing to look at.

## Docs

- `docs/ARCHITECTURE.md` — the design, and which parts came from the source
  video versus which were filled in
- `docs/PER-CLIENT-SETUP.md` — the runbook for onboarding a client
