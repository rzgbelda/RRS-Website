-- Sales Closer role: in-house cold-calling sales reps who earn a flat
-- commission on orders they close, per the CEO's "Sales Commission Margin
-- Analysis" (Sept 2026): Tier 1 closers = 8% of order value, Tier 2 = 5%.
-- Straight percentage of what the client pays (not gross-profit-based),
-- confirmed viable there even on RRS's thinnest-margin item.
--
-- Deliberately a separate table set from sub_distributors/order_referrals/
-- affiliate_payouts rather than folding sales reps into the affiliate
-- system -- affiliate commission is revenue-tiered company-wide, sales
-- commission is a flat rate per rep's tier, and keeping them apart means
-- neither can break the other while both are actively evolving.
--
-- role value: profiles.role = 'sales'.

create table if not exists public.sales_reps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  sales_code text not null,
  tier text not null default 'tier1' check (tier in ('tier1', 'tier2')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists sales_reps_code_idx
  on public.sales_reps (lower(sales_code));

create index if not exists sales_reps_user_id_idx on public.sales_reps(user_id);

-- Commission rate is looked up from tier at the call site (admin.js), same
-- way affiliate tiers are computed in JS with the SQL comment noting JS is
-- authoritative -- kept here as a comment for reference, not enforced by
-- the DB: tier1 = 0.08, tier2 = 0.05.

create table if not exists public.sales_referrals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sales_rep_id uuid not null references public.sales_reps(id) on delete cascade,
  order_value numeric(10,2) not null,       -- item revenue the % is applied to (client price, before tax/freight)
  commission_rate numeric(5,4) not null,    -- snapshotted 0.08 / 0.05 at attribution time so a later tier change never changes paid history
  commission_amount numeric(10,2) not null, -- order_value * commission_rate
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists sales_referrals_rep_idx on public.sales_referrals(sales_rep_id);

create table if not exists public.sales_payouts (
  id uuid primary key default gen_random_uuid(),
  sales_rep_id uuid not null references public.sales_reps(id) on delete cascade,
  period_month date not null,
  referred_revenue numeric(10,2) not null,
  commission_rate numeric(5,4) not null,
  commission_amount numeric(10,2) not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (sales_rep_id, period_month)
);

create index if not exists sales_payouts_status_idx on public.sales_payouts(status);

alter table public.sales_reps enable row level security;
alter table public.sales_referrals enable row level security;
alter table public.sales_payouts enable row level security;

-- Staff-only management (owner/admin), mirrors sub_distributors' base
-- policy. Uses is_admin() (already defined) rather than is_staff(), since
-- is_staff() includes 'developer' and managing sales reps/payouts is an
-- account-management action like affiliate management, not a dev task.
create policy "staff_manage_sales_reps" on public.sales_reps
  for all using (public.is_admin()) with check (public.is_admin());

create policy "staff_manage_sales_referrals" on public.sales_referrals
  for all using (public.is_admin()) with check (public.is_admin());

create policy "staff_manage_sales_payouts" on public.sales_payouts
  for all using (public.is_admin()) with check (public.is_admin());

-- Self-service SELECT-only policies, same linkage pattern as
-- 20260916_affiliate_self_service_rls.sql (sales_reps.user_id = auth.uid()).
-- No self-service INSERT/UPDATE anywhere: a sales rep can look but not
-- touch their own code, tier, or any order -- matching the "look yes,
-- change no" scope affiliates get. Attribution rows in sales_referrals are
-- written server-side only (via the service role in the order-creation
-- API), never by an open client-side insert policy -- this is the fix for
-- the known order_referrals `with_check: true` gap: that hole is never
-- reproduced here because there is no client-writable insert path at all.

create policy "sales_read_own_row" on public.sales_reps
  for select
  using (user_id = auth.uid());

create policy "sales_read_own_referrals" on public.sales_referrals
  for select
  using (
    exists (
      select 1 from public.sales_reps sr
      where sr.id = sales_referrals.sales_rep_id
        and sr.user_id = auth.uid()
    )
  );

create policy "sales_read_own_payouts" on public.sales_payouts
  for select
  using (
    exists (
      select 1 from public.sales_reps sr
      where sr.id = sales_payouts.sales_rep_id
        and sr.user_id = auth.uid()
    )
  );

drop policy if exists "sales_read_referred_orders" on public.orders;
create policy "sales_read_referred_orders" on public.orders
  for select
  using (
    exists (
      select 1
      from public.sales_referrals r
      join public.sales_reps sr on sr.id = r.sales_rep_id
      where r.order_id = orders.id
        and sr.user_id = auth.uid()
    )
  );

-- Public lookup for a sales code entered at checkout -- same reasoning as
-- lookup_affiliate_by_subdomain(): sales_reps stays staff/self-only under
-- RLS, so resolving "which rep owns this code" for a customer needs a
-- narrow security-definer function rather than opening the table.
create or replace function public.lookup_sales_code(p_code text)
returns table (id uuid, full_name text, sales_code text, tier text)
language sql
stable
security definer
set search_path = public
as $fn$
  select sr.id, sr.full_name, sr.sales_code, sr.tier
  from public.sales_reps sr
  where lower(sr.sales_code) = lower(trim(p_code))
    and sr.status = 'active'
  limit 1;
$fn$;

revoke all on function public.lookup_sales_code(text) from public;
grant execute on function public.lookup_sales_code(text) to anon, authenticated;

-- Let sales reps file dev tickets (reporter-only: they can create and read
-- their own tickets/comments, not triage or see other staff's tickets).
-- dev_tickets/dev_ticket_comments were staff-only (is_staff()) via a single
-- "for all" policy each (20260814_dev_tickets.sql) -- adding a narrower
-- sales policy alongside it rather than widening is_staff() itself, since
-- is_staff() gates several other staff-only surfaces this role must not get.
create policy "sales_create_own_tickets" on public.dev_tickets
  for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sales')
    and reporter_id = auth.uid()
  );

create policy "sales_read_own_tickets" on public.dev_tickets
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sales')
    and reporter_id = auth.uid()
  );

create policy "sales_manage_own_ticket_comments" on public.dev_ticket_comments
  for all
  using (
    exists (
      select 1 from public.dev_tickets t
      join public.profiles p on p.id = auth.uid()
      where t.id = dev_ticket_comments.ticket_id
        and p.role = 'sales'
        and t.reporter_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.dev_tickets t
      join public.profiles p on p.id = auth.uid()
      where t.id = dev_ticket_comments.ticket_id
        and p.role = 'sales'
        and t.reporter_id = auth.uid()
    )
  );
