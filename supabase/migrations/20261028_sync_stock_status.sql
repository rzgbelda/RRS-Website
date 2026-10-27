-- Out-of-stock in admin never reached the storefront.
--
-- The admin's Stock Status (product modal, Inventory tab, dashboard
-- "Out of Stock" count) lives in inventory.status. The storefront, cart and
-- checkout read only products.in_stock -- and nothing ever copied one to the
-- other, so a product marked Out of Stock in admin stayed sellable.
--
-- 1. Backfill: a product is out of stock if EITHER side says so (never put
--    something back on sale by accident), and both sides are made to agree.
-- 2. Trigger: every write to inventory.status mirrors onto products.in_stock,
--    whatever path wrote it (admin, CSV import, SQL).

update public.products p
   set in_stock = false
  from public.inventory i
 where i.product_id = p.id
   and i.status = 'out_of_stock'
   and p.in_stock is distinct from false;

insert into public.inventory (product_id, stock_qty, status, updated_at)
select p.id, 0, 'out_of_stock', now()
  from public.products p
 where p.in_stock = false
on conflict (product_id) do update
   set status = 'out_of_stock', updated_at = now()
 where public.inventory.status <> 'out_of_stock';

create or replace function public.sync_product_in_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
     set in_stock = (new.status <> 'out_of_stock')
   where id = new.product_id
     and in_stock is distinct from (new.status <> 'out_of_stock');
  return new;
end;
$$;

revoke all on function public.sync_product_in_stock() from public, anon, authenticated;

drop trigger if exists inventory_sync_in_stock on public.inventory;
create trigger inventory_sync_in_stock
after insert or update of status on public.inventory
for each row execute function public.sync_product_in_stock();
