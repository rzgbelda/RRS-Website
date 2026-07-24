-- Add Estes BOL / PRO number columns to orders table
alter table public.orders
  add column if not exists bol_number  text,
  add column if not exists pro_number  text,
  add column if not exists bol_created_at timestamptz;
