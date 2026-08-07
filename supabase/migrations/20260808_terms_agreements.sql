-- Clickwrap acceptance of a negotiated payment-terms exception (e.g. Nc
-- Wellness's 30-day net terms). A "reply to confirm" email has no real
-- record of who agreed to what, or when -- this table is the evidence
-- trail: token, timestamp, and the IP/user-agent that clicked Accept.
--
-- No RLS policies are defined on purpose: every read and write goes
-- through api/send-terms-agreement.js and api/terms-agreement.js using
-- the service-role key, the same pattern already used for orders in
-- api/create-order.js. With RLS enabled and zero policies, the anon key
-- cannot touch this table at all -- the customer-facing page only ever
-- talks to it through those two server endpoints.
create table if not exists public.terms_agreements (
  id                   uuid primary key default gen_random_uuid(),
  token                text not null unique,
  contact_name         text not null,
  business_name        text not null,
  email                text not null,
  total                numeric(10,2),
  status               text not null default 'pending', -- 'pending' | 'accepted'
  created_at           timestamptz not null default now(),
  accepted_at          timestamptz,
  accepted_ip          text,
  accepted_user_agent  text
);

alter table public.terms_agreements enable row level security;
