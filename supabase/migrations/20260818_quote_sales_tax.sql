-- Sales tax on quotes/invoices, applied by the customer's shipping state.
-- quote_requests has never captured any address/state field at all (see
-- research before this migration -- confirmed live via a direct schema
-- query, not assumed). shipping_state is picked in the admin Quote
-- Composer when building a quote. tax_rate and tax_amount are snapshotted
-- at send time (mirroring how subtotal/grand_total already work) rather
-- than recomputed live on every read, so a later change to the site's
-- rate table never silently changes what an already-sent quote says it
-- charged.
alter table public.quote_requests
  add column if not exists shipping_state text,
  add column if not exists tax_rate numeric(6,4) not null default 0,
  add column if not exists tax_amount numeric(10,2) not null default 0;
