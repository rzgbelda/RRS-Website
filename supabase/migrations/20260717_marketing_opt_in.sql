-- Add marketing opt-in fields to profiles and quote_requests
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_in    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT true;
