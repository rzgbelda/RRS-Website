-- Groups Starlinen towels by type (Washcloth/Hand Towel/Bath Towel/Bath
-- Mat) with quality tier (Economy/Premium/Luxury/Grand Luxury/Ultra
-- Luxury) as the picker's first axis and size/weight as the second --
-- reverses the earlier decision (20261008_starlinen_import_fix.sql) to
-- leave towels ungrouped. User provided reference screenshots showing
-- the desired tier-picker UI and explicitly asked for Economy/Premium/
-- Luxury/Grand Luxury/Ultra Luxury as the tier options.
--
-- "Grand Luxury" is a NEW product_tier value (every other value here
-- already existed). "Luxury" here is Starlinen's Simplicity Ring-Spun
-- line -- kept as a DISTINCT tier from "Grand Luxury" (Starlinen's Ring-
-- Spun line) per explicit confirmation: the two are different product
-- lines (different weights/sizes, Simplicity has no Bath Mat), not the
-- same tier under two names.

alter table public.products
  drop constraint if exists products_product_tier_check;
alter table public.products
  add constraint products_product_tier_check check (
    product_tier is null or product_tier in
      ('Economy','Premium','Luxury','Grand Luxury','Ultra Luxury','Suites','Ringspun',
       'Hospitality','Wrinkle-Free','180','200','250','300','600',
       '1.0 Mil','1.25 Mil','1.5 Mil','2 Mil')
  );

begin;

update public.products set product_family = 'Cotton Washcloth', product_tier = 'Economy', variant_label = '12x12', updated_at = now() where sku = '11012WH400';
update public.products set product_family = 'Cotton Hand Towel', product_tier = 'Economy', variant_label = '16x27', updated_at = now() where sku = '11023WH400';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Economy', variant_label = '22x44', updated_at = now() where sku = '11054WH400';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Economy', variant_label = '24x48', updated_at = now() where sku = '11079WH400';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Economy', variant_label = '24x50', updated_at = now() where sku = '11092WH400';
update public.products set product_family = 'Cotton Bath Mat', product_tier = 'Economy', variant_label = '20x30', updated_at = now() where sku = '11130WH400';
update public.products set product_family = 'Cotton Washcloth', product_tier = 'Premium', variant_label = '12x12', updated_at = now() where sku = '19304WH098';
update public.products set product_family = 'Cotton Hand Towel', product_tier = 'Premium', variant_label = '16x27', updated_at = now() where sku = '19303WH098';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Premium', variant_label = '22x44', updated_at = now() where sku = '19302WH098';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Premium', variant_label = '24x48', updated_at = now() where sku = '19301WH098';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Premium', variant_label = '24x50', updated_at = now() where sku = '19300WH098';
update public.products set product_family = 'Cotton Bath Mat', product_tier = 'Premium', variant_label = '20x30', updated_at = now() where sku = '19305WH098';
update public.products set product_family = 'Cotton Washcloth', product_tier = 'Grand Luxury', variant_label = '13x13', updated_at = now() where sku = '18207WH098';
update public.products set product_family = 'Cotton Hand Towel', product_tier = 'Grand Luxury', variant_label = '16x30', updated_at = now() where sku = '18206WH098';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Grand Luxury', variant_label = '27x50', updated_at = now() where sku = '18205WH098';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Grand Luxury', variant_label = '27x54', updated_at = now() where sku = '18209WH098';
update public.products set product_family = 'Cotton Bath Mat', product_tier = 'Grand Luxury', variant_label = '22x34', updated_at = now() where sku = '18208WH098';
update public.products set product_family = 'Cotton Washcloth', product_tier = 'Ultra Luxury', variant_label = '13x13, 1.5 lb/Dozen', updated_at = now() where sku = '18305WH099';
update public.products set product_family = 'Cotton Washcloth', product_tier = 'Ultra Luxury', variant_label = '13x13, 1.75 lb/Dozen', updated_at = now() where sku = '18304WH099';
update public.products set product_family = 'Cotton Hand Towel', product_tier = 'Ultra Luxury', variant_label = '16x30', updated_at = now() where sku = '18303WH099';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Ultra Luxury', variant_label = '27x50', updated_at = now() where sku = '18301WH099';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Ultra Luxury', variant_label = '27x54', updated_at = now() where sku = '18300WH099';
update public.products set product_family = 'Cotton Bath Mat', product_tier = 'Ultra Luxury', variant_label = '22x34', updated_at = now() where sku = '18306WH099';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Luxury', variant_label = '27x54, 17 lb/Dozen', updated_at = now() where sku = '7136054';
update public.products set product_family = 'Cotton Bath Towel', product_tier = 'Luxury', variant_label = '27x54, 14 lb/Dozen', updated_at = now() where sku = '7136631';
update public.products set product_family = 'Cotton Hand Towel', product_tier = 'Luxury', variant_label = '16x30, 4.5 lb/Dozen', updated_at = now() where sku = '7136051';
update public.products set product_family = 'Cotton Washcloth', product_tier = 'Luxury', variant_label = '13x13, 1.5 lb/Dozen', updated_at = now() where sku = '7136052';

commit;

-- Verify (run separately, after the transaction above commits):
-- select product_family, product_tier, variant_label, name, sku from public.products
-- where sku in ('11012WH400', '11023WH400', '11054WH400', '11079WH400', '11092WH400', '11130WH400', '19304WH098', '19303WH098', '19302WH098', '19301WH098', '19300WH098', '19305WH098', '18207WH098', '18206WH098', '18205WH098', '18209WH098', '18208WH098', '18305WH099', '18304WH099', '18303WH099', '18301WH099', '18300WH099', '18306WH099', '7136054', '7136631', '7136051', '7136052')
-- order by product_family, product_tier, variant_label;