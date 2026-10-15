-- Work Board: the Head of Sales ('sales_manager') leads the Sales team.
--
-- 20261015b treated the Head of Sales like a sales closer (assigned tickets,
-- status only). Correction from the CEO's side: the closers report to the
-- Head of Sales, so the Head of Sales:
--   - sees every Sales ticket,
--   - creates Sales tickets and assigns them to the closers,
--   - can change anything on a Sales ticket, like Owner / Head of Ops /
--     Developer already can.
-- Owner, Head of Operations and Developer keep handing out Sales work too.
-- Sales closers ('sales') are unchanged: only tickets assigned to them,
-- status and comments only.
--
-- Run after 20261015b_work_board_sales.sql. Safe to re-run.

create or replace function public.is_sales_lead()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select role = 'sales_manager' from public.profiles where id = auth.uid()), false)
$$;

-- ============================================================
-- 1. WHO MAY CHANGE WHAT: Head of Sales dispatches Sales tickets
-- ============================================================
-- Same function as 20261015b; the only change is v_dispatch, which now
-- also covers sales_manager on Sales tickets. On any other team's ticket
-- assigned to them, the Head of Sales falls through to the sales branch
-- (status and comments only).

create or replace function public.guard_work_ticket_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_dept     text;
  v_dispatch boolean;
  v_sales    boolean;
  v_mine     boolean;
begin
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    new.assignee_email := old.assignee_email;
  elsif new.assignee_id is not null then
    select p.email into new.assignee_email
      from public.profiles p
     where p.id = new.assignee_id
       and p.role in ('owner','operations','developer','marketing','supply_chain','admin','sales','sales_manager');
    if not found then
      raise exception 'That person is not on the team and cannot be assigned work.';
    end if;
  else
    new.assignee_email := null;
  end if;

  if v_uid is null then return new; end if;

  v_role     := public.my_role();
  v_dept     := public.work_department_for_role(v_role);
  v_sales    := v_role in ('sales','sales_manager');
  v_dispatch := v_role in ('owner','operations')
             or (v_role in ('developer','sales_manager') and new.department = 'sales'
                 and (tg_op = 'INSERT' or old.department = 'sales'));

  if tg_op = 'INSERT' then
    new.reporter_id    := v_uid;
    new.reporter_email := (select email from public.profiles where id = v_uid);
    if v_dispatch then return new; end if;
    if v_sales then
      new.department     := 'web_dev';
      new.assignee_id    := null;
      new.assignee_email := null;
      return new;
    end if;
    if new.assignee_id is not null
       and not (new.assignee_id = v_uid and new.department = v_dept) then
      raise exception 'Only the Owner or Head of Operations can assign work to someone else.';
    end if;
    return new;
  end if;

  new.reporter_id    := old.reporter_id;
  new.reporter_email := old.reporter_email;
  if v_dispatch then return new; end if;

  if v_sales then
    if old.assignee_id is distinct from v_uid then
      raise exception 'You can only update tickets assigned to you.';
    end if;
    if new.department      is distinct from old.department
    or new.assignee_id     is distinct from old.assignee_id
    or new.title           is distinct from old.title
    or new.description     is distinct from old.description
    or new.priority        is distinct from old.priority
    or new.due_date        is distinct from old.due_date
    or new.ticket_type     is distinct from old.ticket_type
    or new.page_url        is distinct from old.page_url
    or new.screenshot_url  is distinct from old.screenshot_url
    or new.attachment_url  is distinct from old.attachment_url
    or new.attachment_name is distinct from old.attachment_name then
      raise exception 'Sales accounts can only change the status of tickets assigned to them.';
    end if;
    return new;
  end if;

  if new.department is distinct from old.department then
    raise exception 'Only the Owner or Head of Operations can move a ticket to another department.';
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    if not (
         (old.assignee_id is null and new.assignee_id = v_uid and old.department = v_dept)
      or (old.assignee_id = v_uid and new.assignee_id is null)
    ) then
      raise exception 'Only the Owner or Head of Operations can reassign this ticket.';
    end if;
  end if;

  v_mine := old.department = v_dept or old.assignee_id = v_uid;

  if new.status is distinct from old.status and not v_mine then
    raise exception 'Only the assigned person or their team can change this ticket''s status.';
  end if;

  if (new.title       is distinct from old.title
   or new.description is distinct from old.description
   or new.priority    is distinct from old.priority
   or new.due_date    is distinct from old.due_date
   or new.ticket_type is distinct from old.ticket_type
   or new.page_url    is distinct from old.page_url)
     and not (v_mine or old.reporter_id = v_uid) then
    raise exception 'You can only edit tickets you filed, or that belong to your team.';
  end if;

  return new;
end $$;

-- ============================================================
-- 2. ROW LEVEL SECURITY: Head of Sales sees and works every Sales ticket
-- ============================================================
-- Added beside the "assigned to me" sales policies from 20261015b and the
-- reporter-only ones from 20260929; RLS policies OR together. Inserts
-- already pass "sales_manager_create_own_tickets" (reporter = me, which
-- the guard sets).

drop policy if exists "sales_lead_read_sales_tickets"   on public.dev_tickets;
drop policy if exists "sales_lead_update_sales_tickets" on public.dev_tickets;
create policy "sales_lead_read_sales_tickets" on public.dev_tickets
  for select using (public.is_sales_lead() and department = 'sales');
create policy "sales_lead_update_sales_tickets" on public.dev_tickets
  for update using (public.is_sales_lead() and department = 'sales')
  with check (public.is_sales_lead() and department = 'sales');

drop policy if exists "sales_lead_read_sales_comments"   on public.dev_ticket_comments;
drop policy if exists "sales_lead_insert_sales_comments" on public.dev_ticket_comments;
drop policy if exists "sales_lead_update_own_comments"   on public.dev_ticket_comments;
drop policy if exists "sales_lead_delete_own_comments"   on public.dev_ticket_comments;
create policy "sales_lead_read_sales_comments" on public.dev_ticket_comments
  for select using (public.is_sales_lead() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.department = 'sales'));
create policy "sales_lead_insert_sales_comments" on public.dev_ticket_comments
  for insert with check (public.is_sales_lead() and author_id = auth.uid() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.department = 'sales'));
create policy "sales_lead_update_own_comments" on public.dev_ticket_comments
  for update using (public.is_sales_lead() and author_id = auth.uid() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.department = 'sales'))
  with check (public.is_sales_lead() and author_id = auth.uid());
create policy "sales_lead_delete_own_comments" on public.dev_ticket_comments
  for delete using (public.is_sales_lead() and author_id = auth.uid() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.department = 'sales'));

drop policy if exists "sales_lead_read_sales_events" on public.dev_ticket_events;
create policy "sales_lead_read_sales_events" on public.dev_ticket_events
  for select using (public.is_sales_lead() and department = 'sales');

drop policy if exists "sales_lead_read_sales_files" on storage.objects;
create policy "sales_lead_read_sales_files" on storage.objects
  for select using (
    bucket_id = 'dev-note-screenshots'
    and public.is_sales_lead()
    and (
      exists (select 1 from public.dev_tickets t
               where t.department = 'sales'
                 and (t.screenshot_url = objects.name or t.attachment_url = objects.name))
      or exists (select 1 from public.dev_ticket_comments c
                   join public.dev_tickets t on t.id = c.ticket_id
                  where t.department = 'sales' and c.screenshot_url = objects.name)
    )
  );

-- Verify:
--   select policyname from pg_policies where policyname like 'sales_lead_%';
