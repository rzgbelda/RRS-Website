-- Run this in Supabase Dashboard → SQL Editor
-- Creates the contact_inquiries table for the Contact Us lead capture form

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at              timestamptz DEFAULT now(),
  first_name              text NOT NULL,
  last_name               text NOT NULL,
  company_name            text NOT NULL,
  business_type           text,
  number_of_locations     text,
  email                   text NOT NULL,
  phone                   text NOT NULL,
  city                    text NOT NULL,
  state                   text NOT NULL,
  zip_code                text,
  products_interested     text[],
  monthly_purchase_volume text,
  preferred_contact       text,
  message                 text,
  attachment_url          text,
  status                  text NOT NULL DEFAULT 'new'
);

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (public insert)
CREATE POLICY "Public can submit inquiries"
  ON public.contact_inquiries FOR INSERT
  WITH CHECK (true);

-- Only admins can read / update
CREATE POLICY "Admins can manage inquiries"
  ON public.contact_inquiries FOR ALL
  USING (public.is_admin());
