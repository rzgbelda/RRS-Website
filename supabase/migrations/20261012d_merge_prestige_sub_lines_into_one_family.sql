-- Merges the 4 Prestige InnStyle sub-lines (Hospitality 200, Hospitality
-- 300, Luxury Blend 600, Wrinkle-Free 600) of each product TYPE into one
-- family per type, with the sub-line as a Tier picker option -- instead of
-- 4 entirely separate storefront cards per type as they were.
--
-- Run 20261012c_prestige_combined_tier_values.sql FIRST -- this migration
-- writes the 4 new combined product_tier values it adds to the CHECK
-- constraint.
--
-- Scope: Fitted Sheet, Flat Sheet, and Pillowcase only. NOT the generic
-- Starlinen "Flat Sheet"/"Fitted Sheet"/"Pillowcase" family (family_key
-- 'flat-sheet' etc, from 20261012b) -- confirmed those are a genuinely
-- different supplier (image_url on res.cloudinary.com/j72tftbp, the
-- Starlinen "Elegance" line) from this InnStyle Prestige line (image_url
-- on www.innstyle.com) before deciding not to merge them; doing so would
-- have put two different physical products behind one Tier picker. Also
-- NOT Sheet Set, Pillowcase Pair, Bath Mat, or Bath Towel -- Sheet Set
-- already spans its own two tiers correctly, Pillowcase Pair is a
-- different pack format (2 pillowcases, not 1) from plain Pillowcase, and
-- Bath Mat/Bath Towel only have one Prestige sub-line each, nothing to
-- merge.
--
-- Values below are a straight rename, not a re-derivation: each of the 4
-- old per-sub-line families (e.g. "Prestige T200 Hospitality Flat Sheet")
-- was already a correctly working family with no internal variant_label
-- collisions (confirmed live before writing this), so mapping it onto one
-- new (product_family, product_tier) pair preserves every existing label
-- untouched -- nothing here can introduce a new collision that wasn't
-- already ruled out.

update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT3975122C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT397592C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT3980122C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT398092C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT398092E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT5480122C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT6080122C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT6080152C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT608092C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT7280122C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT7284122C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT7880122C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FT7880152C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS1081042C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS1081092C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS1081142C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS661022C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS661042C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS661092C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS661092E';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS66982C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS811022C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS811042C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS811092C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS81982C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS901042C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS901092C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS901142C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '200 Hospitality', updated_at = now() where sku = 'FS961092C12';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '200 Hospitality', updated_at = now() where sku = 'PC20302C72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '200 Hospitality', updated_at = now() where sku = 'PC20342C72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '200 Hospitality', updated_at = now() where sku = 'PC20402C72';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT3980123C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT3980123E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT5475123E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT5480123C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT5480123E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT5480153C24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT6080123C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT6080123E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT6080153C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT6080153E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT7880123C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT7880153C12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FT7880153E';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS1081093C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS1081143C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS1081143E';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS1141143C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS661093C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS661093E';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS811093C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS811093E';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS811143C24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS901093C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS901093E';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS901143C12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '300 Hospitality', updated_at = now() where sku = 'FS901143E';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '300 Hospitality', updated_at = now() where sku = 'PC20303C72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '300 Hospitality', updated_at = now() where sku = 'PC20303E';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '300 Hospitality', updated_at = now() where sku = 'PC20343C72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '300 Hospitality', updated_at = now() where sku = 'PC20343E';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '300 Hospitality', updated_at = now() where sku = 'PC20403C72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '300 Hospitality', updated_at = now() where sku = 'PC20403E';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT397512LC24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT397512LE';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT398012LC24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT398012LE';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT547512LC24';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT547512LE';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT608015LC12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT608015LE';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT788015LC12';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FT788015LE';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS108109LC12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS108109LE';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS108114LC12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS108114LE';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS66109LC24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS66109LE';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS81109LC24';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS81109LE';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS90109LC12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS90109LE';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS90114LC12';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'FS90114LE';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'PC2034LC72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'PC2034LE';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'PC2040LC72';
update public.products set product_family = 'Prestige Pillowcase', family_key = 'prestige-pillowcase', product_tier = '600 Luxury Blend', updated_at = now() where sku = 'PC2040LE';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FT397516WO';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FT398016WO';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FT547516WO';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FT608016WO';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FT728416WO';
update public.products set product_family = 'Prestige Fitted Sheet', family_key = 'prestige-fitted-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FT788016WO';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FS114115WO';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FS72110WO';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FS90110WO';
update public.products set product_family = 'Prestige Flat Sheet', family_key = 'prestige-flat-sheet', product_tier = '600 Wrinkle-Free', updated_at = now() where sku = 'FS96115WO';

-- Safety-net checks: run these after the updates above.
--   1) expect exactly 3 rows: Prestige Fitted Sheet (42), Prestige Flat
--      Sheet (45), Prestige Pillowcase (13) -- 100 total.
select product_family, count(*) as row_count
from public.products
where family_key in ('prestige-fitted-sheet','prestige-flat-sheet','prestige-pillowcase')
  and is_active = true
group by product_family
order by product_family;

--   2) expect 0 rows -- confirms no variant_label collides within the
--      same (product_family, product_tier) after the merge.
select product_family, product_tier, variant_label, count(*)
from public.products
where family_key in ('prestige-fitted-sheet','prestige-flat-sheet','prestige-pillowcase')
  and is_active = true
group by product_family, product_tier, variant_label
having count(*) > 1;

--   3) informational -- each family should list all 4 Prestige tiers.
select product_family, product_tier, count(*) as sizes_in_tier
from public.products
where family_key in ('prestige-fitted-sheet','prestige-flat-sheet','prestige-pillowcase')
  and is_active = true
group by product_family, product_tier
order by product_family, product_tier;
