-- Per-product volume-tier quantity thresholds.
--
-- Until now the tier breakpoints were hardcoded as 6+ and 30+ in THREE
-- places -- getTierPrice() in script.js, tierPriceFor() in
-- api/_lib/price-cart.js, and the product page's pricing copy. That held
-- while every product shared one pricing scheme.
--
-- It no longer does. The OfficeCrave catalog sets its own breakpoints per
-- product: 76 distinct threshold combinations across 108 items (3/16/36,
-- 5/43/127, 2/12/28, and so on). Hardcoding 6/30 against that data would
-- charge a tier price the supplier does not actually honour at that
-- quantity -- the customer is shown one breakpoint and billed another.
--
-- Tiers are also RAGGED in that catalog: 67 products carry all three, 32
-- carry only one or two, and 9 carry none at all (single price, no volume
-- discount). Hence every column here is nullable: a null threshold means
-- "this product has no such tier", not "use a default". The pricing
-- functions treat a null tier as absent and fall back to the next tier
-- down, so a partial-tier product never advertises a discount a buyer
-- cannot actually reach.

alter table public.products
  add column if not exists tier1_min_qty integer,
  add column if not exists tier2_min_qty integer,
  add column if not exists tier3_min_qty integer;

comment on column public.products.tier1_min_qty is
  'Minimum quantity to reach price_tier1. NULL = this product has no tier 1 (fall back to price). Thresholds are per-product -- see 20260923b_product_tier_quantities.sql.';
comment on column public.products.tier2_min_qty is
  'Minimum quantity to reach price_tier2. NULL = no tier 2.';
comment on column public.products.tier3_min_qty is
  'Minimum quantity to reach price_tier3. NULL = no tier 3.';

-- Guard against a threshold set that cannot be satisfied in order. A
-- tier 2 that kicks in BELOW tier 1 would make the cheaper tier
-- unreachable, and the bug would only surface as a wrong charge at
-- checkout. Nulls pass (ragged tiers are legitimate); only a present,
-- out-of-order pair is rejected.
alter table public.products
  drop constraint if exists products_tier_qty_ascending;
alter table public.products
  add constraint products_tier_qty_ascending check (
    (tier1_min_qty is null or tier1_min_qty > 0) and
    (tier2_min_qty is null or tier2_min_qty > 0) and
    (tier3_min_qty is null or tier3_min_qty > 0) and
    (tier1_min_qty is null or tier2_min_qty is null or tier2_min_qty > tier1_min_qty) and
    (tier2_min_qty is null or tier3_min_qty is null or tier3_min_qty > tier2_min_qty) and
    (tier1_min_qty is null or tier3_min_qty is null or tier3_min_qty > tier1_min_qty)
  );

-- Per-tier supplier cost, alongside the existing cost_per_case. Staff-only
-- margin data: like cost_per_case/landed_cost, these are deliberately NOT
-- added to products_public below, so they cannot reach a customer.
alter table public.products
  add column if not exists tier1_cost numeric(10,2),
  add column if not exists tier2_cost numeric(10,2),
  add column if not exists tier3_cost numeric(10,2);

comment on column public.products.tier1_cost is
  'Supplier cost at tier 1 quantity. Staff-only margin data -- excluded from products_public.';

-- Which distributor supplies this product. RRS dropships (see
-- 20260923_dropship_shipments.sql), so this is what tells staff who to
-- place the order with. Internal: excluded from products_public for the
-- same reason order_shipments.distributor is never shown to a buyer.
alter table public.products
  add column if not exists distributor text;

comment on column public.products.distributor is
  'Supplying distributor (innstyle / sasso / officecrave). Internal -- excluded from products_public.';

-- Whether the distributor can currently supply this. Distinct from
-- is_active: is_active means "we sell this at all", in_stock means "it can
-- be shipped right now". An out-of-stock product stays listed (and
-- indexed) but cannot be added to a cart.
--
-- Defaults true so an import that carries no stock information -- Sasso's
-- file has no stock column, and InnStyle's numeric counts are not treated
-- as availability -- leaves products sellable rather than silently
-- pulling them off the storefront. Only OfficeCrave's explicit
-- "Out Of Stock" label sets this false.
--
-- This lives on products rather than in the inventory table because the
-- storefront reads products_public and has no access to inventory; the
-- catalog previously hardcoded "In Stock" on every tile because it had no
-- stock field to read at all.
alter table public.products
  add column if not exists in_stock boolean not null default true;

comment on column public.products.in_stock is
  'False when the distributor cannot currently supply this. Product stays listed but is not purchasable. Set from the supplier feed on import.';

-- products_public (20260916f, extended by 20260921) is an explicit column
-- allowlist, not `select *`. The storefront reads this view, so the new
-- tier QUANTITY columns must be appended here or the catalog cannot tell
-- a customer which quantity earns which price.
--
-- CREATE OR REPLACE VIEW requires the output column list to only ever
-- grow and never reorder, so the existing list is reproduced byte for
-- byte and the three new columns appended.
--
-- tier*_cost and distributor are deliberately NOT included.
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
  in_stock
  -- Deliberately excluded: cost_per_case, landed_cost, truckload_qty,
  -- tier1_cost, tier2_cost, tier3_cost (margin data), vendor_id and
  -- distributor (internal supplier links).
from public.products
where is_active = true;

grant select on public.products_public to anon, authenticated;

-- Verify
--   select sku, tier1_min_qty, price_tier1, tier2_min_qty, price_tier2
--   from public.products where tier1_min_qty is not null limit 5;
--
--   -- as anon: these must all error (column does not exist)
--   select tier1_cost from public.products_public limit 1;
--   select distributor from public.products_public limit 1;
