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
