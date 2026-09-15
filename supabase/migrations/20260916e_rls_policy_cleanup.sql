-- Cleans up the stale/duplicate/unsafe policies surfaced by the
-- pg_policies audit that found the recursion bug (20260916d). Three
-- separate problems, addressed in order of how much they matter:
--
--   1. UNSAFE: order_referrals lets anyone fabricate a commission claim.
--   2. DUPLICATE: orders and order_items each carry policies from at
--      least three different schema eras doing the same job under
--      different names -- harmless (RLS is permissive/OR'd) but makes
--      the real access rules unreadable, and each duplicate is a place
--      a future recursion bug like 20260916d's can hide.
--   3. Confirms the surviving set still does everything the app needs:
--      guest checkout, a logged-in customer's own orders/items, staff,
--      and the affiliate self-service dashboard.

-- ============================================================
-- 1. order_referrals: close the fabricated-commission hole
-- ============================================================
-- "Users can insert order referrals" (with_check: true, confirmed live
-- via pg_policies 2026-09-16) lets ANY caller insert a row naming ANY
-- sub_distributor_id against ANY order_id -- with no requirement that
-- the order or the affiliate are even real. Financial exposure is
-- currently limited (checkout writes commission_amount: 0; the Payouts
-- tab computes the real figure independently -- see eb47804/ee13bce),
-- but a forged row still pollutes an affiliate's order list with an
-- order that was never theirs, and undermines the auto-attribution this
-- whole feature exists for: every order referred through an affiliate's
-- subdomain must reflect a REAL customer action, not a client's say-so.
--
-- This runs from an anonymous/guest checkout client (payment.html:859,
-- 1202 -- checkout has no login requirement), so it cannot be scoped to
-- auth.uid() the way a logged-in-only insert could. What it CAN require:
-- the referral names an affiliate that actually exists and is active,
-- and the order actually exists. order_referrals already carries
-- UNIQUE(order_id) at the table level (sub_distributors.sql), so "one
-- referral per order" doesn't need re-checking here.
-- Only "Users can insert order referrals" is confirmed live (pg_policies,
-- 2026-09-16); no second insert-policy name was found on this table, so
-- unlike orders/order_items below there is nothing else to drop here.
drop policy if exists "Users can insert order referrals" on public.order_referrals;

create policy "checkout_insert_order_referrals" on public.order_referrals
  for insert
  with check (
    exists (select 1 from public.orders o where o.id = order_id)
    and exists (
      select 1 from public.sub_distributors sd
      where sd.id = sub_distributor_id and sd.status = 'active'
    )
  );

-- ============================================================
-- 2. orders: collapse duplicate SELECT/UPDATE policies
-- ============================================================
-- Confirmed live (pg_policies, 2026-09-16), FIVE policies doing customer/
-- admin read access under different names from different eras:
--   "Admins can view all orders"      -- raw profiles.role = 'admin' check
--   "Admins can update all orders"    -- same, for UPDATE
--   "Allow users to read own orders"  -- auth.uid() = user_id
--   "Users can view own orders"       -- auth.uid() = user_id (duplicate)
--   own_orders_read                   -- auth.uid() = user_id OR is_admin()
-- own_orders_read (20260828-era, using the is_admin() helper that also
-- covers 'owner' -- 20260902e_fix_is_admin_owner_role.sql) is a strict
-- superset of the other four: same customer check, plus is_admin()
-- already covers what the two raw profiles.role='admin' policies did
-- (and correctly ALSO covers owner, which those two never did). Also
-- keeping admin_manage_orders (is_admin(), for ALL) and
-- marketing_manage_orders (is_marketing(), for ALL) -- staff access
-- already routes through those, untouched by this cleanup.
drop policy if exists "Admins can view all orders"     on public.orders;
drop policy if exists "Admins can update all orders"   on public.orders;
drop policy if exists "Allow users to read own orders" on public.orders;
drop policy if exists "Users can view own orders"      on public.orders;

-- Duplicate INSERT policies: anyone_can_insert_orders (with_check: true,
-- no guest/user_id distinction at all) vs create_order (20260806b,
-- with_check: auth.uid() = user_id OR user_id IS NULL -- deliberately
-- written to fix a real guest-checkout outage, and already the policy
-- the checkout code relies on). anyone_can_insert_orders is broader
-- with no upside: it would let a LOGGED IN user insert an order under
-- another user's user_id, which create_order correctly forbids.
drop policy if exists "anyone_can_insert_orders" on public.orders;

-- ============================================================
-- 3. order_items: collapse duplicate SELECT/INSERT policies
-- ============================================================
-- own_order_items_read (20260908_security_enable_missing_rls.sql) is the
-- most complete of the three SELECT variants: same auth.uid() = user_id
-- check as the other two, PLUS a guest-order-by-email fallback that
-- "Users can view own order items" and "own_order_items" both lack. Its
-- comment already establishes it as the intended replacement. Also
-- keeping staff_manage_order_items (is_admin() OR is_marketing(), ALL) --
-- admin_manage_order_items and marketing_manage_order_items are the
-- same two checks split across two policies instead of one; redundant
-- but not wrong, left alone since collapsing them saves nothing.
drop policy if exists "Users can view own order items" on public.order_items;
drop policy if exists "own_order_items"                on public.order_items;

-- Duplicate INSERT: anyone_can_insert_order_items vs insert_order_items,
-- both with_check: true, both unconditional -- true duplicates, not a
-- security question (order_items has no natural per-row scoping at
-- insert time; the server/checkout code sets order_id itself right
-- after creating the order). Keep one.
drop policy if exists "anyone_can_insert_order_items" on public.order_items;

-- ============================================================
-- Verify
-- ============================================================
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('orders','order_items','order_referrals')
--   order by tablename, policyname;
--   -- orders:          admin_manage_orders, create_order,
--   --                  marketing_manage_orders, own_orders_read,
--   --                  service_role_all, affiliate_read_referred_orders
--   -- order_items:     admin_manage_order_items, insert_order_items,
--   --                  marketing_manage_order_items,
--   --                  own_order_items_read, staff_manage_order_items
--   -- order_referrals: "Admins manage order referrals",
--   --                  affiliate_read_own_referrals,
--   --                  checkout_insert_order_referrals,
--   --                  marketing_manage_order_referrals
--
-- Functional checks after applying, all against the LIVE site (not the
-- SQL editor, which runs as superuser and bypasses RLS/GRANT entirely):
--   1. Guest checkout (logged out, no account) with Invoice Me/PO still
--      creates the order -- create_order's guest branch is untouched.
--   2. Guest checkout THROUGH an affiliate subdomain still creates the
--      order_referrals row -- checkout_insert_order_referrals's two
--      EXISTS checks both pass for a real order + a real active
--      affiliate.
--   3. A logged-in customer's Account > Orders page still lists their
--      own orders and each order's items.
--   4. Trust Mark / On Time's My Dashboard still lists their referred
--      orders (this is the exact page 20260916d fixed -- confirms this
--      cleanup didn't reintroduce the recursion or remove something
--      affiliate_read_referred_orders still needs).
--   5. As staff (admin/marketing), the Orders tab and Affiliates tab
--      still show everything company-wide.
