-- Work Board: the Developer Tickets board becomes the company-wide task
-- board for every department, per CEO instruction:
--
--   1. The CEO (role 'owner') can see every task and what each person got
--      done on a given day.
--   2. Only Owner and the Head of Operations hand work out to a department
--      (Web Dev, Marketing, Supply Chain, Operations).
--   3. Everyone on the team can see every department's board, but only the
--      assigned person or their department can move a ticket's status.
--
-- dev_tickets is extended in place rather than replaced, so RRS-1.. history,
-- the sales reps' "Report an Issue" tab, the notification bell and
-- api/notify-ticket.js keep working against the same table. Existing tickets
-- default to department 'web_dev', which is what they all were.
--
-- New roles:
--   'operations'   = Head of Operations. Same data access as Marketing (via
--                    is_marketing(), below) plus dispatching work.
--   'supply_chain' = Supply Chain Manager. Work Board plus products,
--                    inventory, orders, vendors and order exceptions.
--
-- Run in the Supabase SQL editor. Safe to re-run.

-- ============================================================
-- 1. ROLES
-- ============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'customer','owner','admin','developer',
    'sub_distributor','marketing','sales','sales_manager',
    'operations','supply_chain'
  ));

create or replace function public.my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_operations()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select role = 'operations' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_supply_chain()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select role = 'supply_chain' from public.profiles where id = auth.uid()), false)
$$;

-- Head of Operations gets exactly Marketing's data access. ~75 policies
-- (CRM, campaigns, products, orders, best deals, affiliates, content...)
-- call is_marketing(), and is_crm_staff() is built on it, so widening this
-- one function grants all of them at once -- the same single-source trick
-- 20260828f used for is_admin().
create or replace function public.is_marketing()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role in ('marketing','operations') from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Everyone who works the board. Only the ticket tables and the
-- dev-note-screenshots bucket use this (20260814_dev_tickets.sql).
create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    (select role in ('owner','admin','developer','marketing','operations','supply_chain')
       from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Owner and Head of Operations hand out work.
create or replace function public.can_dispatch_work()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select role in ('owner','operations') from public.profiles where id = auth.uid()), false)
$$;

