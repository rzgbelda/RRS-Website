-- Best Deals campaign: the featured products on /best-deals, managed from
-- admin instead of hand-edited in code, so staff can swap the monthly
-- lineup without touching VS Code.
--
-- Deliberately references a product by sku rather than storing its own
-- copy of name/price/image -- price especially must always be the live
-- catalog price. Storing a snapshot here would risk exactly the kind of
-- stale-price bug already fixed twice this week; the page reads current
-- price/name/image straight from products at render time, every time.
-- hook_title and pitch_text are the only real per-deal content, since
-- that marketing copy has no home in the products table itself.

create table if not exists public.best_deals (
  id           uuid primary key default gen_random_uuid(),
  sku          text not null references public.products(sku) on delete cascade,
  hook_title   text not null,
  pitch_text   text not null,
  position     integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists best_deals_active_position_idx
  on public.best_deals(is_active, position);

alter table public.best_deals enable row level security;

-- Public read of active deals only -- this is what the campaign page
-- itself queries, unauthenticated.
drop policy if exists "public_read_active_best_deals" on public.best_deals;
create policy "public_read_active_best_deals"
  on public.best_deals for select
  using (is_active = true);

-- Admins manage everything, including inactive/draft deals for a future
-- month's rollout.
drop policy if exists "admin_manage_best_deals" on public.best_deals;
create policy "admin_manage_best_deals"
  on public.best_deals for all
  using (public.is_admin())
  with check (public.is_admin());
