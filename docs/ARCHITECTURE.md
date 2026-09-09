# Architecture

## Where this design came from

The shape follows a short video Julius supplied a transcript of. Being precise
about what that source did and did not provide, because it matters for how
much of this is load-bearing versus invented:

**From the source, and kept:**
- Stack: Twilio (telephony), Vapi (voice agent), Google Calendar (booking),
  HubSpot (CRM)
- Missed-call text-back as *the first* module, not the last — "this is where
  the money leaks"
- Voice answering that reads the business (services, prices, hours) rather
  than a script, and books while the caller is still on the line
- Many agents over **one shared state store they all read and write**, plus
  real tool access. That distinction — a bot that talks versus an agent that
  books — is the correct one and it drives the schema.
- **One orchestrator that answers no calls** and only decides what needs the
  human. Supervised, not autonomous.

**Not from the source, because it wasn't there:**
- The source claims "a dozen platforms" and names four; it claims "seven
  agents" and names none. Seven is a marketing number. The agent roles here
  are derived from what the call flow actually needs.
- No prompts, schema, webhook flow, escalation criteria or code appeared in
  it. It is a ~90-second lead-magnet reel ending in a comment gate. The shape
  is sound; roughly 90% of the build was not in there.

**One correction to the framing:** Vapi already owns the voice loop —
speech-to-text, LLM, text-to-speech, interruption and barge-in, function
calls, warm transfer. Much of what "seven agents" implies is Vapi's job.
Re-implementing it would be work for no gain.

## Multi-tenancy

The inbound Twilio number is the tenant key (`clients.twilio_number`). One
deploy, many clients. Onboarding is a row plus a number.

An isolated per-client deploy is the same repo with one row in its own
project, so a client who demands data isolation gets it without a fork.

## The shared store

`business_knowledge` holds services, hours, prices, faqs and booking rules as
jsonb — the "one shared brain." Slice 1 barely touches it. It exists now
because the voice agent is the thing that reads it, and adding it after calls
are already flowing is strictly worse than carrying an empty table.

`escalations` is the orchestrator's output: the queue of what needs a human.
Slice 1 writes to it from two places — an inbound SMS reply (no conversational
agent yet, so a person decides) and a failed text-back (a lost lead should be
visible, not buried in logs).

## Two invariants

**Idempotency.** Twilio retries webhooks on non-2xx and on timeout. Without a
ledger, a retried status callback texts the same caller twice. `webhook_events`
has a unique constraint on `(provider, resource_sid, event_type)`; the insert
is the claim. Only the first caller through sends.

**Signature verification.** Every webhook validates `X-Twilio-Signature`
before touching the database. The URL is rebuilt from `PUBLIC_BASE_URL`
because `Host` and `X-Forwarded-*` are attacker-controlled behind a proxy.

## Send ordering

`sendTextback` applies three gates, in this order, and the order is the point:

1. **Opt-out** — absolute. STOP means stop, and it is re-checked at drain time
   in case the caller opted out while a message was deferred.
2. **Quiet hours** — defer, never drop. Evaluated in the *client's* timezone,
   stepped forward in 30-minute increments so DST needs no special case.
3. **Dry run** — record the message so it is auditable, but never hand it to
   Twilio. On by default.

## Access model

RLS is enabled on every table with **no permissive policies**. That denies
anon and authenticated outright; the service role bypasses RLS and is the only
way in. When a client-facing dashboard arrives, add explicit per-client
policies then — do not loosen these.

## Not built yet

- **Slice 2** — Vapi voice agent: answers, reads `business_knowledge`, books
  into Google Calendar via a tool call, writes to `bookings`.
- **Slice 3** — the orchestrator: classifies calls and replies, decides what
  escalates, and drains `escalations` to the owner.
- HubSpot is written against the documented v3 API but **unverified against a
  live portal**. Association type ids are portal-specific; expect to adjust on
  first real run.
