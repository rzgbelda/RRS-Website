-- Customer-facing product text said "...the listed cost applying to one dozen"
-- (and "at the listed per-each cost") -- supplier-sheet wording that exposes the
-- word "cost" on the storefront (80 products, 2026-11-12). Removes just that
-- clause; the rest of each overview/description is untouched. Re-running is safe.
begin;

create table if not exists public.products_backup_20261112b as
  select id, sku, overview, description from public.products
  where overview ilike '%listed%cost%' or description ilike '%listed%cost%';

update public.products set
  overview = regexp_replace(regexp_replace(regexp_replace(overview,
    ' at the (listed per-each|per-each listed) cost;', ';', 'g'),
    ',? and the listed cost applying to one [a-z ]+\.', '.', 'g'),
    ', with the listed cost applying to one [a-z ]+(\.|;)', '\1', 'g'),
  updated_at = now()
where overview ilike '%listed%cost%';

update public.products set
  description = regexp_replace(regexp_replace(regexp_replace(description,
    ' at the (listed per-each|per-each listed) cost;', ';', 'g'),
    ',? and the listed cost applying to one [a-z ]+\.', '.', 'g'),
    ', with the listed cost applying to one [a-z ]+(\.|;)', '\1', 'g'),
  updated_at = now()
where description ilike '%listed%cost%';

commit;
