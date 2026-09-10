-- switchboard 0004_lead_qualification
--
-- Slice 3: Lead qualification and billing
-- Score inbound calls, track qualified leads, and calculate revenue

-- ── calls: lead qualification scoring ──────────────────────────────────
alter table calls
  add column qualification_score numeric(5, 2),
  add column is_qualified_lead boolean default false,
  add column lead_tracking_id text;

comment on column calls.qualification_score is
  'Lead quality score 0-100. >70=transfer, 40-70=queue, <40=booking_link';
comment on column calls.is_qualified_lead is
  'True if score >= 70 (qualified for immediate transfer)';
comment on column calls.lead_tracking_id is
  'References the vapi_call_id when lead is tracked for billing';

create index calls_qualified_lead_idx on calls (client_id, is_qualified_lead)
  where is_qualified_lead = true;

-- ── qualified_leads: billing and conversion tracking ────────────────────
create table qualified_leads (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  call_id            uuid references calls(id) on delete set null,
  caller_name        text not null,
  caller_phone       text not null,
  service_requested  text,
  qualification_score numeric(5, 2) not null,
  transferred_at     timestamptz not null default now(),
  status             text not null default 'pending'
    check (status in ('pending', 'converted', 'lost')),
  converted_at       timestamptz,
  booking_id         uuid references bookings(id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table qualified_leads is
  'Tracks qualified leads transferred to client for billing ($150/lead)';
comment on column qualified_leads.status is
  'pending=transferred but not converted, converted=became booking, lost=no follow-up';
comment on column qualified_leads.transferred_at is
  'When the lead was transferred to the client (billing starts here)';

create index qualified_leads_client_idx on qualified_leads (client_id, transferred_at desc);
create index qualified_leads_status_idx on qualified_leads (client_id, status);
create index qualified_leads_transferred_at_idx on qualified_leads (transferred_at);

-- ── rls policies ──────────────────────────────────────────────────────
alter table qualified_leads enable row level security;

create policy "Clients can read their own qualified leads"
  on qualified_leads for select
  using (client_id = auth.uid() or exists (
    select 1 from clients where id = client_id and user_id = auth.uid()
  ));

create policy "Service can insert qualified leads"
  on qualified_leads for insert
  with check (true);
