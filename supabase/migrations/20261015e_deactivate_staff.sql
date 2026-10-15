-- Deactivating staff accounts (Owner and Developer, via api/create-dev-user.js
-- action 'set_staff_active'). The API bans the login and stamps this column;
-- the account, tasks, comments and report history are all kept.
--
-- A deactivated person must not appear in assignee pickers or on the CEO's
-- daily Team Report, so work_team_members() skips them. Their past work still
-- shows by name on tickets (ticket text carries the name/email already).
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.profiles add column if not exists deactivated_at timestamptz;

create or replace function public.work_team_members()
returns table (id uuid, email text, full_name text, role text, department text)
language sql security definer stable set search_path = public as $$
  select p.id, p.email,
         coalesce(nullif(p.full_name,''), nullif(p.contact_name,''), p.email),
         p.role, public.work_department_for_role(p.role)
    from public.profiles p
   where (public.is_staff() or public.is_sales_rep())
     and p.deactivated_at is null
     and p.role in ('owner','operations','developer','marketing','supply_chain','admin','sales','sales_manager')
   order by 3
$$;
