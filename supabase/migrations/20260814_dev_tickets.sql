-- Developer ticketing system: an internal IT-service-desk board where admins
-- file bugs / errors / enhancement ideas found while testing the site, assign
-- them to a developer, and track them through to done.
--
-- Supersedes the never-deployed dev_notes table from earlier the same day.
-- That table only ever held notes with no priority, assignee, or comments,
-- so it is dropped below -- but only if it exists AND is empty, so this
-- migration is safe to run whether or not the earlier one was ever applied.

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'dev_notes')
     and not exists (select 1 from public.dev_notes limit 1) then
    drop table public.dev_notes;
  end if;
end $$;

-- ============================================================
-- ROLES
-- ============================================================
-- 'developer' is a new value for profiles.role. That column is free-text
-- with no check constraint, so nothing to alter -- but it does need helper
-- functions so RLS policies can talk about developers.

create or replace function public.is_developer()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'developer' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Anyone who may work a ticket: admins and developers.
create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select public.is_admin() or public.is_developer()
$$;

-- SECURITY FIX (pre-existing hole, surfaced by adding a restricted role):
-- the "own_profile_update" policy lets any signed-in user update their own
-- profile row -- including the role column. A customer, sub-distributor, or
-- developer could set role = 'admin' and take over the panel. RLS alone
-- can't restrict a single column, so guard it with a trigger: only an admin
-- may change a role, and nobody may change their own.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin() or new.id = auth.uid() then
      raise exception 'Only an administrator may change an account role.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_role_change on public.profiles;
create trigger guard_profile_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- ============================================================
-- TICKETS
-- ============================================================

-- Human-readable ticket ids (RRS-1, RRS-2, ...) so people can refer to a
-- ticket in conversation without pasting a uuid.
create sequence if not exists public.dev_ticket_seq start 1;

create table if not exists public.dev_tickets (
  id             uuid primary key default gen_random_uuid(),
  ticket_number  text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  reporter_id    uuid references auth.users(id) on delete set null,
  reporter_email text,
  assignee_id    uuid references auth.users(id) on delete set null,
  assignee_email text,

  title          text not null,
  description    text not null,
  page_url       text,

  ticket_type    text not null default 'bug'    check (ticket_type in ('bug','error','idea')),
  priority       text not null default 'medium' check (priority   in ('critical','medium','enhancement')),
  status         text not null default 'open'   check (status     in ('open','in_progress','done','not_possible')),

  screenshot_url text,
  resolution     text,
  resolved_at    timestamptz
);

create index if not exists dev_tickets_status_idx   on public.dev_tickets(status);
create index if not exists dev_tickets_priority_idx on public.dev_tickets(priority);
create index if not exists dev_tickets_assignee_idx on public.dev_tickets(assignee_id);
create index if not exists dev_tickets_created_idx  on public.dev_tickets(created_at desc);

-- Assign the next ticket number, and stamp resolved_at when a ticket reaches
-- a terminal state (done / not_possible) so "time to close" is reportable.
create or replace function public.dev_ticket_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.ticket_number is null then
    new.ticket_number := 'RRS-' || nextval('public.dev_ticket_seq');
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status in ('done','not_possible') and old.status not in ('done','not_possible') then
      new.resolved_at := now();
    elsif new.status not in ('done','not_possible') then
      new.resolved_at := null;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists dev_ticket_before_write on public.dev_tickets;
create trigger dev_ticket_before_write
  before insert or update on public.dev_tickets
  for each row execute function public.dev_ticket_before_write();

-- ============================================================
-- COMMENTS
-- ============================================================

create table if not exists public.dev_ticket_comments (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.dev_tickets(id) on delete cascade,
  created_at   timestamptz not null default now(),
  author_id    uuid references auth.users(id) on delete set null,
  author_email text,
  author_role  text,
  body         text not null
);

create index if not exists dev_ticket_comments_ticket_idx
  on public.dev_ticket_comments(ticket_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Admins and developers both work the board, so both get full access to
-- tickets and comments. Nobody else -- customers and sub-distributors have
-- no policy here at all, so RLS denies them by default.

alter table public.dev_tickets enable row level security;
drop policy if exists "staff_manage_dev_tickets" on public.dev_tickets;
create policy "staff_manage_dev_tickets" on public.dev_tickets for all using (public.is_staff());

alter table public.dev_ticket_comments enable row level security;
drop policy if exists "staff_manage_dev_ticket_comments" on public.dev_ticket_comments;
create policy "staff_manage_dev_ticket_comments" on public.dev_ticket_comments for all using (public.is_staff());

-- ============================================================
-- STORAGE (screenshots)
-- ============================================================
-- Private, unlike product-images: these screenshots show internal admin
-- views and error detail, so they are read through short-lived signed URLs.

insert into storage.buckets (id, name, public)
  values ('dev-note-screenshots', 'dev-note-screenshots', false)
  on conflict do nothing;

drop policy if exists "staff_read_dev_screenshots"   on storage.objects;
drop policy if exists "staff_upload_dev_screenshots" on storage.objects;
drop policy if exists "staff_delete_dev_screenshots" on storage.objects;

create policy "staff_read_dev_screenshots"   on storage.objects for select using      (bucket_id = 'dev-note-screenshots' and public.is_staff());
create policy "staff_upload_dev_screenshots" on storage.objects for insert with check (bucket_id = 'dev-note-screenshots' and public.is_staff());
create policy "staff_delete_dev_screenshots" on storage.objects for delete using      (bucket_id = 'dev-note-screenshots' and public.is_staff());
