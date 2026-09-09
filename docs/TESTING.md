# Voice Agent Testing Guide

Complete guide to testing the Vapi voice agent system without a live Vapi account.

## Quick Start

```bash
# 1. Start the mock Vapi server (Terminal 1)
npx tsx scripts/mock-vapi-server.ts

# 2. Run a test scenario (Terminal 2)
curl -X POST "http://localhost:3001/test/scenario?name=happy-path"

# 3. View results
curl http://localhost:3001/log | jq
```

---

## Testing Tiers

### Tier 1: Logic Tests ✓ (No Database Required)

Pure function tests for availability, timezone math, tenant resolution.

```bash
npm run verify
```

**What it tests:**
- Quiet hours calculation
- Timezone conversions (including DST)
- Template rendering
- Slot generation logic

**Run time:** ~500ms
**Dependencies:** None

---

### Tier 2: Unit Tests ✓ (Database Required)

Component-level tests for each module.

```bash
npm run test
```

**Test suites:**
- `src/lib/__tests__/availability.test.ts` - Slot generation
- `src/lib/vapi/__tests__/assistant.test.ts` - Assistant building
- `src/lib/vapi/__tests__/handoff.test.ts` - Token management & tenant resolution

**What it tests:**
- Slot generation respects lead time, buffer, max per day
- No slots outside business hours
- No slot collision with existing bookings
- Tenant resolution three-signal fallback
- Token consumption prevents reuse
- Assistant includes all services, hours, FAQs

**Run time:** ~2-3 seconds per suite
**Dependencies:** 
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

---

### Tier 3: Integration Tests (End-to-End)

Full flow testing with mock Vapi server.

#### 3a. Mock Vapi Server + Manual Testing

Start the mock server:

```bash
npx tsx scripts/mock-vapi-server.ts
```

Available scenarios:

```bash
# Happy path: Agent books an appointment
curl -X POST "http://localhost:3001/test/scenario?name=happy-path"

# Escalation: Caller needs human, agent escalates
curl -X POST "http://localhost:3001/test/scenario?name=escalation"

# Retry safety: Vapi retries duplicate booking attempt
curl -X POST "http://localhost:3001/test/scenario?name=retry-safety"

# No-answer then agent: Simulates Twilio flow + Vapi handoff
curl -X POST "http://localhost:3001/test/scenario?name=no-answer-then-agent"

# View scenario list
curl http://localhost:3001/scenarios | jq

# View call log
curl http://localhost:3001/log | jq
```

**What happens:**
1. Mock server makes sequential HTTP calls to `/api/vapi`
2. Each call includes realistic Vapi payloads
3. Your app processes them end-to-end
4. Results stored in database

**Verification:**
```bash
# Check bookings were created
psql "postgresql://..." -c "SELECT * FROM bookings WHERE source = 'voice_agent';"

# Check calls were recorded
psql "postgresql://..." -c "SELECT * FROM calls WHERE answered_by = 'agent';"

# Check text-backs were queued
psql "postgresql://..." -c "SELECT * FROM messages WHERE kind = 'textback';"
```

#### 3b. Simulation Script

Runs all scenarios against the real database (once credentials are available):

```bash
npx tsx scripts/simulate-voice.ts
```

**Requirements:**
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TWILIO_* vars (for SMS)

**What it tests:**
- Idempotency: Booking exactly once even on duplicate tool-calls
- Text-back decision: Confirmation if booked, missed-call if not
- Tenant resolution: All three signals work
- End-to-end flow: Call → booking → confirmation text

---

### Tier 4: Deployment Testing

Pre-flight checks before deploying to production.

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh dev
```

**Checks:**
- TypeScript compilation
- Build succeeds
- Environment variables present
- Security audit passes
- Database connectivity

---

## Scenario Deep Dives

### Happy Path: Booking Made

```
Caller dials Twilio
  ↓
/api/voice/incoming: Dials business
  ↓
/api/voice/status: No answer → mint token, dial Vapi
  ↓
