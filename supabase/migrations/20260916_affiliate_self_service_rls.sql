-- Lets a logged-in affiliate (sub_distributor role) see their OWN
-- commissions, referral code, and the orders attributed to them -- the
-- payout dashboard 20260910a_sub_distributors_add_user_id.sql laid the
-- groundwork for but never granted RLS access for.
--
-- Three tables need a scoped self-read policy, because a partner
-- dashboard querying order_referrals with a nested orders(...) join hits
-- RLS on all three independently:
--
--   sub_distributors  -- currently staff-only (20260908_security_enable_
--                         missing_rls.sql). An affiliate could not read
--                         even their own row: no name, no referral code,
--                         no commission_pct.
--   order_referrals   -- currently staff-only (marketing_manage_order_
--                         referrals). No policy let an affiliate see
--                         which orders are theirs.
--   orders            -- currently staff-only. Even with order_referrals
--                         opened, a nested orders(total, created_at) join
--                         would return null for every row an affiliate
--                         cannot independently read.
--
-- Same linkage RLS already trusts for order_returns visibility
-- (20260910b_order_returns.sql): sub_distributors.user_id = auth.uid(),
-- joined through order_referrals.sub_distributor_id. An affiliate sees
-- only orders referred through their own sub_distributor row and cannot
-- see another affiliate's data through it.
--
-- All three policies are SELECT-only. An affiliate reports a return
-- through order_returns (already scoped), but has no path here to edit
-- their own commission_pct, referral_code, or any order -- those stay
-- staff judgment calls.

-- ============================================================
-- sub_distributors: read own row only
-- ============================================================
drop policy if exists "affiliate_read_own_row" on public.sub_distributors;
create policy "affiliate_read_own_row" on public.sub_distributors
  for select
  using (user_id = auth.uid());

-- ============================================================
-- order_referrals: read rows attributed to your own sub_distributor row
-- ============================================================
drop policy if exists "affiliate_read_own_referrals" on public.order_referrals;
create policy "affiliate_read_own_referrals" on public.order_referrals
  for select
  using (
    exists (
      select 1 from public.sub_distributors sd
      where sd.id = order_referrals.sub_distributor_id
        and sd.user_id = auth.uid()
    )
  );

-- ============================================================
-- orders: read only the orders referred through your own sub_distributor
-- row (never every order -- that stays staff-only)
-- ============================================================
drop policy if exists "affiliate_read_referred_orders" on public.orders;
create policy "affiliate_read_referred_orders" on public.orders
  for select
  using (
    exists (
      select 1
      from public.order_referrals r
      join public.sub_distributors sd on sd.id = r.sub_distributor_id
      where r.order_id = orders.id
        and sd.user_id = auth.uid()
    )
  );

-- Verify (as a real affiliate login, not the SQL editor's superuser --
-- these policies only apply to authenticated non-superuser roles):
--   select * from public.sub_distributors;              -- exactly 1 row, your own
--   select * from public.order_referrals;                -- only your referrals
--   select id, order_number, total from public.orders;   -- only your referred orders
