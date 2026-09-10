# Quick Start for Your Intern

Everything they need to know on Day 1.

---

## Your Job (30-second version)

1. **Onboard clients:** Create them in database, configure their AI agent
2. **Monitor quality:** Check if booking rate is >60% (weekly)
3. **Iterate:** Tweak agent voice/greeting/FAQs based on call quality
4. **Report:** Send monthly performance email to client
5. **Upsell:** After month 1, pitch premium features

**Goal:** Client gets a working 24/7 AI receptionist. You move on to next client. Done.

---

## Day 1: Setup

### 1. Get Access
Ask founder for:
- [ ] Supabase dashboard login (database)
- [ ] Admin panel URL (http://localhost:3000/admin/agents)
- [ ] Dograh server SSH access (for logs, if needed)
- [ ] Twilio account access (phone numbers)

### 2. Run Locally
```bash
cd switchboard
npm install
npm run dev
# Open http://localhost:3000/admin/agents
```

### 3. Read These (In Order)
1. **This file** (you're reading it)
2. `docs/INTERN-PLAYBOOK.md` (full guide to your job)
3. `docs/ARCHITECTURE.md` (how the system works)
4. `docs/ADMIN-PANEL.md` (how to use the config tool)

### 4. Understand the Flow
```
Customer misses call
    ↓
Agent calls back automatically
    ↓
Agent books appointment
    ↓
SMS confirmation sent
    ↓
You monitor metrics weekly
```

---

## Day 1-2: Practice Onboarding

Pick a test client (ask founder which one).

### Step 1: Create in Database
Ask founder to run this SQL (or do it in Supabase dashboard):

```sql
INSERT INTO clients (
  id, slug, name, timezone, 
  twilio_number, forward_number, 
  voice_agent_enabled
) VALUES (
  gen_random_uuid(),           -- Generate random ID
  'test-client-slug',          -- lowercase, no spaces
  'Test Business Name',
  'America/New_York',
  '+15551234567',              -- Ask founder for Twilio number
  '+15559876543',              -- Business's real phone
  true
);
```

### Step 2: Configure Agent
1. Go to http://localhost:3000/admin/agents
2. Click your test client
3. Fill in:
   - **Voice:** ElevenLabs, voice "Antoni"
   - **Greeting:** "Hi, this is Test Business calling back about your appointment. Do you have a minute?"
   - **Instructions:** "You're a professional receptionist. Ask what service they need. Book them for the soonest available slot."
   - **Services:** Test Service 1, Test Service 2
   - **Hours:** Mon-Fri 9am-5pm
   - **FAQs:** Q: "How much?" A: "Depends on service, but we'll give you a quote."
4. Click "Save Settings"

### Step 3: Test
```bash
# Make a test call to the Twilio number
# Let it ring for 5 seconds (business phone won't answer because it's a test)
# Dograh should call back with your greeting

# Listen to the call
# Did it sound good? Did the agent ask questions?
# Did it try to book?
```

### Step 4: Check Database
In Supabase dashboard:
- View `calls` table: Do you see your test call?
- View `bookings` table: Did it try to book?
- View `call_metrics` table: What does it say?

---

## Week 1: Onboard First Real Client

### Monday: Kickoff Call
- [ ] Talk to client (Zoom/phone)
- [ ] Ask the three questions (see PLAYBOOK)
  1. "What would your ideal call look like?"
  2. "What do your customers always ask?"
  3. "What's your biggest frustration with missed calls?"
- [ ] Note their timezone
- [ ] Get Twilio number (if they don't have one yet, founder sets up)
- [ ] Get their forward number (where calls ring first)

### Tuesday: Create & Configure
- [ ] Create client in database
- [ ] Go to /admin/agents and configure:
  - Voice + greeting
  - Agent instructions (based on their answers from Monday)
  - Services (their actual services)
  - Hours (their business hours)
  - FAQs (answers to "always asked" questions)

### Wednesday: Test
- [ ] Make 5 test calls
- [ ] Listen to each one
- [ ] Does greeting sound good?
- [ ] Does agent ask right questions?
- [ ] Does agent try to book?
- [ ] Does SMS confirmation send?
- [ ] Check Supabase: do calls appear in database?

### Thursday: Iterate
- [ ] If greeting is stiff → reword it (make it conversational)
- [ ] If agent misses key questions → add to instructions
- [ ] If agent sounds robotic → try different TTS provider
- [ ] Make test calls again
- [ ] Confirm improvements

### Friday: Hand Over
- [ ] Send client their dashboard login
- [ ] Send welcome email: "Your AI receptionist is live! Here's what happens..."
- [ ] Explain they'll get weekly performance reports
- [ ] Set reminder to check metrics Monday

---

## Week 2-4: Monitor & Iterate

### Daily (First 3 Days)
- Listen to 2-3 real calls
- Take notes: What's working? What needs tweaking?

### Weekly (Every Monday)
- Check metrics: Booking rate >60%? Errors <10%?
- Listen to 5 recent calls
- Make 1-2 adjustments if needed
- Send performance email to client

### Adjust When:
| Issue | What to Change |
|-------|---|
| Booking rate <50% | Review agent instructions, make clearer. Reword greeting to ask yes/no question faster |
| Calls dropping | Check Dograh logs (ask founder). Might be SIP configuration |
| Agent talks too much | Add to instructions: "Keep answers under 20 seconds" |
| Agent sounds weird | Try different voice or TTS provider |
| FAQs not being used | They're being asked but agent isn't answering. Reword FAQ answers. |

---

## Tools You'll Use

### The Admin Panel
```
http://localhost:3000/admin/agents
```
- **List:** See all clients, who's enabled
- **Edit:** Configure voice, greeting, FAQs, hours

### Supabase Dashboard
```
https://supabase.com → Your project
```
Tables to monitor:
- `calls` — see recent calls
- `bookings` — see successful bookings
- `call_metrics` — see analytics
- `clients` — look up client details

### Command Line (If Needed)
```bash
# Check if server is running
curl http://localhost:3000/api/admin/agents

# Get metrics
curl http://localhost:3000/api/admin/canary/metrics?hours=168

# Look at logs (if testing)
npm run dev
```

---

## Common Questions

**Q: How do I add a new client?**
A: SQL insert (or ask founder). Then configure in /admin/agents. Then test with calls. Done.

**Q: How do I know if the agent is working?**
A: Check `bookings` table. If appointments are appearing, it's working.

**Q: What if a client complains the agent isn't booking?**
A: Listen to a real call. Check what's happening. Adjust instructions. Make test call. Verify.

**Q: How much does this cost me to run?**
A: ~$0.18-0.28 per call. Client pays $300/mo. If 50 calls/mo, you make $285 profit per client.

**Q: Can I change the voice?**
A: Yes. Go to /admin/agents, pick different provider/voice, save, test. That's it.

**Q: What if Dograh crashes?**
A: Escalate to founder. It's infrastructure. You can't fix it.

**Q: What if SMS doesn't send?**
A: Check Dograh webhook logs (founder can help). Likely a configuration issue.

---

## Your First Month Checklist

- [ ] **Week 1:** Onboard first real client
- [ ] **Week 2:** Monitor booking rate, make 1-2 adjustments
- [ ] **Week 3:** Send monthly report, get feedback from client
- [ ] **Week 4:** Discuss upsell (premium features, increased rollout, add SMS reminders)

**By end of Month 1:**
- You've onboarded 1-2 clients
- You know how to configure agents
- You can debug booking rate issues
- You can write client reports
- You're ready to scale to more clients

---

## Success = This Happens

1. ✓ Customer calls, misses business
2. ✓ AI calls back 5 seconds later with your greeting
3. ✓ AI asks good questions
4. ✓ AI books appointment (or takes info)
5. ✓ SMS confirmation sent
6. ✓ Dashboard shows booking made
7. ✓ Client gets weekly report: "Your AI booked 8 appointments this week!"

If this is happening, you've won.

---

## Red Flags (Escalate to Founder)

- Calls aren't ringing at business
- Dograh isn't answering calls
- SMS isn't sending
- Database errors
- Twilio integration broken
- Booking rate stuck at 0% (not config issue, system issue)

**For everything else:** You can fix it.

---

## Celebrate Wins

When a client hits 60%+ booking rate:
- Email: "Your AI booked X appointments this week! That's $X in value."
- They'll feel like it's working (because it is)
- Upsell becomes easy

---

## One More Thing

Read the PLAYBOOK (`docs/INTERN-PLAYBOOK.md`). Seriously. It has:
- The exact questions to ask clients
- How to adjust the agent
- How to write reports
- Upsell templates
- Troubleshooting flowcharts

You got this. 🚀

---

## Need Help?

- **Technical questions:** Ask founder (Slack, email)
- **Client questions:** See PLAYBOOK (usually has the answer)
- **Debugging:** Check logs, ask founder
- **Configuration:** See ADMIN-PANEL.md

**First week:** Ask lots of questions. Second week: You'll know this cold.
