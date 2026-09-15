-- Groups the ten "600 Wrinkle-Free ... Open Stock" sheets into two cards:
-- one Fitted Sheet card with six bed sizes, one Flat Sheet card with four.
--
-- The earlier variant pass (20260915) grouped on the text before the en dash,
-- which for these reads "600 Wrinkle-Free Twin Fitted Sheet" -- bed size
-- included. Every one therefore looked like a family of a single member and
-- was left alone, which is why the catalog still showed ten nearly identical
-- sheet cards side by side.
--
-- Here the bed size is lifted OUT of the family name and becomes the dropdown
-- option, since the size is exactly what a buyer is choosing between. The
-- dimensions stay in the label because a Twin flat sheet and a Twin fitted
-- sheet are different cuts, and 39x75 vs 39x80 is the difference between a
-- sheet that fits and one that does not.
--
-- Pocket depth is a constant 16" across all six fitted sizes, so it stays out
-- of the labels rather than repeating in every option.
--
-- Only touches rows whose product_family is currently null; verified that no
-- statement targets a SKU that is already grouped.
--
-- Net effect: 161 catalog cards -> 153.

update public.products set product_family = '600 Wrinkle-Free Fitted Sheet', variant_label = 'California King – 72" × 84" × 16"' where sku = 'INN-BED-FTS-CKG-72X84-P16-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Fitted Sheet', variant_label = 'Full – 54" × 75" × 16"' where sku = 'INN-BED-FTS-FL-54X75-P16-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Fitted Sheet', variant_label = 'King – 78" × 80" × 16"' where sku = 'INN-BED-FTS-KG-78X80-P16-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Fitted Sheet', variant_label = 'Queen – 60" × 80" × 16"' where sku = 'INN-BED-FTS-QN-60X80-P16-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Fitted Sheet', variant_label = 'Twin – 39" × 75" × 16"' where sku = 'INN-BED-FTS-TW-39X75-P16-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Fitted Sheet', variant_label = 'Twin XL – 39" × 80" × 16"' where sku = 'INN-BED-FTS-TXL-39X80-P16-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Flat Sheet', variant_label = 'Full – 90" × 110"' where sku = 'INN-BED-FLS-FL-90X110-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Flat Sheet', variant_label = 'King – 114" × 115"' where sku = 'INN-BED-FLS-KG-114X115-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Flat Sheet', variant_label = 'Queen – 96" × 115"' where sku = 'INN-BED-FLS-QN-96X115-T600-WRF-OS';
update public.products set product_family = '600 Wrinkle-Free Flat Sheet', variant_label = 'Twin – 72" × 110"' where sku = 'INN-BED-FLS-TW-72X110-T600-WRF-OS';

-- Verify:
--   select product_family, count(*) c,
--          string_agg(variant_label, chr(124) order by variant_label) opts
--   from public.products
--   where product_family like '600 Wrinkle-Free%Sheet'
--   group by 1;
--   -- expect exactly 2 rows: Fitted Sheet (6), Flat Sheet (4).
