-- Adds product_tier: the quality line a product belongs to (Economy,
-- Premium, Luxury, ...). Until now this existed only as a word buried in
-- the product name, so the storefront could not badge it, filter on it, or
-- group a variants modal by it.
--
-- Tier is deliberately NOT a grouping axis. Merging the Bath Towel tiers
-- into a single card was measured first and produces a price range of
-- $20.48 - $181.69 across 12 variants, which tells a buyer nothing. Tiers
-- stay separate cards; this column drives a badge and a filter.
--
-- Tier is OPTIONAL and usually absent: 124 of 312 active products have no
-- tier at all (gloves, detergent, tissue, liners). Every consumer must treat
-- null as "render nothing", never as a default.
--
-- The CHECK keeps the vocabulary closed. The CSV importer normalizes case
-- and maps anything unrecognized to null rather than passing it through --
-- one bad cell would otherwise fail an entire batch upsert.

alter table public.products
  add column if not exists product_tier text;

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Suites','Ringspun','Hospitality','Wrinkle-Free')
  );

-- Backfill, most specific first. Every statement is guarded by
-- `product_tier is null`, so the cascade is order-safe and re-runnable: the
-- first pattern to claim a row wins and later ones skip it.
--
-- Order is load-bearing. Five products are named "Luxury 25x50 Bath Towels
-- ... 100% Ringspun Cotton Loops" -- there, Luxury is the tier and Ringspun
-- is the material. An unanchored '%ringspun%' run before Luxury mislabels
-- all five, so Ringspun only counts when the name STARTS with it, which is
-- exactly how the real Ringspun line is named ("Ringspun Cotton Bath Towel
-- - 27\" x 50\"").
--
-- Hospitality runs last: it is the weakest signal and appears alongside
-- stronger ones in the sheet lines.

update public.products set product_tier = 'Wrinkle-Free'
  where product_tier is null and name ~* 'wrinkle[- ]free';

update public.products set product_tier = 'Ringspun'
  where product_tier is null and name ~* '^\s*ringspun';

update public.products set product_tier = 'Suites'
  where product_tier is null and name ilike '%suites%';

update public.products set product_tier = 'Luxury'
  where product_tier is null and name ilike '%luxury%';

update public.products set product_tier = 'Premium'
  where product_tier is null and name ilike '%premium%';

update public.products set product_tier = 'Economy'
  where product_tier is null and name ilike '%economy%';

update public.products set product_tier = 'Hospitality'
  where product_tier is null and name ilike '%hospitality%';

-- Verify:
--
--   select coalesce(product_tier,'(none)') as tier, count(*)
--   from public.products where is_active = true
--   group by 1 order by 2 desc;
--   -- expect: Hospitality 77, Luxury 49, Wrinkle-Free 26, Ringspun 15,
--   --         Suites 8, Premium 7, Economy 6, (none) 124.
--
--   -- Families offering more than one tier. These are not errors: they are
--   -- exactly the cards whose modal should group options BY tier.
--   select product_family, count(distinct product_tier) tiers,
--          string_agg(distinct product_tier, ', ' order by product_tier) which
--   from public.products
--   where is_active = true and product_family is not null
--   group by 1 having count(distinct product_tier) > 1
--   order by 1;
--   -- expect exactly 4: Bath Mat, Bath Towel, Hand Towel, Wash Cloth,
--   --                   each Economy/Premium/Ringspun.
