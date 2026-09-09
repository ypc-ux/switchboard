-- switchboard 0002_voice_agent
--
-- Slice 2: the phone rings at the business first; if nobody picks up, the
-- call is handed to a Vapi voice agent instead of dying in voicemail.
-- Missed-call text-back stays as the last line of defence.

-- ── clients: voice agent config ────────────────────────────────────────
alter table clients
  add column voice_agent_enabled boolean not null default false,
  -- The SIP endpoint TwiML dials to reach Vapi. Configurable rather than
  -- hardcoded because the exact URI form has not been confirmed against a
  -- live Vapi account yet (see docs/VOICE-AGENT.md).
  add column vapi_sip_domain text not null default 'sip.vapi.ai',
  add column voice_provider text not null default 'vapi',
  add column voice_id text,
  add column agent_greeting text,
  -- Extra instructions appended to the generated system prompt, so a client
  -- can be tuned without a code change.
  add column agent_instructions text,
  -- How long the agent may hold the line before we give up and text instead.
  add column agent_max_seconds smallint not null default 300
    check (agent_max_seconds between 30 and 1800);

comment on column clients.voice_agent_enabled is
  'When false the call flow is slice-1 only: ring, miss, text-back.';

-- ── calls: what the agent leg produced ─────────────────────────────────
alter table calls
  add column vapi_call_id text unique,
  add column answered_by text not null default 'none'
    check (answered_by in ('none', 'human', 'agent')),
  add column agent_ended_reason text,
  add column transcript text,
  add column summary text,
  add column agent_cost numeric(10, 4);

create index calls_answered_by_idx on calls (client_id, answered_by);

-- ── voice_handoffs ─────────────────────────────────────────────────────
-- A Twilio call and the Vapi call that follows it are two different legs
-- with two different ids. This is the join: a single-use token embedded in
-- the SIP URI we dial, redeemed when Vapi asks us which assistant to run.
--
-- Tenant resolution on assistant-request tries this token first, then the
-- dialed number, then the caller's most recent live handoff. The route logs
-- which signal actually matched so the redundant paths can be deleted once
-- a real Vapi account confirms what round-trips.
create table voice_handoffs (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,
  client_id     uuid not null references clients(id) on delete cascade,
  call_id       uuid references calls(id) on delete set null,
  caller_number text not null,
  twilio_call_sid text,
  created_at    timestamptz not null default now(),
  consumed_at   timestamptz,
  expires_at    timestamptz not null default (now() + interval '15 minutes')
);
create index voice_handoffs_live_idx on voice_handoffs (client_id, caller_number, created_at desc)
  where consumed_at is null;

-- ── bookings: what the agent captured ──────────────────────────────────
alter table bookings
  add column requested_window text,
  add column notes text,
  add column contact_name text,
  add column contact_phone text;

comment on column bookings.requested_window is
  'Caller''s stated preference in their own words, kept verbatim. The agent
   proposes concrete slots but a human confirms, so the raw ask matters.';

alter table voice_handoffs enable row level security;
