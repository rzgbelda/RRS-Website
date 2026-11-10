-- Cart restore for signed-in buyers: cart_mirror kept only sku/name/qty/price,
-- not enough to rebuild a cart line. `item` stores the whole line so the cart
-- comes back on another device or after browser storage is cleared.
-- Run in the Supabase SQL editor. Idempotent.
alter table public.cart_mirror add column if not exists item jsonb;
