-- Dev ticket comments showed the commenter's raw email in the thread even
-- when they'd set a display name (profiles.full_name) -- e.g. "Renz Belda"
-- everywhere else in the panel, but "rgutierrezbelda@gmail.com" in a
-- comment. Store the name at post time so the thread doesn't need to
-- re-join profiles just to render it.
alter table public.dev_ticket_comments add column if not exists author_name text;

-- Backfill existing comments so past ones switch over too, not just new ones.
update public.dev_ticket_comments c
set author_name = p.full_name
from public.profiles p
where c.author_id = p.id
  and c.author_name is null
  and coalesce(p.full_name, '') <> '';
