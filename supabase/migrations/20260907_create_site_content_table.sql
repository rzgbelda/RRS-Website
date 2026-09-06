-- Creates the site_content table admin.js's Hero Section and About
-- Section editors have referenced since commit 8a9ed18 (25 Jun 2026),
-- but a migration for it was never committed -- only a standalone
-- create-site-content-table.sql sat in the repo root and has since been
-- deleted. Every read/write against "site_content" from admin.js or
-- index.html's homepage-CMS loader has been hitting PGRST205 ("Could not
-- find the table") ever since: a 404 on every homepage load, and a
-- completely non-functional Hero/About editor in admin for both the
-- admin and account-manager roles that can see those tabs.
--
-- The site has not visibly broken, because index.html's hardcoded HTML
-- is the real fallback content and the CMS loader silently no-ops when
-- the fetch fails -- so this has been invisible to visitors, only
-- showing up as console noise and a dead admin feature.
--
-- Schema matches exactly what admin.js already reads/writes: one row per
-- named section, arbitrary jsonb content, upserted on `section`.
create table if not exists public.site_content (
  id         uuid primary key default gen_random_uuid(),
  section    text not null unique,
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

-- Public (anon) can read -- the live homepage fetches this on every load
-- to render Hero/About copy for real visitors, logged in or not.
drop policy if exists "public_read_site_content" on public.site_content;
create policy "public_read_site_content" on public.site_content
  for select using (true);

-- Only admin/owner-role staff can write -- matches manage-hero/
-- manage-about being ADMIN_ONLY_TABS in admin.js, gated the same way
-- every other admin-only content table in this schema is gated.
drop policy if exists "admin_write_site_content" on public.site_content;
create policy "admin_write_site_content" on public.site_content
  for all using (public.is_admin()) with check (public.is_admin());

-- Seeded with the real, currently-live homepage copy (the hardcoded
-- HTML in index.html, which is also what the JS defaults in
-- loadHeroSection()/loadAboutSection() fall back to) -- not placeholder
-- text. Editing this in admin should start from what visitors already
-- see, not revert the site to something generic. Idempotent: only
-- inserts a section that doesn't already exist.
--
-- Values use dollar-quoting rather than single-quoted string literals:
-- a known Supabase SQL Editor bug misparses hyphenated words inside
-- single-quoted strings as arithmetic expressions (e.g. "short-term"
-- read as "short - term"), and both paragraphs below contain
-- "short-term rentals".
insert into public.site_content (section, content)
select 'hero', jsonb_build_object(
  'heading', 'Keep Your|Rooms Ready|Without Chasing Supplies',
  'highlight', 'Without Chasing Supplies',
  'description', $hero_desc$Room Ready Supply is an East Coast hospitality and facility supply partner, based in North Carolina — helping hotels, motels, short-term rentals, cleaning companies, restaurants, campgrounds, RV parks, and facilities order paper products, cleaning supplies, linens, and guest room essentials with simple pricing, easy reordering, and local support.$hero_desc$,
  'btnPrimary', 'Shop Catalog',
  'btnSecondary', 'Request Business Pricing',
  'bannerUrl', 'assets/img/banner1.jpg'
)
where not exists (select 1 from public.site_content where section = 'hero');

insert into public.site_content (section, content)
select 'about', jsonb_build_object(
  'tag', 'About Us',
  'title', 'Your Hospitality Supply<br>Partner on the East Coast',
  'p1', 'Keeping rooms, rentals, kitchens, and facilities ready takes more than just products — it takes a supply partner that understands your operation and shows up every time.',
  'p2', 'Room Ready Supply provides hospitality and facility essentials — paper products, trash liners, cleaning supplies, soaps, laundry and dishwashing supplies, linens, and guest room supplies — delivered reliably with easy reordering built in.',
  'p3', $about_p3$Locally owned and based in North Carolina, we proudly serve hospitality and facility businesses across the East Coast — hotels, motels, short-term rentals, cleaning companies, restaurants, campgrounds, RV parks, and facilities — to keep supply runs simple.$about_p3$,
  'bannerUrl', 'assets/img/banner3.jpg'
)
where not exists (select 1 from public.site_content where section = 'about');
