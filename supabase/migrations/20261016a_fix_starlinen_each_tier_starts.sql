-- Starlinen "Each" products whose volume tiers start BELOW the minimum
-- order, so every order got a discount it hadn't earned.
--
-- Found while building the Economy/Premium pages (2026-10-16): the
-- supplier file gives tiers as case ranges (1-3 / 4-8 / 9+ cases), but these
-- five were imported with the case counts as piece counts. Example: the T250
-- King duvet cover sells by the case of 5, yet tier 2 started at 4 pieces,
-- so even the minimum order (5) was charged the tier-2 price.
--
-- Correct starts = case count x pieces per case (the product's moq):
--   tier 2 = 4 cases, tier 3 = 9 cases. Prices are unchanged.
--
-- Only touches rows still holding the wrong (below-moq) value, so it is
-- safe to re-run. Run in the Supabase SQL editor as postgres.

update public.products
set tier2_min_qty = moq * 4,
    tier3_min_qty = moq * 9,
    updated_at    = now()
where sku in ('70010WH287', '73047WH287', '71168WH287', '71167WH287', '20382xx091')
  and moq > 1
  and tier2_min_qty < moq;

-- Check: tier 2 should now be 20 / 24 / 20 / 24 / 576 and tier 3 45 / 54 / 45 / 54 / 1296.
-- select sku, moq, tier2_min_qty, tier3_min_qty from public.products
--  where sku in ('70010WH287', '73047WH287', '71168WH287', '71167WH287', '20382xx091') order by sku;
