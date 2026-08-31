-- Per direct CEO instruction: Owner, the narrow Admin role, and Marketing
-- can all file/view/comment on dev tickets now -- but only a Developer
-- decides who's working one and whether it's done. Two parts:
--
-- 1. Marketing gets into is_staff() (dev_tickets/dev_ticket_comments/the
--    dev-note-screenshots bucket already gate on this one function --
--    see 20260828f_owner_admin_role_split.sql's own comment on it), so
--    Marketing can actually reach the board and file a ticket at all.
--
-- 2. A real server-side guard on status/assignee changes -- the admin.js
--    UI already disables those controls for anyone but a developer, but
--    the board's drag-and-drop ALSO changes status, and RLS's is_staff()
--    check alone can't restrict individual columns. Same pattern as
--    guard_profile_role_change (20260814_dev_tickets.sql): a trigger is
--    what actually stops a bypass, the disabled dropdown is just the UX.

create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select public.is_admin() or public.is_developer() or public.is_account_admin()
    or coalesce((select role = 'marketing' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.guard_dev_ticket_triage_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status is distinct from old.status
      or new.assignee_id is distinct from old.assignee_id
      or new.assignee_email is distinct from old.assignee_email)
     and not public.is_developer() then
    raise exception 'Only a developer may change a ticket''s status or assignee.';
  end if;
  return new;
end $$;

drop trigger if exists guard_dev_ticket_triage_fields on public.dev_tickets;
create trigger guard_dev_ticket_triage_fields
  before update on public.dev_tickets
  for each row execute function public.guard_dev_ticket_triage_fields();
