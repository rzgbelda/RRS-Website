-- Add shipping label and tracking columns to orders table
alter table public.orders
  add column if not exists tracking_number    text,
  add column if not exists label_url          text,
  add column if not exists tracking_url       text,
  add column if not exists shipping_carrier   text,
  add column if not exists label_purchased_at timestamptz;
