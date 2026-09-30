-- Vendors with more than one warehouse (Wraptite: Port Wentworth and
-- Savannah, GA). vendors.ship_from_* stays the PRIMARY warehouse; any others
-- live here as a JSON list of { street, city, state, zip }.
--
-- At checkout each warehouse is rated to the customer and the cheapest one
-- is used (see api/_lib/shipping.js), which in practice is the closest.

alter table public.vendors
  add column if not exists extra_warehouses jsonb not null default '[]'::jsonb;

-- Wraptite's second warehouse (from the supplier Markup sheet).
update public.vendors
   set extra_warehouses = '[{"street":"27 Artley Rd Unit 27-1","city":"Savannah","state":"GA","zip":"31408"}]'::jsonb
 where slug = 'wraptite' and extra_warehouses = '[]'::jsonb;

-- Verify
--   select name, ship_from_city, extra_warehouses from public.vendors order by name;
