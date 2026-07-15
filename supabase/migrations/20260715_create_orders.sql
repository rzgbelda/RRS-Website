-- Orders table for RRS e-commerce payments
create table if not exists public.orders (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  order_number             text not null unique,
  status                   text not null default 'processing'
                             check (status in ('processing','confirmed','shipped','delivered','cancelled','refunded')),
  payment_status           text not null default 'paid'
                             check (payment_status in ('pending','paid','requires_capture','captured','failed','refunded')),

  -- Stripe references
  stripe_payment_intent_id text,
  stripe_charge_id         text,

  -- Amounts (in cents stored as integers, but we store dollars as numeric for readability)
  amount_total             integer,        -- cents
  tax_amount               integer,        -- cents
  shipping_cost            integer,        -- cents, null until freight quoted
  currency                 text default 'usd',

  -- Customer
  customer_name            text,
  customer_email           text,
  business_name            text,
  phone                    text,
  user_id                  uuid references auth.users(id) on delete set null,

  -- Address
  shipping_address         jsonb,

  -- Order contents
  items                    jsonb not null default '[]',
  notes                    text,

  -- Order metadata
  order_type               text default 'one_time',  -- 'one_time' | 'reorder'
  referral_code            text,
  sub_distributor          text,
  po_number                text,
  shipping_status          text default 'awaiting_freight_quote',
  tracking_number          text,
  tracking_carrier         text
);

-- Index for quick admin lookups
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_email_idx on public.orders (customer_email);
create index if not exists orders_status_idx on public.orders (status);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Row-level security: service role bypasses all; anon/auth users cannot read orders
alter table public.orders enable row level security;

-- Only the service role (used by our serverless functions) can insert/read orders
create policy "service_role_all" on public.orders
  for all using (auth.role() = 'service_role');