-- Which department a role belongs to. owner/admin belong to none.
create or replace function public.work_department_for_role(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'developer'    then 'web_dev'
    when 'marketing'    then 'marketing'
    when 'supply_chain' then 'supply_chain'
    when 'operations'   then 'operations'
    else null
  end
$$;

-- ============================================================
-- 2. TICKET COLUMNS
-- ============================================================

alter table public.dev_tickets add column if not exists department text not null default 'web_dev';
alter table public.dev_tickets add column if not exists due_date   date;
alter table public.dev_tickets add column if not exists started_at timestamptz;

alter table public.dev_tickets drop constraint if exists dev_tickets_department_check;
alter table public.dev_tickets add constraint dev_tickets_department_check
  check (department in ('web_dev','marketing','supply_chain','operations'));

-- bug/error/idea are web-dev words; other teams file plain tasks and requests.
alter table public.dev_tickets drop constraint if exists dev_tickets_ticket_type_check;
alter table public.dev_tickets add constraint dev_tickets_ticket_type_check
  check (ticket_type in ('task','request','bug','error','idea'));

-- "Enhancement" was a priority, which non-technical staff read as a type.
-- Priority is now a plain Low/Medium/High/Critical scale. Existing
-- enhancement-priority tickets become Low. Triggers are paused so this
-- doesn't bump every row's updated_at or trip the triage guard (this
-- session has no auth.uid()).
alter table public.dev_tickets drop constraint if exists dev_tickets_priority_check;
alter table public.dev_tickets disable trigger user;
update public.dev_tickets set priority = 'low' where priority = 'enhancement';
update public.dev_tickets set started_at = coalesce(resolved_at, updated_at)
  where started_at is null and status <> 'open';
alter table public.dev_tickets enable trigger user;
alter table public.dev_tickets add constraint dev_tickets_priority_check
  check (priority in ('critical','high','medium','low'));

alter table public.dev_tickets alter column ticket_type set default 'task';

create index if not exists dev_tickets_department_idx on public.dev_tickets(department, status);
create index if not exists dev_tickets_due_idx        on public.dev_tickets(due_date) where due_date is not null;

-- Stamp started_at the first time a ticket goes In Progress (kept on the
-- existing before-write trigger so there is one place that owns timestamps).
create or replace function public.dev_ticket_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.ticket_number is null then
    new.ticket_number := 'RRS-' || nextval('public.dev_ticket_seq');
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('in_progress','done') then new.started_at := coalesce(new.started_at, now()); end if;
    if new.status in ('done','not_possible') then new.resolved_at := coalesce(new.resolved_at, now()); end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status in ('done','not_possible') and old.status not in ('done','not_possible') then
      new.resolved_at := now();
    elsif new.status not in ('done','not_possible') then
      new.resolved_at := null;
    end if;
    if new.status in ('in_progress','done') and new.started_at is null then
      new.started_at := now();
    end if;
  end if;

  return new;
end $$;

-- ============================================================
-- 3. WHO MAY CHANGE WHAT (server-side; the UI only mirrors this)
-- ============================================================
-- Replaces guard_dev_ticket_triage_fields (20260901), which let only a
-- developer touch status/assignee -- that rule only made sense while every
-- ticket was a web-dev ticket.
--
--   Owner / Head of Operations: anything.
--   Everyone else:
--     - may file a ticket to any department; it can only be assigned to
--       themselves, and only inside their own department
--     - may pick up an unassigned ticket in their own department, or drop
--       one assigned to them
--     - may change status if it's their department or assigned to them
--     - may edit details if they filed it, it's assigned to them, or it's
--       their department
--     - may never move a ticket to another department
--
-- Also: assignee_email / reporter_email are always re-derived from
-- profiles. notify-ticket emails assignee_email, so it must never be
-- something the browser typed.

create or replace function public.guard_work_ticket_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_role     text;
  v_dept     text;
  v_dispatch boolean;
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
       and p.role in ('owner','operations','developer','marketing','supply_chain','admin');
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
  v_dispatch := v_role in ('owner','operations');

  if tg_op = 'INSERT' then
    new.reporter_id    := v_uid;
    new.reporter_email := (select email from public.profiles where id = v_uid);
    if v_dispatch then return new; end if;
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

drop trigger if exists guard_dev_ticket_triage_fields on public.dev_tickets;
drop trigger if exists guard_work_ticket_write on public.dev_tickets;
create trigger guard_work_ticket_write
  before insert or update on public.dev_tickets
  for each row execute function public.guard_work_ticket_write();
drop function if exists public.guard_dev_ticket_triage_fields();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
-- The single "for all" staff policy split by action so delete can be
-- narrower. Sales / sales_manager reporter-only policies are untouched.

drop policy if exists "staff_manage_dev_tickets" on public.dev_tickets;
drop policy if exists "staff_read_dev_tickets"   on public.dev_tickets;
drop policy if exists "staff_insert_dev_tickets" on public.dev_tickets;
drop policy if exists "staff_update_dev_tickets" on public.dev_tickets;
drop policy if exists "lead_delete_dev_tickets"  on public.dev_tickets;

create policy "staff_read_dev_tickets"   on public.dev_tickets for select using (public.is_staff());
create policy "staff_insert_dev_tickets" on public.dev_tickets for insert with check (public.is_staff());
create policy "staff_update_dev_tickets" on public.dev_tickets for update using (public.is_staff()) with check (public.is_staff());
create policy "lead_delete_dev_tickets"  on public.dev_tickets for delete
  using (public.my_role() in ('owner','operations','admin'));

-- Comments: anyone on the team reads and writes as themselves; only the
-- author (or a lead) edits or deletes.
drop policy if exists "staff_manage_dev_ticket_comments" on public.dev_ticket_comments;
drop policy if exists "staff_read_dev_ticket_comments"   on public.dev_ticket_comments;
drop policy if exists "staff_insert_dev_ticket_comments" on public.dev_ticket_comments;
drop policy if exists "author_update_dev_ticket_comments" on public.dev_ticket_comments;
drop policy if exists "author_delete_dev_ticket_comments" on public.dev_ticket_comments;

create policy "staff_read_dev_ticket_comments" on public.dev_ticket_comments
  for select using (public.is_staff());
create policy "staff_insert_dev_ticket_comments" on public.dev_ticket_comments
  for insert with check (public.is_staff() and author_id = auth.uid());
create policy "author_update_dev_ticket_comments" on public.dev_ticket_comments
  for update using (public.is_staff() and (author_id = auth.uid() or public.my_role() in ('owner','operations','admin')))
  with check (public.is_staff());
create policy "author_delete_dev_ticket_comments" on public.dev_ticket_comments
  for delete using (public.is_staff() and (author_id = auth.uid() or public.my_role() in ('owner','operations','admin')));

-- ============================================================
-- 5. ACTIVITY LOG (feeds the CEO's daily report)
-- ============================================================
-- Written only by triggers, so it can't be skipped or faked from the
-- browser. ticket_id is "set null" on delete and the number/title are
-- snapshotted, so finished work stays on the record even if the ticket is
-- later deleted.

create table if not exists public.dev_ticket_events (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  ticket_id      uuid references public.dev_tickets(id) on delete set null,
  ticket_number  text,
  ticket_title   text,
  department     text,
  actor_id       uuid,
  actor_email    text,
  actor_name     text,
  assignee_id    uuid,
  assignee_email text,
  event_type     text not null check (event_type in ('created','status','assigned','department','priority','due_date','comment')),
  from_value     text,
  to_value       text
);

create index if not exists dev_ticket_events_created_idx on public.dev_ticket_events(created_at desc);
create index if not exists dev_ticket_events_ticket_idx  on public.dev_ticket_events(ticket_id, created_at);

alter table public.dev_ticket_events enable row level security;
drop policy if exists "staff_read_dev_ticket_events" on public.dev_ticket_events;
create policy "staff_read_dev_ticket_events" on public.dev_ticket_events
  for select using (public.is_staff());

create or replace function public.dev_ticket_log_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
begin
  if v_uid is not null then
    select email, coalesce(nullif(full_name,''), nullif(contact_name,''), email)
      into v_email, v_name from public.profiles where id = v_uid;
  end if;

  if tg_op = 'INSERT' then
    insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, to_value)
    values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'created', new.status);
    if new.status <> 'open' then
      insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, from_value, to_value)
      values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'status', 'open', new.status);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, from_value, to_value)
    values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'status', old.status, new.status);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, from_value, to_value)
    values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'assigned', old.assignee_email, new.assignee_email);
  end if;
  if new.department is distinct from old.department then
    insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, from_value, to_value)
    values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'department', old.department, new.department);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, from_value, to_value)
    values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'priority', old.priority, new.priority);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, from_value, to_value)
    values (new.id, new.ticket_number, new.title, new.department, v_uid, v_email, v_name, new.assignee_id, new.assignee_email, 'due_date', old.due_date::text, new.due_date::text);
  end if;
  return new;
