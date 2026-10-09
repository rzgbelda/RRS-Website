-- 76 products have a literal "Bulk Case Pack of N " prefix baked into
-- their own name/product_family (e.g. "Bulk Case Pack of 1,000 Barrier
-- Nitrile Powder-Free Examination Gloves, Large, 3.5 Mil – Blue").
-- bulkLead() (script.js, mirrored in api/product-meta.js) already
-- prepends its own "Bulk Case "/"Bulk Pallet " to every product title at
-- render time based on MOQ/pack shape -- so these 76 rendered as
-- "Bulk Case Bulk Case Pack of 1,000 Barrier Nitrile..." everywhere a
-- title is built (catalog cards, H1, SEO <title>, Best Deals badges).
--
-- Fix is at the data layer, not bulkLead(): removing bulkLead() instead
-- would also drop the "Bulk Case"/"Bulk Pallet" lead-in from the other
-- ~44 products whose own name never had it, changing how every other
-- product title reads for no reason.
--
-- Verified against a live dump of all 76 matching rows (not a guess):
-- every one starts with exactly "Bulk Case Pack of <digits/commas> "
-- followed by the real product description, and no row anywhere in the
-- catalog uses the pallet-sized phrasing ("Bulk Pallet Pack of..."), so
-- only the one prefix shape needs stripping here.
update public.products
set name = regexp_replace(name, '^Bulk Case Pack of [0-9,]+\s+', '')
where name ~ '^Bulk Case Pack of [0-9,]+\s+';

update public.products
set product_family = regexp_replace(product_family, '^Bulk Case Pack of [0-9,]+\s+', '')
where product_family ~ '^Bulk Case Pack of [0-9,]+\s+';
