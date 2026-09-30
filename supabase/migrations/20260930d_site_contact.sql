-- Editable site contact info (Admin > Settings > Site Contact Info).
--
-- The form used to be a stub that only showed a toast. This gives it a
-- home: one row, readable by the public site so pages can show the current
-- phone/email, writable only by admins.
--
-- Seeded with the values currently baked into the HTML so nothing on the
-- site changes until someone saves a different value in admin.
--
-- address is stored but the storefront never hides or blanks an address
-- because this is empty -- NAP consistency with the Google Business Profile
-- matters more than a tidy form.

create table if not exists public.site_contact (
  id         smallint primary key default 1 check (id = 1),
  phone      text,
  email      text,
  address    text,
  updated_at timestamptz not null default now()
);

insert into public.site_contact (id, phone, email)
values (1, '(252) 227-0073', 'sales@roomreadysupply.com')
on conflict (id) do nothing;

alter table public.site_contact enable row level security;

drop policy if exists "site_contact_public_read" on public.site_contact;
create policy "site_contact_public_read" on public.site_contact
  for select using (true);

drop policy if exists "site_contact_admin_write" on public.site_contact;
create policy "site_contact_admin_write" on public.site_contact
  for all using (public.is_admin()) with check (public.is_admin());

-- Verify
--   select * from public.site_contact;