end $$;

drop trigger if exists dev_ticket_log_events on public.dev_tickets;
create trigger dev_ticket_log_events
  after insert or update on public.dev_tickets
  for each row execute function public.dev_ticket_log_events();

create or replace function public.dev_ticket_comment_log_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.dev_tickets%rowtype;
begin
  select * into t from public.dev_tickets where id = new.ticket_id;
  insert into public.dev_ticket_events (ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, actor_name, assignee_id, assignee_email, event_type, to_value)
  values (new.ticket_id, t.ticket_number, t.title, t.department, new.author_id, new.author_email,
          coalesce(nullif(new.author_name,''), new.author_email), t.assignee_id, t.assignee_email,
          'comment', left(new.body, 280));
  return new;
end $$;

drop trigger if exists dev_ticket_comment_log_event on public.dev_ticket_comments;
create trigger dev_ticket_comment_log_event
  after insert on public.dev_ticket_comments
  for each row execute function public.dev_ticket_comment_log_event();

-- Backfill so the report and each ticket's history aren't empty on day one:
-- a "created" event per ticket, and a "done"/"not possible" event at
-- resolved_at. Only runs while the log is empty, so re-running is a no-op.
insert into public.dev_ticket_events (created_at, ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, assignee_id, assignee_email, event_type, to_value)
select t.created_at, t.id, t.ticket_number, t.title, t.department, t.reporter_id, t.reporter_email, t.assignee_id, t.assignee_email, 'created', 'open'
  from public.dev_tickets t
 where not exists (select 1 from public.dev_ticket_events);

insert into public.dev_ticket_events (created_at, ticket_id, ticket_number, ticket_title, department, actor_id, actor_email, assignee_id, assignee_email, event_type, from_value, to_value)
select t.resolved_at, t.id, t.ticket_number, t.title, t.department, t.assignee_id, t.assignee_email, t.assignee_id, t.assignee_email, 'status', 'in_progress', t.status
  from public.dev_tickets t
 where t.resolved_at is not null
   and not exists (select 1 from public.dev_ticket_events e where e.ticket_id = t.id and e.event_type = 'status');

