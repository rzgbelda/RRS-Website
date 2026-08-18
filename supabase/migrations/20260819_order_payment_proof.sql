-- Real proof of payment on orders. Until now, payment_status:'paid' was
-- purely a flag api/stripe-webhook.js flips -- confirmed live: orders has
-- no stripe_* columns at all (a known drift from an earlier migration
-- file that was never actually run), so there was nothing stored to point
-- to as evidence a charge really happened. This adds a real reference
-- back to the actual Stripe transaction so "Paid" is something you can
-- click through and verify, not just trust.
alter table public.orders
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists receipt_url text,
  add column if not exists stripe_livemode boolean,
  add column if not exists paid_at timestamptz;
