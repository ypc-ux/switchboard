# Voice Agent Admin Panel

Customer-facing dashboard for configuring Dograh voice agent settings per client.

## Quick Start

### Access the Panel

```
http://localhost:3000/admin/agents
```

### Navigation

1. **Agents List** (`/admin/agents`) — View all voice-enabled clients
2. **Agent Editor** (`/admin/agents/[clientId]/edit`) — Configure individual agent

## Configuration Options

### Voice Provider

Choose from four TTS providers, each with different cost/quality tradeoffs:

| Provider | Cost | Best For | Voices |
|----------|------|----------|--------|
| **Google Cloud TTS** | $2-4/hr | Balanced, professional | 4 options (Paige, Evan, Amy, Isaac) |
| **ElevenLabs** | $10-30/hr | Warm, emotional, personality | 4 options (Rachel, Domi, Bella, Antoni) |
| **AWS Polly** | $0.50/hr | Budget-conscious | 4 options (Joanna, Matthew, Kimberly, Justin) |
| **OpenAI TTS** | $1-2/hr | Simple, clear | 6 options (Alloy, Echo, Fable, Onyx, Nova, Shimmer) |

**Recommendation for roofing/trades:** ElevenLabs "Antoni" (confident, authoritative) or Google "Evan" (professional).

### Voice Selection

Once you pick a provider, choose a specific voice model. Each has distinct characteristics:

- **Google "Paige"**: Professional female, natural cadence
- **Google "Evan"**: Professional male, authoritative
- **ElevenLabs "Antoni"**: Confident, commanding tone
- **ElevenLabs "Rachel"**: Warm but professional
- **AWS "Joanna"**: Clear, corporate
- **OpenAI "Nova"**: Energetic, friendly

### Greeting

The first thing the agent says when dialing:

```
"Hi, calling on behalf of Smith Roofing. We received your inquiry 
about roof damage. Do you have 2 minutes to discuss your options?"
```

**Tips:**
- Keep under 30 seconds
- Include business name
- Set expectation (e.g., "2 minutes")
- Ask a yes/no question to start conversation

### Agent Instructions

System prompt that controls behavior, tone, and decision rules.

**Example for roofing:**

```
You are a professional roofing consultant calling customers 
who inquired about roof repair or inspection.

PERSONALITY:
- Confident, knowledgeable about construction
- Respectful of customer time (aim for 4-6 minute calls)
- Ask clarifying questions before offering solutions
- If customer hesitates on price, suggest a free inspection

DECISION RULES:
- Always confirm appointment time and phone number
- If no availability in next 7 days, offer callback
- Escalate emergency leaks to manager immediately
- If customer not interested, ask if anyone else in household handles repairs

TONE: Professional but friendly, like a trusted contractor
```

Keep it detailed (500+ chars)—the agent uses this extensively.

### Services

List all services your business offers. Agent uses this to understand context.

**Examples:**
- Emergency leak repair
- Full roof replacement
- Roof inspection & estimate
- Preventive maintenance
- Insurance claim assistance

### Business Hours

Set hours per day. Agent will mention availability:

```
"We have openings tomorrow at 2pm or Thursday morning. Which works better?"
```

### FAQs

Frequently asked questions the agent should know.

**Examples:**

| Question | Answer |
|----------|--------|
| How much does an inspection cost? | $149, fully credited toward any repair work |
| Do you work on weekends? | Only for emergencies. We can usually fit emergency calls within 24 hours |
| How long does a full replacement take? | 1-3 days depending on roof size and weather |
| Do you handle insurance? | Yes, we file claims directly and work with your adjuster |

## API Reference

### List Agents

```bash
GET /api/admin/agents

# Response
{
  "clients": [
    {
      "id": "uuid",
      "slug": "client-slug",
      "name": "Client Name",
      "voice_agent_enabled": true
    }
  ]
}
```

### Get Agent Config

