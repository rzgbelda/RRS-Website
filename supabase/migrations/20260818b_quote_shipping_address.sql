-- Full shipping address on quotes, not just the state added for tax.
-- Neither the public "Request a Quote" form nor the admin manual-quote
-- entry has ever captured street/city/zip -- confirmed by reading both
-- submission paths, not assumed. Without it, a quote-based order (as
-- opposed to a regular cart checkout, which already collects a full
-- address) has nowhere for fulfillment to ship to.
alter table public.quote_requests
  add column if not exists shipping_street text,
  add column if not exists shipping_city text,
  add column if not exists shipping_zip text;
