-- Owner / Admin role split, per direct CEO instruction: "Admin role should
-- have Users, dev ticket, Hero Section, About Section, only. Only Owner
-- Role should have all of the functions in the backend."
--
-- Until now, role='admin' WAS the unrestricted full-access role -- it's
-- referenced by public.is_admin() across ~25 RLS policies throughout the
-- app (products, orders, inventory, best_deals, sub_distributors,
-- quote_requests via is_crm_staff, dev_tickets via is_staff, etc). Renaming
-- what "admin" means at the role-VALUE level, but keeping every policy
-- pointed at the same FUNCTION NAME (is_admin()), means changing the body
-- of ONE function correctly re-points every one of those ~25 policies at
-- once -- no policy text anywhere else needs to change.
--
-- New role: 'owner' = what 'admin' used to mean (full, unrestricted access).
-- 'admin' is repurposed to mean the narrow Users/Dev-Tickets/Hero/About
-- account-management portal described above.

-- Promote every existing admin account to 'owner' FIRST, before is_admin()'s
-- meaning changes -- so nobody's current access silently disappears
-- mid-migration.
update public.profiles set role = 'owner' where role = 'admin';

create or replace function public.is_owner()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'owner' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Re-pointed to 'owner' -- every existing "admin_manage_X" / is_admin()
-- policy across the app now means "owner can do this", automatically,
-- with no other SQL changes needed anywhere else.
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select public.is_owner()
$$;

-- The new narrow role.
create or replace function public.is_account_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Dev Tickets stays one of the narrow Admin role's 4 retained areas, so it
-- needs to be added to is_staff() (used by dev_tickets/dev_ticket_comments/
-- the dev-note-screenshots storage bucket) alongside is_admin()/is_developer().
create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select public.is_admin() or public.is_developer() or public.is_account_admin()
$$;

-- guard_profile_role_change (20260814_dev_tickets.sql) blocks a role change
-- unless the caller is an admin -- needs is_account_admin() added too, since
-- "Manage user roles and permissions" is explicitly one of the narrow
-- Admin role's jobs now. Self-promotion (new.id = auth.uid()) stays blocked
-- either way.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if not (public.is_admin() or public.is_account_admin()) or new.id = auth.uid() then
      raise exception 'Only an administrator may change an account role.';
    end if;
  end if;
  return new;
end $$;

-- profiles_role_check (added 20260828b) needs 'owner' added.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer','owner','admin','developer','sub_distributor','marketing'));

-- The Users tab (admin.js renderUsersTable) is the narrow Admin role's job
-- now -- it needs its own grant on profiles, since is_admin() no longer
-- covers the literal 'admin' role value.
drop policy if exists "account_admin_manage_profiles" on public.profiles;
create policy "account_admin_manage_profiles" on public.profiles
  for all using (public.is_account_admin()) with check (public.is_account_admin());

-- Same reasoning for businesses (RRS-19) -- the Users tab joins it to show
-- one row per business. admin_read_all_businesses (20260827) already
-- re-points to 'owner' automatically via is_admin() above; this adds the
-- narrow Admin role's own access, plus fills a real gap while here: no role
-- had DELETE on businesses before now (removeBusinessRow() in admin.js was
-- silently failing this same way "Remove" on Users was -- see the separate
-- fix in api/create-dev-user.js for that).
drop policy if exists "account_admin_manage_businesses" on public.businesses;
create policy "account_admin_manage_businesses" on public.businesses
  for all using (public.is_account_admin()) with check (public.is_account_admin());

drop policy if exists "owner_manage_all_businesses" on public.businesses;
create policy "owner_manage_all_businesses" on public.businesses
  for all using (public.is_admin()) with check (public.is_admin());
