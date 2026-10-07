-- Business decision: "InnStyle" (the actual manufacturer's name) must not
-- appear anywhere customer-visible -- the site cannot disclose which
-- manufacturer supplies these products. Renames the brand to "Prestige"
-- in every customer-facing text column.
--
-- Scoped to distributor = 'innstyle' only (confirmed this value does NOT
-- need to change -- it's an internal field, never shown to customers,
-- used for vendor/shipping routing same as 'starlinen'/'sasso'/etc, and
-- changing it would touch per-warehouse UPS shipping key lookups for no
-- customer-visible benefit).
--
-- Columns touched: name, product_family. Confirmed via a live query
-- against products_public that "InnStyle" does NOT appear in
-- description/overview/feature1-4 for any of these 169 rows -- those
-- fields describe the product generically ("Dependable everyday bath
-- towel for hotels, inns, and vacation rentals") without naming the
-- brand, so no replacement is needed there.
--
-- Plain substring replace() rather than per-row UPDATEs: "InnStyle"
-- appears in a consistent, unambiguous way in both columns (e.g.
-- "InnStyle Bath Towel", "Ringspun Cotton Bath Towel..." has no
-- "InnStyle" prefix in the name itself but DOES in product_family,
-- "InnStyle 200 Hospitality Flat Sheet"), so a blanket string swap is
-- safe and avoids hand-transcribing 169 rows again.

update public.products
set name = replace(name, 'InnStyle', 'Prestige'),
    updated_at = now()
where distributor = 'innstyle'
  and name like '%InnStyle%';

update public.products
set product_family = replace(product_family, 'InnStyle', 'Prestige'),
    updated_at = now()
where distributor = 'innstyle'
  and product_family like '%InnStyle%';

-- Verify (run separately):
-- select sku, name, product_family from public.products
-- where distributor = 'innstyle' and (name ilike '%innstyle%' or product_family ilike '%innstyle%');
-- -- should return 0 rows
