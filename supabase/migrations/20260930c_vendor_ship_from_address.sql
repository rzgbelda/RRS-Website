-- Warehouse ship-from address per vendor.
--
-- RRS is a dropshipper: each distributor ships from its own warehouse, so
-- the delivery fee for a cart has to be rated from THAT warehouse to the
-- customer, not from a single RRS origin. products.vendor_id already ties a
-- product to its vendor; these columns give each vendor an origin.
--
-- All nullable: a vendor without an address (or a product with no vendor)
-- falls back to the standard weight-based allowance at checkout rather than
-- blocking the order.

alter table public.vendors
  add column if not exists ship_from_street text,
  add column if not exists ship_from_city   text,
  add column if not exists ship_from_state  text,
  add column if not exists ship_from_zip    text;

-- Starlinen. Only updates an existing vendor row; add the vendor in admin
-- first if it isn't there yet, then re-run or enter the address by hand.
update public.vendors
   set ship_from_street = '1501 Lancer Drive',
       ship_from_city   = 'Moorestown',
       ship_from_state  = 'NJ',
       ship_from_zip    = '08057'
 where lower(name) like '%starlinen%';

-- Verify
--   select name, ship_from_street, ship_from_city, ship_from_state, ship_from_zip from public.vendors;
