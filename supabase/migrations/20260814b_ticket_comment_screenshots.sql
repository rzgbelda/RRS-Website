-- Comments on a ticket can now carry a screenshot too -- e.g. "here's proof
-- it's fixed" -- not just the ticket itself at creation time.

alter table public.dev_ticket_comments
  add column if not exists screenshot_url text;
