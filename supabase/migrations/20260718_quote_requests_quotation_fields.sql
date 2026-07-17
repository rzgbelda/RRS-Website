-- Add quotation snapshot fields to quote_requests
-- These allow the admin's finalized quote to be stored and shown to the customer

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS quote_number     text,
  ADD COLUMN IF NOT EXISTS quote_items      jsonb,
  ADD COLUMN IF NOT EXISTS valid_until      date,
  ADD COLUMN IF NOT EXISTS quote_message    text,
  ADD COLUMN IF NOT EXISTS quoted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS grand_total      numeric(10,2),
  ADD COLUMN IF NOT EXISTS subtotal         numeric(10,2),
  ADD COLUMN IF NOT EXISTS customer_visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at        timestamptz;

-- Partial unique index: quote_number must be unique when set
CREATE UNIQUE INDEX IF NOT EXISTS quote_requests_quote_number_key
  ON quote_requests(quote_number)
  WHERE quote_number IS NOT NULL;
