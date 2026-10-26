-- SECURITY: customers could read which distributor shipped their order.
--
-- own_order_shipments_read (20260923) lets a buyer SELECT the shipment rows
-- on their own order, and RLS is row-level: account.html only asks for the
-- tracking columns, but the same login could call
--   GET /rest/v1/order_shipments?select=distributor,note
-- and read the supplier (and the internal BOL / pickup note tforce-book.js
-- writes). Both are staff-only.
--
-- Fix: column privileges. Logged-in users (customers AND staff -- both are
-- the `authenticated` role) may only select the tracking columns. Staff
-- read distributor/note through staff_order_shipments(), which checks the
-- caller is staff. Inserts/updates/deletes are unchanged (admin.js inserts
-- with return=minimal; ups-tracking.js and tforce-book.js use the service
-- role, which ignores both RLS and these grants).

revoke select on public.order_shipments from anon, authenticated;
grant select (id, order_id, status, tracking_number, tracking_url, carrier,
              shipped_at, delivered_at, created_at, updated_at)
  on public.order_shipments to authenticated;

create or replace function public.staff_order_shipments(p_order_id uuid)
returns table (id uuid, distributor text, note text)
language sql security definer stable set search_path = public as $$
  select s.id, s.distributor, s.note
  from public.order_shipments s
  where s.order_id = p_order_id
    and (public.is_admin() or public.is_marketing() or public.is_supply_chain());
$$;
revoke all on function public.staff_order_shipments(uuid) from public;
grant execute on function public.staff_order_shipments(uuid) to authenticated;

-- Verify (logged in as a customer, with their access token):
--   GET /rest/v1/order_shipments?select=distributor   -> permission denied
--   GET /rest/v1/order_shipments?select=tracking_number -> their rows