/api/vapi (assistant-request): Build agent from client's knowledge
  ↓
/api/vapi (tool-calls): check_availability
  ← Returns 5 slots
  ↓
Agent proposes times to caller
  ↓
/api/vapi (tool-calls): book_appointment
  ← Writes bookings row
  ↓
Call ends
  ↓
/api/vapi (end-of-call-report): Detect booking, send confirmation text
  ← "Your haircut is booked for Thursday at 2pm"
```

**Database state after:**
- `calls`: 1 row with `answered_by='agent'`
- `bookings`: 1 row with `source='voice_agent'`
- `messages`: 1 row with `kind='textback'`, `body=confirmation`
- `voice_handoffs`: 1 row with `consumed_at=now()`

**Success criteria:**
- Exactly 1 booking (not 2 on retry)
- Confirmation text created
- Booking details match caller's choice

---

### Retry Safety: Idempotency

```
First book_appointment call arrives
  ↓
claimEvent(provider='vapi', resource_sid=call_id)
  ↓
webhook_events: Insert (provider, resource_sid, event_type)
  ↓
Process booking → INSERT into bookings
  ↓
Return results

[Network hiccup, Vapi retries same call]

Second book_appointment call arrives (same tool call ID)
  ↓
claimEvent(provider='vapi', resource_sid=call_id)
  ↓
webhook_events: Already exists! Return conflict
  ↓
Skip booking logic, return 200 anyway
  ↓
No second booking inserted
```

**Database state after:**
- `bookings`: Still 1 row (not 2)
- `webhook_events`: 1 row (not 2)
- Both calls processed, only one booking

**Success criteria:**
- No duplicate bookings
- Both requests return 200
- System is transparent to Vapi retries

---

### Tenant Resolution: Three-Signal Fallback

#### Signal 1: Token (Primary)

```
Vapi calls /api/vapi with token in SIP URI
  ↓
resolveTenant(token='abc-123')
  ↓
SELECT * FROM voice_handoffs WHERE token='abc-123' AND consumed_at IS NULL
  ↓
Found! Return client, log "signal: token"
  ↓
Build assistant for this client
```

#### Signal 2: Dialed Number (Fallback)

```
Token missing or invalid

resolveTenant(token=null, dialedNumber='+16505550100')
  ↓
SELECT * FROM clients WHERE twilio_number='+16505550100'
  ↓
Found! Return client, log "signal: dialed_number"
  ↓
Build assistant for this client
```

#### Signal 3: Recent Handoff (Last Resort)

```
Token invalid, dialed number not found

resolveTenant(token=null, dialedNumber=null, callerNumber='+14155552671')
  ↓
SELECT * FROM voice_handoffs
  WHERE caller_number='+14155552671'
  AND consumed_at IS NULL
  ORDER BY created_at DESC LIMIT 1
  ↓
Found! Return client, log "signal: recent_handoff"
  ↓
