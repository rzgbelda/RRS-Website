-- Sales reps can file dev tickets (sales_create_own_tickets policy, added in
-- 20260928_sales_team.sql), but the dev-note-screenshots storage bucket was
-- gated on is_staff() only -- which deliberately excludes 'sales'. Add
-- narrower policies so a sales rep can upload a screenshot when filing a
-- ticket and read back their own uploads. They cannot read other reps' or
-- staff screenshots (path prefix scoped to their own uid), and they cannot
-- delete (staff handles cleanup).

drop policy if exists "sales_upload_own_screenshots" on storage.objects;
drop policy if exists "sales_read_own_screenshots"   on storage.objects;

create policy "sales_upload_own_screenshots"
  on storage.objects for insert
  with check (
    bucket_id = 'dev-note-screenshots'
    and coalesce(
      (select role = 'sales' from public.profiles where id = auth.uid()),
      false
    )
    -- Enforce a per-user path prefix so reps cannot overwrite each other's files.
    -- Front-end uploads to `sales/<uid>/<filename>`.
    and (storage.foldername(name))[1] = 'sales'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "sales_read_own_screenshots"
  on storage.objects for select
  using (
    bucket_id = 'dev-note-screenshots'
    and coalesce(
      (select role = 'sales' from public.profiles where id = auth.uid()),
      false
    )
    and (storage.foldername(name))[1] = 'sales'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
