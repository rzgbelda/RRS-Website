-- Dropship shipment tracking.
--
-- RRS no longer ships from its own warehouse through a booked carrier
-- (Warp/Estes). Distributors -- InnStyle, Sasso, OfficeCrave -- ship
-- directly to the customer and email a tracking number back to staff,
-- who enter it here by hand. There is no rate quoting and no automatic
-- booking left in that flow, so the carrier-era machinery it replaces
-- (freight_quote, bol_number, the warp-freight edge function) stops
-- being the source of shipment truth.
--
-- Why a separate table rather than more columns on orders: a single
-- order can contain items from more than one distributor, and those ship
-- as separate packages with their own tracking numbers, on their own
-- days. orders.tracking_number/tracking_url can only ever hold one, so
-- a multi-distributor order would silently show the customer whichever
-- one staff happened to save last. One row per package fixes that.
--
-- The legacy columns on orders (tracking_number, tracking_url,
-- shipping_carrier, bol_number, pro_number, shipping_status) are left
-- in place and untouched: historical carrier-booked orders still read
-- from them, and dropping them would blank out the tracking on every
-- order placed before this migration.

create table if not exists public.order_shipments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,

  -- Which distributor shipped this package. Internal only -- deliberately
  -- NOT shown to the customer, who sees status and tracking but not which
  -- supplier fulfilled their order. Constrained to the three live
  -- distributors plus 'other' so a typo can't quietly create a fourth
  -- one that then breaks per-distributor reporting.
  distributor text not null check (distributor in (
                'innstyle', 'sasso', 'officecrave', 'other'
              )),

  -- Dropship states. The old orders.shipping_status CHECK allowed
  -- awaiting_freight_quote/booked/in_transit/delivered, which described
  -- a carrier booking flow that no longer exists -- there is nothing to
  -- quote and nothing to book. 'processing' means the order is with the
  -- distributor but not yet shipped; 'shipped' means a tracking number
  -- exists; 'delivered' is set by staff on confirmation.
  status      text not null default 'processing'
                check (status in ('processing', 'shipped', 'delivered')),

  -- Entered by staff from the distributor's email. Both nullable: a row
  -- can exist in 'processing' before any tracking number is issued.
  --
  -- tracking_url is stored rather than derived from a carrier name: each
  -- distributor uses whichever carrier suits the shipment, so there is
  -- no reliable way to build the right URL from the number alone. Staff
  -- paste the link the distributor sends.
  tracking_number text,
  tracking_url    text,
  -- Free text, not a constrained list: this is whatever the distributor
  -- says ("UPS", "FedEx Freight", "Southeastern"), and constraining it
  -- would block a legitimate shipment over an unrecognised carrier name.
  carrier         text,

  note        text,

  shipped_at   timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists order_shipments_order_idx       on public.order_shipments(order_id);
create index if not exists order_shipments_status_idx      on public.order_shipments(status);
create index if not exists order_shipments_distributor_idx on public.order_shipments(distributor);

create or replace function public.order_shipments_set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_order_shipments_updated_at on public.order_shipments;
create trigger trg_order_shipments_updated_at
  before update on public.order_shipments
  for each row execute function public.order_shipments_set_updated_at();

alter table public.order_shipments enable row level security;

-- Staff create and maintain every shipment row -- same access pattern as
-- order_returns/order_exceptions.
drop policy if exists "staff_manage_order_shipments" on public.order_shipments;
create policy "staff_manage_order_shipments" on public.order_shipments
  for all
  using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- A customer reads the shipments on their own order, and nothing else.
-- Read-only: tracking is entered by staff from the distributor's email,
-- never by the buyer. The auth.uid() OR matching-email pair mirrors
-- own_order_items_read (20260908_security_enable_missing_rls.sql) so a
-- guest checkout can still see its own tracking once that guest logs in
-- with the email they ordered under.
drop policy if exists "own_order_shipments_read" on public.order_shipments;
create policy "own_order_shipments_read" on public.order_shipments
  for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_shipments.order_id
        and (
          o.user_id = auth.uid()
          or (
            auth.jwt() ->> 'email' is not null
            and o.customer_email = auth.jwt() ->> 'email'
          )
        )
    )
  );

-- Verify
--   select tablename, policyname, cmd from pg_policies
--   where tablename = 'order_shipments' order by policyname;
