-- Follow-up to 20260908_security_enable_missing_rls.sql.
--
-- After that migration ran, order_items locked down correctly but
-- sub_distributors was STILL returning its full row to the public anon key
-- (verified live: an unfiltered select returned the affiliate's name,
-- email, phone and commission rate). RLS is on and the staff policy exists,
-- so the only way a row still comes back is a second, permissive policy
-- created directly in the dashboard and tracked by no migration -- the same
-- origin as the original bug. Run inspect step below to see it, then this
-- migration removes it and replaces it with something safe.
--
-- Why not simply drop all public access: the public site legitimately needs
-- to read this table. A customer entering a referral code at checkout
-- (payment.html, script.js registerReferral) is anonymous, and looks the
-- code up to resolve id/name/commission_pct. Making the table staff-only
-- would silently break affiliate referrals -- the lookup would return null
-- and every referral code would read as invalid.
--
-- So: no public policy on the base table at all (which holds email, phone
-- and internal notes), and a narrow security-definer function for the one
-- thing the public actually needs -- resolving a code the caller already
-- knows. That exposes no PII and cannot be used to enumerate affiliates,
-- because a caller has to supply the exact code to get anything back.

-- ---------------------------------------------------------------------
-- 1. Remove any permissive public-read policies on the base table.
--    Named defensively: whichever of these exists gets dropped, the rest
--    are harmless no-ops.
-- ---------------------------------------------------------------------
drop policy if exists "Enable read access for all users"        on public.sub_distributors;
drop policy if exists "public_read_sub_distributors"            on public.sub_distributors;
drop policy if exists "Allow public read"                       on public.sub_distributors;
drop policy if exists "anon_read_sub_distributors"              on public.sub_distributors;
drop policy if exists "sub_distributors_select_policy"          on public.sub_distributors;
drop policy if exists "Enable read access for authenticated"    on public.sub_distributors;

-- ---------------------------------------------------------------------
-- 2. Public referral-code lookup, without exposing the table.
--    security definer so it runs with the owner's rights and bypasses the
--    (now staff-only) RLS on the base table -- but it returns only three
--    non-sensitive columns, and only for an exact, active code.
-- ---------------------------------------------------------------------
create or replace function public.lookup_referral_code(p_code text)
returns table (id uuid, name text, commission_pct numeric)
language sql
stable
security definer
set search_path = public
as $fn$
  select sd.id, sd.name, sd.commission_pct
  from public.sub_distributors sd
  where upper(sd.referral_code) = upper(trim(p_code))
    and sd.status = 'active'
  limit 1;
$fn$;

revoke all on function public.lookup_referral_code(text) from public;
grant execute on function public.lookup_referral_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Same treatment for the employee-code path, which script.js also
--    resolves for anonymous callers (it joins through to the parent's
--    name and commission rate). Guarded: the table may not exist.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sub_distributor_employees') is not null then
    execute $ddl$
      create or replace function public.lookup_employee_referral_code(p_code text)
      returns table (
        employee_id uuid,
        employee_name text,
        sub_distributor_id uuid,
        sub_distributor_name text,
        commission_pct numeric
      )
      language sql
      stable
      security definer
      set search_path = public
      as $fn2$
        select e.id, e.name, e.sub_distributor_id, sd.name, sd.commission_pct
        from public.sub_distributor_employees e
        join public.sub_distributors sd on sd.id = e.sub_distributor_id
        where upper(e.referral_code) = upper(trim(p_code))
          and e.status = 'active'
          and sd.status = 'active'
        limit 1;
      $fn2$;
    $ddl$;

    execute 'revoke all on function public.lookup_employee_referral_code(text) from public';
    execute 'grant execute on function public.lookup_employee_referral_code(text) to anon, authenticated';
  end if;
end $$;
