-- Phase 0 (urgent): the admin product editor writes cost_per_case,
-- landed_cost and truckload_qty on every save, but these columns were
-- never added to the live products table -- every save that includes a
-- cost is currently failing in production (Postgrest 42703 "column does
-- not exist"). Confirmed live via a direct read of the products table.
alter table public.products
  add column if not exists cost_per_case numeric(10,2),
  add column if not exists landed_cost   numeric(10,2),
  add column if not exists truckload_qty integer;

-- Phase 1: columns needed so the products table can fully replace
-- products.csv as the storefront's data source without losing any
-- content currently rendered from the CSV (product detail pages,
-- variant/color switcher, feature bullets, dimensions for freight).
-- All nullable/additive -- existing rows are unaffected.
alter table public.products
  add column if not exists overview      text,
  add column if not exists feature1      text,
  add column if not exists feature2      text,
  add column if not exists feature3      text,
  add column if not exists feature4      text,
  add column if not exists sell_by_each  text,
  add column if not exists weight        numeric(10,2),
  add column if not exists length        numeric(10,2),
  add column if not exists width         numeric(10,2),
  add column if not exists height        numeric(10,2),
  add column if not exists product_family text,
  add column if not exists variant_label  text,
  add column if not exists color_group    text,
  add column if not exists color_label    text;

-- Phase 1b: the reseed script upserts on sku, which requires a unique
-- constraint that was never added. Two earlier seed runs (2026-06-23 and
-- 2026-07-05) each inserted the same 47 real SKUs with different prices,
-- so every one of them exists twice today -- confirmed live, e.g.
-- 11008635042 appears as both $35.30 and $34.06. Neither survives: the
-- reseed overwrites every field on whichever row remains, so it does not
-- matter which duplicate is kept, only that one is. Keeps the most
-- recently created row of each pair; only touches rows that have a sku
-- (the ~91 unrelated legacy rows with no sku are untouched).
with ranked as (
  select id, sku, row_number() over (partition by sku order by created_at desc) as rn
  from public.products
  where sku is not null
)
delete from public.products
where id in (select id from ranked where rn > 1);

alter table public.products
  add constraint products_sku_key unique (sku);
