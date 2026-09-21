-- Adds a manual "fast/free delivery" flag to products, for RRS-31 (Eric's
-- ticket: "we need to get to 3-5 day delivered to door... if we cannot
-- give free delivery we find the products we can and promote the free
-- delivery... at catalog level put a banner on item").
--
-- Deliberately NOT automatic and NOT site-wide. The ticket's larger idea
-- (a 2-3 day drop-ship carrier, timed against a faster Stripe payout) is a
-- vendor/payment negotiation that has not concluded -- "maybe Adam will
-- be successful with the conversation" -- so there is no real, checkable
-- rule yet for which products actually qualify. Every other delivery
-- estimate on this site (checkout.html's acknowledgment checkbox,
-- shipping-policy.html, the SEO landing pages) states 3-5 business days
-- processing plus separate transit time, and that stays the site-wide
-- default. This flag exists so a human -- staff, as vendor/carrier
-- confirmations come in -- can mark a specific product as qualifying for
-- a faster/free-delivery badge, one product at a time, rather than the
-- claim being inferred by code from stock status or category.
--
-- Defaults to false: a product says nothing extra about delivery speed
-- until someone deliberately flips it on.
alter table public.products
  add column if not exists is_fast_ship boolean not null default false;

comment on column public.products.is_fast_ship is
  'Manually set by staff in Admin -> Products. Shows a fast/free-delivery badge on this product in the catalog. Not inferred automatically -- see 20260921_products_fast_ship_flag.sql for why.';

-- products_public (20260916f) is an explicit column allowlist, not
-- `select *` -- the storefront's fetchCatalogProducts() (script.js) reads
-- this view, not the products table directly, so a new column on the
-- table does not appear to a customer until the view is redefined to
-- include it too. Re-running the exact same view definition with
-- is_fast_ship added is safer than guessing at a diff -- CREATE OR
-- REPLACE VIEW requires the output column list to only ever grow, never
-- reorder or drop a column, so this preserves the original list byte for
-- byte and appends the one new column.
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
  is_fast_ship
  -- Deliberately excluded: cost_per_case, landed_cost, truckload_qty
  -- (margin data) and vendor_id (internal supplier link).
from public.products
where is_active = true;

grant select on public.products_public to anon, authenticated;

-- ============================================================
-- Verify
-- ============================================================
--   -- as anon:
--   select id, name, is_fast_ship from products_public limit 5;
--   -- expect: is_fast_ship present on every row, false by default.
--
--   -- as staff, in Admin -> Products: open any product, check "Fast /
--   -- Free Delivery", save, reopen it -- the checkbox should still be
--   -- checked. On the live catalog, that product's card should show the
--   -- fast-ship badge; every other card should not.
