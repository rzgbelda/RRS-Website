-- Run this in Supabase Dashboard → SQL Editor
-- Creates the price_beat_requests table for the "Price Beat" lead capture page.
-- Modeled on contact_inquiries (public insert, admin-only read/update).

CREATE TABLE IF NOT EXISTS public.price_beat_requests (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz DEFAULT now(),
  contact_name      text NOT NULL,
  business_name     text NOT NULL,
  email             text NOT NULL,
  items             jsonb NOT NULL, -- [{ description, current_price }], 1-3 entries
  notes             text,
  sub_distributor_id uuid REFERENCES public.sub_distributors(id),
  status            text NOT NULL DEFAULT 'new'
);

ALTER TABLE public.price_beat_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (public insert) -- matches contact_inquiries; the
-- insert itself goes through the price-beat-request edge function using
-- the service-role key, but this policy also covers a direct client insert
-- if the function is ever bypassed.
CREATE POLICY "Public can submit price beat requests"
  ON public.price_beat_requests FOR INSERT
  WITH CHECK (true);

-- Only admins can read / update
CREATE POLICY "Admins can manage price beat requests"
  ON public.price_beat_requests FOR ALL
  USING (public.is_admin());
