-- Visitor footprint tracking + server-side cart persistence for abandoned-
-- cart recovery emails. Two independent pieces, one migration:
--
-- 1. page_events: every meaningful step of a visitor's path through the
--    site (page_view / catalog_view / product_view / add_to_cart /
--    checkout_start / checkout_complete), keyed by a client-generated
--    session_id so anonymous browsing is trackable, with user_id filled
--    in once/if that visitor is logged in. This is what lets admin answer
--    "where do visitors actually drop off" -- GA4 (script.js's existing
--    trackEcommerce()) sends the same moments to Google, but nothing was
--    ever stored in our own database, so it could never be queried from
--    admin or joined against our own orders/accounts.
--
-- 2. cart_items: the cart itself is localStorage-only today (script.js's
--    getCart()/saveCart()) -- it has never existed anywhere the backend
--    can see it. A cron sweep cannot detect an "abandoned cart" that only
--    ever lived in one visitor's browser. This table is a server-side
--    mirror, synced from the client on every cart mutation for signed-in
--    users only (an anonymous cart has no email to send a reminder to,
--    so there is nothing to gain from mirroring it). Keyed on product sku
--    (text), matching the shape the cart array already uses everywhere
--    client-side (item.itemNumber / item.sku) rather than introducing a
--    uuid FK the cart object doesn't carry.

-- ============================================================
-- PAGE_EVENTS
-- ============================================================
create table if not exists public.page_events (
  id            bigint generated always as identity primary key,
  session_id    uuid not null,
  user_id       uuid references auth.users(id) on delete set null,
  event_type    text not null check (event_type in
    ('page_view','catalog_view','product_view','add_to_cart','checkout_start','checkout_complete')),
  path          text not null,
  product_sku   text,
  referrer      text,
  occurred_at   timestamptz not null default now()
);

-- Funnel/drop-off queries group by session and scan a date range; event
-- lookups for a specific visitor filter by user_id across all sessions.
create index if not exists page_events_session_idx on public.page_events(session_id, occurred_at);
create index if not exists page_events_user_idx    on public.page_events(user_id) where user_id is not null;
create index if not exists page_events_occurred_idx on public.page_events(occurred_at);

alter table public.page_events enable row level security;

-- Write-only from the browser (anon or logged-in) -- a visitor may only
-- ever create their own footprint, never read anyone's, including their
-- own: the admin funnel view reads through the service role from the cron
-- dispatch endpoint, same pattern as campaign_email_events.
drop policy if exists "public_can_log_events" on public.page_events;
create policy "public_can_log_events"
  on public.page_events for insert
  to anon, authenticated
  with check (true);

drop policy if exists "crm_staff_read_events" on public.page_events;
create policy "crm_staff_read_events"
  on public.page_events for select
  using (public.is_crm_staff());

-- ============================================================
-- CART_ITEMS -- server-side mirror of a signed-in user's cart.
-- ============================================================
create table if not exists public.cart_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  product_sku   text not null,
  product_name  text not null,
  quantity      integer not null check (quantity > 0),
  price_snapshot numeric(10,2) not null default 0,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, product_sku)
);

create index if not exists cart_items_updated_idx on public.cart_items(updated_at);

create or replace function public.cart_items_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists cart_items_before_update on public.cart_items;
create trigger cart_items_before_update
  before update on public.cart_items
  for each row execute function public.cart_items_set_updated_at();

alter table public.cart_items enable row level security;

-- A signed-in user may only ever read/write their own mirrored cart --
-- this table backs a marketing reminder, not a cart-restore feature, but
-- there's no reason to make it readable beyond its owner and staff.
drop policy if exists "user_manages_own_cart" on public.cart_items;
create policy "user_manages_own_cart"
  on public.cart_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "crm_staff_read_cart_items" on public.cart_items;
create policy "crm_staff_read_cart_items"
  on public.cart_items for select
  using (public.is_crm_staff());

-- ============================================================
-- AUTOMATIONS: extend the existing trigger_type check constraint
-- (20260901f_campaign_email_tracking_and_automations.sql) with
-- 'cart_abandoned' -- reuses that table's existing delay_days/is_active
-- machinery and automation_sends' idempotent queue rather than adding a
-- parallel table. target_type on automation_sends also needs a third
-- value ('cart_user') since this trigger's target is a user_id, not a
-- quote_requests or orders row.
-- ============================================================
alter table public.automations drop constraint if exists automations_trigger_type_check;
alter table public.automations add constraint automations_trigger_type_check
  check (trigger_type in ('crm_lead_created','quote_stale','order_delivered','cart_abandoned'));

alter table public.automation_sends drop constraint if exists automation_sends_target_type_check;
alter table public.automation_sends add constraint automation_sends_target_type_check
  check (target_type in ('quote_request','order','cart_user'));

-- cart_abandoned's eligibility depends on stale_after_days (hours would be
-- more natural for carts, but reusing the existing days column -- already
-- present on automations -- avoids a parallel "hours" column just for one
-- trigger type; fractional values like 0.25 (6 hours) work fine as-is).
comment on column public.automations.stale_after_days is
  'quote_stale: days with no order before nudging. cart_abandoned: days (fractional allowed, e.g. 0.25 = 6h) since last cart activity before nudging.';

-- A real, ready-to-use default (same is_active: false pattern as the
-- order_delivered default in 20260902b) so staff can read/edit the copy
-- and confirm timing before this starts emailing real customers.
insert into public.automations (name, trigger_type, stale_after_days, delay_days, subject, body_html, is_active)
select
  'Abandoned Cart Reminder',
  'cart_abandoned',
  0.25, -- 6 hours
  0,
  'You left something in your cart, {{first_name}}',
  '<p>Hi {{first_name}},</p>' ||
  '<p>You still have items waiting in your Room Ready Supply cart:</p>' ||
  '<p>{{cart_items}}</p>' ||
  '<p><strong>Cart total: {{cart_value}}</strong></p>' ||
  '<p><a href="https://www.roomreadysupply.com/cart">Return to your cart &rarr;</a></p>' ||
  '<p>Thank you,<br>Room Ready Supply</p>',
  false
where not exists (
  select 1 from public.automations where trigger_type = 'cart_abandoned'
);
