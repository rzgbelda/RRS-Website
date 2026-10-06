-- Best Deal pricing: a deal can carry its own selling price and tier 1-3
-- prices, and those become the product's price everywhere while the deal is
-- active.
--
-- Applied in products_public rather than in each page: the catalog, product
-- page, Best Deals page, quote form and the server-rendered product page all
-- read this view, so they all show the deal price with no per-page logic.
-- The card charge (api/_lib/price-cart.js) reads the base table with the
-- service role and applies the same overlay itself.
--
-- A NULL deal price means "keep the product's own price" for that field.
-- Deactivating or deleting the deal restores the regular prices instantly.

alter table public.best_deals
  add column if not exists deal_price  numeric(10,2),
  add column if not exists deal_tier1  numeric(10,2),
  add column if not exists deal_tier2  numeric(10,2),
  add column if not exists deal_tier3  numeric(10,2);

-- Rebuilt rather than CREATE OR REPLACE: the price columns change from plain
-- columns to expressions, which REPLACE rejects if the type modifier shifts.
-- In one transaction, so a failure leaves the old view untouched.
begin;

drop view if exists public.products_public;

create view public.products_public as
select
  p.id, p.name, p.sku, p.description, p.overview, p.image_url, p.images,
  p.category_id, p.category_name,
  coalesce(d.deal_price, p.price)        as price,
  p.sale_price, p.is_on_sale,
  p.case_qty, p.pack_size, p.unit, p.sell_by_each,
  coalesce(d.deal_tier1, p.price_tier1)  as price_tier1,
  coalesce(d.deal_tier2, p.price_tier2)  as price_tier2,
  coalesce(d.deal_tier3, p.price_tier3)  as price_tier3,
  p.product_tier,
  p.product_family, p.variant_label, p.color_group, p.color_label,
  p.moq, p.moq_group, p.moq_group_min,
  p.weight, p.length, p.width, p.height,
  p.feature1, p.feature2, p.feature3, p.feature4,
  p.meta_title, p.meta_description,
  p.is_featured, p.is_active, p.created_at, p.updated_at,
  p.is_fast_ship,
  p.tier1_min_qty, p.tier2_min_qty, p.tier3_min_qty,
  p.in_stock,
  p.family_key,
  p.retail_price,
  -- Best Deal flag + the regular prices, so pages can tag the product and
  -- show what it normally costs.
  (d.sku is not null)                    as is_best_deal,
  p.price                                as regular_price,
  p.price_tier1                          as regular_price_tier1,
  p.price_tier2                          as regular_price_tier2,
  p.price_tier3                          as regular_price_tier3
  -- Deliberately excluded: cost_per_case, landed_cost, truckload_qty,
  -- tier1_cost, tier2_cost, tier3_cost (margin data), vendor_id and
  -- distributor (internal supplier links).
from public.products p
left join lateral (
  -- If a SKU somehow has more than one active deal, the first by position wins.
  select bd.sku, bd.deal_price, bd.deal_tier1, bd.deal_tier2, bd.deal_tier3
  from public.best_deals bd
  where bd.sku = p.sku and bd.is_active = true
  order by bd.position asc, bd.created_at asc
  limit 1
) d on true
where p.is_active = true;

grant select on public.products_public to anon, authenticated;

commit;

-- Verify:
--   select sku, price, regular_price, is_best_deal from public.products_public where is_best_deal;
