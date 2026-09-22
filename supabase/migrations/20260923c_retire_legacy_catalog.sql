-- Retires the pre-dropship catalog.
--
-- RRS now dropships from InnStyle, Sasso and OfficeCrave, and their 300
-- products replace the 123 that were sourced the old way. The two sets
-- are entirely disjoint: zero SKUs overlap, and a name-similarity scan
-- found exactly one near-match (a Dial Gold hand soap, in a different
-- pack size). This is a catalog swap, not a re-numbering.
--
-- DEACTIVATE, NOT DELETE. is_active = false removes a product from the
-- storefront (products_public filters on it) and blocks purchase
-- (price-cart.js refuses an inactive SKU), while the rows stay put so
-- past orders keep resolving to a real product -- order history,
-- invoices and reporting would otherwise lose their product links. It is
-- also reversible, which deleting is not.
--
-- RUN THIS AFTER importing rrs_import_combined.csv, not before. The
-- importer upserts on sku and the new SKUs don't collide with the old
-- ones, so the import only inserts -- but running this first would leave
-- the storefront with an empty catalog in between.

-- Safety: refuse to run if the new catalog isn't in place yet. Better to
-- fail loudly than to deactivate everything and leave nothing to sell.
do $$
declare
  new_count integer;
begin
  select count(*) into new_count
  from public.products
  where distributor in ('innstyle', 'sasso', 'officecrave');

  if new_count < 250 then
    raise exception
      'Only % dropship products found (expected ~300). Import rrs_import_combined.csv first -- refusing to retire the old catalog and leave the storefront empty.',
      new_count;
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
--   -- should be ~300 active, all with a distributor
--   select distributor, count(*), sum((is_active)::int) as active
--   from public.products group by distributor order by 1;
--
--   -- the retired 123, still present and still linked to their orders
--   select count(*) from public.products where is_active = false;
--
--   -- storefront sees only the new catalog
--   select count(*) from public.products_public;
