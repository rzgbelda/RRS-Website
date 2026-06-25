-- ============================================================
-- Room Ready Supply — Full Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES  (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  business_name   text,
  business_type   text,
  contact_name    text,
  phone           text,
  role            text not null default 'customer',  -- 'customer' | 'admin'
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-create profile after signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, business_name, business_type, contact_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'business_name', ''),
    coalesce(new.raw_user_meta_data->>'business_type', ''),
    coalesce(new.raw_user_meta_data->>'contact_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- CATEGORIES
-- ============================================================
create table if not exists public.categories (
  id         uuid primary key default uuid_generate_v4(),
  name       text unique not null,
  slug       text unique not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

insert into public.categories (name, slug, sort_order) values
  ('Toilet Paper',           'toilet-paper',          1),
  ('Paper Towels',           'paper-towels',          2),
  ('Trash Liners',           'trash-liners',          3),
  ('Cleaning Chemicals',     'cleaning-chemicals',    4),
  ('Hand Soap',              'hand-soap',             5),
  ('Laundry Supplies',       'laundry-supplies',      6),
  ('Dishwashing Supplies',   'dishwashing-supplies',  7),
  ('Guest Room Supplies',    'guest-room-supplies',   8),
  ('Towels and Linens',      'towels-and-linens',     9),
  ('Food Service Supplies',  'food-service-supplies', 10),
  ('Facility Supplies',      'facility-supplies',     11)
on conflict do nothing;

-- ============================================================
-- PRODUCTS
-- ============================================================
create table if not exists public.products (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  sku           text unique,
  description   text,
  price         numeric(10,2) not null default 0,
  sale_price    numeric(10,2),
  is_on_sale    boolean not null default false,
  category_id   uuid references public.categories(id),
  category_name text,
  case_qty      integer default 1,
  pack_size     integer default 1,
  unit          text default 'Case',
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  image_url     text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- PRODUCT IMAGES (multiple per product, Supabase Storage)
-- ============================================================
create table if not exists public.product_images (
  id           uuid primary key default uuid_generate_v4(),
  product_id   uuid not null references public.products(id) on delete cascade,
  url          text not null,
  storage_path text,
  is_primary   boolean default false,
  sort_order   integer default 0,
  created_at   timestamptz default now()
);

-- ============================================================
-- INVENTORY
-- ============================================================
create table if not exists public.inventory (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  stock_qty  integer not null default 0,
  status     text not null default 'in_stock',  -- 'in_stock' | 'low_stock' | 'out_of_stock'
  updated_at timestamptz default now(),
  unique(product_id)
);

-- ============================================================
-- PAYMENT METHODS (admin-configurable)
-- ============================================================
create table if not exists public.payment_methods (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  code       text unique not null,
  is_enabled boolean not null default true,
  sort_order integer default 0
);

insert into public.payment_methods (name, code, is_enabled, sort_order) values
  ('Cash on Delivery',            'cod',           true,  1),
  ('Bank Transfer',               'bank_transfer', true,  2),
  ('Credit/Debit Card (Stripe)',  'stripe',        false, 3),
  ('PayPal',                      'paypal',        false, 4)
on conflict do nothing;

-- ============================================================
-- CARTS + CART ITEMS
-- ============================================================
create table if not exists public.carts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create table if not exists public.cart_items (
  id                uuid primary key default uuid_generate_v4(),
  cart_id           uuid not null references public.carts(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  name              text not null,
  price             numeric(10,2) not null,
  image_url         text,
  quantity          integer not null default 1,
  reorder_frequency text default 'Once',
  created_at        timestamptz default now(),
  unique(cart_id, product_id)
);

-- ============================================================
-- WISHLISTS + WISHLIST ITEMS
-- ============================================================
create table if not exists public.wishlists (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id)
);

create table if not exists public.wishlist_items (
  id          uuid primary key default uuid_generate_v4(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(wishlist_id, product_id)
);

-- ============================================================
-- SHIPPING ADDRESSES
-- ============================================================
create table if not exists public.shipping_addresses (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  business_name text,
  contact_name  text,
  phone         text,
  email         text,
  address_line1 text,
  city          text,
  state         text,
  zip           text,
  is_default    boolean default false,
  created_at    timestamptz default now()
);

-- ============================================================
-- ORDERS + ORDER ITEMS
-- ============================================================
create table if not exists public.orders (
  id                uuid primary key default uuid_generate_v4(),
  order_number      text unique not null default ('RRS-' || to_char(now(),'YYYYMMDD') || '-' || lpad((floor(random()*9000)+1000)::text,4,'0')),
  user_id           uuid references auth.users(id),
  customer_name     text,
  customer_email    text,
  business_name     text,
  phone             text,
  shipping_address  jsonb,
  order_type        text default 'one_time',
  reorder_frequency text,
  subtotal          numeric(10,2) default 0,
  total             numeric(10,2) default 0,
  status            text not null default 'pending',
  payment_method    text,
  payment_status    text default 'pending',
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.order_items (
  id         uuid primary key default uuid_generate_v4(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  name       text not null,
  price      numeric(10,2) not null,
  quantity   integer not null default 1,
  subtotal   numeric(10,2) not null
);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table if not exists public.payments (
  id             uuid primary key default uuid_generate_v4(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  method         text not null,
  amount         numeric(10,2) not null,
  status         text not null default 'pending',
  transaction_id text,
  created_at     timestamptz default now()
);

-- ============================================================
-- CUSTOMER ACTIVITY
-- ============================================================
create table if not exists public.customer_activity (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade,
  action     text not null,
  details    jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- STORAGE BUCKET for product images
-- Run separately if the bucket doesn't exist yet:
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- PROFILES
alter table public.profiles enable row level security;
create policy "own_profile_read"   on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "own_profile_update" on public.profiles for update using (auth.uid() = id);
create policy "admin_all_profiles" on public.profiles for all using (public.is_admin());

-- CATEGORIES (public read)
alter table public.categories enable row level security;
create policy "public_read_categories" on public.categories for select using (true);
create policy "admin_manage_categories" on public.categories for all using (public.is_admin());

-- PRODUCTS (public read active; admin full)
alter table public.products enable row level security;
create policy "public_read_active_products" on public.products for select using (is_active = true or public.is_admin());
create policy "admin_manage_products" on public.products for all using (public.is_admin());

-- PRODUCT IMAGES
alter table public.product_images enable row level security;
create policy "public_read_images" on public.product_images for select using (true);
create policy "admin_manage_images" on public.product_images for all using (public.is_admin());

-- INVENTORY
alter table public.inventory enable row level security;
create policy "public_read_inventory" on public.inventory for select using (true);
create policy "admin_manage_inventory" on public.inventory for all using (public.is_admin());

-- PAYMENT METHODS
alter table public.payment_methods enable row level security;
create policy "public_read_enabled_methods" on public.payment_methods for select using (is_enabled = true or public.is_admin());
create policy "admin_manage_methods" on public.payment_methods for all using (public.is_admin());

-- CARTS
alter table public.carts enable row level security;
create policy "own_cart" on public.carts for all using (auth.uid() = user_id);

alter table public.cart_items enable row level security;
create policy "own_cart_items" on public.cart_items for all using (
  exists (select 1 from public.carts c where c.id = cart_items.cart_id and c.user_id = auth.uid())
);

-- WISHLISTS
alter table public.wishlists enable row level security;
create policy "own_wishlist" on public.wishlists for all using (auth.uid() = user_id);

alter table public.wishlist_items enable row level security;
create policy "own_wishlist_items" on public.wishlist_items for all using (
  exists (select 1 from public.wishlists w where w.id = wishlist_items.wishlist_id and w.user_id = auth.uid())
);

-- SHIPPING ADDRESSES
alter table public.shipping_addresses enable row level security;
create policy "own_addresses" on public.shipping_addresses for all using (auth.uid() = user_id);
create policy "admin_view_addresses" on public.shipping_addresses for select using (public.is_admin());

-- ORDERS
alter table public.orders enable row level security;
create policy "own_orders_read"   on public.orders for select using (auth.uid() = user_id or public.is_admin());
create policy "create_order"      on public.orders for insert with check (auth.uid() = user_id or user_id is null);
create policy "admin_manage_orders" on public.orders for all using (public.is_admin());

alter table public.order_items enable row level security;
create policy "own_order_items"       on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid())
  or public.is_admin()
);
create policy "insert_order_items"    on public.order_items for insert with check (true);
create policy "admin_manage_order_items" on public.order_items for all using (public.is_admin());

-- PAYMENTS
alter table public.payments enable row level security;
create policy "own_payments"      on public.payments for select using (
  exists (select 1 from public.orders o where o.id = payments.order_id and o.user_id = auth.uid())
  or public.is_admin()
);
create policy "insert_payment"    on public.payments for insert with check (true);
create policy "admin_manage_payments" on public.payments for all using (public.is_admin());

-- CUSTOMER ACTIVITY
alter table public.customer_activity enable row level security;
create policy "own_activity" on public.customer_activity for select using (auth.uid() = user_id or public.is_admin());
create policy "insert_activity" on public.customer_activity for insert with check (auth.uid() = user_id);

-- ============================================================
-- STORAGE POLICY (run after creating the bucket)
-- ============================================================
-- create policy "public_read_images"  on storage.objects for select using (bucket_id = 'product-images');
-- create policy "admin_upload_images" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_admin());
-- create policy "admin_delete_images" on storage.objects for delete using (bucket_id = 'product-images' and public.is_admin());
