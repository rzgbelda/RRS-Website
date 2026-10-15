-- NPS paper products: correct the imported data, then put them back on the
-- storefront. All 10 NPS rows were imported from the RAW masterlist (not the
-- converted copy) and were still hidden (is_active = false) from 2026-10-02.
--
-- What was wrong (see the NPS pallet rules):
--   unit            'Each'      -> 'Case'   (price is per CASE; MOQ = cases per pallet)
--   tier quantities 1 / 4 / 9   -> pallets, must be cases: x MOQ (e.g. 30 / 120 / 270).
--                   Tier 1 equals the base price, so it is dropped (null) and the
--                   product page rebuilds that card from the base price.
--   weight          per PALLET  -> per CASE. The cart multiplies weight by cases, so a
--                   658 lb pallet weight shipped 30 cases as 19,740 lb.
--                   per-case = pallet weight / MOQ (a pallet's own ~45 lb makes this
--                   a slight overestimate, which is the safe direction).
--   name            12375 starts with the stray word "Purchase ".
--
-- Idempotent: the weight step only touches rows still holding a pallet-sized
-- weight (>= 200 lb), so running this twice does not divide twice.
-- Run in the Supabase SQL editor as postgres.

begin;

update public.products
set
  weight        = round((weight / nullif(moq, 0))::numeric, 2),
  updated_at    = now()
where distributor = 'nps'
  and moq > 1
  and weight >= 200;

update public.products
set
  unit          = 'Case',
  price_tier1   = null,
  tier1_min_qty = null,
  tier2_min_qty = case when tier2_min_qty is not null and tier2_min_qty < moq then tier2_min_qty * moq else tier2_min_qty end,
  tier3_min_qty = case when tier3_min_qty is not null and tier3_min_qty < moq then tier3_min_qty * moq else tier3_min_qty end,
  name          = regexp_replace(name, '^Purchase\s+', ''),
  is_active     = true,
  updated_at    = now()
where distributor = 'nps';

commit;

-- Check: unit Case, weight a few dozen lb, tiers x MOQ, all active.
-- select sku, left(name, 40) as name, is_active, unit, moq, weight,
--        price, price_tier2, price_tier3, tier2_min_qty, tier3_min_qty
--   from public.products where distributor = 'nps' order by sku;
