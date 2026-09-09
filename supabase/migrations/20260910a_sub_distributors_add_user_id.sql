-- Fixes a real, silently-failing bug: supabase/functions/create-subdist-user
-- has always called
--   supabase.from("sub_distributors").update({ user_id: userId }).eq("id", sub_distributor_id)
-- to link the auth account it just created back to the affiliate's business
-- record -- but sub_distributors was never given a user_id column (verified
-- live: information_schema.columns lists id, name, contact_person, email,
-- phone, referral_code, commission_pct, status, notes, created_at,
-- updated_at -- no user_id). That update has been failing on every call,
-- and nothing surfaced it because the Edge Function doesn't check that
-- particular error.
--
-- This is also what blocks any affiliate self-service: without a stored
-- link from "the person who is logged in" to "which sub_distributor row is
-- theirs", there is no way to scope a payout dashboard, an order list, or
-- (as of this migration) return/logistics reports to just their business.
-- Adding the column is the prerequisite for all of that, not just today's
-- order_returns table.

alter table public.sub_distributors
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One sub_distributor row should map to at most one login -- otherwise
-- two different affiliate accounts could both claim the same business
-- record and see each other's data through it.
create unique index if not exists sub_distributors_user_id_idx
  on public.sub_distributors(user_id)
  where user_id is not null;

-- The existing RLS on this table (staff_manage_sub_distributors, from
-- 20260908_security_enable_missing_rls.sql) already restricts all access
-- to owner/admin/marketing -- no policy change needed here for the
-- affiliate to eventually read their OWN row directly; that access is
-- granted narrowly in 20260910_order_returns.sql via order_returns'
-- policies, not by opening sub_distributors itself to affiliate logins.
-- sub_distributors still holds email/phone/notes and stays staff-only.
