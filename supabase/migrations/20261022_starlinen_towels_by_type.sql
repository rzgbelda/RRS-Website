-- Starlinen towels: one catalog card per TYPE (Bath Towel, Hand Towel,
-- Washcloth, Bath Mat), with the collection as the Tier picker's first axis
-- and size as the second -- the layout asked for in
-- 20261008d_starlinen_group_towels_by_tier.sql, re-applied (user decision,
-- 2026-10-22).
--
-- Why again: later passes left it half done. Hand towels, washcloths and
-- bath mats were grouped by type but missing Simplicity and Grand Luxury
-- (those stayed as loose single cards), while bath towels were split into
-- five per-collection cards. A "bath towel" search came back as a jumble of
-- generic and collection-named cards.
--
-- Tiers (one per Starlinen collection):
--   Economy      = Economy Cotton (11xxxWH400)
--   Premium      = Premium Cotton Blend (19xxxWH098)
--   Luxury       = Simplicity Luxury Ring-Spun (7136xxx)
--   Grand Luxury = Grand Luxury Ring-Spun (18xxxWH098)
--   Ultra Luxury = Optima Ultra Luxury Long-Staple (18xxxWH099)
--
-- 'Grand Luxury' was added to products_product_tier_check by 20261008d but
-- dropped again when 20261012c rewrote the list from an older copy, so it is
-- restored here (every 20261012c value kept).
--
-- Two sizes that share a size within one tier get the supplier's dozen
-- weight in the label so the picker can tell them apart (Simplicity bath
-- towels 14 vs 17 lb/dozen, Optima washcloths 1.5 vs 1.75 lb/dozen).
--
-- NOT touched: 19206WH098 "Luxury White Ring-Spun Cotton Hand Towel" -- it
-- carries the Grand Luxury hand towel's image and weight at a different
-- price and MOQ, so it looks like an older duplicate of 18206WH098. It is
-- taken out of the hand-towel family so it can't collide with Simplicity's
-- Luxury 16 x 30 slot; deactivating it is left for a human to confirm.

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Grand Luxury','Ultra Luxury','Suites','Ringspun',
       'Hospitality','Wrinkle-Free','180','200','250','300','600',
       '1.0 Mil','1.25 Mil','1.5 Mil','2 Mil',
       '200 Hospitality','300 Hospitality','600 Luxury Blend','600 Wrinkle-Free')
  );

begin;

-- Bath Towel
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Economy',      variant_label = '22 × 44 in. - Pack of 12', updated_at = now() where sku = '11054WH400';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Economy',      variant_label = '24 × 48 in. - Pack of 12', updated_at = now() where sku = '11079WH400';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Economy',      variant_label = '24 × 50 in. - Pack of 12', updated_at = now() where sku = '11092WH400';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Premium',      variant_label = '22 × 44 in. - Pack of 12', updated_at = now() where sku = '19302WH098';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Premium',      variant_label = '24 × 48 in. - Pack of 12', updated_at = now() where sku = '19301WH098';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Premium',      variant_label = '24 × 50 in. - Pack of 12', updated_at = now() where sku = '19300WH098';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Luxury',       variant_label = '27 × 54 in. - 14 lb/Dozen - Pack of 12', updated_at = now() where sku = '7136631';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Luxury',       variant_label = '27 × 54 in. - 17 lb/Dozen - Pack of 12', updated_at = now() where sku = '7136054';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Grand Luxury', variant_label = '27 × 50 in. - Pack of 12', updated_at = now() where sku = '18205WH098';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Grand Luxury', variant_label = '27 × 54 in. - Pack of 12', updated_at = now() where sku = '18209WH098';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Ultra Luxury', variant_label = '27 × 50 in. - Pack of 12', updated_at = now() where sku = '18301WH099';
update public.products set product_family = 'Bath Towel', family_key = 'bath-towel', product_tier = 'Ultra Luxury', variant_label = '27 × 54 in. - Pack of 12', updated_at = now() where sku = '18300WH099';

-- Hand Towel
update public.products set product_family = 'Hand Towel', family_key = 'hand-towel', product_tier = 'Economy',      variant_label = '16 × 27 in. - Pack of 12', updated_at = now() where sku = '11023WH400';
update public.products set product_family = 'Hand Towel', family_key = 'hand-towel', product_tier = 'Premium',      variant_label = '16 × 27 in. - Pack of 12', updated_at = now() where sku = '19303WH098';
update public.products set product_family = 'Hand Towel', family_key = 'hand-towel', product_tier = 'Luxury',       variant_label = '16 × 30 in. - Pack of 12', updated_at = now() where sku = '7136051';
update public.products set product_family = 'Hand Towel', family_key = 'hand-towel', product_tier = 'Grand Luxury', variant_label = '16 × 30 in. - Pack of 12', updated_at = now() where sku = '18206WH098';
update public.products set product_family = 'Hand Towel', family_key = 'hand-towel', product_tier = 'Ultra Luxury', variant_label = '16 × 30 in. - Pack of 12', updated_at = now() where sku = '18303WH099';
update public.products set product_family = null, family_key = null, variant_label = null, updated_at = now() where sku = '19206WH098';

-- Washcloth
update public.products set product_family = 'Washcloth', family_key = 'washcloth', product_tier = 'Economy',      variant_label = '12 × 12 in. - Pack of 12', updated_at = now() where sku = '11012WH400';
update public.products set product_family = 'Washcloth', family_key = 'washcloth', product_tier = 'Premium',      variant_label = '12 × 12 in. - Pack of 12', updated_at = now() where sku = '19304WH098';
update public.products set product_family = 'Washcloth', family_key = 'washcloth', product_tier = 'Luxury',       variant_label = '13 × 13 in. - Pack of 12', updated_at = now() where sku = '7136052';
update public.products set product_family = 'Washcloth', family_key = 'washcloth', product_tier = 'Grand Luxury', variant_label = '13 × 13 in. - Pack of 12', updated_at = now() where sku = '18207WH098';
update public.products set product_family = 'Washcloth', family_key = 'washcloth', product_tier = 'Ultra Luxury', variant_label = '13 × 13 in. - 1.5 lb/Dozen - Pack of 12', updated_at = now() where sku = '18305WH099';
update public.products set product_family = 'Washcloth', family_key = 'washcloth', product_tier = 'Ultra Luxury', variant_label = '13 × 13 in. - 1.75 lb/Dozen - Pack of 12', updated_at = now() where sku = '18304WH099';

-- Bath Mat
update public.products set product_family = 'Bath Mat', family_key = 'bath-mat', product_tier = 'Economy',      variant_label = '20 × 30 in. - Pack of 12', updated_at = now() where sku = '11130WH400';
update public.products set product_family = 'Bath Mat', family_key = 'bath-mat', product_tier = 'Premium',      variant_label = '20 × 30 in. - Pack of 12', updated_at = now() where sku = '19305WH098';
update public.products set product_family = 'Bath Mat', family_key = 'bath-mat', product_tier = 'Grand Luxury', variant_label = '22 × 34 in. - Pack of 12', updated_at = now() where sku = '18208WH098';
update public.products set product_family = 'Bath Mat', family_key = 'bath-mat', product_tier = 'Ultra Luxury', variant_label = '22 × 34 in. - Pack of 12', updated_at = now() where sku = '18306WH099';

commit;

-- Check: expect bath-towel 12, hand-towel 5, washcloth 6, bath-mat 4.
select family_key, count(*) from public.products
where family_key in ('bath-towel','hand-towel','washcloth','bath-mat') and is_active
group by family_key order by family_key;