```bash
GET /api/admin/agents/{clientId}

# Response
{
  "config": {
    "id": "uuid",
    "client_id": "uuid",
    "client_slug": "string",
    "tts_provider": "google|elevenlabs|aws|openai",
    "voice_id": "string",
    "greeting": "string",
    "agent_instructions": "string",
    "services": ["string"],
    "business_hours": {
      "Monday": ["09:00", "17:00"],
      "Tuesday": ["09:00", "17:00"],
      ...
    },
    "faq": [
      { "question": "string", "answer": "string" }
    ],
    "updated_at": "ISO8601"
  }
}
```

### Update Agent Config

```bash
PUT /api/admin/agents/{clientId}

# Request body: Partial<AgentConfig>
{
  "tts_provider": "elevenlabs",
  "voice_id": "g0FPH82WrITT8r7aHiN2",
  "greeting": "Hi, this is...",
  "agent_instructions": "You are...",
  "services": ["Service 1", "Service 2"],
  "business_hours": {...},
  "faq": [...]
}

# Response: Same as GET
```

## Workflow for Your Intern

### 1. Launch Admin Panel

```bash
npm run dev
# Open http://localhost:3000/admin/agents
```

### 2. Edit a Client

Click on any client to open the editor. You'll see:
- Voice provider selection (radio buttons)
- Voice model dropdown
- Text fields for greeting, instructions
- Dynamic lists for services, FAQs
- Time pickers for business hours

### 3. Preview Changes

Settings save in real-time to database. No "draft" mode—changes are live immediately.

### 4. Test the Agent

Once config is saved:

1. Make a test call to client's Twilio number
2. Let it ring (don't answer)
3. After ~5 seconds, Dograh dials in using the SIP URI
4. Agent uses the greeting, instructions, services, and FAQs you configured

### 5. Iterate

Adjust agent instructions based on call outcomes:
- If agent talks too much: Add "keep responses under 30 seconds" to instructions
- If agent misses key details: Add examples to FAQs
- If greeting doesn't resonate: Reword it to match customer feedback

## Database Schema

Configs are stored in `business_knowledge` table:

```sql
CREATE TABLE business_knowledge (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  client_slug TEXT NOT NULL,
  
  tts_provider TEXT DEFAULT 'google',  -- google|elevenlabs|aws|openai
  voice_id TEXT NOT NULL,               -- Provider-specific voice model ID
  
  greeting TEXT NOT NULL,               -- Initial greeting message
  agent_instructions TEXT NOT NULL,     -- System prompt/personality
  
  services TEXT[] DEFAULT '{}',         -- List of services offered
  business_hours JSONB DEFAULT '{}',    -- {"Monday": ["09:00", "17:00"], ...}
  faq JSONB DEFAULT '[]',               -- [{"question": "...", "answer": "..."}, ...]
  
  updated_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
};
```

## Troubleshooting

### "Agent not found"

Check that the client has `voice_agent_enabled = true` in the `clients` table.

### Changes don't appear in calls

1. Verify save succeeded (green banner)
2. Make a new test call (agent uses latest config from DB)
3. Check logs: `docker logs dograh` to see if SIP call is reaching Dograh

### TTS provider not working

1. Verify API credentials are set for that provider (env vars or Dograh config)
2. Try a different provider to isolate issue
3. Check Dograh logs for TTS initialization errors

### Voice sounds robotic

- Try ElevenLabs (more natural prosody)
- Adjust agent instructions: "Speak naturally with pauses, like a real person"
- Add punctuation examples to greeting (!) for emphasis

## Future Enhancements

- [ ] Voice preview: Click play button to hear greeting with selected voice
- [ ] A/B testing: Compare two configs' call outcomes
- [ ] Call transcript view: See what agent said on recent calls
- [ ] Agent performance dashboard: Booking rate, error rate, duration trends per config version
- [ ] Webhook for config changes: Trigger Dograh restart when TTS provider changes
- [ ] Bulk import: Upload services/FAQs from CSV
- [ ] Prompt templates: Pre-written system prompts for common industries (dental, plumbing, etc.)

## Next Steps for Intern

1. Test the admin panel locally
2. Create configs for 2-3 test clients
3. Make test calls and iterate on voice/greeting/instructions
4. Document which voice + instructions work best for each industry
5. Build customer-facing preview page (listen to greeting, see FAQ list)
