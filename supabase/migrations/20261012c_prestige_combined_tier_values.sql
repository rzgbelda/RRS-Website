-- Adds four new product_tier values so the four Prestige InnStyle sub-lines
-- (Hospitality 200, Hospitality 300, Luxury Blend 600, Wrinkle-Free 600) can
-- be told apart as separate TIERS of one family, instead of four entirely
-- separate families as they are today.
--
-- Why a combined value instead of reusing the existing single-word ones
-- ("Hospitality", "600"): "Hospitality" alone cannot distinguish the T200
-- line from the T300 line -- both would collapse onto the same tier word
-- even though they are different thread counts at different prices. "600"
-- alone cannot distinguish Luxury Blend from Wrinkle-Free -- same thread
-- count, different fabric/finish. The existing single-word tiers (Economy,
-- Premium, Luxury, Ultra Luxury, Suites, Ringspun, Wrinkle-Free, 180, 200,
-- 250, 300, 600, and the can-liner Mil values) are untouched and keep
-- meaning what they already mean elsewhere in the catalog.
--
-- Carries every previously-allowed value forward -- this constraint only
-- ever grows, never narrows (same ALTER TABLE failure risk noted in
-- 20261008_starlinen_import_fix.sql and 20261008c_innstyle_600_tier.sql:
-- dropping and rebuilding the list must include every value any existing
-- row already carries, or the ALTER fails against live data).

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Ultra Luxury','Suites','Ringspun',
       'Hospitality','Wrinkle-Free','180','200','250','300','600',
       '1.0 Mil','1.25 Mil','1.5 Mil','2 Mil',
       '200 Hospitality','300 Hospitality','600 Luxury Blend','600 Wrinkle-Free')
  );
