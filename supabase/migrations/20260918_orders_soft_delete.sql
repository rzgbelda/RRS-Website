-- Soft-delete for orders.
--
-- Deleting an order in the admin ("Delete" button on the Orders tab) was
-- a real `DELETE` straight to Postgres, cascading to order_items,
-- fulfillment rows, order_returns and acknowledgements. There was no
-- undo -- not a trash bin, not an audit row, nothing. An order got
-- deleted (RRS-INV-1786133040344, Nc Wellness / Lashanda Moore, invoice
-- on file) and there was no way to get it back short of a Supabase
-- point-in-time restore, which is a project-wide rollback, not a
-- single-row undo, and only exists at all on a paid plan with PITR
-- enabled.
--
-- This adds deleted_at/deleted_by columns and three RPCs
-- (soft_delete_order / restore_order / purge_deleted_order) that the
-- admin's Delete button and a new "Deleted Orders" list call instead of
-- deleting the row directly. The row and its order_items stay on disk
-- until someone explicitly empties the trash; nothing here is a
-- substitute for real backups, but it turns "gone" into "hidden, and one
-- click from back."
--
-- Also closes a gap noticed while fixing this: 20260828d granted
-- marketing_manage_orders `for all` (insert/select/update/DELETE) to
-- is_marketing(), with no separate owner-only delete policy -- unlike
-- quote_requests, campaigns and the CRM tables, which all got an
-- owner-gated delete in 20260912c. Any marketing-role account could
-- permanently delete a financial record. Delete (soft-delete, now) is
-- owner-only going forward; marketing keeps insert/select/update.

alter table public.orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists orders_deleted_at_idx on public.orders (deleted_at);

-- Every existing read/list path that lists multiple orders -- the Orders
-- tab, dashboard stats, a customer's order history, the sales-tax report
-- -- now filters .is("deleted_at", null) at the call site instead of
-- going through a view. There are ~60 call sites against "orders" across
-- admin.js, account.html, script.js and the server APIs; most of them
-- fetch a single row by id (an invoice link, a webhook reconciling a
-- payment) where a soft-deleted order should still resolve, so a
-- blanket view swap would have been wrong for those, not just unnecessary.

-- Replace marketing's blanket "for all" with explicit insert/select/update.
-- Delete is dropped from this policy entirely -- see owner_delete_orders.
drop policy if exists "marketing_manage_orders" on public.orders;

drop policy if exists "marketing_insert_orders" on public.orders;
create policy "marketing_insert_orders" on public.orders
  for insert with check (public.is_marketing());

drop policy if exists "marketing_select_orders" on public.orders;
create policy "marketing_select_orders" on public.orders
  for select using (public.is_marketing());

drop policy if exists "marketing_update_orders" on public.orders;
create policy "marketing_update_orders" on public.orders
  for update using (public.is_marketing()) with check (public.is_marketing());

-- Owner can do everything marketing can, plus the hard delete this
-- migration is meant to make rare: emptying the trash (see
-- purge_deleted_order below) still goes through a real DELETE, and that
-- stays owner-only.
drop policy if exists "owner_all_orders" on public.orders;
create policy "owner_all_orders" on public.orders
  for all using (public.is_owner()) with check (public.is_owner());

-- Soft-deletes an order: sets deleted_at/deleted_by rather than removing
-- the row. security definer so it can run as the calling user (owner
-- only, checked below) without needing a broader UPDATE grant on orders
-- than marketing already has.
create or replace function public.soft_delete_order(p_order_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner can delete an order.';
  end if;

  update public.orders
    set deleted_at = now(),
        deleted_by = auth.uid()
    where id = p_order_id
      and deleted_at is null;
end;
$$;

-- Undoes soft_delete_order. Owner only, same reasoning.
create or replace function public.restore_order(p_order_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner can restore an order.';
  end if;

  update public.orders
    set deleted_at = null,
        deleted_by = null
    where id = p_order_id
      and deleted_at is not null;
end;
$$;

-- Permanent delete, for the trash view's own "Delete Forever." This is
-- the only path left in the app that actually removes the row (and, via
-- the existing on delete cascade FKs, order_items and the fulfillment/
-- returns/acknowledgement rows tied to it). Only callable on a row that
-- is already soft-deleted, so it cannot be used to skip the trash step.
create or replace function public.purge_deleted_order(p_order_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner can permanently delete an order.';
  end if;

  delete from public.orders
    where id = p_order_id
      and deleted_at is not null;
end;
$$;

grant execute on function public.soft_delete_order(uuid) to authenticated;
grant execute on function public.restore_order(uuid) to authenticated;
grant execute on function public.purge_deleted_order(uuid) to authenticated;
