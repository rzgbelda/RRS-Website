-- Google Merchant Center flagged product titles over its 150-char limit
-- ("Value truncated (too long) [title]"). Four "Luxury" towel SKUs run
-- 151-152 chars once the site's " | Room Ready Supply" suffix is added,
-- all from the same over-long spec tail:
--   ", 16s x 16s x 20 Construction, 1 lb Material"
-- which is the least shopper-relevant part of the name (yarn count and
-- per-unit material weight). Removing just that clause drops each title
-- to ~107 chars with the suffix, keeping size, case quantity, cam border,
-- and the 100% ringspun cotton claim.
--
-- Scoped to the exact four SKUs by id, not a blanket LIKE, so it can't
-- catch anything it wasn't meant to.

update public.products
set name = replace(name, ', 16s x 16s x 20 Construction, 1 lb Material', '')
where sku in (
  'RDU-TWL-WCL-13X13-LUX',
  'RDU-TWL-HTW-16X30-LUX',
  'RDU-TWL-BTW-25X50-LUX',
  'RDU-TWL-BTW-27X54-LUX'
)
and name like '%, 16s x 16s x 20 Construction, 1 lb Material%';
