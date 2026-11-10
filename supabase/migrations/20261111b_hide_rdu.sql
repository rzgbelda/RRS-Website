-- Drop RDU from the storefront (user, 2026-11-11: "wala na yon, matagal na tayong
-- di nakuha sa RDU"). 6 microfiber sheets (RDU-BED-*) were still active with no
-- supplier set, so delivery could never be priced and checkout stopped on them.
-- Hidden, not deleted: past orders and quotes still point at them.
-- Run in the Supabase SQL editor as postgres. Idempotent.

begin;

update public.products
set is_active = false,
    updated_at = now()
where sku like 'RDU-%'
  and is_active is distinct from false;

update public.best_deals
set is_active = false
where is_active = true
  and sku like 'RDU-%';

commit;

-- Check: select sku, is_active from public.products where sku like 'RDU-%' order by sku;