-- ============================================================
-- 6. END-OF-DAY NOTES (optional, one per person per day)
-- ============================================================

create table if not exists public.work_daily_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_date   date not null,
  body        text not null default '',
  blockers    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, note_date)
);

create index if not exists work_daily_notes_date_idx on public.work_daily_notes(note_date);

alter table public.work_daily_notes enable row level security;
drop policy if exists "own_daily_notes"       on public.work_daily_notes;
drop policy if exists "leads_read_daily_notes" on public.work_daily_notes;
create policy "own_daily_notes" on public.work_daily_notes
  for all using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());
create policy "leads_read_daily_notes" on public.work_daily_notes
  for select using (public.can_dispatch_work());

create or replace function public.work_daily_notes_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists work_daily_notes_touch on public.work_daily_notes;
create trigger work_daily_notes_touch before update on public.work_daily_notes
  for each row execute function public.work_daily_notes_touch();

-- ============================================================
-- 7. TEAM DIRECTORY
-- ============================================================
-- The board needs names for the assignee picker and avatars. A function
-- instead of a profiles read policy, so Supply Chain can see teammates
-- without being able to read every customer's profile row.

create or replace function public.work_team_members()
returns table (id uuid, email text, full_name text, role text, department text)
language sql security definer stable set search_path = public as $$
  select p.id, p.email,
         coalesce(nullif(p.full_name,''), nullif(p.contact_name,''), p.email),
         p.role, public.work_department_for_role(p.role)
    from public.profiles p
   where public.is_staff()
     and p.role in ('owner','operations','developer','marketing','supply_chain','admin')
   order by 3
$$;

revoke all on function public.work_team_members() from public;
grant execute on function public.work_team_members() to authenticated;

-- ============================================================
-- 8. SUPPLY CHAIN DATA ACCESS
-- ============================================================
-- Products, inventory, orders and vendor tabs. Policies are added beside
-- the existing owner/marketing ones (RLS policies OR together). Owner-only
-- triggers -- invoice credit, net 30, order soft-delete -- still apply.

create or replace function pg_temp.grant_supply_chain(p_table text, p_mode text) returns void
language plpgsql as $$
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  execute format('drop policy if exists %I on public.%I', 'supply_chain_' || p_mode || '_' || p_table, p_table);
  if p_mode = 'manage' then
    execute format('create policy %I on public.%I for all using (public.is_supply_chain()) with check (public.is_supply_chain())',
                   'supply_chain_manage_' || p_table, p_table);
  else
    execute format('create policy %I on public.%I for select using (public.is_supply_chain())',
                   'supply_chain_read_' || p_table, p_table);
  end if;
end $$;

select pg_temp.grant_supply_chain(t, 'manage') from unnest(array[
  'products','categories','product_images','inventory','inventory_holds',
  'orders','order_items','order_shipments','order_exceptions','order_returns',
  'vendors','vendor_purchase_orders'
]) as t;

select pg_temp.grant_supply_chain(t, 'read') from unnest(array[
  'order_referrals'
]) as t;

drop policy if exists "supply_chain_upload_product_images" on storage.objects;
drop policy if exists "supply_chain_read_product_images"   on storage.objects;
drop policy if exists "supply_chain_update_product_images" on storage.objects;
create policy "supply_chain_upload_product_images" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_supply_chain());
create policy "supply_chain_read_product_images" on storage.objects
  for select using (bucket_id = 'product-images' and public.is_supply_chain());
create policy "supply_chain_update_product_images" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_supply_chain())
  with check (bucket_id = 'product-images' and public.is_supply_chain());

-- ============================================================
-- 9. LIVE UPDATES
-- ============================================================
-- The board listens for changes so a ticket moved by someone else shows up
-- without a refresh. Realtime still applies RLS per subscriber.

do $$
begin
  begin
    alter publication supabase_realtime add table public.dev_tickets;
  exception when duplicate_object then null; when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dev_ticket_comments;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

-- Verify:
--   select department, status, count(*) from public.dev_tickets group by 1,2;
--   select event_type, count(*) from public.dev_ticket_events group by 1;
--   select * from public.work_team_members();   -- as a signed-in staff user
