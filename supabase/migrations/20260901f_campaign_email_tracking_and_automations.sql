-- Two real, scoped pieces from the email-funnel-platform spec review --
-- NOT a general SaaS funnel builder (that would be a separate, unrelated
-- product); these extend RRS's own existing Campaigns/CRM tabs.
--
-- 1. Real delivery/open/click/bounce/unsubscribe tracking, fed by Resend's
--    own webhook events (already the email provider site-wide -- no new
--    service). campaigns.emails_sent already existed as a raw count; this
--    adds what actually happened to each one.
-- 2. One real trigger -> delay -> email automation engine (CRM lead
--    created, or a quote sent with no order N days later), not a visual
--    drag-and-drop builder -- a small table of active automations plus a
--    queue of pending sends a cron sweep works through, which is the
--    entire mechanism a drag-and-drop UI would produce anyway.

-- ============================================================
-- CAMPAIGN EMAIL EVENTS -- one row per Resend webhook event for an email
-- this system sent. campaign_id is nullable: automation-sequence sends
-- (below) also flow through this table so both surfaces share one metrics
-- source, but they aren't tied to a marketing Campaign record.
-- ============================================================
create table if not exists public.campaign_email_events (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.campaigns(id) on delete cascade,
  automation_id uuid, -- fk added below once automations exists
  resend_email_id text,        -- Resend's own id for the sent message, ties every event for one send together
  recipient     text not null,
  event_type    text not null check (event_type in
    ('sent','delivered','delivery_delayed','opened','clicked','bounced','complained','unsubscribed')),
  link_url      text,          -- set only for 'clicked' events
  occurred_at   timestamptz not null default now(),
  raw           jsonb          -- the full Resend payload, kept for anything not modeled above
);

create index if not exists campaign_email_events_campaign_idx   on public.campaign_email_events(campaign_id);
create index if not exists campaign_email_events_automation_idx on public.campaign_email_events(automation_id);
create index if not exists campaign_email_events_resend_id_idx  on public.campaign_email_events(resend_email_id);
create index if not exists campaign_email_events_type_idx       on public.campaign_email_events(event_type);

alter table public.campaign_email_events enable row level security;
drop policy if exists "crm_staff_read_email_events" on public.campaign_email_events;
create policy "crm_staff_read_email_events" on public.campaign_email_events
  for select using (public.is_crm_staff());
-- No public/staff insert policy -- only ever written by the webhook
-- handler, which uses the service-role key and bypasses RLS entirely
-- (same pattern api/stripe-webhook.js already uses for orders).

-- ============================================================
-- AUTOMATIONS -- a small library of trigger -> delay -> email sequences.
-- Two trigger types cover the buildable, real cases, and both target the
-- same table: a CRM "lead" IS a quote_requests row (confirmed against
-- admin.js's CRM tab, which reads quote_requests directly -- there is no
-- separate leads table). 'crm_lead_created' fires once per new row after
-- delay_days; 'quote_stale' fires once per row that's gone
-- stale_after_days with no matching order. Both are evaluated by a cron
-- sweep, not a live event listener -- consistent with how reorders already
-- work (api/create-order.js's daily sweep).
-- ============================================================
create table if not exists public.automations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  trigger_type  text not null check (trigger_type in ('crm_lead_created','quote_stale')),
  delay_days    integer not null default 0 check (delay_days >= 0),
  -- Only meaningful for quote_stale: how many days with no order before
  -- this counts as "stale" and the delay clock starts.
  stale_after_days integer,
  subject       text not null,
  body_html     text not null,
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.automations_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists automations_before_update on public.automations;
create trigger automations_before_update
  before update on public.automations
  for each row execute function public.automations_set_updated_at();

alter table public.automations enable row level security;
drop policy if exists "crm_staff_manage_automations" on public.automations;
create policy "crm_staff_manage_automations" on public.automations
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

alter table public.campaign_email_events
  add constraint campaign_email_events_automation_fk
  foreign key (automation_id) references public.automations(id) on delete cascade;

-- ============================================================
-- AUTOMATION SENDS -- one row per (automation, target) pair, tracking
-- whether it's still waiting out its delay or has already fired. The
-- unique constraint is what makes the whole engine idempotent: the cron
-- sweep can run as often as it likes and never double-send the same
-- automation to the same lead/quote.
-- ============================================================
create table if not exists public.automation_sends (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references public.automations(id) on delete cascade,
  target_type    text not null default 'quote_request' check (target_type in ('quote_request')),
  target_id      uuid not null references public.quote_requests(id) on delete cascade,
  recipient_email text not null,
  eligible_at    timestamptz not null, -- when the delay clock finishes and this becomes sendable
  sent_at        timestamptz,          -- null until actually sent
  skipped_reason text,                 -- e.g. 'no_email', 'lead_converted' -- set instead of sent_at when this target no longer qualifies
  created_at     timestamptz not null default now(),
  unique (automation_id, target_type, target_id)
);

create index if not exists automation_sends_pending_idx
  on public.automation_sends(eligible_at) where sent_at is null and skipped_reason is null;

alter table public.automation_sends enable row level security;
drop policy if exists "crm_staff_read_automation_sends" on public.automation_sends;
create policy "crm_staff_read_automation_sends" on public.automation_sends
  for select using (public.is_crm_staff());
