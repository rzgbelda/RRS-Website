-- Corrects 20261008_starlinen_import_fix.sql's family grouping for the
-- Starlinen sheet line: that migration gave T180/T200/T250/Millennium T300
-- each their own product_family per sheet type ("T180 Cotton Blend Flat
-- Sheet", "T200 Cotton Blend Flat Sheet", etc.), treating thread count like
-- a quality tier (Economy/Premium/Luxury) that deserves its own card.
--
-- User feedback: these are the same product differing only by thread count
-- and size -- not different products -- and should be ONE card per sheet
-- type (Flat Sheet / Fitted Sheet / Pillowcase) with thread count AND size
-- both selectable inside it. The catalog's variant picker already supports
-- exactly this two-axis pattern (see script.js's "Select Tier" then
-- "Select Size" rows, which already lists 180/200/250 first in its sort
-- order) -- this migration just uses the mechanism that was already there
-- instead of the one invented for the first pass.
--
-- product_tier (the thread count: 180/200/250/300) is left as set by the
-- prior migration; only product_family changes here, merging all four
-- thread counts into one family per sheet type.
--
-- family_key is confirmed NULL on all of these rows (checked live), so the
-- storefront's grouping (family_key || product_family) falls through to
-- product_family cleanly -- no second column to update.
--
-- Duvet covers: per the same feedback, King and Queen duvet covers now
-- each span both patterns (Solid White, White 1 cm Stripe) under one card
-- per size. King and Queen stay separate families -- they are different,
-- non-interchangeable sizes, same reasoning the sheet sizes already use.
-- variant_label carries both pattern and size as one combined label
-- ("King — Solid White") since the picker's two axes are tier+size, there
-- is only one tier here (250), and pattern isn't a tier.

begin;

update public.products set product_family = 'Cotton Blend Flat Sheet', updated_at = now()
  where sku in ('74007WH402','74009WH402','74011WH402','74023WH402','74025WH402','74027WH402',
                '74102WH402','74104WH402','74106WH402','37207WH287','80230WH287');

update public.products set product_family = 'Cotton Blend Fitted Sheet', updated_at = now()
  where sku in ('74014WH402','74015WH402','74016WH402','74034WH402','74035WH402','74036WH402',
                '74103WH402','74105WH402','74107WH402','37202WH287','80222WH287');

update public.products set product_family = 'Cotton Blend Pillowcase', updated_at = now()
  where sku in ('74000WH402','74002WH402','74019WH402','74020WH402','74108WH402','74109WH402',
                '37203WH287','37204WH287');

update public.products set
  product_family = 'T250 Cotton Blend King Duvet Cover',
  variant_label = 'King — Solid White',
  updated_at = now()
  where sku = '70010WH287';
update public.products set
  product_family = 'T250 Cotton Blend King Duvet Cover',
  variant_label = 'King — White 1 cm Stripe',
  updated_at = now()
  where sku = '71168WH287';
update public.products set
  product_family = 'T250 Cotton Blend Queen Duvet Cover',
  variant_label = 'Queen — Solid White',
  updated_at = now()
  where sku = '73047WH287';
update public.products set
  product_family = 'T250 Cotton Blend Queen Duvet Cover',
  variant_label = 'Queen — White 1 cm Stripe',
  updated_at = now()
  where sku = '71167WH287';

commit;

-- Verify (run separately, after the transaction above commits):
-- select product_family, product_tier, variant_label, name, sku from public.products
-- where product_family in ('Cotton Blend Flat Sheet','Cotton Blend Fitted Sheet','Cotton Blend Pillowcase','T250 Cotton Blend King Duvet Cover','T250 Cotton Blend Queen Duvet Cover')
-- order by product_family, product_tier, variant_label;
