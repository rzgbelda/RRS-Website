-- The live database has a profiles.role check constraint that was never
-- captured in a tracked migration (not in schema.sql either) -- discovered
-- live when creating the first marketing account failed with
-- "violates check constraint profiles_role_check". Recreated here with
-- 'marketing' added, keeping every other role already in real use
-- (customer/admin/developer/sub_distributor) exactly as they were.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer','admin','developer','sub_distributor','marketing'));
