-- Attributes quote requests to the affiliate whose subdomain the customer
-- was on, and lets that affiliate see their own quotes.
--
-- Orders have had attribution since 20260911 (order_referrals, plus the
-- subdomain auto-fill in script.js). Quotes never did: quote_requests has
-- no affiliate column at all, and supabase/functions/quote-request accepts
-- no subdomain or referral parameter. A customer landing on
-- trustmarkcleaners.roomreadysupply.com and requesting volume pricing
-- produced a quote indistinguishable from a direct one -- so the affiliate
-- could not see it, and if it converted, the commission trail started only
-- at the order.
--
-- Deliberately a direct sub_distributor_id column rather than a
-- quote_referrals join table (the shape order_referrals uses). An order
-- referral carries its own computed commission_amount and is a financial
-- record in its own right; a quote is a lead, with no money attached yet,
-- and exactly one owning affiliate. A join table here would be a
-- one-to-one with a single foreign key -- more moving parts for no gain.
-- When a quote converts, api/send-invoice.js already creates the order and
-- the existing order_referrals path takes over.

alter table public.quote_requests
  add column if not exists sub_distributor_id uuid
    references public.sub_distributors(id) on delete set null;

-- Partner dashboard lists an affiliate's quotes newest-first; without this
-- every load is a full scan filtered in memory.
create index if not exists quote_requests_sub_distributor_idx
  on public.quote_requests (sub_distributor_id, created_at desc)
  where sub_distributor_id is not null;

-- ============================================================
-- RLS: an affiliate reads only the quotes attributed to them
-- ============================================================
-- Same linkage every other affiliate policy uses (20260910b, 20260916):
-- sub_distributors.user_id = auth.uid(). SELECT only -- an affiliate
-- watches their pipeline but cannot price, edit, or delete a quote; that
-- stays staff work through the existing marketing/owner policies.
drop policy if exists "affiliate_read_own_quotes" on public.quote_requests;
create policy "affiliate_read_own_quotes" on public.quote_requests
  for select
  using (
    exists (
      select 1 from public.sub_distributors sd
      where sd.id = quote_requests.sub_distributor_id
        and sd.user_id = auth.uid()
    )
  );

-- Verify:
--   -- as a real affiliate login (not the SQL editor's superuser):
--   select id, business_name, status from public.quote_requests;
--   -- expect only quotes carrying that affiliate's sub_distributor_id.
--
--   -- attribution actually landing, as staff:
--   select sd.name, count(q.*)
--   from public.quote_requests q
--   join public.sub_distributors sd on sd.id = q.sub_distributor_id
--   group by 1 order by 2 desc;
