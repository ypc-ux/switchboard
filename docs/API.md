# Voice Agent API Documentation

Complete reference for the Vapi voice agent system endpoints.

## Overview

The voice agent system exposes three main endpoints:

- **`/api/voice/incoming`** - Handles inbound Twilio calls
- **`/api/voice/status`** - Receives call status updates and routes to voice agent
- **`/api/vapi`** - Receives Vapi webhook events

## 1. Inbound Call Handler

### `POST /api/voice/incoming`

Handles inbound calls from Twilio. Returns TwiML to dial the business.

#### Request (Twilio Form Data)

```
CallSid: CA-EXAMPLE-1234567890abcdef123456
Caller: +14155552671
Digits: 
AccountSid: AC-EXAMPLE-1234567890abcdef123456
CallStatus: ringing
Direction: inbound
```

#### Response (TwiML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20">
    <Number>+16505550101</Number>
  </Dial>
</Response>
```

#### Behavior

1. Records call in `calls` table with `dial_status = 'initiated'`
2. Dials the business number using `client.forward_number`
3. Returns immediately; status updates come to `/api/voice/status`

#### Error Handling

- If client not found: Returns error TwiML
- If database error: Returns generic error, logs for retry

---

## 2. Call Status Webhook

### `POST /api/voice/status`

Receives call status updates from Twilio when the dialed business doesn't answer.

#### Request (Twilio Form Data)

```
CallSid: EXAMPLE-CALL-SID-NOT-REAL
Caller: +14155552671
DialCallStatus: no-answer     # "completed", "no-answer", "busy", "failed"
AccountSid: EXAMPLE-ACCOUNT-ID-NOT-REAL
CallStatus: in-progress
```

#### Response

```json
{
  "success": true,
  "action": "voice_agent_enabled" | "text_back_queued"
}
```

#### Behavior

**If `voice_agent_enabled = false`:**
- Queue a missed-call text-back immediately
- Return `"action": "text_back_queued"`

**If `voice_agent_enabled = true`:**
- Mint a single-use handoff token
- Return TwiML `<Dial><Sip>` to Vapi with token in URI
- Do NOT queue text-back yet (deferred to `end-of-call-report`)

#### Example: Voice Agent Path

```xml
<Response>
  <Dial timeout="300">
    <Sip>sip://sip.vapi.ai?token=f47ac10b-58cc-4372-a567-0e02b2c3d479</Sip>
  </Dial>
