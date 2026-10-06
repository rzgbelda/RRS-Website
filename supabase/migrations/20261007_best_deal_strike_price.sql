-- Best Deal "was" price: a struck-through original price staff set directly
-- in the Best Deals editor, instead of in a separate product field.
--
-- Before this, the Best Deals page's strikethrough read products.retail_price
-- -- a manual "compare at" number set on the PRODUCT, in a different screen
-- (Admin > Products) than where deal prices are set (Admin > Best Deals).
-- Every deal needed two separate edits in two separate places to show its
-- "was" price correctly, and it was easy to set a deal price and forget the
-- other field -- which is exactly what happened (2026-10-07: several live
-- deals had a real deal_price but no retail_price, so the page showed a flat
-- price with no strikethrough at all).
--
-- strike_price lives on best_deals itself: it's marketing copy for THIS
-- deal, not a durable fact about the product, so it belongs with hook_title/
-- pitch_text rather than on products. retail_price stays (CSV import and any
-- historical use still read it) and is kept as a fallback only.

alter table public.best_deals
  add column if not exists strike_price numeric(10,2);

-- Verify:
--   select sku, strike_price, deal_price from public.best_deals;
