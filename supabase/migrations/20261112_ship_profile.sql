-- Eric (2026-11-12): product pages state each supplier's real shipping
-- details -- Imperial Brady and Starlinen differ -- and the "In Stock"
-- block comes off the product page (stock is handled at cart level).
--
-- products.distributor is internal and never reaches the browser, so each
-- product is TAGGED with a neutral ship_profile the storefront can show:
--   same_day_3pm : Imperial Brady (order before 3 PM Eastern, ships same day)
--   ships_1_2    : Starlinen (ships within 1 to 2 business days)
-- A trigger keeps new imports tagged from their distributor; untagged
-- suppliers keep the generic product-page text.
-- Run in the Supabase SQL editor. Idempotent.

begin;

alter table public.products add column if not exists ship_profile text;

create or replace function public.set_ship_profile() returns trigger
language plpgsql as $$
begin
  new.ship_profile := case lower(coalesce(new.distributor, ''))
    when 'imperial-brady' then 'same_day_3pm'
    when 'starlinen'      then 'ships_1_2'
    else null end;
  return new;
end $$;

drop trigger if exists products_set_ship_profile on public.products;
create trigger products_set_ship_profile
  before insert or update of distributor on public.products
  for each row execute function public.set_ship_profile();

update public.products
set ship_profile = case lower(coalesce(distributor, ''))
    when 'imperial-brady' then 'same_day_3pm'
    when 'starlinen'      then 'ships_1_2'
    else null end;

-- Same view as 20261006_best_deal_pricing.sql (matches the live columns),
-- with ship_profile appended.
drop view if exists public.products_public;

create view public.products_public as
select
  p.id, p.name, p.sku, p.description, p.overview, p.image_url, p.images,
  p.category_id, p.category_name,
  coalesce(d.deal_price, p.price)        as price,
  p.sale_price, p.is_on_sale,
  p.case_qty, p.pack_size, p.unit, p.sell_by_each,
  coalesce(d.deal_tier1, p.price_tier1)  as price_tier1,
  coalesce(d.deal_tier2, p.price_tier2)  as price_tier2,
  coalesce(d.deal_tier3, p.price_tier3)  as price_tier3,
  p.product_tier,
  p.product_family, p.variant_label, p.color_group, p.color_label,
  p.moq, p.moq_group, p.moq_group_min,
  p.weight, p.length, p.width, p.height,
  p.feature1, p.feature2, p.feature3, p.feature4,
  p.meta_title, p.meta_description,
  p.is_featured, p.is_active, p.created_at, p.updated_at,
  p.is_fast_ship,
  p.tier1_min_qty, p.tier2_min_qty, p.tier3_min_qty,
  p.in_stock,
  p.family_key,
  p.retail_price,
  (d.sku is not null)                    as is_best_deal,
  p.price                                as regular_price,
  p.price_tier1                          as regular_price_tier1,
  p.price_tier2                          as regular_price_tier2,
  p.price_tier3                          as regular_price_tier3,
  p.ship_profile
from public.products p
left join lateral (
  select bd.sku, bd.deal_price, bd.deal_tier1, bd.deal_tier2, bd.deal_tier3
  from public.best_deals bd
  where bd.sku = p.sku and bd.is_active = true
  order by bd.position asc, bd.created_at asc
  limit 1
) d on true
where p.is_active = true;

grant select on public.products_public to anon, authenticated;

commit;

-- Check:
-- select ship_profile, count(*) from public.products group by 1;
