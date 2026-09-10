# Switchboard Architecture

Complete technical overview of how Switchboard works. For account managers, focus on **The Flow** section. For developers, read everything.

---

## The Flow: How a Call Becomes a Booking

```
1. Customer calls Smith Roofing's number
   ↓
2. Twilio (our phone service) receives it
   ↓
3. Our server processes: /api/voice/incoming
   └─ Check: Does this business use voice agent?
   ├─ Yes → Ring their business line
   └─ No → Hang up
   ↓
4. Business phone rings for 5 seconds
   ↓
5. Customer hangs up OR business doesn't answer
   ↓
6. Our server processes: /api/voice/status
   └─ Check: Call was missed?
   ├─ Yes → Proceed
   └─ No → Done
   ↓
7. Decision: Route to Dograh or textback?
   ├─ Dograh enabled? (in database)
   ├─ Dograh reachable? (check SIP domain)
   ├─ Config complete? (greeting, instructions, etc.)
   └─ All yes? → Dograh gets the call
   └─ Any no? → Send text: "Sorry we missed you"
   ↓
8. Dograh voice agent answers
   └─ Plays greeting: "Hi, this is Smith Roofing..."
   └─ Asks questions: "What's the issue?"
   └─ Books appointment: "We can see you Tuesday at 2pm"
   ↓
9. Conversation ends
   ↓
10. Dograh calls our webhook: /api/dograh/webhook
    └─ Sends: transcript, duration, booking_made (true/false), cost
    └─ We store: everything in database
    ↓
11. Decision: Was booking made?
    ├─ Yes → SMS to customer: "Your appointment is booked!"
    └─ No → SMS to customer: "Sorry we missed you, call back anytime"
    ↓
12. Analytics updated
    └─ call_metrics table: duration, booking_made, error, cost
    └─ Dashboard updated for account manager to see

TOTAL TIME: 5-15 minutes from missed call to booked appointment or follow-up text
```

---

## System Components

### 1. Twilio (Phone Service)
**What it does:** Receives calls to the client's phone number

**Account setup:**
- Buy a local phone number (e.g., +1-555-123-4567)
- Configure webhook: When call received → POST to `/api/voice/incoming`

**Config location:** `.env.local`

**Your role as account manager:** None. The founder handles Twilio. You just verify the number works.

---

### 2. Switchboard Server (Our Code)
**What it does:** Routes calls, decides who answers (business or Dograh), records metrics

**Tech stack:**
- Next.js (Node.js framework)
- TypeScript (type-safe code)
- Runs on Vercel (serverless hosting)

**Key routes you should know about:**

| Route | Purpose | Used By |
|-------|---------|---------|
| `/api/voice/incoming` | Receive call from Twilio, ring business | Twilio webhook |
| `/api/voice/status` | Call status update, route to Dograh if missed | Twilio webhook |
| `/api/dograh/webhook` | Dograh reports call result (booking made?) | Dograh |
| `/admin/agents` | **YOU USE THIS** — Configure agent voice/greeting | You (admin) |
| `/api/admin/canary/metrics` | **YOU USE THIS** — View call statistics | You (admin) |

**Your role:** You don't touch the code. You use the APIs (admin panel + metrics endpoint).

---

### 3. Dograh (Voice Agent)
**What it does:** The AI that actually talks to callers

**Deployment:** Self-hosted open-source voice agent

**Your role:** You configure Dograh via the admin panel. Everything is no-code.

---

### 4. Supabase (Database)
**What it does:** Stores everything

**Tables you care about:**

| Table | Contains | You Use It For |
|-------|----------|----------------|
| `clients` | Business info (Twilio #, timezone, name) | Look up client details |
| `calls` | Every incoming call record | Debug missing calls |
| `bookings` | Appointments the agent booked | Verify agent is working |
| `business_knowledge` | Agent config (voice, greeting, FAQs, instructions) | Read current config |
| `call_metrics` | Analytics (duration, booking rate, errors) | Monthly reports |

**Your role:** Read-only mostly. You view metrics and call records.

---

## Cost Breakdown Per Call

**Scenario:** Customer calls, agent books appointment (4 min call)

| Component | Cost |
|-----------|------|
| Twilio phone service | $0.01 |
| Dograh SIP/hosting | $0.10 |
| TTS (4 min speech) | $0.02-0.12 depending on provider |
| LLM/AI (agent decision-making) | $0.05 |
| Database storage | $0.001 |
| **Total** | **$0.18-0.28** |

**Compare to:**
- Hiring receptionist: $15-20/hour = $3,000-4,000/month
- Using Vapi (cloud): $0.80/min = $3.20/call

**Margin for $300/mo client:**
- Revenue: $300
- Cost (50 calls/month): $15
- **Profit: $285**

---

## Monitoring: What You Check Weekly

### 1. Call Metrics
Check dashboard or query metrics endpoint

**Healthy targets:**
- Booking rate: >60%
- Error rate: <10%
- Duration: 3-6 minutes

### 2. Recent Calls
In Supabase `calls` table:
- Filter by `client_id`
- Check `duration`, `status`, `routed_to`

### 3. Bookings
In Supabase `bookings` table:
- Filter by `client_id`
- Count new bookings per day

---

## What You Own (As Account Manager)

✅ **You configure:**
- Agent voice & greeting
- Agent instructions & tone
- Services list
- Business hours
- FAQ answers
- Voice provider selection

✅ **You monitor:**
- Call metrics (booking rate, errors)
- Booking volume
- Customer feedback

✅ **You adjust:**
- Greeting if it's not working
- Instructions if agent misses key questions
- FAQs based on call feedback
- Voice if quality is off

❌ **You DON'T touch:**
- Twilio configuration
- Dograh deployment
- Database schema
- Code changes
- Infrastructure

---

## Success Metrics

**Industry Benchmarks:**
- Roofing: 65-75% booking rate
- Dental: 75-85% booking rate
- HVAC: 60-70% booking rate
- Plumbing: 70-80% booking rate

**If you hit these, the client is profitable and happy.**