</Response>
```

#### Database Changes

- Updates `calls` row: `dial_status = 'no-answer'` | `'busy'` | `'failed'`
- Inserts `voice_handoffs` row with `token`, `client_id`, `caller_number`, `twilio_call_sid`

#### Error Handling

- If client not found: Sends text-back as fallback
- If token mint fails: Logs error, sends text-back as fallback
- If database unavailable: Returns 500, Twilio retries

---

## 3. Vapi Webhook

### `POST /api/vapi`

Receives all Vapi webhook events. Single endpoint handles three message types.

#### Authentication

No explicit auth; Vapi calls your `/api/vapi` URL. Consider adding signature validation in production.

#### Request Body Structure

```json
{
  "message": {
    "type": "assistant-request" | "tool-calls" | "end-of-call-report",
    "assistantRequest": { ... },
    "toolCalls": { ... },
    "endOfCallReport": { ... }
  }
}
```

---

### 3.1 Assistant Request

**Message Type:** `assistant-request`

Called by Vapi when a caller reaches the agent. Returns transient assistant configuration.

#### Request

```json
{
  "message": {
    "type": "assistant-request",
    "assistantRequest": {
      "name": "Vapi Assistant",
      "token": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    }
  }
}
```

#### Response

```json
{
  "assistant": {
    "name": "Assistant for Demo Salon",
    "firstMessage": "Hi there! Welcome to Demo Salon. How can I help you today?",
    "model": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "messages": [
        {
          "role": "system",
          "content": "You are a professional appointment booking assistant for Demo Salon...",
          ...
        }
      ]
    },
    "voice": {
      "provider": "openai",
      "voiceId": "echo"
    },
    "tools": [
      { "function": { "name": "check_availability", ... } },
      { "function": { "name": "book_appointment", ... } },
      { "function": { "name": "escalate", ... } }
    ],
    "clientMessages": "only_initial_and_tool_calls",
    "serverMessages": ["tool_calls", "end_of_call_report"]
  }
}
```

#### Behavior

1. **Tenant Resolution** (three-signal priority):
   - Token from SIP URI (primary) → looks up in `voice_handoffs`
   - Dialed number (fallback 1) → looks up in `clients.twilio_number`
   - Caller's recent handoff (fallback 2) → most recent row with `consumed_at = null`
   - Throws if none found

2. **Load Business Knowledge**:
   - SELECT from `business_knowledge` for resolved client
   - Fetch services, hours, FAQs, booking rules

3. **Build Assistant**:
   - Compose system prompt from services, hours, FAQs, agent instructions
   - Include first message from `client.agent_greeting`
   - Attach three function tools
   - Set correct message filtering

4. **Log Tenant Resolution Signal**:
   - Console logs which signal matched (token / dialed_number / recent_handoff)
   - Used to identify dead paths in production

#### Idempotency

- Calls `claimEvent` to detect duplicate requests
- Returns same assistant if already processed

---

### 3.2 Tool Calls

**Message Type:** `tool-calls`

Called by Vapi when the assistant uses a function tool.

#### Request

```json
{
  "message": {
    "type": "tool-calls",
    "toolCalls": {
      "toolCallList": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "check_availability",
            "arguments": "{\"service_name\": \"Haircut\", \"preferred_date\": \"2026-09-10\"}"
          }
        }
      ]
    }
  }
}
```

#### Response (by Tool)

**check_availability:**
```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": {
        "slots": [
          {
            "start": "2026-09-10T14:00:00Z",
            "end": "2026-09-10T15:00:00Z",
            "label": "Thursday, September 10, 2:00 PM"
          },
          ...
        ]
      }
    }
  ]
}
```

**book_appointment:**
```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": {
        "success": true,
        "message": "Haircut confirmed for Thursday at 2:00 PM"
      }
    }
  ]
}
```

**escalate:**
```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": {
        "escalated": true,
        "message": "Connecting you with a representative..."
      }
    }
  ]
}
```

#### Behavior per Tool

**`check_availability(service_name, preferred_date?)`**
1. Load business knowledge for the client
2. Call `availableSlots()` with:
   - Client timezone
   - Business hours
   - Booking rules (lead time, buffer, max per day)
   - Service duration
3. Return up to 5 closest slots

**`book_appointment(service_name, start_time, contact_name, contact_phone, notes?, requested_window?)`**
1. Validate appointment is still available
2. Upsert contact in `contacts` table
3. Insert booking in `bookings` table with:
   - `source = 'voice_agent'`
   - `starts_at = start_time`
   - `ends_at = start_time + service_duration`
   - `requested_window`, `notes`, `contact_name`, `contact_phone`
4. Idempotent via `claimEvent` (prevents double-booking on retry)

**`escalate(reason?)`**
1. Return escalation signal
2. Vapi routes call to human or voicemail

#### Idempotency

- Calls `claimEvent(provider='vapi', resource_sid=call_id, event_type='tool_calls')`
- If already claimed: Returns 200 but skips tool logic
- Prevents double-booking on Vapi retry

#### Error Handling

- If tool fails: Returns error in result
- If database unavailable: Returns error, Vapi retries
- If slot no longer available: Returns error, prompts agent to re-check

---

### 3.3 End of Call Report

**Message Type:** `end-of-call-report`

Called by Vapi after the call ends. Stores call transcript, summary, cost.

#### Request

```json
{
  "message": {
    "type": "end-of-call-report",
    "endOfCallReport": {
      "vapiCallId": "c12345-67890",
      "summary": "Successfully booked a haircut appointment",
      "transcript": "Agent: Hi, how can I help? Caller: I'd like a haircut...",
      "cost": 0.42,
      "duration": 85
    }
  }
}
```

#### Response

```json
{
  "success": true,
  "action": "confirmation_sent" | "textback_sent"
}
```

#### Behavior

1. **Store call data** in `calls` table:
   - `vapi_call_id`, `transcript`, `summary`, `agent_cost`
   - Mark `answered_by = 'agent'`

2. **Check if booking was made**:
   - Query `bookings` table for this call
   - If found: `booking_made = true`
   - If not: `booking_made = false`

3. **Send appropriate text-back**:
   - **If booking made:**
     ```
     "Your haircut is confirmed for Thursday at 2:00 PM. See you soon!"
     ```
   - **If no booking:**
     ```
     "Sorry we missed you at Demo Salon. Want to book? https://..."
     ```

4. **Consume handoff token**:
   - Mark `voice_handoffs.consumed_at = now()`
   - Prevents re-processing

#### Idempotency

- Calls `claimEvent(provider='vapi', resource_sid=vapi_call_id, event_type='end_of_call_report')`
- If already claimed: Returns 200, skips text-back logic
- Prevents duplicate confirmations on retry

#### Error Handling

- If text-back fails: Logged for retry by `/api/cron/drain`
- If database unavailable: Returns 500, Vapi retries

---

## 4. Cron Drain

### `POST /api/cron/drain`

Runs periodically (hourly). Handles deferred text-backs and orphaned handoffs.

#### Request (from Vercel Cron / your scheduler)

```
Authorization: Bearer ${CRON_SECRET}
```

#### Response

```json
{
  "drained": 0,
  "orphaned": 3,
  "message": "Drained 0 deferred messages, 3 orphaned handoffs"
}
```

#### Behavior

1. **Drain deferred text-backs**:
   - Query `messages` where `status = 'deferred'` and `scheduled_for <= now()`
   - Send each via Twilio
   - Mark `status = 'sent'`

2. **Sweep orphaned handoffs**:
   - Query `voice_handoffs` where:
     - `consumed_at IS NULL` (not yet consumed)
     - `created_at < now() - agent_max_seconds` (timed out)
   - For each: Send missed-call text-back
   - Mark as processed (insert into `messages`)

#### Use Cases

- Vapi SIP timeout (no assistant-request received)
- Vapi down during call
- Network failure before end-of-call-report
- Agent silent on all paths (token invalid, dialed number outdated, no recent handoff)

---

## Tool Parameter Schemas

### check_availability

```json
{
  "type": "object",
  "properties": {
    "service_name": {
      "type": "string",
      "description": "Name of the service (e.g., 'Haircut')"
    },
    "preferred_date": {
      "type": "string",
      "description": "YYYY-MM-DD or null for next available"
    }
  },
  "required": ["service_name"]
}
```

### book_appointment

```json
{
  "type": "object",
  "properties": {
    "service_name": { "type": "string" },
    "start_time": { "type": "string", "description": "ISO 8601 (e.g., '2026-09-15T14:00:00Z')" },
    "contact_name": { "type": "string" },
    "contact_phone": { "type": "string" },
    "notes": { "type": "string", "description": "Optional special requests" },
    "requested_window": { "type": "string", "description": "Caller's stated preference in their own words" }
  },
  "required": ["service_name", "start_time", "contact_name", "contact_phone"]
}
```

### escalate

```json
{
  "type": "object",
  "properties": {
    "reason": { "type": "string", "description": "Brief reason for escalation" }
  },
  "required": ["reason"]
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | None |
| 400 | Bad request (invalid params) | Fix request and retry |
| 404 | Resource not found | Check client ID, call ID |
| 500 | Server error | Log and retry later |

### Common Error Scenarios

**"no tenant resolved"**
- All three signals failed
- Check: token is valid, Twilio number is registered, caller has recent handoff

**"booking slot no longer available"**
- Another call booked the same slot (race condition)
- Agent should re-check availability and propose different slot

**"client not found"**
- Client ID doesn't exist in database
- Check Twilio number routing

---

## Testing

### Mock Vapi Server

Test the entire flow locally without a real Vapi account:

```bash
# Terminal 1: Start mock server
npx tsx scripts/mock-vapi-server.ts

# Terminal 2: Run a scenario
curl -X POST "http://localhost:3001/test/scenario?name=happy-path"

# View logs
curl http://localhost:3001/log
```

### Simulation Script

Test against real database:

```bash
npx tsx scripts/simulate-voice.ts
```

Requires environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Monitoring

### Key Metrics

- **Tenant resolution signal**: Which signal resolved the tenant (token / dialed_number / recent_handoff)
- **Booking success rate**: Bookings made / total calls
- **Agent cost**: Sum of `calls.agent_cost`
- **Call duration**: Average of `calls.duration_seconds`
- **Idempotency**: Count of duplicate webhook calls (should be 0 bookings created)

### Logs to Watch

```
// Tenant resolution
"tenant resolved via token" | "via dialed number" | "via recent handoff"

// Idempotency
"claimEvent: already claimed" → 200 but skipped logic

// Orphaned handoff
"sweeping orphaned handoff: call_id={id}, age={seconds}s"
```

---

## Production Checklist

- [ ] Vapi webhook URL set to `{PUBLIC_BASE_URL}/api/vapi`
- [ ] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY configured
- [ ] TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN configured
- [ ] PUBLIC_BASE_URL matches your domain
- [ ] SMS_DRY_RUN=false when ready for real texts
- [ ] Cron job configured to call `/api/cron/drain` hourly
- [ ] CRON_SECRET set to a strong random value
- [ ] Monitoring dashboard connected to your Supabase
- [ ] Alerts set up for: booking success rate < 70%, agent cost > $1/call
- [ ] voice_agent_enabled tested on 1-2 clients before broad rollout
