-- Lets a Payment Terms Agreement sent from an ORDER (not just a quote) be
-- tracked back to that order, mirroring the existing quote_requests
-- pattern exactly (terms_status/terms_sent_at/terms_accepted_at/terms_token)
-- so the order modal can show the same "Sent -- Awaiting Response" /
-- "Accepted" badge quotes already have. Previously there was no order_id
-- column on terms_agreements at all, so an order-initiated agreement's
-- acceptance had nowhere to be recorded against the order.
alter table terms_agreements add column if not exists order_id uuid references orders(id);

alter table orders add column if not exists terms_status text;
alter table orders add column if not exists terms_sent_at timestamptz;
alter table orders add column if not exists terms_accepted_at timestamptz;
alter table orders add column if not exists terms_token text;
