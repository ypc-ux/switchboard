-- switchboard 0001_init
--
-- One deploy serves many clients. A client is resolved by the inbound
-- Twilio number, so onboarding is a row plus a purchased number.
--
-- ACCESS MODEL: every table has RLS enabled and NO permissive policies.
-- That denies anon and authenticated outright. The service role bypasses
-- RLS and is the only way in — so the service-role key must stay
-- server-side. When a client-facing dashboard is added later, add
-- explicit per-client policies then; do not loosen these now.

create extension if not exists "pgcrypto";

-- ── clients ────────────────────────────────────────────────────────────
create table clients (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  timezone              text not null default 'America/New_York',

  -- E.164. The number callers dial.
  twilio_number         text not null unique,
  -- E.164. The business's real line, where calls are forwarded.
  forward_number        text not null,
  -- Where the owner gets alerts. Falls back to forward_number.
  owner_alert_number    text,

  booking_url           text,
  textback_template     text not null
    default 'Sorry we missed you at {{business}}. Want us to book you in? {{booking_url}}',

  -- Local hours (0-23). Window wraps midnight when start > end.
  quiet_hours_start     smallint not null default 21
    check (quiet_hours_start between 0 and 23),
  quiet_hours_end       smallint not null default 8
    check (quiet_hours_end between 0 and 23),

  dial_timeout_seconds  smallint not null default 20
    check (dial_timeout_seconds between 5 and 120),

  crm_provider          text not null default 'supabase'
    check (crm_provider in ('supabase', 'hubspot', 'noop')),
  crm_config            jsonb not null default '{}'::jsonb,

  -- Defaults TRUE on purpose: no live SMS until A2P 10DLC clears.
  sms_dry_run           boolean not null default true,
  active                boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column clients.sms_dry_run is
  'When true, outbound SMS is recorded but never sent. Keep true until A2P 10DLC registration clears.';

-- ── contacts ───────────────────────────────────────────────────────────
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  phone           text not null,
  name            text,
  opted_out       boolean not null default false,
  opted_out_at    timestamptz,
  crm_external_id text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (client_id, phone)
);
create index contacts_client_idx on contacts (client_id);

-- ── calls ──────────────────────────────────────────────────────────────
create table calls (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  contact_id       uuid references contacts(id) on delete set null,
  twilio_call_sid  text not null unique,
  from_number      text not null,
  to_number        text not null,
  direction        text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  -- Twilio DialCallStatus: completed | no-answer | busy | failed | canceled
  dial_status      text,
  missed           boolean not null default false,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer,
  recording_url    text
);
create index calls_client_started_idx on calls (client_id, started_at desc);
create index calls_missed_idx on calls (client_id, missed) where missed;

-- ── messages ───────────────────────────────────────────────────────────
create table messages (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  contact_id          uuid references contacts(id) on delete set null,
  call_id             uuid references calls(id) on delete set null,
  twilio_message_sid  text unique,
  direction           text not null check (direction in ('inbound', 'outbound')),
  from_number         text not null,
  to_number           text not null,
  body                text not null,
  status              text not null default 'pending'
    check (status in ('pending', 'deferred', 'sent', 'failed', 'suppressed', 'received')),
  kind                text not null default 'textback'
    check (kind in ('textback', 'reply', 'owner_alert')),
  dry_run             boolean not null default false,
  -- Set when quiet hours pushed the send into a later window.
  scheduled_for       timestamptz,
  sent_at             timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);
create index messages_client_created_idx on messages (client_id, created_at desc);
create index messages_deferred_idx on messages (scheduled_for)
  where status = 'deferred';

-- ── business_knowledge ─────────────────────────────────────────────────
-- The shared brain. Slice 1 only reads `name`/`booking_url` off clients,
-- but the voice agent in slice 2 reads all of this, and retrofitting it
-- after calls are already flowing is worse than carrying it now.
create table business_knowledge (
  client_id     uuid primary key references clients(id) on delete cascade,
  services      jsonb not null default '[]'::jsonb,
  hours         jsonb not null default '{}'::jsonb,
  prices        jsonb not null default '{}'::jsonb,
  faqs          jsonb not null default '[]'::jsonb,
  booking_rules jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ── bookings ───────────────────────────────────────────────────────────
create table bookings (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  contact_id        uuid references contacts(id) on delete set null,
  call_id           uuid references calls(id) on delete set null,
  service           text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  source            text not null default 'textback'
    check (source in ('textback', 'voice_agent', 'manual', 'web')),
  calendar_event_id text,
  status            text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  created_at        timestamptz not null default now()
);
create index bookings_client_starts_idx on bookings (client_id, starts_at);

-- ── escalations ────────────────────────────────────────────────────────
-- The orchestrator's output: what needs the human. Supervised, not autonomous.
create table escalations (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  call_id     uuid references calls(id) on delete set null,
  message_id  uuid references messages(id) on delete set null,
  reason      text not null,
  status      text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  assigned_to text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index escalations_open_idx on escalations (client_id, status)
  where status = 'open';

-- ── webhook_events ─────────────────────────────────────────────────────
-- Idempotency ledger. Twilio retries webhooks; the unique constraint is
-- what stops a retry from texting the same caller twice.
create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null default 'twilio',
  resource_sid text not null,
  event_type   text not null,
  received_at  timestamptz not null default now(),
  unique (provider, resource_sid, event_type)
);

-- ── RLS: deny-by-default on everything ─────────────────────────────────
alter table clients            enable row level security;
alter table contacts           enable row level security;
alter table calls              enable row level security;
alter table messages           enable row level security;
alter table business_knowledge enable row level security;
alter table bookings           enable row level security;
alter table escalations        enable row level security;
alter table webhook_events     enable row level security;
