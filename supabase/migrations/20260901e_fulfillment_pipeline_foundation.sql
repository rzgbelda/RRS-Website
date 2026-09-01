-- Priority 3 (Automated Fulfillment Pipeline) -- the pieces buildable
-- without a live vendor API/inventory feed, which nothing RRS has yet
-- (see this week's vendor research: Warp is a freight carrier, not a
-- supplier; American Blossom Linens has no order-push API on either
-- Shopify Collective or Faire). Access gated the same way orders already
-- are (is_admin() [owner] or is_marketing()) -- narrow Admin and
-- Developer have no reason to see vendor/fulfillment data, matching
-- ADMIN_ROLE_TABS not including "orders" today either.

-- ============================================================
-- VENDORS -- the roster Jonas onboards into, referenced by both the PO
-- email flow and (once tagged onto real products) the per-vendor
-- delivery-estimate split at checkout.
-- ============================================================
create table if not exists public.vendors (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  contact_name     text,
  contact_email    text not null,
  contact_phone    text,
  category         text,   -- free text, e.g. "Linens", "Personal Care", "Paper Products" -- matches the memo's channel groupings, not a hard enum
  estimated_ship_days integer not null default 3,
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace function public.vendors_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists vendors_before_update on public.vendors;
create trigger vendors_before_update
  before update on public.vendors
  for each row execute function public.vendors_set_updated_at();

alter table public.vendors enable row level security;
drop policy if exists "staff_manage_vendors" on public.vendors;
create policy "staff_manage_vendors" on public.vendors
  for all using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- Optional: tags a product as fulfilled by a specific vendor rather than
-- shipped from RRS's own warehouse. Null (the default, and every existing
-- row today) means "ships from RRS" -- exactly current behavior,
-- unchanged for every product until staff deliberately tag one.
alter table public.products
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null;

-- ============================================================
-- INVENTORY HOLDS -- the "soft cart hold" the memo asks for. Reserves
-- against RRS's own inventory.stock_qty (the only stock data that
-- actually exists -- a live vendor feed is the blocked half of Stage 1)
-- for a short window while a customer is in checkout, so two people
-- paying for the last unit within seconds of each other can't both
-- succeed. Written by an unauthenticated checkout session, same as
-- orders already allows (create_order policy, 20260806b) -- there is no
-- login gate at checkout, so this can't require one either.
-- ============================================================
create table if not exists public.inventory_holds (
  id            uuid primary key default gen_random_uuid(),
  session_token text not null,  -- client-generated (crypto.randomUUID()), correlates every hold from one checkout attempt before an order exists
  sku           text not null,
  quantity      integer not null check (quantity > 0),
  order_id      uuid references public.orders(id) on delete cascade,  -- set once payment succeeds and a real order exists; null while just held
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists inventory_holds_sku_idx     on public.inventory_holds(sku);
create index if not exists inventory_holds_session_idx on public.inventory_holds(session_token);
create index if not exists inventory_holds_expires_idx on public.inventory_holds(expires_at);

alter table public.inventory_holds enable row level security;

-- Public insert/select/delete scoped to holds you created (matched by
-- session_token, not user_id -- checkout has no login requirement).
-- There is no update policy: a hold is either released (deleted) or
-- attached to a real order (which the checkout API does with the
-- service-role key, bypassing RLS entirely, same pattern
-- api/stripe-webhook.js already uses for orders).
drop policy if exists "public_create_holds" on public.inventory_holds;
create policy "public_create_holds" on public.inventory_holds
  for insert with check (true);

drop policy if exists "public_read_own_holds" on public.inventory_holds;
create policy "public_read_own_holds" on public.inventory_holds
  for select using (true);

drop policy if exists "public_release_own_holds" on public.inventory_holds;
create policy "public_release_own_holds" on public.inventory_holds
  for delete using (true);

drop policy if exists "staff_manage_holds" on public.inventory_holds;
create policy "staff_manage_holds" on public.inventory_holds
  for all using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- ============================================================
-- ORDER EXCEPTIONS -- the queue the memo asks for ("route the order to
-- an automated exception queue tagged with a reason code... rather than
-- stalling system queues"). Two ways a row lands here today: an
-- automatic flag from the soft stock check at checkout (reason code
-- 'possible_stockout' -- "possible" because RRS's own inventory numbers
-- aren't independently verified against a live vendor feed yet, so this
-- surfaces a signal for staff to check rather than silently blocking a
-- real customer's payment on data that might be stale), or a manual flag
-- staff raise from the order screen for anything else that needs
-- attention before fulfillment proceeds.
-- ============================================================
create table if not exists public.order_exceptions (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  reason_code  text not null check (reason_code in ('possible_stockout','supplier_stockout','vendor_unresponsive','address_issue','other')),
  note         text,
  status       text not null default 'open' check (status in ('open','resolved')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id) on delete set null
);

create index if not exists order_exceptions_order_idx  on public.order_exceptions(order_id);
create index if not exists order_exceptions_status_idx on public.order_exceptions(status);

alter table public.order_exceptions enable row level security;
drop policy if exists "staff_manage_order_exceptions" on public.order_exceptions;
create policy "staff_manage_order_exceptions" on public.order_exceptions
  for all using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());

-- The checkout flow itself needs to be able to raise a possible_stockout
-- exception for a guest with no session -- same reasoning as
-- inventory_holds' public insert policy. Read/update stay staff-only.
drop policy if exists "public_raise_exception" on public.order_exceptions;
create policy "public_raise_exception" on public.order_exceptions
  for insert with check (reason_code = 'possible_stockout');

-- ============================================================
-- VENDOR PURCHASE ORDERS -- a record of every PO PDF actually emailed to
-- a vendor, so staff can see at a glance whether an order's linen/
-- personal-care lines have already been sent out, instead of re-sending
-- (or forgetting to) by memory.
-- ============================================================
create table if not exists public.vendor_purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  vendor_id     uuid not null references public.vendors(id) on delete restrict,
  po_number     text not null,
  line_items    jsonb not null,  -- snapshot of what was sent: [{sku, name, quantity}], no pricing -- "neutral packing slip" per the memo
  sent_to_email text not null,
  sent_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists vendor_pos_order_idx  on public.vendor_purchase_orders(order_id);
create index if not exists vendor_pos_vendor_idx on public.vendor_purchase_orders(vendor_id);

alter table public.vendor_purchase_orders enable row level security;
drop policy if exists "staff_manage_vendor_pos" on public.vendor_purchase_orders;
create policy "staff_manage_vendor_pos" on public.vendor_purchase_orders
  for all using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());
