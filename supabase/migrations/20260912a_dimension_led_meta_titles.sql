-- Search Console shows the site drawing impressions for bare dimension
-- fragments -- "16x27" (pos 19), "8x350" (pos 17), "8 x 800" (pos 34),
-- "200 cases" -- which are measurements, not things a buyer searches for
-- with intent to purchase. They rank because 17 product names lead with a
-- raw dimension ("9.05x9.25 Morcon Valay Multifold Towel"), and the title
-- generator in api/product-meta.js preserves that leading token as a
-- prefix, so the <title> opens on a number instead of the product type.
--
-- A second, quieter problem: the generated titles collide. All three NOVA
-- hardwound towels produced the identical title
-- "Wholesale 8x350' NOVA(R) Hardwound Towel | Room Ready Supply" (and the
-- 800' pair likewise), as did both Morcon multifold SKUs and both Green
-- Heritage tissues. Identical titles across distinct URLs invite Google to
-- treat them as duplicates and pick one, so these SKUs were competing with
-- each other rather than covering different queries.
--
-- meta_title is already supported end to end: api/product-meta.js prefers
-- it over the generated title, and admin.html exposes it as the "SEO Title"
-- field with a 60-char counter. It was simply empty for all 312 products.
-- This fills it for the 17 affected SKUs only; everything else keeps using
-- the generator, which handles normal product names well.
--
-- Every title below leads with the term a buyer types, keeps the dimension
-- as a qualifier, and is unique. All sizes, roll lengths, case quantities
-- and materials come from each product's own description column -- no
-- specification here is invented. Scoped to exact SKUs, never a LIKE.

update public.products set meta_title = 'Bulk 2-Ply Toilet Paper, 96 Rolls/Case | Room Ready Supply'  where sku = '276';
update public.products set meta_title = 'Commercial 2-Ply Bath Tissue, 96 Rolls/Case'                 where sku = '248';

update public.products set meta_title = 'Multifold Paper Towels, 16/250 Case | Morcon Morsoft'        where sku = 'R720';
update public.products set meta_title = 'Multifold Paper Towels, 16/250 Case | Morcon Valay'          where sku = 'VT1106';

-- "Center Pull" was being trimmed to "Pull Virgin Towel" by the title
-- length budget, which reads as nonsense; spelling it out also fixes that.
update public.products set meta_title = 'Center Pull Paper Towels, 2-Ply Virgin, 6/Case'              where sku = 'CP 660010';

update public.products set meta_title = 'Hardwound Roll Towels, 8" x 350'', 12/Case | NOVA'           where sku = 'NOVA 350N';
update public.products set meta_title = 'Hardwound Paper Towel Rolls, 8" x 350'', 12/Case'            where sku = 'NOVA 350W';
update public.products set meta_title = 'Hardwound Roll Towels, 8" x 800'', 6/Case | NOVA'            where sku = 'NOVA 800W';
update public.products set meta_title = 'Hardwound Paper Towel Rolls, 8" x 800'', 6/Case'             where sku = 'NOVA 800N';

update public.products set meta_title = 'Low Density Can Liners, 38x58, Bulk Case | LDPE'             where sku = 'PL385815B';
update public.products set meta_title = 'HDPE Trash Can Liners, 24x33, 20/50 Case'                    where sku = 'S243308N';
update public.products set meta_title = 'Heavy Duty Trash Bags, 38x58, Municipal Grade'               where sku = 'RM3858H';

-- NOVA519 and NOVA523 are both 38x58 at 100/case; case weight (25.5 vs
-- 34 lbs) is the only spec that separates them, so it carries the title.
update public.products set meta_title = 'Coreless Can Liners, 38x58, 100/Case | Recycled'             where sku = 'NOVA519';
update public.products set meta_title = 'Heavy Coreless Can Liners, 38x58, 100/Case, 34 lb'           where sku = 'NOVA523';
update public.products set meta_title = 'Coreless Trash Can Liners, 40x46, 100/Case'                  where sku = 'NOVA517';
update public.products set meta_title = 'Coreless Can Liners, 43x47, 100/Case | Recycled'             where sku = 'NOVA522';

update public.products set meta_title = 'Hookless Shower Curtains, 71x74, 30/Case'                    where sku = 'RDU-BTH-SHC-71X74-HKL';

-- Verify: expect 17 rows, every title distinct and <= 60 characters.
-- select sku, meta_title, length(meta_title) as len
-- from public.products
-- where meta_title is not null
-- order by len desc;
