-- ============================================================
-- ROOM READY SUPPLY — SUPABASE DATABASE SCHEMA
-- ============================================================

-- EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- USERS & PROFILES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text default 'customer' check (role in ('customer','admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- CATEGORIES
-- ============================================================

create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- PRODUCTS
-- ============================================================

create table public.products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  pack_size text,
  case_quantity text,
  price_per_case numeric(10,2),
  price_display text default 'Request Pricing',
  min_order_quantity int default 1,
  delivery_notes text,
  stock_status text default 'in_stock' check (stock_status in ('in_stock','low_stock','out_of_stock')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- PRODUCT IMAGES
-- ============================================================

create table public.product_images (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references public.products(id) on delete cascade,
  url text not null,
  alt_text text,
  is_primary boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- ADDRESSES
-- ============================================================

create table public.addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  business_name text,
  contact_name text,
  street text not null,
  city text not null,
  state text,
  zip text,
  phone text,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- CUSTOMER SUPPLY LISTS
-- ============================================================

create table public.customer_supply_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default 'My Supply List',
  items jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- ORDERS
-- ============================================================

create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  order_number text unique not null default concat('ORD-', to_char(nextval('order_seq'), 'FM000000')),
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  delivery_address jsonb,
  order_type text default 'one_time' check (order_type in ('one_time','reorder')),
  status text default 'new' check (status in ('new','confirmed','processing','delivered','cancelled')),
  notes text,
  total_estimate numeric(10,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create sequence if not exists order_seq start 1;

-- ============================================================
-- ORDER ITEMS
-- ============================================================

create table public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity int not null default 1,
  price_per_case numeric(10,2),
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- REORDER SCHEDULES
-- ============================================================

create table public.reorder_schedules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  frequency text not null check (frequency in ('weekly','biweekly','monthly','45_days','60_days','custom')),
  custom_frequency text,
  supply_list jsonb default '[]',
  next_order_date date,
  start_date date,
  status text default 'active' check (status in ('active','paused','cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- REORDER REMINDERS
-- ============================================================

create table public.reorder_reminders (
  id uuid primary key default uuid_generate_v4(),
  schedule_id uuid references public.reorder_schedules(id) on delete cascade,
  reminder_date date not null,
  sent_at timestamptz,
  customer_action text check (customer_action in ('approved','edited','skipped','pending')),
  action_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- QUOTE REQUESTS
-- ============================================================

create table public.quote_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  quote_number text unique not null default concat('QT-', to_char(nextval('quote_seq'), 'FM000000')),
  business_name text not null,
  customer_type text not null,
  contact_name text not null,
  phone text,
  email text not null,
  current_supplier text,
  regular_products text,
  monthly_usage text,
  notes text,
  invoice_url text,
  status text default 'new' check (status in ('new','under_review','quoted','completed','declined')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create sequence if not exists quote_seq start 1;

-- ============================================================
-- UPLOADED INVOICES
-- ============================================================

create table public.uploaded_invoices (
  id uuid primary key default uuid_generate_v4(),
  quote_request_id uuid references public.quote_requests(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null,
  file_url text not null,
  file_size int,
  mime_type text,
  uploaded_at timestamptz default now()
);

-- ============================================================
-- ADMIN USERS
-- ============================================================

create table public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  permissions jsonb default '{"products":true,"orders":true,"quotes":true,"customers":true,"reorders":true}',
  created_at timestamptz default now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('order_confirmation','quote_confirmation','reorder_reminder','admin_new_order','admin_new_quote','admin_new_reorder')),
  title text not null,
  message text,
  reference_id uuid,
  reference_type text,
  is_read boolean default false,
  sent_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_products_category on public.products(category_id);
create index idx_products_active on public.products(is_active);
create index idx_orders_user on public.orders(user_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_created on public.orders(created_at desc);
create index idx_order_items_order on public.order_items(order_id);
create index idx_quote_requests_status on public.quote_requests(status);
create index idx_reorder_schedules_user on public.reorder_schedules(user_id);
create index idx_reorder_schedules_status on public.reorder_schedules(status);
create index idx_notifications_user_unread on public.notifications(user_id, is_read);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.quote_requests enable row level security;
alter table public.reorder_schedules enable row level security;
alter table public.reorder_reminders enable row level security;
alter table public.customer_supply_lists enable row level security;
alter table public.addresses enable row level security;
alter table public.notifications enable row level security;
alter table public.uploaded_invoices enable row level security;

-- PUBLIC READ: products & categories
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.product_images enable row level security;

create policy "Anyone can view active products"
  on public.products for select using (is_active = true);

create policy "Anyone can view categories"
  on public.categories for select using (true);

create policy "Anyone can view product images"
  on public.product_images for select using (true);

-- PROFILES
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ORDERS
create policy "Users can view own orders"
  on public.orders for select using (auth.uid() = user_id);
create policy "Users can create orders"
  on public.orders for insert with check (auth.uid() = user_id or user_id is null);

-- ORDER ITEMS
create policy "Users can view own order items"
  on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- QUOTE REQUESTS
create policy "Users can view own quotes"
  on public.quote_requests for select using (auth.uid() = user_id);
create policy "Anyone can create quote requests"
  on public.quote_requests for insert with check (true);

-- REORDER SCHEDULES
create policy "Users can view own reorders"
  on public.reorder_schedules for select using (auth.uid() = user_id);
create policy "Users can create reorders"
  on public.reorder_schedules for insert with check (auth.uid() = user_id);
create policy "Users can update own reorders"
  on public.reorder_schedules for update using (auth.uid() = user_id);

-- SUPPLY LISTS
create policy "Users can manage own supply lists"
  on public.customer_supply_lists for all using (auth.uid() = user_id);

-- ADDRESSES
create policy "Users can manage own addresses"
  on public.addresses for all using (auth.uid() = user_id);

-- NOTIFICATIONS
create policy "Users can view own notifications"
  on public.notifications for select using (auth.uid() = user_id);
create policy "Users can update own notifications"
  on public.notifications for update using (auth.uid() = user_id);

-- ============================================================
-- ADMIN POLICIES (via role check)
-- ============================================================

create policy "Admins can view all orders"
  on public.orders for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can update all orders"
  on public.orders for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can view all quotes"
  on public.quote_requests for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can update all quotes"
  on public.quote_requests for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins can manage products"
  on public.products for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
-- SEED DATA — CATEGORIES
-- ============================================================

insert into public.categories (name, slug, sort_order) values
  ('Toilet Paper', 'toilet-paper', 1),
  ('Paper Towels', 'paper-towels', 2),
  ('Trash Liners', 'trash-liners', 3),
  ('Cleaning Chemicals', 'cleaning-chemicals', 4),
  ('Hand Soap', 'hand-soap', 5),
  ('Laundry Supplies', 'laundry-supplies', 6),
  ('Dishwashing Supplies', 'dishwashing-supplies', 7),
  ('Guest Room Supplies', 'guest-room-supplies', 8),
  ('Towels and Linens', 'towels-and-linens', 9),
  ('Food Service Supplies', 'food-service-supplies', 10),
  ('Facility Supplies', 'facility-supplies', 11);

-- ============================================================
-- SEED DATA — PRODUCTS
-- ============================================================

insert into public.products (category_id, name, slug, description, pack_size, case_quantity, price_display, stock_status)
select c.id, p.name, p.slug, p.description, p.pack_size, p.case_quantity, p.price_display, 'in_stock'
from public.categories c
cross join (values
  ('Toilet Paper', 'Standard Toilet Paper Roll', 'standard-toilet-paper', '2-ply standard rolls for high-traffic hospitality environments.', '2-Ply', '96 Rolls/Case', 'Request Pricing'),
  ('Toilet Paper', 'Jumbo Toilet Paper Roll', 'jumbo-toilet-paper', 'High-capacity jumbo rolls for commercial restrooms.', '2-Ply Jumbo', '12 Rolls/Case', 'Request Pricing'),
  ('Paper Towels', 'C-Fold Paper Towels', 'c-fold-paper-towels', 'Classic C-fold towels for dispensers in hospitality settings.', '200 Sheets/Pack', '12 Packs/Case', 'Request Pricing'),
  ('Paper Towels', 'Multifold Paper Towels', 'multifold-paper-towels', 'Multifold format for touch-free dispenser compatibility.', '250 Sheets/Pack', '16 Packs/Case', 'Request Pricing'),
  ('Trash Liners', 'Kitchen Trash Liners', 'kitchen-trash-liners-30gal', 'Durable 30-gallon liners for kitchen and hallway bins.', '30 Gallon', '200/Case', 'Request Pricing'),
  ('Trash Liners', 'Heavy Duty Can Liners', 'heavy-duty-liners-55gal', 'Extra-thick 55-gallon liners for outdoor and industrial bins.', '55 Gallon', '100/Case', 'Request Pricing'),
  ('Cleaning Chemicals', 'All-Purpose Cleaner', 'all-purpose-cleaner', 'Versatile cleaner suitable for most hospitality surfaces.', '1 Gallon', '4/Case', 'Request Pricing'),
  ('Cleaning Chemicals', 'Disinfectant Spray', 'disinfectant-spray', 'EPA-registered disinfectant for guest rooms and common areas.', '32 oz', '12/Case', 'Request Pricing'),
  ('Hand Soap', 'Foaming Hand Soap', 'foaming-hand-soap-1000ml', 'Gentle foaming formula compatible with most dispensers.', '1000 mL', '6/Case', 'Request Pricing'),
  ('Hand Soap', 'Liquid Hand Soap', 'liquid-hand-soap-800ml', 'Classic liquid soap for countertop and wall dispensers.', '800 mL', '12/Case', 'Request Pricing'),
  ('Laundry Supplies', 'Commercial Laundry Detergent', 'commercial-laundry-detergent', 'Heavy-duty formula for linens, towels, and hospitality laundry.', '5 Gallon', '1/Case', 'Request Pricing'),
  ('Laundry Supplies', 'Fabric Softener Sheets', 'fabric-softener-sheets', 'Dryer sheets to reduce static and add freshness to linens.', '200 Sheets', '6/Case', 'Request Pricing'),
  ('Dishwashing Supplies', 'Dishwashing Liquid', 'dishwashing-liquid', 'Commercial-grade dish liquid for sinks and food service operations.', '1 Gallon', '4/Case', 'Request Pricing'),
  ('Dishwashing Supplies', 'Commercial Rinse Aid', 'commercial-rinse-aid', 'Speeds drying and eliminates spotting on glassware and dishes.', '1 Gallon', '4/Case', 'Request Pricing'),
  ('Guest Room Supplies', 'Hotel Shampoo Bottles', 'hotel-shampoo-1oz', 'Single-use hotel shampoo in 1 oz bottles for guest rooms.', '1 oz', '144/Case', 'Request Pricing'),
  ('Guest Room Supplies', 'Body Lotion Bottles', 'body-lotion-1oz', 'Gentle moisturizing lotion packaged for guest room amenity kits.', '1 oz', '144/Case', 'Request Pricing'),
  ('Towels and Linens', 'Bath Towels', 'bath-towels', 'Durable hospitality bath towels, bleach-friendly, quick-dry weave.', '27" x 54"', '12/Case', 'Request Pricing'),
  ('Towels and Linens', 'Hand Towels', 'hand-towels', 'Compact hand towels for guest bathrooms and gym areas.', '16" x 30"', '12/Case', 'Request Pricing'),
  ('Food Service Supplies', 'Disposable Gloves', 'disposable-gloves-medium', 'Food-safe disposable gloves for food prep and service.', 'Medium', '1000/Case', 'Request Pricing'),
  ('Food Service Supplies', 'Deli Wrap Paper', 'deli-wrap-paper', 'Grease-resistant wrap paper for sandwiches and food items.', '12" x 12"', '1000/Case', 'Request Pricing'),
  ('Facility Supplies', 'Mop Heads', 'mop-heads-24oz', 'Commercial cotton mop heads, machine washable.', '24 oz', '12/Case', 'Request Pricing'),
  ('Facility Supplies', 'Floor Cleaner', 'floor-cleaner-1gal', 'Heavy-duty floor cleaner for tile, vinyl, and sealed concrete.', '1 Gallon', '4/Case', 'Request Pricing')
) as p(category_name, name, slug, description, pack_size, case_quantity, price_display)
where c.name = p.category_name;
