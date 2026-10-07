-- Adds '600' to product_tier's closed vocabulary for the InnStyle 600
-- Luxury Blend bed sheet line (InnStyle's own Wrinkle-Free 600 line
-- already uses the existing 'Wrinkle-Free' tier word, so only the
-- numeric '600' is new). Same reasoning as 20261008_starlinen_import_fix.sql
-- adding '300' for Starlinen's Millennium line: thread-count-like numbers
-- reuse product_tier/the existing tier-then-size picker rather than a
-- second dimension, and an unlisted value fails the whole row's write,
-- not just that column.
--
-- Carries every previously-allowed value forward -- this constraint only
-- ever grows, never narrows (same ALTER TABLE failure risk flagged in
-- 20261008_starlinen_import_fix.sql's own history applies here: dropping
-- and rebuilding the list must include every value any existing row
-- already carries, or the ALTER fails against live data).

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Ultra Luxury','Suites','Ringspun',
       'Hospitality','Wrinkle-Free','180','200','250','300','600',
       '1.0 Mil','1.25 Mil','1.5 Mil','2 Mil')
  );
