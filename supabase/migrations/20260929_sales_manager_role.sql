-- Adds the 'sales_manager' role (Head of Sales Operations).
-- Same portal as 'sales' but with broader read access:
--   · All sales_reps rows (not just own)
--   · All sales_referrals rows (team-wide commissions)
--   · All sales_payouts rows (team-wide payout history)
--   · All referred orders (via sales_referrals join)
-- Also inherits the same dev-ticket create/read-own rights as sales reps.

-- 1. Widen the role allow-list
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'customer','owner','admin','developer',
    'sub_distributor','marketing','sales','sales_manager'
  ));

-- 2. sales_reps: manager can read all rows (staff already can via is_admin)
drop policy if exists "sales_manager_read_all_reps" on public.sales_reps;
create policy "sales_manager_read_all_reps" on public.sales_reps
  for select
  using (
    coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false)
  );

-- 3. sales_referrals: manager can read all rows
drop policy if exists "sales_manager_read_all_referrals" on public.sales_referrals;
create policy "sales_manager_read_all_referrals" on public.sales_referrals
  for select
  using (
    coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false)
  );

-- 4. sales_payouts: manager can read all rows
drop policy if exists "sales_manager_read_all_payouts" on public.sales_payouts;
create policy "sales_manager_read_all_payouts" on public.sales_payouts
  for select
  using (
    coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false)
  );

-- 5. orders: manager can read any order that has a sales_referral row
drop policy if exists "sales_manager_read_referred_orders" on public.orders;
create policy "sales_manager_read_referred_orders" on public.orders
  for select
  using (
    exists (
      select 1 from public.sales_referrals r where r.order_id = orders.id
    )
    and coalesce(
      (select role = 'sales_manager' from public.profiles where id = auth.uid()),
      false
    )
  );

-- 6. dev_tickets: same create + read-own rights as sales reps
drop policy if exists "sales_manager_create_own_tickets"    on public.dev_tickets;
drop policy if exists "sales_manager_read_own_tickets"      on public.dev_tickets;
drop policy if exists "sales_manager_manage_own_ticket_comments" on public.dev_ticket_comments;

create policy "sales_manager_create_own_tickets" on public.dev_tickets
  for insert with check (
    coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false)
    and reporter_id = auth.uid()
  );

create policy "sales_manager_read_own_tickets" on public.dev_tickets
  for select using (
    coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false)
    and reporter_id = auth.uid()
  );

create policy "sales_manager_manage_own_ticket_comments" on public.dev_ticket_comments
  for all
  using      (coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false) and author_id = auth.uid())
  with check (coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false) and author_id = auth.uid());

-- 7. Storage: same screenshot upload/read as sales reps, scoped to sales_manager/<uid>/
drop policy if exists "sales_manager_upload_own_screenshots" on storage.objects;
drop policy if exists "sales_manager_read_own_screenshots"   on storage.objects;

create policy "sales_manager_upload_own_screenshots"
  on storage.objects for insert
  with check (
    bucket_id = 'dev-note-screenshots'
    and coalesce(
      (select role = 'sales_manager' from public.profiles where id = auth.uid()),
      false
    )
    and (storage.foldername(name))[1] = 'sales'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "sales_manager_read_own_screenshots"
  on storage.objects for select
  using (
    bucket_id = 'dev-note-screenshots'
    and coalesce(
      (select role = 'sales_manager' from public.profiles where id = auth.uid()),
      false
    )
    and (storage.foldername(name))[1] = 'sales'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
