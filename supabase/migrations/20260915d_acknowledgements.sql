-- A single evidence trail for every checkbox a customer ticks: the delivery
-- estimate acknowledgement added now, and any future opt-in or terms
-- acceptance, so they are all queryable from one place instead of each one
-- growing its own pair of columns somewhere.
--
-- Deliberately separate from terms_agreements. That table models a
-- negotiated Payment Terms Agreement: a token is emailed, the customer
-- visits a page, and the row moves pending -> accepted. This one records a
-- box ticked inline while placing an order -- there is no token, no pending
-- state, and no separate visit. Folding both into one table would mean half
-- its columns are null for whichever kind a row happens to be.
--
-- Stores what makes an acknowledgement defensible later: exactly what text
-- was agreed to (not a pointer to wording that may since have changed), when,
-- and from which IP and browser -- the same evidence terms_agreements keeps.

create table if not exists public.acknowledgements (
  id             uuid primary key default gen_random_uuid(),

  -- What was acknowledged. 'delivery_estimate' is the first; future kinds
  -- (marketing opt-in, returns policy, etc.) reuse this table with a new
  -- value rather than adding columns elsewhere.
  kind           text not null,

  -- Where it happened, for filtering in admin: 'checkout' | 'quote_confirm'.
  context        text not null,

  -- The exact wording shown. Kept verbatim so a later edit to the copy can
  -- never rewrite what an earlier customer is recorded as having agreed to.
  terms_text     text not null,

  -- Who. All optional: a guest checkout has no user_id, and a quote
  -- confirmation is identified by its quote rather than a signed-in account.
  user_id        uuid references auth.users(id) on delete set null,
  order_id       uuid references public.orders(id) on delete set null,
  quote_id       uuid references public.quote_requests(id) on delete set null,
  email          text,
  business_name  text,

  -- Evidence.
  accepted_at    timestamptz not null default now(),
  accepted_ip    text,
  accepted_user_agent text
);

create index if not exists acknowledgements_kind_idx     on public.acknowledgements (kind, accepted_at desc);
create index if not exists acknowledgements_order_idx    on public.acknowledgements (order_id) where order_id is not null;
create index if not exists acknowledgements_quote_idx    on public.acknowledgements (quote_id) where quote_id is not null;
create index if not exists acknowledgements_email_idx    on public.acknowledgements (lower(email));

-- RLS on with no anon policy, matching terms_agreements: every write goes
-- through a server endpoint using the service-role key, so the anon key
-- cannot insert a forged acknowledgement or read anyone else's. Staff read
-- it through the admin panel, which authenticates as a real user.
alter table public.acknowledgements enable row level security;

drop policy if exists "staff_read_acknowledgements" on public.acknowledgements;
create policy "staff_read_acknowledgements" on public.acknowledgements
  for select using (public.is_admin() or public.is_marketing());

-- Verify:
--   select kind, context, count(*), max(accepted_at)
--   from public.acknowledgements group by 1,2 order by 1,2;
--
--   -- everything one customer has ever acknowledged:
--   select kind, context, accepted_at, accepted_ip
--   from public.acknowledgements where lower(email) = lower('someone@example.com')
--   order by accepted_at desc;
