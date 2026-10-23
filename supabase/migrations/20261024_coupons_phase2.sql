-- Coupons, phase 2: customers apply a code at checkout.
--
-- The discount itself is computed server-side only, in api/_lib/coupons.js
-- (called from api/_lib/price-cart.js) with the service role -- customers
-- still have no read access to public.coupons (see 20261019_coupons.sql).
--
-- One discount per order (user decision, 2026-10-19): a coupon and the 5%
-- Reorder Program discount never stack. The customer picks which one; the
-- server enforces it.
--
-- What this adds:
--   orders.coupon_code / coupon_discount -- what was applied to the order,
--     shown in Admin > Orders and taken off the invoice payment link.
--   coupon_redemptions -- one row per order that used a coupon; drives the
--     per-customer limit (by email) and the usage history.
--   redeem_coupon() -- records a redemption and bumps coupons.times_used in
--     one step, idempotent per order (the browser's create-order and the
--     Stripe webhook safety net can both call it).

alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists coupon_discount numeric(10,2) not null default 0;

create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  code        text not null,
  email       text,
  discount    numeric(10,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (order_id)
);

create index if not exists coupon_redemptions_coupon_email_idx
  on public.coupon_redemptions (coupon_id, lower(email));

alter table public.coupon_redemptions enable row level security;

-- Same people who manage coupons can see who used them. Writes happen only
-- through redeem_coupon() with the service role.
drop policy if exists "staff_read_coupon_redemptions" on public.coupon_redemptions;
create policy "staff_read_coupon_redemptions"
  on public.coupon_redemptions for select
  using (public.is_owner() or public.is_marketing());

create or replace function public.redeem_coupon(
  p_coupon_id uuid,
  p_order_id  uuid,
  p_code      text,
  p_email     text,
  p_discount  numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  inserted int;
begin
  insert into public.coupon_redemptions (coupon_id, order_id, code, email, discount)
  values (p_coupon_id, p_order_id, upper(p_code), lower(nullif(trim(p_email), '')), coalesce(p_discount, 0))
  on conflict (order_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    update public.coupons set times_used = times_used + 1, updated_at = now() where id = p_coupon_id;
  end if;
  return inserted > 0;
end;
$fn$;

-- Service role only: never callable from a browser.
revoke all on function public.redeem_coupon(uuid, uuid, text, text, numeric) from public, anon, authenticated;

-- Verify:
--   select o.order_number, o.coupon_code, o.coupon_discount from public.orders o
--   where o.coupon_code is not null order by o.created_at desc limit 10;
--   select code, times_used, usage_limit from public.coupons order by updated_at desc;
