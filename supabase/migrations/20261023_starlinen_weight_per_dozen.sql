-- Starlinen towels and sheets: weight per DOZEN, not per case.
--
-- Checkout weighs a line as products.weight x quantity, and these products
-- are sold by the dozen, but the Starlinen file put the weight of a whole
-- supplier case (MOQ dozens) in the column. A 10-dozen washcloth case is
-- 10 lb, so 10 dozen weighed 100 lb instead of 10. The 2026-10-22 order
-- (7 cases, 187 lb real) was rated at 784 lb.
--
-- Each row divides the case weight by the dozens per case (moq), e.g. queen
-- T180 flat sheets 30 lb / 2 dz = 15 lb/dozen (1.25 lb a sheet), Economy
-- hand towels 30 / 10 = 3 lb/dozen. Explicit values with the old weight in
-- the WHERE, so running this twice changes nothing the second time.
--
-- Not touched: Simplicity (7136xxx), kitchen/bar-mop (21xxx-38xxx) and
-- Millennium (moq 1) lines, whose weights are already per dozen.
-- 18207WH098 Grand Luxury washcloths (8 lb, 25 dz case = 0.32 lb/dozen) fits
-- neither reading and is left for a supplier check. Optima washcloths are set
-- to the lb/Dozen printed in their names.
--
-- Re-importing the Starlinen file will put case weights back unless the
-- weights are divided by the case dozens first.

