# Voice Agent (Slice 2)

## Architecture

Slice 2 adds a voice agent that answers calls when the business doesn't. The call flow:

1. Caller dials the business's Twilio number
2. `/api/voice/incoming` dials the actual business
3. If the business doesn't answer, `/api/voice/status` gets a `DialCallStatus` of `no-answer`, `busy`, or `failed`
4. If `voice_agent_enabled` is true:
   - Mint a single-use handoff token
   - Return TwiML `<Dial><Sip>` URI pointing to Vapi
   - **Text-back is deferred** (see below)
5. If the agent connects:
   - Vapi calls `/api/vapi` with `assistant-request`
   - We resolve the tenant and return a transient `CreateAssistantDto`
   - Vapi calls tool endpoints for `check_availability`, `book_appointment`, `escalate`
   - Vapi calls `/api/vapi` with `end-of-call-report` (transcript, summary, cost)
   - We decide: if a booking was made, send confirmation text; otherwise send the missed-call text-back

**Why text-back is deferred:** Texting "sorry we missed you" to someone who just booked an appointment is a bug. The decision moves to `end-of-call-report` where we know the outcome.

**Why voice handoffs can fail silently:** SIP can time out or Vapi can be down. Any handoff older than `client.agent_max_seconds` with no report is an orphan. The `/api/cron/drain` sweep catches these and sends the text-back they missed.

## Tenant Resolution

The handoff token is embedded in the SIP URI: `sip://sip.vapi.ai?token=<token>`. On `assistant-request`, we try three signals in order to identify the client:

1. **Token** (primary): Most reliable once verified
2. **Dialed number** (fallback): The Twilio number the caller dialed
3. **Recent handoff** (last resort): Caller's most recent unconsumed handoff

Each signal is logged. Once a real Vapi account exists, the dead paths can be deleted. The three-signal design means we can launch without confirming the SIP URI form, verify it in production logs, then simplify.

## Unconfirmed: SIP URI Format

The exact SIP URI form to reach Vapi from Twilio is **not verified** against a live account. This is stored in `clients.vapi_sip_domain` (default: `sip.vapi.ai`) and passed to the tenant resolution token. When the SIP auth, URI scheme, or query-string format differs from what's implemented, update the column and logs will show what round-trips.

## Database Schema

**New columns on `clients`:**

- `voice_agent_enabled`: Boolean; default false. Toggles agent handoff.
- `vapi_sip_domain`: The SIP endpoint URI. Default: `sip.vapi.ai`.
- `voice_provider`: Will be "vapi" for now.
- `voice_id`: OpenAI voice ID (e.g., "echo"). Default: "echo".
- `agent_greeting`: Greeting the agent speaks. Default: null.
- `agent_instructions`: Extra instructions for tuning the agent. Default: null.
- `agent_max_seconds`: How long the agent may hold the line before we give up and text. Default: 300 (5 min). Min: 30, Max: 1800.

**New columns on `calls`:**

- `vapi_call_id`: The Vapi call ID (populated by end-of-call-report).
- `answered_by`: `'none'` (slice 1 text-back), `'human'` (business picked up), or `'agent'` (Vapi handled).
- `agent_ended_reason`: The `endedReason` from Vapi's report.
- `transcript`: Full call transcript.
- `summary`: AI summary of the call.
- `agent_cost`: Cost charged by Vapi (in dollars).

**New table `voice_handoffs`:**

Bridges Twilio and Vapi calls (they have different leg IDs):

- `id`: UUID primary key.
- `token`: Single-use UUID, unique. Embedded in SIP URI.
- `client_id`: Which business.
- `call_id`: The Twilio call (nullable; may be set later).
- `caller_number`: The inbound caller's number.
- `twilio_call_sid`: The Twilio call SID.
- `created_at`: When minted.
- `consumed_at`: When used by assistant-request (idempotency marker).
- `expires_at`: 15 minutes. Old orphans are eligible for the drain sweep.

**Enhanced `bookings`:**

- `requested_window`: Caller's stated preference in their own words (free-text).
- `notes`: Any special requests.
- `contact_name`: Caller's name.
- `contact_phone`: Caller's phone (for follow-up).

**Row-level security (RLS):** Enabled on `voice_handoffs`. Same policy as `calls` and `bookings`.

## Vapi Dashboard Setup

When you have a Vapi account:

1. Create a new **Phone Number** in the Vapi dashboard pointing to your deployment.
2. Set the webhook URL to `https://your-app/api/vapi`.
3. Add API credentials to environment:
   - No per-call credentials needed (we build the assistant; Vapi runs it).
   - The Vapi account is org-scoped (one per deployment).
4. Test the SIP URI format against your Twilio instance and update `clients.vapi_sip_domain` if needed.
5. Enable `voice_agent_enabled` for test clients and verify logs show tenant resolution working.

## Custom Tools

Three tools are defined in `src/lib/vapi/tools.ts`:

- **`check_availability(service_name, preferred_date?)`**: Returns up to 5 available slots. Called when the agent needs to show options.
- **`book_appointment(service_name, start_time, contact_name, contact_phone, notes?, requested_window?)`**: Writes a `bookings` row. The agent calls this after the caller confirms a time.
- **`escalate(reason?)`**: Signals the agent to hand off to a human (not yet implemented; the call ends).

All three call back to `/api/vapi/tools/*` endpoints (to be implemented; the webhook inlines them for now).

## Verification Checklist

- `npx tsc --noEmit` is clean.
- `npm run verify` passes (existing 17 assertions).
- Migration `0002_voice_agent.sql` applied: `npx supabase-cli apply_migration`.
- `list_tables` shows `voice_handoffs` and new columns on `clients`, `calls`, `bookings`.
- `scripts/simulate-voice.ts` passes: seeding, building assistant, booking idempotency, end-of-call processing.
- A `voice_agent_enabled = false` client is bit-for-bit slice-1 behaviour (no regression).
- Logs show tenant resolution (one of: token → dialed number → recent handoff).
- Security: `get_advisors` returns only expected `rls_enabled_no_policy` notices.
- Commit and push to main.

## Not Doing (Slice 2b/3)

- **Google Calendar**: Deferred to slice 2b. Calendar sync requires per-client OAuth, which the org-scoped Vapi credential architecture doesn't support. Custom function tools keep the design simple for Supabase-only bookings.
- **Agent-first answering**: Julius chose business-first. The agent only runs as a fallback.
- **Orchestrator (slice 3)**: Multi-leg call coordination is separate.

## Live SMS Status

`sms_dry_run` remains `true`. All texts are logged but not sent to Twilio. When ready, flip the flag per-client or globally.

## Logs

Key log lines to monitor:

- `"tenant resolved"` — shows which signal matched (token / dialed_number / recent_handoff).
- `"handoff to vapi"` — token minted; SIP URI being dialed.
- `"duplicate assistant-request ignored"` — Vapi retried; we no-opped.
- `"end-of-call-report processed"` — call ended; decision made (booking made? text sent?).
- `"orphaned handoff text-back sent"` — drain sweep caught a missed call.

## Implementation Notes

- **Transient assistants:** One Vapi phone number config serves all clients. The assistant is built per-call from `business_knowledge`, not pre-created. This keeps setup simple.
- **Idempotency:** Every Vapi message (assistant-request, tool-calls, end-of-call-report) is deduplicated via `webhook_events` (existing mechanism). Tool calls use the same table to prevent double-booking on Vapi retries.
- **Timezones:** All slot generation is in the client's local timezone (via `src/lib/time.ts`). Stored times are always UTC.
- **No pre-created assistants:** Avoids per-client config in Vapi dashboard. The server builds and returns them.
