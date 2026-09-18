-- Auto-purges soft-deleted orders 3 days after deletion.
--
-- The Deleted Orders trash (20260918_orders_soft_delete.sql) kept a
-- deleted order recoverable forever unless an owner manually clicked
-- "Delete Forever" -- no expiry at all. Per the CEO: a 3-day restore
-- window, after which the trash empties itself automatically.
--
-- This is a SEPARATE function from purge_deleted_order(), not a reuse of
-- it. purge_deleted_order() is security definer but still calls
-- is_owner(), which reads auth.uid() -- that resolves for a real admin
-- clicking the button in a browser session, and resolves to NULL for a
-- Vercel Cron hit with the service-role key and no logged-in user, so
-- every automated call would have failed with "Only an owner can
-- permanently delete an order." This function does the same delete but
-- is meant to be called ONLY by the cron sweep in api/create-order.js
-- (which the daily Vercel Cron already hits -- see that file's own
-- comment on why new order-lifecycle work lives there instead of a new
-- route: this project is at Vercel Hobby's 12-function cap), not
-- exposed to any authenticated-user RPC path the way the three
-- owner-triggered ones are.
create or replace function public.purge_expired_deleted_orders()
returns table(purged_id uuid, purged_order_number text)
language plpgsql security definer as $$
begin
  return query
  delete from public.orders
    where deleted_at is not null
      and deleted_at < now() - interval '3 days'
    returning id, order_number;
end;
$$;

-- Deliberately NOT granted to authenticated: this must only run from the
-- service-role cron sweep. No client-facing code should ever be able to
-- call this directly, since it has no is_owner() check of its own -- the
-- 3-day cutoff on already-soft-deleted rows IS the check.
revoke all on function public.purge_expired_deleted_orders() from public, authenticated, anon;
grant execute on function public.purge_expired_deleted_orders() to service_role;

-- Verify (as owner, in the SQL editor):
--   select * from public.purge_expired_deleted_orders();
--   -- run it twice in a row: the second call should return 0 rows, since
--   -- everything eligible was already purged by the first.
