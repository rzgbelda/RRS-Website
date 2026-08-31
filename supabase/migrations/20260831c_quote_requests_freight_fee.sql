-- Same freight-fee concept as orders.freight_fee
-- (20260831b_orders_freight_fee.sql), just for a quote/invoice built from
-- the admin "Build Quotation" composer BEFORE an order exists -- staff
-- pull a Warp quote there too and it needs somewhere to land on the quote
-- snapshot, same as in_house_delivery_fee already does.
alter table public.quote_requests
  add column if not exists freight_fee numeric(10,2) not null default 0;
