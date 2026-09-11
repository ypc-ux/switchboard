# Switchboard — AI Call Center Superagent

## What It Does
Multi-tenant call center that handles every inbound call for local service businesses. When a call comes in, the system resolves the client by phone number, routes to the real business line, and if missed, automatically sends an SMS text-back with a booking link within seconds.

Slice 2 (in development) adds a Vapi voice agent that answers calls, qualifies leads, and books appointments autonomously.

## Tools Connected (5+)
- **Twilio** — inbound call routing, SMS text-back
- **Vapi** — AI voice agent that answers, qualifies, and books
- **Supabase** — call history, bookings, escalations, lead data
- **HubSpot** — CRM integration (pluggable backends: HubSpot, Supabase, noop)
- **Dograh AI** — additional AI agent integration
- **Slack** — notifications for escalations and held decisions

## Autonomous Decisions
- **Call routing**: resolves client by inbound phone number, decides whether to ring real line or handle via AI
- **Missed call handling**: if business doesn't answer, autonomously sends SMS text-back with booking link
- **Lead qualification**: voice agent qualifies leads based on business knowledge
- **Escalation logic**: decides when to hand off to human vs. handle autonomously
- **Quiet hours**: defers SMS during quiet hours, sends when appropriate
- **Idempotency**: prevents duplicate bookings via token system

## Daily Cadence
Every single inbound call triggers the agent. The system runs 24/7, handling calls as they come in. No manual intervention needed for basic missed-call text-back.

## Context Across Sessions
Supabase stores:
- Call history (who called, when, outcome)
- Bookings (scheduled appointments)
- Escalations (calls that needed human intervention)
- Lead data (qualified prospects)
- Client configuration (per-business settings, knowledge base)

Every call has access to the full history of that client's interactions.

## Testing & Quality
- Mock Vapi server with 4 scenarios: happy-path, escalation, retry-safety, no-answer-then-agent
- 33 unit tests covering availability, assistant building, handoff/idempotency
- Documentation: Admin Panel, API docs, Per-Client Setup, Intern Playbook, Architecture docs

## Scoring
- **Qualifying**: 10 points (autonomous agent doing real work)
- **Complex**: 15 points (orchestrates 5+ tools, makes autonomous decisions, holds context, runs on every inbound call)
- **Total**: 25 points

## Integration with Portfolio
Publishes signals to ops digest:
- `did` signals when calls are handled, SMS sent, bookings made
- `needs_you` signals when escalations occur or human review needed

The ops digest monitors switchboard daily and reports status across the entire portfolio.
