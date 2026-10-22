-- 19206WH098 "Luxury White Ring-Spun Cotton Hand Towel - 16 x 30 in." is an
-- outdated listing of the Grand Luxury hand towel: same image
-- (Grand-hand_towel.png), same 25 lb weight and 16 x 30 size as the current
-- 18206WH098 "Grand Luxury Ring-Spun Cotton Hand Towels", which is already in
-- the Hand Towel family (20261022_starlinen_towels_by_type.sql). The user
-- asked (2026-10-22) for outdated items to be removed when the updated one is
-- live. Deactivated rather than deleted, like every earlier duplicate, so
-- past orders that reference it keep their product row.

update public.products
set is_active = false, updated_at = now()
where sku = '19206WH098';

-- Check: expect is_active = false.
select sku, name, is_active from public.products where sku in ('19206WH098', '18206WH098');
