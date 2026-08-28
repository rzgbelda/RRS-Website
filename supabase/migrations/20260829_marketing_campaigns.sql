-- Marketing Account, Phase 2/3: Campaign Management + the realistic slice
-- of Email Marketing (segmented list + template library + manual send).
-- True automated drip funnels are NOT built here -- that needs a scheduled
-- trigger system, a meaningfully bigger and separate piece of work; this
-- covers campaign tracking, a content calendar (as a per-campaign scheduled
-- item list, not a full month-grid calendar widget), A/B version notes,
-- product/promo linking, and one-off segmented sends via Resend (already
-- integrated site-wide -- no new email provider needed).

create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  campaign_type    text not null default 'email' check (campaign_type in ('email','social','landing_page','product_promo','other')),
  audience_segment text,     -- free-text description staff can read at a glance, e.g. "Hotels, New Leads, from Trade Show"
  segment_customer_type text, -- structured filters actually used to compute a live recipient list --
  segment_lead_status   text, -- null in any of these three means "don't filter on this axis"
  segment_lead_source    text,
  start_date       date,
  end_date         date,
  status           text not null default 'draft' check (status in ('draft','scheduled','active','completed','archived')),
  linked_product_sku    text references public.products(sku) on delete set null,
  linked_best_deal_id   uuid references public.best_deals(id) on delete set null,
  linked_moq_group      text,  -- products.moq_group is free text, not its own table -- see 20260821_moq_groups.sql
  notes            text,      -- also where A/B version notes live for now (subject lines tried, offers tested, etc.)
  emails_sent      integer not null default 0,
  last_sent_at     timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists campaigns_status_idx on public.campaigns(status);

create or replace function public.campaigns_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists campaigns_before_update on public.campaigns;
create trigger campaigns_before_update
  before update on public.campaigns
  for each row execute function public.campaigns_set_updated_at();

-- Content calendar: scheduled items (a social post, an email send, any
-- dated marketing activity) under a campaign. A per-campaign dated list
-- rather than a month-grid calendar widget -- the real information (what's
-- scheduled when) is the same either way, and this is the buildable v1.
create table if not exists public.campaign_content (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  scheduled_date date not null,
  content_type   text not null default 'email' check (content_type in ('email','social_post','other')),
  title          text not null,
  notes          text,
  status         text not null default 'planned' check (status in ('planned','posted','sent','skipped')),
  created_at     timestamptz not null default now()
);

create index if not exists campaign_content_campaign_idx on public.campaign_content(campaign_id, scheduled_date);

-- Email template library.
create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text not null,
  body_html  text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.email_templates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists email_templates_before_update on public.email_templates;
create trigger email_templates_before_update
  before update on public.email_templates
  for each row execute function public.email_templates_set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY -- same access level as CRM (is_crm_staff:
-- owner + marketing). Campaigns/email marketing are marketing functions,
-- not part of the narrow Admin (Users/Tickets/Hero/About) role.
-- ============================================================
alter table public.campaigns enable row level security;
drop policy if exists "crm_staff_manage_campaigns" on public.campaigns;
create policy "crm_staff_manage_campaigns" on public.campaigns
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

alter table public.campaign_content enable row level security;
drop policy if exists "crm_staff_manage_campaign_content" on public.campaign_content;
create policy "crm_staff_manage_campaign_content" on public.campaign_content
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

alter table public.email_templates enable row level security;
drop policy if exists "crm_staff_manage_email_templates" on public.email_templates;
create policy "crm_staff_manage_email_templates" on public.email_templates
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());
