-- ── Sub-Distributor Sales Tracking Schema ───────────────────────
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Sub-distributors master table
CREATE TABLE IF NOT EXISTS public.sub_distributors (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              text        NOT NULL,
  contact_person    text,
  email             text,
  phone             text,
  referral_code     text        NOT NULL UNIQUE,
  commission_pct    numeric(5,2) NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. Employees / referrers under a sub-distributor
CREATE TABLE IF NOT EXISTS public.sub_distributor_employees (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_distributor_id   uuid NOT NULL REFERENCES public.sub_distributors(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  email                text,
  phone                text,
  referral_code        text NOT NULL UNIQUE,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- 3. Links a customer (auth user) to a sub-distributor at registration time
CREATE TABLE IF NOT EXISTS public.customer_sub_distributor_links (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sub_distributor_id   uuid NOT NULL REFERENCES public.sub_distributors(id) ON DELETE CASCADE,
  employee_id          uuid REFERENCES public.sub_distributor_employees(id) ON DELETE SET NULL,
  referral_code_used   text NOT NULL,
  linked_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)  -- one sub-distributor link per customer
);

-- 4. Referral record attached to each order
CREATE TABLE IF NOT EXISTS public.order_referrals (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id             uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  referral_code        text NOT NULL,
  sub_distributor_id   uuid REFERENCES public.sub_distributors(id) ON DELETE SET NULL,
  employee_id          uuid REFERENCES public.sub_distributor_employees(id) ON DELETE SET NULL,
  commission_pct       numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount    numeric(10,2) NOT NULL DEFAULT 0,
  source               text NOT NULL DEFAULT 'checkout' CHECK (source IN ('registration','checkout')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)  -- one referral record per order
);

-- ── Indexes for fast referral code lookups ────────────────────
CREATE INDEX IF NOT EXISTS idx_sub_distributors_referral_code
  ON public.sub_distributors(referral_code);

CREATE INDEX IF NOT EXISTS idx_sde_referral_code
  ON public.sub_distributor_employees(referral_code);

CREATE INDEX IF NOT EXISTS idx_order_referrals_sub_dist
  ON public.order_referrals(sub_distributor_id);

CREATE INDEX IF NOT EXISTS idx_order_referrals_employee
  ON public.order_referrals(employee_id);

CREATE INDEX IF NOT EXISTS idx_csdl_user
  ON public.customer_sub_distributor_links(user_id);

-- ── Auto-update updated_at on sub_distributors ───────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sub_distributors_updated_at ON public.sub_distributors;
CREATE TRIGGER trg_sub_distributors_updated_at
  BEFORE UPDATE ON public.sub_distributors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE public.sub_distributors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_distributor_employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sub_distributor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_referrals               ENABLE ROW LEVEL SECURITY;

-- sub_distributors: admins full access; public can read active ones (for code validation)
CREATE POLICY "Admins manage sub_distributors"
  ON public.sub_distributors FOR ALL
  USING (public.is_admin());

CREATE POLICY "Public can validate referral codes"
  ON public.sub_distributors FOR SELECT
  USING (status = 'active');

-- sub_distributor_employees: admins full; public can validate active codes
CREATE POLICY "Admins manage employees"
  ON public.sub_distributor_employees FOR ALL
  USING (public.is_admin());

CREATE POLICY "Public can validate employee codes"
  ON public.sub_distributor_employees FOR SELECT
  USING (status = 'active');

-- customer links: user can read own link; admins full access
CREATE POLICY "User can read own link"
  ON public.customer_sub_distributor_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "User can insert own link"
  ON public.customer_sub_distributor_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage customer links"
  ON public.customer_sub_distributor_links FOR ALL
  USING (public.is_admin());

-- order_referrals: admins full; users can read their own
CREATE POLICY "Admins manage order referrals"
  ON public.order_referrals FOR ALL
  USING (public.is_admin());

CREATE POLICY "Users can insert order referrals"
  ON public.order_referrals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can read own order referrals"
  ON public.order_referrals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );
