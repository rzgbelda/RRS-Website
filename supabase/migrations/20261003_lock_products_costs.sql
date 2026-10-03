-- SECURITY: supplier cost was publicly readable.
--
-- products_public (20260916f) hides cost_per_case, tier1-3_cost, landed_cost,
-- vendor_id and distributor, but the base table kept the policy
-- "public_read_active_products" (select where is_active), so anyone with the
-- publishable key -- which is in every page's source -- could still run
-- GET /rest/v1/products?select=cost_per_case,tier1_cost,distributor
-- and read RRS's cost and supplier on every product. Logged-in customers too.
--
-- Nothing public needs the base table: the storefront, account page and
-- checkout read products_public, and the server routes (price-cart,
-- create-order) use the service role, which bypasses RLS. Staff keep full
-- access through the existing admin_manage_products / marketing_manage_products
-- policies (FOR ALL, which includes SELECT).
--
-- products_public keeps working for everyone: the view runs with its owner's
-- rights (no security_invoker), so base-table RLS doesn't apply to it.
--
-- Deploy the code that points best-deals.html, quote.html and
-- api/product-meta.js at products_public BEFORE running this.

-- 1) Best Deals shows retail_price; add it to the public view (appended at
--    the end -- CREATE OR REPLACE VIEW can only add columns, not reorder).
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
  is_featured, is_active, created_at, updated_at,
  is_fast_ship,
  tier1_min_qty, tier2_min_qty, tier3_min_qty,
  in_stock,
  family_key,
  retail_price
  -- Deliberately excluded: cost_per_case, landed_cost, truckload_qty,
  -- tier1_cost, tier2_cost, tier3_cost (margin data), vendor_id and
  -- distributor (internal supplier links).
from public.products
where is_active = true;

grant select on public.products_public to anon, authenticated;

-- 2) Base table: staff only.
drop policy if exists "public_read_active_products" on public.products;

-- Belt and braces: anonymous visitors never touch the base table (only the
-- view), so take the privilege away entirely. Even if a permissive select
-- policy is re-added later, anon still can't read it. (A column-level
-- revoke would do nothing here while a table-level grant exists.)
revoke select on public.products from anon;

-- Verify (as an anonymous visitor this should now return [] or a permission error):
--   GET /rest/v1/products?select=cost_per_case&limit=1   (with only the anon key)
