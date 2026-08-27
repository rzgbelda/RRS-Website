-- Marketing Account, Phase 1: CRM core.
--
-- Per the architecture decision made with the CEO: a "lead" is not a new,
-- separate record -- it IS a quote_requests row, extended with the columns
-- a lead pipeline needs. This avoids duplicating contact data across two
-- tables that would otherwise need to be kept in sync by hand. A lead
-- becomes a "customer" the same way it always implicitly has: it placed an
-- order. "Repeat customer" is computed from orders at read time, not stored
-- here, so it can never drift out of sync with reality.

-- ============================================================
-- ROLE: marketing
-- ============================================================
-- profiles.role is free text (see profiles table) -- no check constraint to
-- alter. Mirrors is_admin()/is_developer() exactly.

create or replace function public.is_marketing()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'marketing' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Anyone who may work the CRM/lead pipeline: admins and marketing.
-- Deliberately NOT the same as is_staff() (admin+developer, used for the dev
-- ticket board) -- marketing has no default access to dev tickets, and
-- developers have no default access to leads, per the requested scoping.
create or replace function public.is_crm_staff()
returns boolean language sql security definer stable as $$
  select public.is_admin() or public.is_marketing()
$$;

-- ============================================================
-- quote_requests: lead pipeline columns
-- ============================================================
-- status already holds free text with no check constraint (confirmed --
-- no such constraint exists in the schema), so the pipeline's 5 stages
-- (new/contacted/quote_sent/customer/repeat_customer) need no migration of
-- their own to introduce; existing rows simply keep whatever status they
-- already have (typically 'new'), same as before this migration.
alter table public.quote_requests add column if not exists lead_source text;
alter table public.quote_requests add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists quote_requests_assigned_to_idx on public.quote_requests(assigned_to);
create index if not exists quote_requests_status_idx      on public.quote_requests(status);

-- ============================================================
-- CRM ACTIVITY LOG
-- ============================================================
-- Calls / emails / notes / follow-ups / status changes against a lead.
-- FK'd straight to quote_requests -- see the note at the top of this file
-- for why a lead doesn't get its own separate table.
create table if not exists public.crm_activity_log (
  id                uuid primary key default gen_random_uuid(),
  quote_request_id  uuid not null references public.quote_requests(id) on delete cascade,
  created_at        timestamptz not null default now(),
  author_id         uuid references auth.users(id) on delete set null,
  author_name       text,
  activity_type     text not null default 'note' check (activity_type in ('call','email','note','follow_up','status_change','other')),
  body              text not null
);

create index if not exists crm_activity_log_lead_idx on public.crm_activity_log(quote_request_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Purely additive: this grants crm staff (admin + marketing) access to
-- quote_requests without touching whatever existing policy already lets a
-- customer see their own request or lets the quote-request Edge Function
-- (service role) insert one -- Postgres OR's permissive policies together,
-- so this can only ever add access, never remove any that exists today.
alter table public.quote_requests enable row level security;
drop policy if exists "crm_staff_manage_quote_requests" on public.quote_requests;
create policy "crm_staff_manage_quote_requests" on public.quote_requests
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());

alter table public.crm_activity_log enable row level security;
drop policy if exists "crm_staff_manage_activity_log" on public.crm_activity_log;
create policy "crm_staff_manage_activity_log" on public.crm_activity_log
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());
