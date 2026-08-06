-- Fix: guest (not logged in) checkout cannot submit an order at all.
--
-- Confirmed live: POSTing a new row to public.orders with user_id = null
-- (exactly what payment.html sends for a guest checkout, both the invoice/PO
-- path and the card path) is rejected with 42501 "new row violates row-level
-- security policy for table orders" -- reproduced directly against the REST
-- API, independent of any application code.
--
-- schema.sql has always documented the intended policy as allowing this
-- ("auth.uid() = user_id or user_id is null"), so this was never a change in
-- intent -- whatever is live today either predates that policy or was never
-- applied to match it. Re-declaring it explicitly removes the ambiguity.
--
-- Impact while this was broken: any visitor who was not logged in and chose
-- Invoice Me or PO at checkout had their order silently fail to save, with
-- no fallback (unlike card payments, which are still recorded a few seconds
-- later by the Stripe webhook using the service role key, bypassing RLS --
-- so card guests saw a scary but false "we hit a problem" message, while
-- invoice/PO guests lost the order outright).
drop policy if exists "create_order" on public.orders;
create policy "create_order" on public.orders
  for insert
  with check (auth.uid() = user_id or user_id is null);
