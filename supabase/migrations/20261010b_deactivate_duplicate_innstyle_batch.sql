-- Deactivates 169 duplicate InnStyle products imported 2026-10-07 under
-- SKUs shaped like "INN-TWL-BTW-27X50-RSP-CS48" -- a separate, older
-- import of the same physical products that were re-imported today
-- (2026-10-10) under their raw InnStyle item numbers (e.g. "BT2750RC48",
-- matching innstyle.csv's own "Item Number" column directly).
--
-- Both batches have a real but different pricing gap -- discovered while
-- investigating a missing tier-card report:
--   - The 2026-10-07 batch (this one): price_tier1 is populated,
--     price_tier3 is always null.
--   - The 2026-10-10 batch (kept): price_tier2/price_tier3 are
--     populated; price_tier1 was null until the Converter's above-base
--     drop rule was fixed in the same commit as this migration (see
--     admin.js, cvtNormalizeValue) to stop treating a tier-1 price EQUAL
--     to base as a data error -- that was the InnStyle feed's normal
--     shape (tier 1 = the un-discounted starting rate), not a mistake.
--
-- Rather than repair the older batch's tier3 gap too, it's deactivated:
-- keeping both live would mean two storefront listings for the same
-- physical product, and the newer batch's data (full name, SKU format,
-- and once the price_tier1 fix above is in effect) is the more complete
-- and more current of the two.
--
-- Identified as one clean batch by a shared updated_at timestamp (every
-- one of the 169 rows carries the exact same write time from that
-- original import), not by SKU prefix alone -- confirmed via a live
-- query before writing this migration, not assumed.
update public.products
set is_active = false, updated_at = now()
where sku ilike 'INN-%'
  and updated_at = '2026-10-07T20:26:26.494284+00:00';

-- Safety-net count: confirms exactly how many rows this touched. Expect
-- 169 based on the live count checked before writing this migration --
-- a different number here means the dataset changed between that check
-- and running this, and is worth a second look before trusting the result.
select count(*) as deactivated_count
from public.products
where sku ilike 'INN-%'
  and is_active = false
  and updated_at > '2026-10-10T00:00:00+00:00';
