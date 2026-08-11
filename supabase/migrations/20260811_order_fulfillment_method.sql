-- Reported live: an invoice-created order for a customer who is actually
-- picking up in person at the warehouse got sent through the Estes rate
-- flow with a real address, purely because there was no other option.
-- Every order implicitly assumed shipping.
--
-- Default 'ship' so every existing order keeps its current behavior
-- untouched; only new checkout selections and explicit admin edits ever
-- write 'pickup'.
alter table public.orders
  add column if not exists fulfillment_method text not null default 'ship';
