-- Ties a payment terms agreement back to the quote request it belongs to,
-- so staff can see acceptance status right on the quote (Admin > Quote
-- Requests > View) instead of having to check a separate inbox or table.
--
-- Denormalized onto quote_requests (terms_status/terms_sent_at/
-- terms_accepted_at) so admin.js's existing `.select("*")` on
-- quote_requests picks this up for free -- no new read endpoint or RLS
-- policy needed. terms_agreements remains the source of truth /
-- audit trail (token, IP, user agent); these columns are a read-only
-- cache kept in sync by api/send-terms-agreement.js and
-- api/terms-agreement.js.
alter table public.quote_requests
  add column if not exists terms_status       text, -- null | 'pending' | 'accepted'
  add column if not exists terms_sent_at       timestamptz,
  add column if not exists terms_accepted_at   timestamptz,
  add column if not exists terms_token         text;

alter table public.terms_agreements
  add column if not exists quote_request_id uuid references public.quote_requests(id);
