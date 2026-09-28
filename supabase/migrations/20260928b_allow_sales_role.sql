-- profiles_role_check (last widened in 20260828f_owner_admin_role_split.sql)
-- didn't know about 'sales' yet -- creating a sales rep login failed with
-- "new row for relation profiles violates check constraint
-- profiles_role_check" the first time it was tried from the new Sales
-- Team admin tab. Same fix pattern as 20260828b_allow_marketing_role.sql:
-- drop and recreate the constraint with 'sales' added to the allow-list.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer','owner','admin','developer','sub_distributor','marketing','sales'));
