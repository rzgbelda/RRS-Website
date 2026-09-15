-- Column-level lockdown on public.products: cost_per_case, landed_cost,
-- truckload_qty and vendor_id are margin/supplier data, never meant for a
-- customer or affiliate to see -- but "public_read_active_products"
-- (schema.sql:289) is a ROW-level policy ("is_active = true or
-- is_admin()"). Postgres RLS has no column granularity, so that policy
-- controls which ROWS anon/authenticated can see, not which COLUMNS --
-- anyone could already pull cost_per_case and landed_cost today via a
-- direct PostgREST call (e.g. ?select=name,cost_per_case), bypassing RLS
-- entirely, because the underlying GRANT SELECT was never scoped.
--
-- Surfaced by the affiliate self-service dashboard (20260916_affiliate_
-- self_service_rls.sql): the request was for affiliates to see products
-- and our selling price, never our cost or margin. RLS cannot make that
-- distinction -- only column privileges can, so this closes the gap for
-- every anon/authenticated caller, not only affiliates.
--
-- Approach: revoke blanket table SELECT from anon/authenticated (Supabase
-- grants this by default on every public table) and grant back an
-- explicit column list that excludes the four internal columns. Staff
-- (admin/marketing) are unaffected -- they read through the service-role
-- key server-side or the authenticated grant with RLS already scoping
-- full rows to is_admin()/is_marketing() (public_read_active_products'
-- "or public.is_admin()" branch, and marketing_manage_products), and
-- table owners/superusers bypass GRANT entirely, which is how the admin
-- panel's product editor keeps writing cost_per_case unaffected by this.
--
-- INSERT/UPDATE/DELETE grants are untouched -- this migration is
-- SELECT-only. Staff still write cost_per_case exactly as before,
-- because those writes never went through the anon/authenticated
-- SELECT grant this touches.

revoke select on public.products from anon, authenticated;

grant select (
  id, name, sku, description, price, sale_price, is_on_sale,
  category_id, category_name, case_qty, pack_size, unit,
  is_featured, is_active, image_url, created_at, updated_at,
  overview, feature1, feature2, feature3, feature4, sell_by_each,
  weight, length, width, height,
  product_family, variant_label, color_group, color_label,
  price_tier1, price_tier2, price_tier3,
  moq, meta_title, meta_description, product_tier
) on public.products to anon, authenticated;

-- Deliberately NOT granted to anon/authenticated:
--   cost_per_case, landed_cost, truckload_qty  -- margin data
--   vendor_id                                   -- internal supplier link

-- ====================================================================
-- MUST VERIFY BEFORE TRUSTING THIS -- script.js:285 (fetchCatalogProducts,
-- the function every storefront page's product grid depends on) calls
-- the products table with ?select=* using the plain anon key, not a
-- named column list. PostgREST's documented behavior is that ?select=*
-- against a role with column-level privileges returns only the columns
-- that role can read, rather than erroring -- but that is exactly the
-- kind of claim to confirm live, not trust from memory, given that
-- getting it wrong breaks every category page and the homepage catalog
-- simultaneously. Run BOTH checks below right after applying this, with
-- the ANON key (curl or an incognito browser tab -- not the SQL editor,
-- which runs as superuser and bypasses GRANT entirely, and not a logged
-- in admin/marketing/owner session, which would pass regardless because
-- RLS grants those roles full rows separately):
--
--   1. curl "$SUPABASE_URL/rest/v1/products?select=*&limit=1" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--      Expect: 200, a product object, and NO cost_per_case/landed_cost/
--      truckload_qty/vendor_id keys in it.
--
--   2. Open roomreadysupply.com in an incognito window (logged out) and
--      confirm a category page (e.g. /category/towels) still lists
--      products with prices -- confirms ?select=* did not start
--      returning 0 columns or erroring instead of narrowing.
--
-- If either check fails, this migration must be rolled back immediately
-- (regrant the removed columns) before the storefront is down for real
-- customers -- do not leave it live "to keep investigating."
