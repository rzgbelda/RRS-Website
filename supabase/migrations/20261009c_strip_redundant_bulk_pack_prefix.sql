-- Follow-up to 20261009b: that migration only matched the "Bulk Case
-- Pack of N " shape. 21 more products use a second, narrower phrase --
-- "Bulk Pack of N " (no "Case") -- e.g. "Bulk Pack of 12 Classic 100%
-- Cotton Kitchen Pot Holders — Hunter Green", which still collides with
-- bulkLead()'s own "Bulk Case "/"Bulk Pallet " lead-in at render time,
-- producing "Bulk Case Bulk Pack of 12...".
--
-- Verified against a live dump of all 21 matching rows: every one starts
-- with exactly "Bulk Pack of <digits> " followed by the real product
-- description, and none of their product_family values start with
-- "Bulk" at all (confirmed separately), so only name needs stripping
-- this time.
update public.products
set name = regexp_replace(name, '^Bulk Pack of [0-9,]+\s+', '')
where name ~ '^Bulk Pack of [0-9,]+\s+';
