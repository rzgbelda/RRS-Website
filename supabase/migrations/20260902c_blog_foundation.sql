-- SEO Roadmap Day 17: blog foundation (infrastructure only -- no
-- articles yet, that's Day 18). "For a B2B wholesale site this is the
-- single biggest structural gap -- no backlink-attracting, long-tail-
-- keyword-targeting content exists" (SEO-ROADMAP.md audit).
--
-- Real content table (not the single-row site_content jsonb pattern Hero/
-- About use -- that's a fine shape for one section, wrong shape for many
-- articles with drafts/publish dates/slugs). Access: same is_crm_staff()
-- (owner + marketing) as Campaigns/CRM -- blog content is a marketing
-- function, not part of narrow Admin's Users/Tickets/Hero/About scope.

create table if not exists public.articles (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  excerpt           text,                 -- shown on the /blog index card and used as the meta description fallback
  body_html         text not null default '',
  cover_image_url   text,
  meta_title        text,                 -- optional SEO override, same pattern as products.meta_title
  meta_description  text,
  status            text not null default 'draft' check (status in ('draft','published')),
  published_at      timestamptz,          -- set once, the first time status flips to 'published' -- not touched by later edits, so it stays a real publish date
  author_id         uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists articles_status_idx       on public.articles(status);
create index if not exists articles_published_at_idx on public.articles(published_at desc);

create or replace function public.articles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'published' and old.status is distinct from 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists articles_before_update on public.articles;
create trigger articles_before_update
  before update on public.articles
  for each row execute function public.articles_set_updated_at();

-- Insert doesn't run the above trigger's old/new comparison (there is no
-- "old" row), so a post created directly as 'published' needs its own
-- published_at set at insert time.
create or replace function public.articles_set_published_at_on_insert()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists articles_before_insert on public.articles;
create trigger articles_before_insert
  before insert on public.articles
  for each row execute function public.articles_set_published_at_on_insert();

alter table public.articles enable row level security;

-- Published articles are real content, publicly readable with no auth --
-- the whole point is for search engines and anonymous visitors to read
-- them. Drafts stay staff-only.
drop policy if exists "public_read_published_articles" on public.articles;
create policy "public_read_published_articles" on public.articles
  for select using (status = 'published');

drop policy if exists "crm_staff_manage_articles" on public.articles;
create policy "crm_staff_manage_articles" on public.articles
  for all using (public.is_crm_staff()) with check (public.is_crm_staff());
