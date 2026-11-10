-- Checkout failure log (Eric's Part B, B4): every time a buyer hits an error
-- in checkout/payment, record what happened, when, and which cart -- shown in
-- Admin > Visitor Insights > "Checkout failures".
-- Write-only from the browser (anon + signed-in), read by CRM staff only.
-- Run in the Supabase SQL editor. Idempotent.
create table if not exists public.checkout_failures (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  session_id  uuid,
  user_id     uuid references auth.users(id) on delete set null,
  stage       text not null,            -- e.g. payment, delivery_quote, order_submit
  message     text not null,            -- what the buyer saw / the error text
  path        text,
  email       text,
  zip         text,
  cart        jsonb,                    -- the cart lines at the time
  cart_total  numeric(12,2),
  user_agent  text
);
create index if not exists checkout_failures_when_idx on public.checkout_failures(occurred_at desc);

alter table public.checkout_failures enable row level security;

drop policy if exists "public_can_log_checkout_failures" on public.checkout_failures;
create policy "public_can_log_checkout_failures"
  on public.checkout_failures for insert
  to anon, authenticated
  with check (true);

drop policy if exists "crm_staff_read_checkout_failures" on public.checkout_failures;
create policy "crm_staff_read_checkout_failures"
  on public.checkout_failures for select
  using (public.is_crm_staff());
