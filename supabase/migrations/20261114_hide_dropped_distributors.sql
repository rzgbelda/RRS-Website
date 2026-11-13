-- Drop Innstyle, Bargoose and Wraptite from the storefront (owner confirmed
-- 2026-11-14: only Starlinen and Imperial Brady are retained as distributors).
-- Same approach as 20261110_hide_nps.sql: hidden, not deleted, so past orders,
-- quotes and vendor rows keep pointing at these products and re-activating is
-- one update. Their removal also drops them from the products sitemap on its
-- next build (it lists active products only).
--
-- Backs up the rows first (SKU + prior is_active), so "undo" is exact:
--   update public.products p set is_active = b.is_active
--     from public.products_backup_20261114 b where b.id = p.id;
--
-- Active Best Deals on those SKUs are switched off too (two Wraptite deals,
-- GLNMPFL3-L and CL062424N, at the time of writing), so the Best Deals page
-- never shows a card for a product that can't be bought.
--
-- Run in the Supabase SQL editor as postgres. Idempotent.

begin;

create table if not exists public.products_backup_20261114 as
select id, sku, distributor, is_active, now() as backed_up_at
from public.products
where lower(distributor) in ('innstyle', 'bargoose', 'wraptite');

update public.products
set is_active = false,
    updated_at = now()
where lower(distributor) in ('innstyle', 'bargoose', 'wraptite')
  and is_active is distinct from false;

update public.best_deals
set is_active = false
where is_active = true
  and sku in (
    select sku from public.products
    where lower(distributor) in ('innstyle', 'bargoose', 'wraptite')
  );

commit;

-- Checks:
-- select lower(distributor) as distributor, count(*) filter (where is_active) as active, count(*) as total
--   from public.products group by 1 order by 1;
--   -> innstyle / bargoose / wraptite should show active = 0.
-- select sku, is_active from public.best_deals where is_active order by position;
--   -> only the 6 Imperial Brady deals should remain.