begin;
update public.products set weight = 1, updated_at = now() where sku = '11012WH400' and weight = 10; -- 10 lb / 10 dz case. Economy Cotton Washcloths - 12 × 12 in., White, Pack of 12
update public.products set weight = 3, updated_at = now() where sku = '11023WH400' and weight = 30; -- 30 lb / 10 dz case. Economy Cotton Hand Towels - 16 × 27 in., White, Pack of 12
update public.products set weight = 6, updated_at = now() where sku = '11054WH400' and weight = 30; -- 30 lb / 5 dz case. Economy Cotton Bath Towels - 22 × 44 in., White, Pack of 12
update public.products set weight = 9, updated_at = now() where sku = '11079WH400' and weight = 45; -- 45 lb / 5 dz case. Economy Cotton Bath Towels - 24 × 48 in., White, Pack of 12
update public.products set weight = 10, updated_at = now() where sku = '11092WH400' and weight = 50; -- 50 lb / 5 dz case. Economy Cotton Bath Towels - 24 × 50 in., White, Pack of 12
update public.products set weight = 7, updated_at = now() where sku = '11130WH400' and weight = 35; -- 35 lb / 5 dz case. Economy Cotton Bath Mats - 20 × 30 in., White, Pack of 12
update public.products set weight = 15, updated_at = now() where sku = '18205WH098' and weight = 45; -- 45 lb / 3 dz case. Grand Luxury Ring-Spun Cotton Bath Towels - 27 × 50 in., Whi
update public.products set weight = 2.5, updated_at = now() where sku = '18206WH098' and weight = 25; -- 25 lb / 10 dz case. Grand Luxury Ring-Spun Cotton Hand Towels - 16 × 30 in., Whi
update public.products set weight = 9, updated_at = now() where sku = '18208WH098' and weight = 45; -- 45 lb / 5 dz case. Grand Luxury Ring-Spun Cotton Bath Mats - 22 × 34 in., White
update public.products set weight = 17, updated_at = now() where sku = '18209WH098' and weight = 51; -- 51 lb / 3 dz case. Grand Luxury Ring-Spun Cotton Bath Towels - 27 × 54 in., Whi
update public.products set weight = 16.67, updated_at = now() where sku = '18300WH099' and weight = 50; -- 50 lb / 3 dz case. Optima Ultra Luxury Long-Staple Cotton Bath Towels - 27 × 54
update public.products set weight = 15, updated_at = now() where sku = '18301WH099' and weight = 45; -- 45 lb / 3 dz case. Optima Ultra Luxury Long-Staple Cotton Bath Towels - 27 × 50
update public.products set weight = 2.3, updated_at = now() where sku = '18303WH099' and weight = 23; -- 23 lb / 10 dz case. Optima Ultra Luxury Long-Staple Cotton Hand Towels - 16 × 30
update public.products set weight = 6, updated_at = now() where sku = '18306WH099' and weight = 30; -- 30 lb / 5 dz case. Optima Ultra Luxury Long-Staple Cotton Bath Mats - 22 × 34 i
update public.products set weight = 10, updated_at = now() where sku = '19300WH098' and weight = 50; -- 50 lb / 5 dz case. Premium Cotton Blend Bath Towels - 24 × 50 in., White, Pack 
update public.products set weight = 9, updated_at = now() where sku = '19301WH098' and weight = 45; -- 45 lb / 5 dz case. Premium Cotton Blend Bath Towels - 24 × 48 in., White, Pack 
update public.products set weight = 6, updated_at = now() where sku = '19302WH098' and weight = 30; -- 30 lb / 5 dz case. Premium Cotton Blend Bath Towels - 22 × 44 in., White, Pack 
update public.products set weight = 3, updated_at = now() where sku = '19303WH098' and weight = 30; -- 30 lb / 10 dz case. Premium Cotton Blend Hand Towels - 16 × 27 in., White, Pack 
update public.products set weight = 1, updated_at = now() where sku = '19304WH098' and weight = 10; -- 10 lb / 10 dz case. Premium Cotton Blend Washcloths - 12 × 12 in., White, Pack o
update public.products set weight = 7, updated_at = now() where sku = '19305WH098' and weight = 35; -- 35 lb / 5 dz case. Premium Cotton Blend Bath Mats - 20 × 30 in., White, Pack of
update public.products set weight = 4.17, updated_at = now() where sku = '74000WH402' and weight = 25; -- 25 lb / 6 dz case. Standard T180 Cotton Blend Pillowcases - 42 × 34 in., White,
update public.products set weight = 5, updated_at = now() where sku = '74002WH402' and weight = 30; -- 30 lb / 6 dz case. King T180 Cotton Blend Pillowcases - 42 × 46 in., White, Cas
update public.products set weight = 12.5, updated_at = now() where sku = '74007WH402' and weight = 25; -- 25 lb / 2 dz case. Full XL T180 Cotton Blend Flat Sheets - 81 × 108 in., White,
update public.products set weight = 15, updated_at = now() where sku = '74009WH402' and weight = 30; -- 30 lb / 2 dz case. Queen T180 Cotton Blend Flat Sheets - 90 × 110 in., White, P
update public.products set weight = 16, updated_at = now() where sku = '74011WH402' and weight = 32; -- 32 lb / 2 dz case. King T180 Cotton Blend Flat Sheets - 108 × 110 in., White, C
update public.products set weight = 12.5, updated_at = now() where sku = '74014WH402' and weight = 25; -- 25 lb / 2 dz case. Full T180 Cotton Blend Fitted Sheets - 54 × 80 in., 12 in. P
update public.products set weight = 12.5, updated_at = now() where sku = '74015WH402' and weight = 25; -- 25 lb / 2 dz case. Queen T180 Cotton Blend Fitted Sheets - 60 × 80 in., 12 in. 
update public.products set weight = 15, updated_at = now() where sku = '74016WH402' and weight = 30; -- 30 lb / 2 dz case. King T180 Cotton Blend Fitted Sheets - 78 × 80 in., 12 in. P
update public.products set weight = 3.67, updated_at = now() where sku = '74019WH402' and weight = 22; -- 22 lb / 6 dz case. Standard T200 Cotton Blend Pillowcases - 42 × 36 in., White,
update public.products set weight = 4.33, updated_at = now() where sku = '74020WH402' and weight = 26; -- 26 lb / 6 dz case. King T200 Cotton Blend Pillowcases - 42 × 46 in., White, Cas
update public.products set weight = 12.5, updated_at = now() where sku = '74023WH402' and weight = 25; -- 25 lb / 2 dz case. Full XL T200 Cotton Blend Flat Sheets - 81 × 108 in., White,
update public.products set weight = 16.5, updated_at = now() where sku = '74025WH402' and weight = 33; -- 33 lb / 2 dz case. Queen T200 Cotton Blend Flat Sheets - 90 × 115 in., White, P
update public.products set weight = 16, updated_at = now() where sku = '74027WH402' and weight = 32; -- 32 lb / 2 dz case. King T200 Cotton Blend Flat Sheets - 108 × 110 in., White, C
update public.products set weight = 12.5, updated_at = now() where sku = '74034WH402' and weight = 25; -- 25 lb / 2 dz case. Full T200 Cotton Blend Fitted Sheets - 54 × 80 in., 15 in. P
update public.products set weight = 13.5, updated_at = now() where sku = '74035WH402' and weight = 27; -- 27 lb / 2 dz case. Queen T200 Cotton Blend Fitted Sheets - 60 × 80 in., 15 in. 
update public.products set weight = 15, updated_at = now() where sku = '74036WH402' and weight = 30; -- 30 lb / 2 dz case. King T200 Cotton Blend Fitted Sheets - 78 × 80 in., 15 in. P
update public.products set weight = 15, updated_at = now() where sku = '74102WH402' and weight = 30; -- 30 lb / 2 dz case. Full XL T250 Cotton Blend Flat Sheets - 84 × 120 in., White,
update public.products set weight = 12.5, updated_at = now() where sku = '74103WH402' and weight = 25; -- 25 lb / 2 dz case. Full T250 Cotton Blend Fitted Sheets - 54 × 80 in., 15 in. P
update public.products set weight = 17.5, updated_at = now() where sku = '74104WH402' and weight = 35; -- 35 lb / 2 dz case. Queen T250 Cotton Blend Flat Sheets - 94 × 120 in., White, P
update public.products set weight = 13.5, updated_at = now() where sku = '74105WH402' and weight = 27; -- 27 lb / 2 dz case. Queen T250 Cotton Blend Fitted Sheets - 60 × 80 in., 15 in. 
update public.products set weight = 18, updated_at = now() where sku = '74106WH402' and weight = 36; -- 36 lb / 2 dz case. King T250 Cotton Blend Flat Sheets - 114 × 120 in., White, C
update public.products set weight = 15, updated_at = now() where sku = '74107WH402' and weight = 30; -- 30 lb / 2 dz case. King T250 Cotton Blend Fitted Sheets - 78 × 80 in., 15 in. P
update public.products set weight = 3.67, updated_at = now() where sku = '74108WH402' and weight = 22; -- 22 lb / 6 dz case. Standard T250 Cotton Blend Pillowcases - 42 × 36 in., White,
update public.products set weight = 4.33, updated_at = now() where sku = '74109WH402' and weight = 26; -- 26 lb / 6 dz case. King T250 Cotton Blend Pillowcases - 42 × 46 in., White, Cas
update public.products set weight = 1.75, updated_at = now() where sku = '18304WH099' and weight = 12; -- per the product name (1.75 lb/Dozen)
update public.products set weight = 1.5, updated_at = now() where sku = '18305WH099' and weight = 10; -- per the product name (1.5 lb/Dozen)
commit;
