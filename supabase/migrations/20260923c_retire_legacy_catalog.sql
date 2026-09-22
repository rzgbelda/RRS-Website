-- Retires the pre-dropship catalog.
--
-- RRS now dropships from InnStyle, Sasso and OfficeCrave, and their 300
-- products replace what was sourced the old way. What "the old way"
-- turned out to mean, checked live against the products table rather
-- than assumed from products.csv (2026-09-23):
--
--   474 products  -- distributor is null, sku is not null. The real old
--                    catalog. No duplicate SKUs within this set (checked
--                    live) -- every one is a distinct product, just a
--                    larger set than the ~123 in products.csv, built up
--                    across several import passes between Aug 6 and
--                    Sept 22.
--    91 products  -- distributor is null, sku is null. Stale rows from a
--                    single botched import on 2026-07-05 (88 rows at
--                    19:15 UTC, 3 more at 19:20), unrelated to today's
--                    work. With no SKU they can never match anything a
--                    real order references, but they're retired the same
--                    way as everything else rather than assumed harmless.
--   300 products  -- distributor is one of innstyle/sasso/officecrave.
--                    Today's import. Checked clean: no duplicate SKUs
--                    among these 300, and no product here shares a NAME
--                    with one of the 474, so this is a genuine catalog
--                    swap, not a re-numbering of the same products.
--
-- 474 + 91 + 300 = 865 is more than the 565 total the table actually
-- has BEFORE this migration runs, because is_active only ever counted
-- true rows in earlier checks -- the numbers above are unconditional
-- counts, not "active" counts, so they will not sum to a prior active
-- total. What matters here is the WHERE clause below, not this arithmetic.
--
-- DEACTIVATE, NOT DELETE. is_active = false removes a product from the
-- storefront (products_public filters on it) and blocks purchase
-- (price-cart.js refuses an inactive SKU), while the rows stay put so
-- past orders keep resolving to a real product -- order history,
-- invoices and reporting would otherwise lose their product links. It is
-- also reversible, which deleting is not. Applies equally to the 91
-- null-SKU rows: deactivated, not dropped, since nothing here confirms
-- they are safe to delete outright.
--
-- RUN THIS AFTER importing rrs_import_combined.csv, not before. The
-- importer upserts on sku and the new SKUs don't collide with the old
-- ones, so the import only inserts -- but running this first would leave
-- the storefront with an empty catalog in between.

-- Safety: refuse to run if the new catalog isn't in place yet. Better to
-- fail loudly than to deactivate everything and leave nothing to sell.
-- Confirmed live on 2026-09-23: the import landed exactly 300 (108
-- officecrave + 172 innstyle + 20 sasso), 0 duplicate SKUs, 0 errors --
-- so this checks for exactly that split rather than a loose "at least
-- some" threshold.
do $$
declare
  oc_count integer;
  inn_count integer;
  sasso_count integer;
begin
  select count(*) into oc_count    from public.products where distributor = 'officecrave';
  select count(*) into inn_count   from public.products where distributor = 'innstyle';
  select count(*) into sasso_count from public.products where distributor = 'sasso';

  if oc_count <> 108 or inn_count <> 172 or sasso_count <> 20 then
    raise exception
      'Dropship product counts do not match the expected import (officecrave=% expected 108, innstyle=% expected 172, sasso=% expected 20). Refusing to retire the old catalog until the counts match -- re-check the import before re-running this.',
      oc_count, inn_count, sasso_count;
  end if;
end $$;

-- Everything that did NOT come from one of the three distributors is the
-- old catalog. Keyed on distributor rather than a SKU list so a product
-- added by hand before the switch is caught too.
update public.products
set is_active = false,
    updated_at = now()
where is_active = true
  and (distributor is null or distributor not in ('innstyle', 'sasso', 'officecrave'));

-- Verify
--   -- exactly 300 active, all with a distributor, split 108/172/20
--   select distributor, count(*), sum((is_active)::int) as active
--   from public.products group by distributor order by 1;
--
--   -- the retired 474 (real old products) + 91 (null-sku junk) = 565,
--   -- still present and still linked to any orders that reference them
--   select
--     count(*) filter (where sku is not null) as retired_named,
--     count(*) filter (where sku is null)     as retired_null_sku
--   from public.products where is_active = false;
--
--   -- storefront sees only the new 300-product catalog
--   select count(*) from public.products_public;  -- expect 300
