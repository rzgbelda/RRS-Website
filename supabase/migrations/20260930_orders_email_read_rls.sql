-- Fixes a gap in own_orders_read that made a real order invisible to the
-- customer who placed it.
--
-- own_orders_read (schema.sql:332) only ever checked auth.uid() = user_id.
-- That's correct for orders placed while logged in, but api/create-order.js
-- explicitly supports guest checkout (order_reorder migration's own
-- comments: "Guest (not logged in) checkout was completely broken..."),
-- and the daily reorder-sweep clone in api/create-order.js's runDueReorders
-- copies user_id from the source order verbatim -- so a guest-placed
-- reorder schedule clones into more rows that also carry user_id = null
-- forever, even after the customer creates an account with the same email.
--
-- account.html's loadOrders() already queries
-- `.or('user_id.eq.X,customer_email.eq.Y')` expecting the email match to
-- work -- it has since before this feature existed. RLS silently dropped
-- every row that query's email half was supposed to surface, so a
-- logged-in customer looking at their own Order History saw "No orders
-- yet" for any order that didn't have their user_id attached, with no
-- error to explain why.
drop policy if exists "own_orders_read" on public.orders;
create policy "own_orders_read" on public.orders
  for select
  using (
    auth.uid() = user_id
    or public.is_admin()
    or (customer_email is not null and lower(customer_email) = lower(auth.jwt() ->> 'email'))
  );

-- Same gap, same fix, for the line items joined onto each order --
-- account.html's `.select("*, order_items(*)")` needs both policies to
-- agree or the order shows with zero items.
drop policy if exists "own_order_items" on public.order_items;
create policy "own_order_items" on public.order_items
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          o.user_id = auth.uid()
          or public.is_admin()
          or (o.customer_email is not null and lower(o.customer_email) = lower(auth.jwt() ->> 'email'))
        )
    )
  );
