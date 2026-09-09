-- Return / logistics-exception tracking, for both RRS's own orders and
-- affiliate-storefront orders (RRS-9's sub-distributor program).
--
-- order_exceptions (20260901e) already tracks pre-fulfillment problems
-- (stockouts, vendor unresponsive) -- this is a distinct, POST-shipment
-- concern: an item comes back, or something went wrong in delivery. Two
-- different problems that need different next steps, so this is a
-- separate table rather than widening order_exceptions' reason_code:
--
--   customer_return  -- buyer sends the item back (wrong size, changed
--                        mind, damaged on arrival, etc.)
--   logistics_error  -- the carrier (WARP or Shippo) lost it, delivered
--                        to the wrong address, damaged it in transit, or
--                        it never showed up
--
-- The field that actually matters for money: fault_party. An affiliate's
-- commission for a given order should NOT be dinged for a carrier's
-- mistake, but SHOULD be dinged if the affiliate gave WARP a wrong
-- pickup/delivery address or mishandled the item themselves. This table
-- is the record that answers "whose fault was it" when a payout is being
-- calculated, rather than that judgment call happening from memory in a
-- Slack thread months later.

create table if not exists public.order_returns (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,

  kind              text not null check (kind in ('customer_return', 'logistics_error')),
  reason_code       text not null check (reason_code in (
                      -- customer_return reasons
                      'damaged_on_arrival', 'wrong_item_shipped', 'no_longer_needed',
                      'quality_issue', 'ordered_by_mistake',
                      -- logistics_error reasons
                      'lost_in_transit', 'carrier_damaged', 'delivered_wrong_address',
                      'delivery_delayed', 'never_delivered',
                      'other'
                    )),
  note              text,

  -- Whose mistake this was, for payout purposes. 'unresolved' is the
  -- required starting state -- fault should be determined by looking at
  -- what happened, not defaulted to whichever party is more convenient.
  fault_party       text not null default 'unresolved'
                      check (fault_party in ('rrs', 'affiliate', 'carrier', 'customer', 'unresolved')),

  -- Carrier claim reference, when this is a WARP/Shippo matter -- most
  -- LTL/parcel carriers run their own loss-and-damage claims process;
  -- this is where that claim number lives instead of getting lost in
  -- someone's inbox.
  carrier_claim_ref text,

  status            text not null default 'reported'
                      check (status in ('reported', 'investigating', 'resolved')),
  resolution        text check (resolution in (
                      'refunded', 'replaced', 'store_credit', 'carrier_reimbursed', 'no_action'
                    )),

  -- Whether this return/error should reduce the commission RRS owes the
  -- affiliate for the underlying order. Only meaningful when fault_party
  -- is 'affiliate' or the order was otherwise not a completed sale --
  -- kept as an explicit flag rather than inferred from fault_party so a
  -- staff member reviewing a payout can see the actual decision made,
  -- not just re-derive it.
  affects_commission boolean not null default false,

  reported_by        uuid references auth.users(id) on delete set null,
  reported_at         timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists order_returns_order_idx    on public.order_returns(order_id);
create index if not exists order_returns_status_idx    on public.order_returns(status);
create index if not exists order_returns_fault_idx     on public.order_returns(fault_party);

create or replace function public.order_returns_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_order_returns_updated_at on public.order_returns;
create trigger trg_order_returns_updated_at
  before update on public.order_returns
  for each row execute function public.order_returns_set_updated_at();

alter table public.order_returns enable row level security;

-- Staff (owner/admin/marketing) manage every return across every order --
-- same access pattern already used for order_exceptions.
drop policy if exists "staff_manage_order_returns" on public.order_returns;
create policy "staff_manage_order_returns" on public.order_returns
  for all
  using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- An affiliate (sub_distributor role) may report a return/issue on an
-- order that is theirs, and read the ones they've already reported --
-- scoped through sub_distributors.user_id -> order_referrals.sub_distributor_id,
-- the same linkage RLS already trusts for payout visibility. They cannot
-- see or report against another affiliate's orders, and cannot set
-- fault_party/affects_commission themselves (that's a staff judgment
-- call) -- enforced by column-level grants below, not by this policy.
drop policy if exists "affiliate_report_own_returns" on public.order_returns;
create policy "affiliate_report_own_returns" on public.order_returns
  for select
  using (
    exists (
      select 1
      from public.order_referrals r
      join public.sub_distributors sd on sd.id = r.sub_distributor_id
      where r.order_id = order_returns.order_id
        and sd.user_id = auth.uid()
    )
  );

drop policy if exists "affiliate_insert_own_returns" on public.order_returns;
create policy "affiliate_insert_own_returns" on public.order_returns
  for insert
  with check (
    exists (
      select 1
      from public.order_referrals r
      join public.sub_distributors sd on sd.id = r.sub_distributor_id
      where r.order_id = order_returns.order_id
        and sd.user_id = auth.uid()
    )
    -- An affiliate can report a problem, but not pre-decide fault or
    -- whether it dents their own commission.
    and fault_party = 'unresolved'
    and affects_commission = false
    and status = 'reported'
  );
