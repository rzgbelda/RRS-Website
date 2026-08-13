-- Admin-only "Developer Notes" tab: a place for admins to log bugs,
-- errors, or ideas found while testing the site, optionally with a
-- screenshot. Not customer-facing -- gated the same way every other
-- admin table is, via public.is_admin().

create table if not exists public.dev_notes (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  author_id     uuid references auth.users(id) on delete set null,
  author_email  text,
  title         text not null,
  description   text not null,
  note_type     text not null default 'bug' check (note_type in ('bug', 'error', 'idea')),
  status        text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  screenshot_url text
);

create index if not exists dev_notes_status_idx on public.dev_notes(status);
create index if not exists dev_notes_created_idx on public.dev_notes(created_at desc);

alter table public.dev_notes enable row level security;
create policy "admin_manage_dev_notes" on public.dev_notes for all using (public.is_admin());

-- Storage bucket for attached screenshots -- private, not public, since
-- these can contain internal admin-panel views and error detail.
insert into storage.buckets (id, name, public)
  values ('dev-note-screenshots', 'dev-note-screenshots', false)
  on conflict do nothing;

create policy "admin_read_dev_note_screenshots"   on storage.objects for select using (bucket_id = 'dev-note-screenshots' and public.is_admin());
create policy "admin_upload_dev_note_screenshots" on storage.objects for insert with check (bucket_id = 'dev-note-screenshots' and public.is_admin());
create policy "admin_delete_dev_note_screenshots" on storage.objects for delete using (bucket_id = 'dev-note-screenshots' and public.is_admin());
