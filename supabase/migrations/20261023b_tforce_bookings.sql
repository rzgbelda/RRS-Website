-- TForce freight booking from the admin order screen.
--
-- RRS books its own LTL (third-party billed, supplier warehouse -> customer)
-- through the TForce Shipping API instead of typing each eBOL into
-- tforcefreight.com: one call creates the BOL, assigns the PRO, schedules
-- the pickup and returns the BOL and 4x6 label PDFs (api/ups-tracking.js,
-- action 'tforce_book'). TForce API support confirmed 2026-10-23 that these
-- shipments show in MyLTL like website bookings.
--
-- 1. freight_bookings: one row per booking, with the PDFs, so staff can
--    reprint them and see what was booked. environment 'cie' = TForce's
--    test system (no real pickup); 'prod' = a real shipment.
-- 2. vendors.pickup_ready_time / pickup_close_time: each warehouse's dock
--    window (HH:MM, 24h), pre-filled into the booking form. Null until the
--    supplier confirms; the form falls back to 10:00-16:00.
-- 3. order_shipments.distributor allowed every live distributor; it only
--    knew InnStyle, Sasso and OfficeCrave, so a Starlinen or NPS booking
--    could not be recorded as the customer-visible tracking row.

create table if not exists public.freight_bookings (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  distributor         text not null,
  carrier             text not null default 'tforce',
  environment         text not null check (environment in ('cie', 'prod')),
  pro_number          text,
  bol_id              text,
  pickup_confirmation text,
  origin_terminal     text,
  pickup_date         date,
  pallets             integer,
  weight_lb           numeric,
  freight_class       text,
  liftgate            boolean not null default false,
  quoted_total        numeric,
  transit_days        text,
  bol_pdf             text,   -- base64
  label_pdf           text,   -- base64
  emailed_to          text,
  request             jsonb,  -- what was sent to TForce, for support questions
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists freight_bookings_order_idx on public.freight_bookings(order_id);

alter table public.freight_bookings enable row level security;
drop policy if exists "staff_manage_freight_bookings" on public.freight_bookings;
create policy "staff_manage_freight_bookings" on public.freight_bookings
  for all using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());
drop policy if exists "supply_chain_manage_freight_bookings" on public.freight_bookings;
create policy "supply_chain_manage_freight_bookings" on public.freight_bookings
  for all using (public.is_supply_chain()) with check (public.is_supply_chain());

alter table public.vendors
  add column if not exists pickup_ready_time text,
  add column if not exists pickup_close_time text;

alter table public.order_shipments
  drop constraint if exists order_shipments_distributor_check;
alter table public.order_shipments
  add constraint order_shipments_distributor_check check (distributor in (
    'innstyle', 'sasso', 'officecrave', 'starlinen', 'nps', 'imperial-brady', 'wraptite', 'bargoose', 'other'
  ));

-- Check: expect the new table, two vendor columns, and the wider constraint.
select
  to_regclass('public.freight_bookings') as freight_bookings,
  (select count(*) from information_schema.columns
    where table_name = 'vendors' and column_name in ('pickup_ready_time', 'pickup_close_time')) as vendor_cols;
