-- Drop NPS from the storefront (Eric, 2026-11-10: "Yes drop them (hide)").
-- RRS no longer buys from NPS. Hidden, not deleted: past orders, quotes and
-- the vendor row keep pointing at these products, and re-activating is one
-- update if NPS ever comes back. Their removal also drops them from the
-- products sitemap on its next build (it lists active products only).
--
-- An active Best Deal on an NPS SKU is switched off too, so the Best Deals
-- page never shows a card for a product that can't be bought.
--
-- Run in the Supabase SQL editor as postgres. Idempotent.

begin;

update public.products
set is_active = false,
    updated_at = now()
where lower(distributor) = 'nps'
  and is_active is distinct from false;

update public.best_deals
set is_active = false
where is_active = true
  and sku in (select sku from public.products where lower(distributor) = 'nps');

commit;

-- Check: every NPS row inactive, no active deal left on one.
-- select sku, left(name, 45) as name, is_active from public.products
--  where lower(distributor) = 'nps' order by sku;
-- select sku, is_active from public.best_deals
--  where sku in (select sku from public.products where lower(distributor) = 'nps');
