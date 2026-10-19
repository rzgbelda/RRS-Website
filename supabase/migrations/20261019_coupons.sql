-- Coupons / voucher codes, managed from Admin > Coupons.
--
-- Phase 1 (this migration + admin-coupons.js): staff create, generate and
-- manage codes. Nothing customer-facing reads this table yet -- checkout
-- does not accept a code until phase 2 wires it into api/_lib/price-cart.js,
-- which re-prices every order server-side. The browser must never be the
-- authority on a discount, the same rule that file already enforces for
-- prices, so customers never get read access here: phase 2 validates codes
-- with the service role.
--
-- Best Deals: a product with an active best_deals row is already sold at a
-- reduced price, so by default a coupon does NOT discount it
-- (include_best_deals = false). Staff can still allow it per coupon.
-- Evaluated at checkout time, not stored per SKU, so a product added to or
-- removed from Best Deals later is handled without editing any coupon.
--
-- What a coupon covers (applies_to):
--   all        -- every product, minus exclude_skus
--   categories -- products whose category_name is in category_names,
--                 minus exclude_skus
--   products   -- exactly the SKUs in product_skus
-- Best Deals items are then removed from any of those unless
-- include_best_deals is true.
--
-- Discount maths (implemented in phase 2, recorded here as the contract):
--   percent -- discount_value % of the eligible lines' subtotal, capped at
--              max_discount when set
--   fixed   -- discount_value dollars off the eligible lines' subtotal,
--              never more than that subtotal
-- min_subtotal is checked against the whole merchandise subtotal.

create table if not exists public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  description        text,
  discount_type      text not null default 'percent',
  discount_value     numeric(10,2) not null,
  max_discount       numeric(10,2),
  min_subtotal       numeric(10,2),
  applies_to         text not null default 'all',
  product_skus       text[] not null default '{}',
  category_names     text[] not null default '{}',
  exclude_skus       text[] not null default '{}',
  include_best_deals boolean not null default false,
  starts_at          timestamptz,
  expires_at         timestamptz,
  usage_limit        integer,
  per_customer_limit integer,
  times_used         integer not null default 0,
  is_active          boolean not null default true,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Codes are stored upper-case so "save10" and "SAVE10" are one code.
  constraint coupons_code_format    check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint coupons_discount_type  check (discount_type in ('percent', 'fixed')),
  constraint coupons_discount_value check (
    discount_value > 0 and (discount_type <> 'percent' or discount_value <= 100)
  ),
  constraint coupons_max_discount   check (max_discount is null or max_discount > 0),
  constraint coupons_min_subtotal   check (min_subtotal is null or min_subtotal >= 0),
  constraint coupons_applies_to     check (applies_to in ('all', 'categories', 'products')),
  constraint coupons_scope_filled   check (
    (applies_to <> 'products'   or cardinality(product_skus)   > 0) and
    (applies_to <> 'categories' or cardinality(category_names) > 0)
  ),
  constraint coupons_dates          check (starts_at is null or expires_at is null or expires_at > starts_at),
  constraint coupons_usage_limit    check (usage_limit is null or usage_limit > 0),
  constraint coupons_customer_limit check (per_customer_limit is null or per_customer_limit > 0),
  constraint coupons_times_used     check (times_used >= 0)
);

create index if not exists coupons_active_idx on public.coupons(is_active, expires_at);

alter table public.coupons enable row level security;

-- Owner and Marketing / Head of Operations (is_marketing()) manage coupons,
-- the same people who run Best Deals and Campaigns. No public policy: see
-- the header.
drop policy if exists "staff_manage_coupons" on public.coupons;
create policy "staff_manage_coupons"
  on public.coupons for all
  using (public.is_owner() or public.is_marketing())
  with check (public.is_owner() or public.is_marketing());

-- Verify:
--   select code, discount_type, discount_value, applies_to, include_best_deals, is_active
--   from public.coupons order by created_at desc;
