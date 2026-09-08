-- SECURITY FIX: two tables were world-readable via the public anon key.
--
-- Found by probing the live REST API with nothing but the publishable key
-- that ships in every page of the site -- i.e. exactly what any visitor
-- can do from their browser console:
--
--   * order_items      -- 43 rows exposed: every line item of every order
--                         (product, quantity, negotiated price_per_case).
--   * sub_distributors -- affiliate PII exposed: business name, contact
--                         person, email, phone, commission_pct, referral
--                         code, and internal notes.
--
-- Root cause: neither table was created by a tracked migration (both were
-- made directly in the dashboard), so neither ever got
-- `enable row level security`. 20260828d_marketing_full_module_access.sql
-- DID add policies to both -- but a policy on a table without RLS enabled
-- is inert: Postgres never consults it, and the table stays fully open.
-- That's why this looked correct in the migration history while being wide
-- open in production.
--
-- Note on not breaking the customer account page: account.html reads items
-- nested through orders (`.select("*, order_items(*)")`). orders already
-- has correct RLS, and PostgREST applies RLS to embedded resources, so a
-- customer's own items keep resolving through that join. Verified against
-- the live API before writing this: the nested read already returns [] for
-- an anonymous caller while the direct read leaked -- confirming the parent
-- is doing the filtering and this migration only closes the direct path.

-- ---------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------
alter table public.order_items enable row level security;

-- Staff access (mirrors the marketing policy already on record in
-- 20260828d, re-declared here so it survives independently of it).
drop policy if exists "staff_manage_order_items" on public.order_items;
create policy "staff_manage_order_items" on public.order_items
  for all
  using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- A customer may read the line items belonging to an order that is theirs.
-- Scoped by the same ownership test the account page uses on orders:
-- either the order is linked to their auth user, or it was a guest order
-- placed with their email address.
drop policy if exists "own_order_items_read" on public.order_items;
create policy "own_order_items_read" on public.order_items
  for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (
          o.user_id = auth.uid()
          or (
            auth.jwt() ->> 'email' is not null
            and o.customer_email = auth.jwt() ->> 'email'
          )
        )
    )
  );

-- The serverless checkout/webhook functions write items with the service
-- role, which bypasses RLS entirely -- no insert policy needed for them.

-- ---------------------------------------------------------------------
-- sub_distributors
-- ---------------------------------------------------------------------
alter table public.sub_distributors enable row level security;

-- Affiliate records are internal business data: staff only, no public read.
drop policy if exists "staff_manage_sub_distributors" on public.sub_distributors;
create policy "staff_manage_sub_distributors" on public.sub_distributors
  for all
  using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- ---------------------------------------------------------------------
-- sub_distributor_employees -- same origin as the two above (dashboard
-- created, policy added in 20260828d with no RLS enable). Guarded because
-- unlike the other two its existence isn't confirmed in this database.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sub_distributor_employees') is not null then
    execute 'alter table public.sub_distributor_employees enable row level security';
    execute 'drop policy if exists "staff_manage_sd_employees" on public.sub_distributor_employees';
    execute 'create policy "staff_manage_sd_employees" on public.sub_distributor_employees
      for all using (public.is_admin() or public.is_marketing())
      with check (public.is_admin() or public.is_marketing())';
  end if;
end $$;
