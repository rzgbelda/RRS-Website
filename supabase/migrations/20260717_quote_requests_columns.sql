-- Ensure quote_requests has all columns needed for marketing & tracking
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS user_id       uuid,
  ADD COLUMN IF NOT EXISTS customer_type text,
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS file_url      text,
  ADD COLUMN IF NOT EXISTS file_name     text,
  ADD COLUMN IF NOT EXISTS phone_number  text;

-- Normalize status default to 'pending'
ALTER TABLE quote_requests
  ALTER COLUMN status SET DEFAULT 'pending';
