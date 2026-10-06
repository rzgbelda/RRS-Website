-- Adds can-liner thickness values (Mil for LDPE, Micron for HDPE) to
-- product_tier's closed vocabulary, same reasoning as 20260930b's thread
-- counts: thickness isn't a quality-tier WORD like Economy/Luxury, but
-- reuses this same column and the existing tier-grouped selector UI (the
-- catalog card's variant modal and the product page's Tier-then-Size
-- picker) rather than inventing a second dimension -- a can liner family
-- is picked by thickness exactly the way a towel family is picked by
-- quality tier, so the existing grouping mechanism already does the right
-- thing once these values are allowed through the CHECK constraint.
--
-- Specific values, not an open pattern: the Wraptite LDPE/HDPE can liner
-- import (2026-10-06) needed exactly these four to fix its missing variant
-- grouping (33/40-45/56/55-60 Gallon LDPE families at 1.0/1.25/1.5/2 Mil;
-- Kleenline Coreless Roll liners at 1.5/2 Mil -- normalized to "2 Mil" even
-- where a source name said "2.0 mil", so the two lines share one tier value
-- instead of the vocabulary carrying both spellings of the same thickness).
-- HDPE products in the same import (7-10/12-16/20-30 Gallon, 6/8/13/16
-- Micron) are each the only thickness on file for their size today, so no
-- Micron value is needed here yet -- add it the same way if a second
-- thickness ever ships for one of them.
--
-- Without this, those rows fail to tag a tier (or the whole CSV batch
-- upsert rejects on the constraint, per the same gap 20260930b's own
-- comment describes for thread counts).

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Ultra Luxury','Suites','Ringspun',
       'Hospitality','Wrinkle-Free','180','200','250',
       '1.0 Mil','1.25 Mil','1.5 Mil','2 Mil')
  );

-- Verify:
--   select coalesce(product_tier,'(none)') as tier, count(*)
--   from public.products where is_active = true
--   group by 1 order by 2 desc;
