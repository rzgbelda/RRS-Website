-- Two changes needed to onboard the Sasso/Starlinen catalog cleanly:
--
-- 1. product_tier is missing "Ultra Luxury". Starlinen's towel line has four
--    tiers per product type (Economy/Premium/Luxury/Ultra Luxury), and
--    without this value in the CHECK constraint, any "Ultra Luxury" row
--    would fail to tag (or worse, get caught by the existing '%luxury%'
--    pattern in 20260915c_product_tier.sql's backfill and mislabeled as
--    plain "Luxury" -- Ultra Luxury contains the substring "luxury").
--
-- 2. product_family is a free-text display name, historically set with the
--    tier baked into the string itself (see 20260915_group_product_variants
--    .sql: "200 Hospitality Full Flat Sheet"). That means the same product
--    type at two different tiers -- "Economy White Cotton Wash Cloth" vs.
--    "Ultra Luxury White Long-Staple Cotton Wash Cloth" -- naturally lands
--    on two different product_family values and therefore two different
--    catalog cards, which is exactly the duplicate-card problem the
--    Starlinen import must avoid. family_key is a separate, stable grouping
--    key (slug of the base product type only, e.g. "wash-cloth") that
--    grouping logic keys on instead of the display name, so renaming a
--    family or having tier-specific display names never forks the group.

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Ultra Luxury','Suites','Ringspun','Hospitality','Wrinkle-Free')
  );

alter table public.products
  add column if not exists family_key text;

create index if not exists products_family_key_idx on public.products (family_key);

-- Backfill from the existing product_family display name: lowercase, strip
-- everything but letters/digits/spaces, collapse whitespace to hyphens.
-- Re-runnable and safe -- only touches rows where family_key is still null.
update public.products
set family_key = trim(both '-' from
  regexp_replace(
    regexp_replace(lower(product_family), '[^a-z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ))
where family_key is null and product_family is not null;

-- products_public lists its columns explicitly rather than select *, so
-- family_key is invisible to the storefront until the view is recreated to
-- include it. Based on the most recent prior definition (20260923b), with
-- family_key appended -- reusing an older revision here would have silently
-- dropped is_fast_ship/tier*_min_qty/in_stock (added in 20260921 and
-- 20260923b) back out of the view.
--
-- family_key is appended at the END of the select list, not inlined next to
-- product_family/variant_label where it reads more naturally: Postgres's
-- `create or replace view` only allows ADDING columns at the end of the
-- existing list, never inserting one in the middle -- doing that errors
-- with 42P16 ("cannot change name of view column ... to ...") because it
-- reads as renaming every column after the insertion point.
create or replace view public.products_public as
select
  id, name, sku, description, overview, image_url, images,
  category_id, category_name,
  price, sale_price, is_on_sale,
  case_qty, pack_size, unit, sell_by_each,
  price_tier1, price_tier2, price_tier3, product_tier,
  product_family, variant_label, color_group, color_label,
  moq, moq_group, moq_group_min,
  weight, length, width, height,
  feature1, feature2, feature3, feature4,
  meta_title, meta_description,
  is_featured, is_active, created_at, updated_at,
  is_fast_ship,
  tier1_min_qty, tier2_min_qty, tier3_min_qty,
  in_stock,
  family_key
  -- Deliberately excluded: cost_per_case, landed_cost, truckload_qty,
  -- tier1_cost, tier2_cost, tier3_cost (margin data), vendor_id and
  -- distributor (internal supplier links).
from public.products
where is_active = true;

grant select on public.products_public to anon, authenticated;

-- Verify:
--
--   select coalesce(product_tier,'(none)') as tier, count(*)
--   from public.products where is_active = true
--   group by 1 order by 2 desc;
--
--   select family_key, count(distinct product_family) as family_name_variants,
--          string_agg(distinct product_family, ' | ') as names
--   from public.products
--   where family_key is not null
--   group by 1 having count(distinct product_family) > 1;
--   -- rows here show families whose display name varies across members --
--   -- expected once Starlinen tiers are unified under one family_key.