Build assistant for this client
```

**Logs to check:**
```bash
# Look for these in your app logs
"tenant resolved via token"          # Best case
"tenant resolved via dialed number"  # Fallback 1 working
"tenant resolved via recent handoff" # Fallback 2 working (rare)
```

---

## Test Data

### Seed Test Clients

Create realistic test clients:

```bash
npx tsx scripts/seed-test-data.ts
```

**Creates 4 clients:**
1. **Demo Salon** (LA) - Hair services, 9am-7pm weekdays
2. **NYC Dental** (NYC) - Dental services, 8am-5pm weekdays
3. **Zen Yoga** (Denver) - Classes, 6am-9pm + weekend hours
4. **Mike's Pizza** (Chicago) - Delivery, 11am-11pm daily

**Each includes:**
- Services with descriptions, durations, prices
- Business hours (timezone-aware)
- Booking rules (lead time, buffer, max per day)
- FAQs

**Use for:**
- Testing timezone math (clients in different zones)
- Testing multi-slot days (Yoga has 2 time periods)
- Testing different hours (Pizza is 7 days)

---

## Monitoring Dashboard

Visual representation of system health and metrics.

```bash
# Open in browser
open scripts/monitoring-dashboard.html
```

**Shows:**
- Total calls, bookings made, booking success rate
- Recent 10 calls with outcome and cost
- Tenant resolution signal breakdown
- Text-back delivery status
- System health (all components green)

**Note:** Currently shows sample data. Wire up to your Supabase to see live metrics.

---

## Pre-Deployment Checklist

Before going live:

### Code Quality
- [ ] `npm run typecheck` passes
- [ ] `npm run verify` passes (22 logic assertions)
- [ ] `npm run test` passes (unit tests)
- [ ] `npm run build` succeeds
- [ ] `npm audit --audit-level=moderate` passes

### Integration Tests
- [ ] Mock Vapi server: happy-path scenario works
- [ ] Mock Vapi server: escalation scenario works
- [ ] Mock Vapi server: retry-safety scenario works
- [ ] Database has test clients seeded
- [ ] Bookings table receives new booking
- [ ] Messages table receives confirmation text

### Configuration
- [ ] `SUPABASE_URL` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] `TWILIO_ACCOUNT_SID` set
- [ ] `TWILIO_AUTH_TOKEN` set
- [ ] `PUBLIC_BASE_URL` matches your domain
- [ ] `CRON_SECRET` set
- [ ] `SMS_DRY_RUN=true` (until ready)

### Vapi Setup
- [ ] Vapi account created
- [ ] Phone number provisioned
- [ ] SIP domain noted (default: sip.vapi.ai)
- [ ] Webhook URL set to `{PUBLIC_BASE_URL}/api/vapi`
- [ ] Test call made (manually, before full rollout)

### Monitoring
- [ ] Dashboard connected to Supabase
- [ ] Logs being captured
- [ ] Tenant resolution signal logging enabled
- [ ] Booking success rate being tracked

---

## Troubleshooting

### "tenant resolved via recent_handoff" often appears

**Issue:** Third signal is activating, suggesting token or dialed number aren't working.

**Check:**
1. Vapi SIP URI format - Is token in URI?
2. Twilio routing - Is dialed number set correctly?
3. Token expiration - Default is 15 minutes

**Fix:** Once confirmed token works, remove fallback paths from code.

### Duplicate bookings despite idempotency

**Issue:** Two booking rows for the same caller at same time.

**Check:**
1. Is `claimEvent` actually being called?
2. Are webhook_events being inserted?
3. Check logs for "already claimed" message

**Fix:** Ensure all tool-calls go through the idempotency check.

### Text-back not sent after booking

**Issue:** Booking created but no confirmation text.

**Check:**
1. Did end-of-call-report arrive?
2. Did it detect the booking? (`booking_made = true`)
3. Check messages table for errors

**Fix:** Run drain manually: `curl /api/cron/drain`

### Availability slots always empty

**Issue:** `check_availability` returns no slots.

**Check:**
1. Business hours configured?
2. Lead time < available time to first slot?
3. Max per day limit reached?
4. Existing bookings blocking all slots?

**Fix:** Use test data that has clear business hours.

---

## Performance Baseline

Expected latencies:

| Operation | Time | Notes |
|-----------|------|-------|
| check_availability | 200-400ms | Database query + computation |
| book_appointment | 150-300ms | Insert into bookings, idempotency check |
| build_assistant | 50-100ms | System prompt composition |
| tenant resolution | 30-80ms | Database lookup (primary < fallback) |

---

## Next Steps

1. **Run Tier 1 tests** (logic only): `npm run verify`
2. **Run Tier 2 tests** (with database): `npm run test`
3. **Start mock server**: `npx tsx scripts/mock-vapi-server.ts`
4. **Run a scenario**: `curl -X POST http://localhost:3001/test/scenario?name=happy-path`
5. **Check results**: `curl http://localhost:3001/log | jq`
6. **Review database state**: Query your Supabase project
7. **Get Vapi account**: Create one when ready for production
8. **Deploy**: `./scripts/deploy.sh dev`
