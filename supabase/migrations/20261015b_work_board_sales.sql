-- Work Board: Sales department, per CEO instruction.
--
--   - New department 'sales' on the Work Board.
--   - Sales closers ('sales') and the Head of Sales Ops ('sales_manager')
--     see only the tickets assigned to them, and may only change their
--     status and comment on them. They can't create work, pick up other
--     tickets, or edit a ticket's details.
--   - Owner, Head of Operations and Developer hand out Sales tickets.
--     (Developer dispatches Sales work only; other teams' work stays with
--     Owner / Head of Ops, as in 20261015_work_board_departments.sql.)
--
-- The sales reps' existing "Report an Issue" tab keeps working: what they
-- file there is still an unassigned Web Dev ticket they can read.
--
-- Run in the Supabase SQL editor after 20261015_work_board_departments.sql.
-- Safe to re-run.

-- ============================================================
-- 1. ROLES / DEPARTMENT
-- ============================================================

create or replace function public.is_sales_rep()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select role in ('sales','sales_manager') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.work_department_for_role(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'developer'     then 'web_dev'
    when 'marketing'     then 'marketing'
    when 'supply_chain'  then 'supply_chain'
    when 'operations'    then 'operations'
    when 'sales'         then 'sales'
    when 'sales_manager' then 'sales'
    else null
  end
$$;

alter table public.dev_tickets drop constraint if exists dev_tickets_department_check;
alter table public.dev_tickets add constraint dev_tickets_department_check
  check (department in ('web_dev','marketing','supply_chain','operations','sales'));

-- ============================================================
-- 2. WHO MAY CHANGE WHAT
-- ============================================================
-- Same rules as 20261015, plus:
--   - Developer is a dispatcher for Sales tickets (create, assign, move).
--   - Sales roles: status only, and only on tickets assigned to them.
--     Anything they insert ("Report an Issue") is forced to an unassigned
--     Web Dev ticket.

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
  -- Assignee must be a real team member; email always comes from profiles.
  -- Only checked when the assignee changes, so an old ticket whose assignee
  -- later left the team can still be edited.
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

  -- SQL editor / service role (no signed-in user) are trusted.
  if v_uid is null then return new; end if;

  v_role     := public.my_role();
  v_dept     := public.work_department_for_role(v_role);
  v_sales    := v_role in ('sales','sales_manager');
  v_dispatch := v_role in ('owner','operations')
             or (v_role = 'developer' and new.department = 'sales'
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

  -- UPDATE
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
-- 3. ROW LEVEL SECURITY: sales see and update only their assigned tickets
-- ============================================================
-- Added beside the existing reporter-only sales policies (20260928,
-- 20260929), which keep covering their "Report an Issue" tickets.

drop policy if exists "sales_read_assigned_tickets"   on public.dev_tickets;
drop policy if exists "sales_update_assigned_tickets" on public.dev_tickets;
create policy "sales_read_assigned_tickets" on public.dev_tickets
  for select using (public.is_sales_rep() and assignee_id = auth.uid());
create policy "sales_update_assigned_tickets" on public.dev_tickets
  for update using (public.is_sales_rep() and assignee_id = auth.uid())
  with check (public.is_sales_rep() and assignee_id = auth.uid());

drop policy if exists "sales_read_assigned_ticket_comments"   on public.dev_ticket_comments;
drop policy if exists "sales_insert_assigned_ticket_comments" on public.dev_ticket_comments;
drop policy if exists "sales_update_own_assigned_comments"    on public.dev_ticket_comments;
drop policy if exists "sales_delete_own_assigned_comments"    on public.dev_ticket_comments;
create policy "sales_read_assigned_ticket_comments" on public.dev_ticket_comments
  for select using (public.is_sales_rep() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.assignee_id = auth.uid()));
create policy "sales_insert_assigned_ticket_comments" on public.dev_ticket_comments
  for insert with check (public.is_sales_rep() and author_id = auth.uid() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.assignee_id = auth.uid()));
create policy "sales_update_own_assigned_comments" on public.dev_ticket_comments
  for update using (public.is_sales_rep() and author_id = auth.uid() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.assignee_id = auth.uid()))
  with check (public.is_sales_rep() and author_id = auth.uid());
create policy "sales_delete_own_assigned_comments" on public.dev_ticket_comments
  for delete using (public.is_sales_rep() and author_id = auth.uid() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_comments.ticket_id and t.assignee_id = auth.uid()));

drop policy if exists "sales_read_assigned_ticket_events" on public.dev_ticket_events;
create policy "sales_read_assigned_ticket_events" on public.dev_ticket_events
  for select using (public.is_sales_rep() and exists (
    select 1 from public.dev_tickets t where t.id = dev_ticket_events.ticket_id and t.assignee_id = auth.uid()));

-- Screenshots/files on their assigned tickets (uploaded by whoever filed
-- them). Their own uploads already go to sales/<uid>/ (20260928c, 20260929).
drop policy if exists "sales_read_assigned_ticket_files" on storage.objects;
create policy "sales_read_assigned_ticket_files" on storage.objects
  for select using (
    bucket_id = 'dev-note-screenshots'
    and public.is_sales_rep()
    and (
      exists (select 1 from public.dev_tickets t
               where t.assignee_id = auth.uid()
                 and (t.screenshot_url = objects.name or t.attachment_url = objects.name))
      or exists (select 1 from public.dev_ticket_comments c
                   join public.dev_tickets t on t.id = c.ticket_id
                  where t.assignee_id = auth.uid() and c.screenshot_url = objects.name)
    )
  );

-- ============================================================
-- 4. TEAM DIRECTORY: include sales, and let sales read it
-- ============================================================

create or replace function public.work_team_members()
returns table (id uuid, email text, full_name text, role text, department text)
language sql security definer stable set search_path = public as $$
  select p.id, p.email,
         coalesce(nullif(p.full_name,''), nullif(p.contact_name,''), p.email),
         p.role, public.work_department_for_role(p.role)
    from public.profiles p
   where (public.is_staff() or public.is_sales_rep())
     and p.role in ('owner','operations','developer','marketing','supply_chain','admin','sales','sales_manager')
   order by 3
$$;

-- Verify:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'dev_tickets_department_check';
--   select policyname from pg_policies where policyname like 'sales_%assigned%';
