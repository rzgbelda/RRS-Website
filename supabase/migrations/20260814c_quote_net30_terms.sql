-- "Payment terms: Net 30 days upon credit approval." was a hardcoded line
-- on every quote/invoice PDF, but not every customer has that agreement.
-- Now opt-in per quote, set from a checkbox in the admin composer.

alter table public.quote_requests
  add column if not exists net_30_terms boolean not null default false;
