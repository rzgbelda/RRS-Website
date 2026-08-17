-- Minimal email capture for the Best Deals landing page's "Subscribe"
-- form. No newsletter-sending infrastructure exists yet -- this just
-- gives the button somewhere real to save an email, so campaign traffic
-- isn't silently discarded while a real ESP (Mailchimp/Klaviyo/etc.) is
-- decided on later. Public insert only; nothing else is exposed.

create table if not exists public.newsletter_subscribers (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  source       text default 'best-deals',
  created_at   timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "public_can_subscribe" on public.newsletter_subscribers;
create policy "public_can_subscribe"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "admin_read_subscribers" on public.newsletter_subscribers;
create policy "admin_read_subscribers"
  on public.newsletter_subscribers for select
  using (public.is_admin());
