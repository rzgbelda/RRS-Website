-- Adds thread-count values (180/200/250) to product_tier's closed
-- vocabulary, for Starlinen's sheet line (Flat Sheet, Fitted Sheet,
-- Pillowcase). Thread count isn't a quality-tier WORD like Economy/Luxury,
-- but reuses this same column and the tier-grouped selector UI (both the
-- catalog card's variant modal and the product page's two-step
-- Tier-then-Size picker) rather than a second dimension: a sheet family
-- is picked by thread count exactly the way a towel family is picked by
-- quality tier, so the existing grouping mechanism already does the right
-- thing once these values are allowed through the CHECK constraint.
--
-- Without this, every Starlinen sheet row would fail to tag a tier (or
-- the whole CSV batch upsert would reject on the constraint, depending on
-- how the client sends it), the same class of gap Ultra Luxury hit for
-- towels in 20260930_family_key_and_ultra_luxury_tier.sql.

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Ultra Luxury','Suites','Ringspun',
       'Hospitality','Wrinkle-Free','180','200','250')
  );

-- Verify:
--   select coalesce(product_tier,'(none)') as tier, count(*)
--   from public.products where is_active = true
--   group by 1 order by 2 desc;
