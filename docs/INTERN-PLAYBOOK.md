# Switchboard Voice Agent Account Manager Playbook

**Your role:** After the client signs and pays, you own their voice agent setup and ongoing management. The founder shouldn't need to touch it.

---

## What is Switchboard?

**The Product:** A 24/7 AI receptionist that answers missed calls, books appointments, and routes leads to customers.

**The Tech:** Combines three things:
1. **Twilio** (phone service) — receives inbound calls
2. **Dograh** (self-hosted AI voice agent) — talks to callers, asks questions, makes decisions
3. **Supabase** (database) — stores everything: clients, calls, bookings, metrics

**The Business Model:** Sell packages ($300-1200/mo) that include setup + ongoing management (you).

---

## Your Responsibilities

### Week 1: Onboarding
- [ ] Create client in Supabase
- [ ] Configure Dograh agent (voice, greeting, services, FAQs)
- [ ] Set up Twilio number forwarding
- [ ] Test call flow end-to-end
- [ ] Deliver client dashboard login

### Weeks 2-4: Launch & Monitoring
- [ ] Monitor call metrics (booking rate, errors, duration)
- [ ] Adjust agent instructions based on call quality
- [ ] Handle any setup issues
- [ ] Train client on dashboard

### Ongoing: Management
- [ ] Weekly health check (booking rate, error trends)
- [ ] Monthly performance report to client
- [ ] Adjust pricing/FAQs based on feedback
- [ ] Troubleshoot issues (client asks questions → you debug)
- [ ] Upsell opportunities (add features, increase rollout %)

---

## Architecture Overview

```
Customer calls → Twilio → Our Server → Dograh (SIP) → Database
                              ↓
                        Route Incoming Call
                              ↓
                    Ring Business 5 seconds
                              ↓
                        No Answer?
                              ↓
              Dograh Takes Over (SIP Dial)
                              ↓
         Agent: "Hi, this is [business]..."
         Agent: Questions about appointment
                              ↓
                    Booking Made?
                    ✓ Yes      ✗ No
                      ↓          ↓
                   SMS to    SMS to
                  customer  customer
                           "Sorry missed you"
```

### Key Endpoints (You Don't Need to Touch These)

| URL | What It Does |
|-----|--------------|
| `/api/voice/incoming` | Receives call from Twilio, rings business |
| `/api/voice/status` | Call missed → routes to Dograh or textback |
| `/api/dograh/webhook` | Dograh calls back with booking result |
| `/admin/agents` | **YOU USE THIS** — Configure agent |
| `/api/admin/canary/metrics` | **YOU USE THIS** — View call stats |

### Database Tables (Read-Only for You)

- `clients` — Company info (Twilio number, timezone, etc.)
- `calls` — Incoming call records
- `bookings` — Appointments the agent booked
- `call_metrics` — Analytics (routing, duration, booking rate, errors)
- `business_knowledge` — Agent config (greeting, instructions, FAQs)

---

## Client Onboarding Checklist

### Step 1: Create Client in Database

```sql
INSERT INTO clients (
  id, slug, name, timezone, 
  twilio_number, forward_number, 
  voice_agent_enabled
) VALUES (
  'new-uuid-here',
  'roofing-guy-business',
  'Smith Roofing',
  'America/New_York',
  '+15551234567',        -- Twilio number (ask client)
  '+15559876543',        -- Where to forward business calls
  true
);
```

**Where to get these:**
- `id` — Generate a UUID (use any UUID generator)
- `slug` — lowercase, no spaces (e.g., "smith-roofing")
- `name` — Client's business name
- `timezone` — Their timezone (important for business hours)
- `twilio_number` — Twilio will give you this when you set up their account
- `forward_number` — Their actual phone number (where calls ring first)

### Step 2: Configure Agent

1. Go to `http://localhost:3000/admin/agents`
2. Click their client
3. Fill in:

| Field | Example |
|-------|---------|
| **Voice Provider** | ElevenLabs (most natural for trades) |
| **Voice Model** | "Antoni" (confident, authoritative) |
| **Greeting** | "Hi, this is our roofing team returning your call about roof damage..." |
| **Agent Instructions** | "You're a professional roofer calling back. Ask about roof type, damage extent, timeline. If no appointment available this week, ask for callback." |
| **Services** | Emergency repair, Inspection, Replacement, Maintenance |
| **Business Hours** | Mon-Fri 9am-5pm, Sat 9am-12pm (closed Sunday) |
| **FAQs** | "How much is an inspection?" → "$150, credited toward work" |

**Tips for Each Industry:**

**Roofing/Trades:**
- Voice: ElevenLabs "Antoni" or Google "Evan" (confident, authoritative)
- Tone: Professional, knowledgeable, respectful of time
- Focus: Get appointment booked, mention free inspection

**Medical/Dental:**
- Voice: Google "Paige" or ElevenLabs "Rachel" (warm, calming)
- Tone: Friendly, compassionate, reassuring
- Focus: Appointment + insurance/payment questions

**Auto Shop:**
- Voice: Google "Evan" (no-nonsense, friendly)
- Tone: Casual, helpful, expert
- Focus: Diagnosis, quote, appointment

