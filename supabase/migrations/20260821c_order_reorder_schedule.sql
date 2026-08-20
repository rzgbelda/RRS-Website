-- Turns the "Set Up Reorder" checkout option from an inert label into a
-- real recurring schedule. The order that starts a schedule IS the
-- subscription record (reorder_active = true, reorder_next_date = when the
-- next draft is due); the daily sweep in api/create-order.js clones it into
-- a new order, emails a payment link for that new order, and advances (or
-- closes out) this original row's schedule. Generated drafts carry
-- reorder_active = false (they don't independently keep spawning -- only
-- the original schedule progresses) and reorder_source_order_id pointing
-- back to it, so order history stays traceable.
alter table orders add column if not exists reorder_frequency text;
alter table orders add column if not exists reorder_next_date date;
alter table orders add column if not exists reorder_active boolean not null default false;
alter table orders add column if not exists reorder_custom_dates jsonb;
alter table orders add column if not exists reorder_source_order_id uuid references orders(id);
