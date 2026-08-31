-- Freight is no longer shown live to the customer at checkout (that panel
-- is now staff-only, hidden from checkout.html) -- instead staff pull a
-- Warp quote (or set an in-house delivery fee) and bill it as a real line
-- item on the invoice they email out. This is that billable amount,
-- parallel to the existing in_house_delivery_fee column and handled the
-- same way everywhere it's used (admin.js, api/send-invoice.js): additive
-- to the taxable subtotal, its own invoice line, its own Stripe line item.
alter table public.orders
  add column if not exists freight_fee numeric(10,2) not null default 0;
