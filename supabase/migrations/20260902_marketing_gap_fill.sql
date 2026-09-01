-- Second-pass build from the email-funnel-platform spec review: the real,
-- useful-for-RRS pieces still missing after 20260901f (tracking +
-- automations). Skips anything that only makes sense for a multi-tenant
-- SaaS product (landing pages, workspaces, API-key management, Zapier) --
-- these five extend the existing CRM/Campaigns tabs:
--   1. Tags on leads (quote_requests) + a consent/opt-in field
--   2. Scheduled ("send later") campaign sends
--   3. (test-email-before-sending needs no schema -- client-only, see admin.js)
--   4. Reporting reads existing campaign_email_events -- no schema needed
--   5. CSV import needs no schema -- writes straight to quote_requests

-- ============================================================
-- TAGS + CONSENT on leads. tags is a free-text array (staff type whatever
-- label makes sense, e.g. "trade-show", "vip") rather than a separate
-- tags table with its own CRUD -- matches how audience_segment already
-- works on campaigns (free text staff read, not a rigid taxonomy).
-- consent_marketing defaults true (existing leads all came from a real
-- quote-request submission, an affirmative action) but is NOT retroactive
-- proof of consent for the CAN-SPAM record it's meant to start keeping --
-- captured explicitly by checkout.html's request form and account.html's
-- profile going forward via the corresponding checkout-side migration
-- decision, see the marketing team guide.
-- ============================================================
alter table public.quote_requests add column if not exists tags text[] not null default '{}';
alter table public.campaigns add column if not exists segment_tag text; -- 4th segment filter, alongside the existing customer-type/lead-status/lead-source columns from 20260829_marketing_campaigns.sql
alter table public.quote_requests add column if not exists consent_marketing boolean not null default true;
alter table public.quote_requests add column if not exists consent_recorded_at timestamptz;

create index if not exists quote_requests_tags_idx on public.quote_requests using gin (tags);

-- ============================================================
-- SCHEDULED CAMPAIGN SENDS -- "send later" instead of only send-now.
-- One row per scheduled send; the daily cron sweep (the same one that
-- already runs reorders and automations, api/create-order.js) picks up
-- anything due and sends it the same way a manual "Send to Segment" click
-- already does, then marks it sent. A campaign can only have one pending
-- scheduled send at a time (the partial unique index below) -- scheduling
-- a new one while one's still pending replaces it rather than stacking
-- duplicate sends.
-- ============================================================
create table if not exists public.campaign_scheduled_sends (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  subject      text not null,
  body_html    text not null,
  send_at      timestamptz not null,
  sent_at      timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists campaign_scheduled_sends_due_idx
  on public.campaign_scheduled_sends(send_at) where sent_at is null;

create unique index if not exists campaign_scheduled_sends_one_pending_idx
  on public.campaign_scheduled_sends(campaign_id) where sent_at is null;

alter table public.campaign_scheduled_sends enable row level security;
drop policy if exists "crm_staff_manage_scheduled_sends" on public.campaign_scheduled_sends;
create policy "crm_staff_manage_scheduled_sends" on public.campaign_scheduled_sends
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());
