-- Hides cost/margin/supplier data from every non-staff reader of the
-- product catalog, without touching the products table's own grants at
-- all -- replaces the abandoned 20260916c draft, which revoked SELECT
-- from the "authenticated" role directly and would have broken the
-- staff admin product editor in the process (see the note at the
-- bottom for exactly why that approach was wrong).
--
-- THE GAP: public_read_active_products (schema.sql) is a ROW-level RLS
-- policy ("is_active = true or is_admin()") -- it controls which ROWS
-- anon/authenticated can see, never which COLUMNS. Nothing has ever
-- restricted columns, so any caller can already pull cost_per_case and
-- landed_cost for every product today via a direct PostgREST call (e.g.
-- ?select=name,cost_per_case), no login needed. The storefront's own
-- script.js:285 (fetchCatalogProducts, what every category page and the
-- homepage grid load from) makes exactly this kind of call --
-- ?select=* -- so the gap is one HTTP request away from anyone who
-- opens dev tools, not a theoretical one.
--
-- THE FIX: a view exposing only public-safe columns. The products TABLE
-- keeps its current grants completely untouched -- staff (admin.js,
-- same anon-key-plus-session-token client as everyone else, scoped
-- wider by RLS's is_admin()/is_marketing() branches, not a different
-- login) keep reading products directly exactly as before, cost columns
-- included. Only callers that should never see cost switch to this view.
create or replace view public.products_public as
select
  id, name, sku, description, overview, image_url, images,
  category_id, category_name,
  price, sale_price, is_on_sale,
  case_qty, pack_size, unit, sell_by_each,
  price_tier1, price_tier2, price_tier3, product_tier,
  product_family, variant_label, color_group, color_label,
  moq, moq_group, moq_group_min,
  weight, length, width, height,
  feature1, feature2, feature3, feature4,
  meta_title, meta_description,
  is_featured, is_active, created_at, updated_at
  -- Deliberately excluded: cost_per_case, landed_cost, truckload_qty
  -- (margin data) and vendor_id (internal supplier link).
from public.products
where is_active = true;

-- By default a Postgres view runs with the privileges of whoever OWNS
-- it (the migration-running role, typically postgres/superuser), which
-- BYPASSES the products table's RLS entirely for anyone querying the
-- view -- deliberately not relied on here, because that would be one
-- more thing to get right rather than fewer: the view's own `where
-- is_active = true` above does the real filtering, independently of
-- whatever the owner's RLS situation is, so a viewer only ever gets
-- active rows regardless. Column exclusion (the actual point of this
-- view) needs no RLS at all -- a column simply not listed in `select`
-- above cannot be returned, full stop, view semantics aside.
grant select on public.products_public to anon, authenticated;

-- ============================================================
-- Verify
-- ============================================================
--   -- as anon (curl with the anon key, or an incognito tab's network
--   -- tab -- not the SQL editor, which is superuser and bypasses all of
--   -- this):
--   select * from products_public limit 1;
--   -- expect: a product row with a price, and NO cost_per_case/
--   -- landed_cost/truckload_qty/vendor_id key anywhere in it.
--
--   select cost_per_case from products_public limit 1;
--   -- expect: 42703 "column does not exist" -- the column was never
--   -- included in the view's definition, not merely hidden.
--
--   select cost_per_case from products limit 1;
--   -- run as STAFF (a real admin/marketing login, not superuser): must
--   -- still work. This is the exact case 20260916c would have broken.
--
-- ============================================================
-- Why 20260916c (abandoned, not applied) was wrong
-- ============================================================
-- It did `revoke select on products from anon, authenticated` and
-- granted back a safe column list on the TABLE. That looked right until
-- checking how staff actually read the table: admin.js's product editor
-- (renderProductsTable, openEditProduct, the vendor lookup, etc., all
-- confirmed live via grep) queries `window.sb.from("products").select(...)`
-- -- the SAME Supabase client, same "authenticated" Postgres role, as a
-- logged-in customer or affiliate. What currently gives staff wider
-- access is RLS's is_admin()/is_marketing() row-level branches, not a
-- different grant. A column-level REVOKE on "authenticated" cannot see
-- is_admin() at all -- it would have silently dropped cost_per_case out
-- of every admin product query too, the moment it ran. A view sidesteps
-- this entirely: the products table's grants never change, so staff
-- access is provably untouched, and only code that is deliberately
-- pointed at products_public loses the columns.
