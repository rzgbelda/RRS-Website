-- Two more grouping gaps found by the user after the previous Prestige
-- unification: both are pre-existing DATA, not something the Converter
-- fix can retroactively repair on its own, so backfilled here.
--
-- 1. BLACK/BLUE BARRIER NITRILE GLOVES. This row's own color_group was
--    already correctly populated and IDENTICAL between the two colors
--    ("bulk-case-pack-of-1000-barrier-nitrile-powder-free-examination-
--    gloves-35-mil") -- but product_family/family_key still literally
--    carried the color word ("Black Barrier Nitrile..." vs "Blue Barrier
--    Nitrile..."), because this batch was imported BEFORE
--    cvtStripColorPrefix existed in admin.js (added later this same
--    session, to fix exactly this). The color axis data was half-applied:
--    color_group matched, but the SIZE-grouping key (family_key) never
--    got the matching color fix applied to it. Confirmed via a full-catalog
--    scan before writing this that no OTHER product has this same
--    half-applied state -- every other color-prefixed product_family
--    (Natural/Black HDPE and LDPE Can Liners) has only one color each, no
--    sibling of a different color to merge with, so nothing else needed
--    touching.
--
-- 2. KLEENLINE SELECT PREMIUM FACIAL TISSUE (Cube Box / Flat Box). A
--    second, narrower Converter gap: a trailing comma-separated package-
--    format word ("Cube Box", "Flat Box") sitting BEFORE the dash in this
--    vendor's name format got trapped inside cvtDeriveVariant's family
--    string, which only ever splits on the dash -- "...Tissue, Cube Box"
--    and "...Tissue, Flat Box" never shared a family at all. Fixed in
--    admin.js (new CVT_BOX_FORMAT_RE, narrow on purpose: only the two
--    known box shapes, not a general trailing-comma strip) so a future
--    re-import groups this automatically; this migration backfills the 2
--    rows already live under the old, ungrouped data.

update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFB3-XL';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFB3-L';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFB3-M';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFB3-S';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFL3-XL';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFL3-L';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFL3-M';
update public.products set product_family = 'Barrier Nitrile Powder-Free Examination Gloves', family_key = 'barrier-nitrile-powder-free-examination-gloves', updated_at = now() where sku = 'GLNMPFL3-S';

update public.products set product_family = 'Kleenline Select 2-Ply Facial Tissue', family_key = 'kleenline-select-2-ply-facial-tissue', product_tier = 'Premium', variant_label = 'Cube Box - 96 Sheets - 36 Boxes/Case', updated_at = now() where sku = '855606';
update public.products set product_family = 'Kleenline Select 2-Ply Facial Tissue', family_key = 'kleenline-select-2-ply-facial-tissue', product_tier = 'Premium', variant_label = 'Flat Box - 100 Sheets - 30 Boxes/Case', updated_at = now() where sku = '855607';

-- Safety-net checks: run these after the updates above.
--   1) expect 8 rows, all sharing family_key
--      'barrier-nitrile-powder-free-examination-gloves', 4 distinct
--      variant_label values (Small/Medium/Large/Extra Large) x 2 colors --
--      and 0 rows from check 2 below confirms no label collides within
--      the same color.
select sku, product_family, color_label, variant_label
from public.products
where family_key = 'barrier-nitrile-powder-free-examination-gloves' and is_active = true
order by color_label, variant_label;

--   2) expect 0 rows -- confirms no variant_label collides within the
--      same color for the gloves family.
select product_family, color_label, variant_label, count(*)
from public.products
where family_key = 'barrier-nitrile-powder-free-examination-gloves' and is_active = true
group by product_family, color_label, variant_label
having count(*) > 1;

--   3) expect 2 rows -- the Kleenline Select Premium tissue, now grouped.
select sku, product_family, product_tier, variant_label
from public.products
where family_key = 'kleenline-select-2-ply-facial-tissue' and is_active = true
order by variant_label;
