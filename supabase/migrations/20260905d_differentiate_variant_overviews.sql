-- Differentiates product overviews that were identical across size/colour
-- variants of the same product family.
--
-- After stripping the shared marketing boilerplate (20260905c), 22 of 140
-- active products across 7 families were left sharing a byte-identical
-- overview with their siblings -- e.g. all four Empress nitrile glove
-- sizes, all four NOVA hardwound towel variants, all four NOVA coreless
-- can liner sizes, and three fleece blankets in two colourways each.
--
-- Their <title> tags already differ (Google can tell "Wholesale Small
-- Powder Free Gloves" from "...Large..."), so canonicalising them to one
-- parent would throw away genuinely distinct, individually purchasable
-- pages -- the product page has no variant switcher, so each size is the
-- only way to buy that size. The narrower, correct fix is to make the
-- description carry the same distinguishing attribute the title already
-- does.
--
-- Two groups, because they vary along different axes:
--   * 16 products vary by SIZE and their variant_label is not yet in the
--     text -> lead with the size.
--   * 6 fleece blankets already name their size in the text and vary only
--     by COLOUR -> lead with the colour instead.
--
-- Idempotent: each statement skips rows whose overview already opens with
-- the attribute being added, so re-running changes nothing.

-- 1. Size-varying products (gloves, towels, can liners).
update public.products p
set overview = p.variant_label || ' — ' || p.overview,
    updated_at = now()
where p.is_active
  and coalesce(p.variant_label, '') <> ''
  and position(lower(p.variant_label) in lower(p.overview)) = 0
  and exists (
    select 1 from public.products s
    where s.is_active
      and s.id <> p.id
      and btrim(s.overview) = btrim(p.overview)
  );

-- 2. Colour-varying products (fleece blankets) -- size is already in the
--    text, so colour is what actually separates them.
update public.products p
set overview = p.color_label || ' — ' || p.overview,
    updated_at = now()
where p.is_active
  and coalesce(p.color_label, '') <> ''
  and position(lower(p.color_label) in lower(p.overview)) = 0
  and exists (
    select 1 from public.products s
    where s.is_active
      and s.id <> p.id
      and btrim(s.overview) = btrim(p.overview)
  );
