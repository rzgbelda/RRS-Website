-- Closes a real gap flagged by the CEO: visiting an affiliate's own
-- subdomain (e.g. trustmark.roomreadysupply.com) currently attributes
-- NOTHING to that affiliate. Verified against the live code before writing
-- this -- every existing attribution path (payment.html's checkout,
-- script.js's registration/checkout referral lookups) depends entirely on
-- a referral_code the customer types into a plain text field labelled
-- "optional". Nothing anywhere reads window.location.hostname. A customer
-- who lands on an affiliate's subdomain and checks out without typing a
-- code becomes an ordinary, unattributed RRS order -- which breaks the
-- whole payout/commission model this week's other migrations built
-- (order_returns' fault_party, affiliate_payouts) since there is nothing
-- reliable to compute them from.
--
-- Fix: sub_distributors gets its own subdomain slug, independent of
-- referral_code (a subdomain is a DNS-facing identity, a referral code is
-- a marketing string a customer types -- keeping them separate lets either
-- change without touching the other). The frontend (this migration's
-- companion JS changes) resolves the current subdomain to a referral code
-- via lookup_referral_code_by_subdomain() below and auto-applies it,
-- with the existing manual-code field kept only as a fallback for
-- customers on the main site who have a code from elsewhere.

alter table public.sub_distributors
  add column if not exists subdomain text;

-- One subdomain maps to exactly one affiliate. Case-insensitive uniqueness
-- (citext-free approach: index on lower()) since a subdomain in a URL is
-- always lowercase in practice but the column shouldn't silently allow
-- 'Trustmark' and 'trustmark' as two different rows.
create unique index if not exists sub_distributors_subdomain_idx
  on public.sub_distributors (lower(subdomain))
  where subdomain is not null;

-- Public lookup, same shape and reasoning as lookup_referral_code(): the
-- base table holds email/phone/notes and stays staff-only under RLS, so
-- resolving "which affiliate owns this subdomain" for an anonymous visitor
-- needs a narrow security-definer function, not a policy opening the
-- table itself. Returns only what checkout/registration need to attribute
-- an order -- no contact details.
create or replace function public.lookup_affiliate_by_subdomain(p_subdomain text)
returns table (id uuid, name text, referral_code text, commission_pct numeric)
language sql
stable
security definer
set search_path = public
as $fn$
  select sd.id, sd.name, sd.referral_code, sd.commission_pct
  from public.sub_distributors sd
  where lower(sd.subdomain) = lower(trim(p_subdomain))
    and sd.status = 'active'
  limit 1;
$fn$;

revoke all on function public.lookup_affiliate_by_subdomain(text) from public;
grant execute on function public.lookup_affiliate_by_subdomain(text) to anon, authenticated;