### Step 3: Test End-to-End

1. **Make a test call** to the client's Twilio number
2. **Let it ring 5 seconds** (doesn't go to business)
3. **Dograh calls back** with greeting you wrote
4. **Have a conversation** — test if agent books appointment
5. **Check database** — verify booking appeared in `bookings` table
6. **Check SMS** — client gets confirmation or "sorry we missed you"

### Step 4: Deliver to Client

Send them:
- **Dashboard login:** `https://yoursite.com/client/[clientId]`
- **What to expect:** "Calls missed by your team → AI books appointments automatically"
- **Dashboard shows:** Recent calls, bookings made, customer sentiment
- **First 3 days:** "We're monitoring and may adjust the agent's personality based on call quality"

---

## Week 2-4: Launch & Iterate

### Daily (First 3 Days)
- Listen to 2-3 call recordings (via dashboard)
- Check if agent is booking appointments
- Note any issues (agent talking too much? Missing key questions?)

### Adjustments Based on Calls

| Issue | Fix |
|-------|-----|
| Agent talks too much | Add to instructions: "Keep responses under 20 seconds" |
| Agent misses budget questions | Add FAQ: "What's the cost?" |
| Agent not asking for appointment | Add to instructions: "Always end with: 'Can I book you for Tuesday at 2pm?'" |
| Agent sounds robotic | Switch to ElevenLabs TTS |
| Agent sounds too informal | Switch voice to "Rachel" or "Paige" (more professional) |

### Make Changes

1. Go to `/admin/agents` → click client
2. Edit the field (greeting, instructions, FAQ, etc.)
3. Click "Save Settings"
4. **Test immediately** — make another test call
5. **Listen to recording** — does it sound better?

### Weekly Check-In (Every Monday)

```bash
# Check metrics
curl http://localhost:3000/api/admin/canary/metrics?hours=168

# Look for:
- Booking rate: Should be >60% (if <50%, agent needs adjustment)
- Error rate: Should be <10% (if >15%, check Dograh logs)
- Call volume: How many calls came through?
- Average duration: 4-6 minutes is normal
```

### Report to Client (Every Friday)

Send them a simple email:

```
Hi [Client Name],

This week's AI receptionist summary:
- Calls answered: 12
- Appointments booked: 8 (66% success rate)
- Missed by business: 4 (we sent SMS follow-ups)
- Average call: 4min 30sec

Highlight: The AI is booking your appointments automatically!

Next week: We're testing a slightly faster response time to see if 
that improves booking rate.

Let me know if you want to adjust anything.
```

---

## Ongoing: Monthly Operations

### 1. Monthly Performance Review

Pull last 30 days of metrics:

```bash
curl http://localhost:3000/api/admin/canary/metrics?hours=720
```

Create a simple report:
- Total calls: X
- Appointments booked: X
- Booking rate: X%
- Error rate: X%
- Est. cost savings vs. hiring receptionist: $X

**Cost Savings Pitch:**
- Hiring receptionist: $3,000-4,000/month
- Switchboard: $300-1,200/month
- **Savings: $1,800-3,700/month**

### 2. Upsell Opportunities

After 30 days of success (>60% booking rate):

**Upsell Option 1: Premium Support (+$200/mo)**
- Daily performance reports
- Unlimited agent customization
- Priority issue resolution
- Monthly strategy call

**Upsell Option 2: Analytics Dashboard (+$300/mo)**
- Real-time call heatmap
- Caller sentiment analysis
- Comparative analytics (vs. industry benchmark)
- Predictive lead scoring

**Upsell Option 3: SMS Automation (+$150/mo)**
- Automatic appointment reminders (1 day before)
- Follow-up SMS to no-shows
- "Book now" links in SMS

### 3. Troubleshooting Workflow

**Client: "The AI isn't booking appointments"**

1. **Check metrics:** Are calls being routed to Dograh? What's booking rate?
2. **Listen to a call:** Does greeting sound good? Is agent asking right questions?
3. **Review instructions:** Are they clear? Do they match the business?
4. **Check FAQs:** Are the most common questions covered?
5. **Adjust & test:** Change one thing, make test call, verify

**Client: "Calls aren't coming through"**

1. Check Twilio integration (verify phone number is correct)
2. Check Dograh logs (is SIP call reaching the server?)
3. Check database (are calls in `calls` table?)
4. If nothing appears, escalate to founder

**Client: "Agent sounds weird"**

1. Try a different TTS provider (Google → ElevenLabs)
2. Try a different voice model
3. Update instructions: "Speak naturally with pauses, like a real person"

---

## Tools You'll Use

### Local Development
```bash
# Start the dev server
npm run dev

# Access admin panel
http://localhost:3000/admin/agents

# Access metrics
http://localhost:3000/api/admin/canary/metrics
```

### Database Queries
You'll use Supabase dashboard to:
- Create new clients
- View call records
- Check booking records
- See error logs

### Communication
- **Twilio Dashboard** — Manage phone numbers
- **Email** — Weekly reports to clients
- **Call recordings** — Store on Supabase to review agent quality

---

## The Three Questions to Ask Every Client

Use these to understand what agent config they need:

### 1. "What would your ideal call look like?"

Listen for:
- How long should calls be? (4 mins? 10 mins?)
- What questions need answering? (Price? Availability? Details?)
- Should the agent book, or just take info?

**Example:** "A customer calls about roof damage. Ideal call: Agent asks what happened, where on roof, timeline. If urgent → book same-day inspection. If not urgent → offer next available."

### 2. "What do your customers always ask?"

These become FAQs:
- "How much does it cost?"
- "How fast can you come out?"
- "Do you work weekends?"
- "Do you handle insurance?"

**Action:** Add these exact Q&As to the FAQ section.

### 3. "What's your biggest frustration with missed calls?"

This shapes the agent instructions:
- **"We lose 30% of leads to competitors"** → Agent should mention your unique value (speed, price, reviews)
- **"Customers are angry we don't call back"** → Agent should apologize and prioritize booking
- **"Half hang up before answering"** → Agent should be brief, warm, get to the point in 10 seconds

---

## Quick Reference: Common Tasks

### Add a New Client
1. Generate UUID (uuidgen in terminal)
2. Run SQL insert above
3. Go to /admin/agents, click client, fill in config
4. Test with a call
5. Send client their dashboard link

### Adjust Agent Greeting
1. /admin/agents → click client
2. Edit "Greeting" field
3. Save
4. Test call (agent uses new greeting immediately)

### Change Voice
1. /admin/agents → click client
2. Select different TTS provider
3. Select different voice model
4. Save
5. Test call (you'll hear the new voice)

### View Client's Calls
1. Supabase dashboard → `calls` table
2. Filter by `client_id`
3. See timestamp, caller, duration, routed_to (dograh/vapi/textback)

### Check If Client is Profitable

Monthly revenue: (Client pays per month)
Monthly cost: (TTS + Twilio + your time)

**Example:**
- Client pays: $600/month
- TTS cost (ElevenLabs): 200 calls × $0.03 = $6/month
- Twilio: $1/month
- Your time (1 hr/week): $400/month (assuming $400/hr)
- **Gross profit: $193/month**

---

## What You DON'T Need to Know (Yet)

These are founder-level tasks. Don't worry about them unless asked:

- ❌ How Dograh SIP routing works (backend)
- ❌ Twilio configuration (account setup)
- ❌ Supabase migration/schema changes
- ❌ Deploying code changes
- ❌ Debugging TypeScript errors

**Your job:** Client communication, agent tuning, metrics monitoring.

---

## Emergency Escalation

If anything below happens, message the founder:

1. ❌ "Database connection error" → Backend issue
2. ❌ "Agent never responds to SIP call" → Dograh infrastructure down
3. ❌ "Client gets no SMS confirmation" → SMS provider issue
4. ❌ "Twilio number not ringing" → Twilio account issue
5. ❌ Booking rate drops below 30% consistently → Investigate together

**For everything else:** You have the tools to debug and fix it.

---

## Success Metrics

### For You (Account Manager)
- **Onboarding speed:** Can you launch a new client in 2 hours? (Target: Yes)
- **Client satisfaction:** Do clients praise the booking quality? (Target: >80% positive feedback)
- **Upsell rate:** Of first 10 clients, how many upgrade to premium? (Target: >30%)

### For the Client
- **Booking rate:** % of calls that turn into appointments (Target: >60%)
- **Cost savings:** How much less than hiring a receptionist? (Target: $1,800-3,700/mo)
- **Customer satisfaction:** Are callers happy with the service? (Target: >4/5 stars)

---

## 30-Day Quick Start Timeline

| Day | Task |
|-----|------|
| 1-2 | Client signs → You create in database |
| 3-4 | Configure agent (voice, greeting, FAQs) |
| 5 | End-to-end testing (10 test calls) |
| 6 | Send client dashboard + welcome email |
| 7-14 | Daily monitoring, 1-2 adjustments |
| 15 | Weekly check-in email to client |
| 21 | Listen to 10 real calls, note improvements |
| 22-28 | Adjust agent based on real call quality |
| 29 | Weekly report + upsell conversation |
| 30 | Month 2 plan (increase volume? Add features?) |

---

## Your Goal

After 30 days, the client should:
1. ✓ Have a working 24/7 AI receptionist
2. ✓ See >60% of calls turning into bookings
3. ✓ Be getting weekly performance reports
4. ✓ Know they're saving $2,000+/month vs. hiring a person
5. ✓ Ask "What else can we add?" (upsell opportunity)

**And you?** You move on to the next client. Zero founder involvement needed.

---

## Keep Learning

As you onboard more clients:
- Document what works (voice model + greeting style) for each industry
- Build templates (roofing greeting, medical greeting, etc.)
- Note common FAQs by industry
- Track which clients upsell (what worked?)

After 5-10 clients, you'll be able to onboard new ones in 1 hour flat.

---

**Last Note:** This playbook is a living document. As you run into new situations, add them here. The founder will review it monthly to keep it sharp.

Good luck! 🚀
