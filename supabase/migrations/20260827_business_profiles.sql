-- RRS-19: multiple business profiles under one customer account.
--
-- Orders and quote_requests already store business_name as free text per
-- row (not a foreign key to profiles) -- see schema.sql. That means a
-- customer's businesses can be split apart purely by matching business_name
-- text, with no need to retrofit business_id onto every historical order.
-- This migration just adds the businesses table itself and backfills one
-- row per existing customer so nobody's current single business "disappears"
-- once the switcher ships.

create table if not exists public.businesses (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  business_type text,
  contact_name  text,
  phone         text,
  email         text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists businesses_user_idx on public.businesses(user_id);

create or replace function public.businesses_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists businesses_before_update on public.businesses;
create trigger businesses_before_update
  before update on public.businesses
  for each row execute function public.businesses_set_updated_at();

-- Backfill: every customer with a business_name today gets exactly one
-- businesses row marked as their default, seeded from their existing
-- profile fields. Guarded so re-running this migration is a no-op.
insert into public.businesses (user_id, business_name, business_type, contact_name, phone, email, is_default)
select p.id, p.business_name, p.business_type, p.contact_name, p.phone, p.email, true
from public.profiles p
where p.role = 'customer'
  and coalesce(p.business_name, '') <> ''
  and not exists (select 1 from public.businesses b where b.user_id = p.id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.businesses enable row level security;

drop policy if exists "owner_manage_own_businesses" on public.businesses;
create policy "owner_manage_own_businesses" on public.businesses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admin_read_all_businesses" on public.businesses;
create policy "admin_read_all_businesses" on public.businesses
  for select using (public.is_admin());
