-- affiliate_payouts (RRS-9's commission ledger, 20260822c_affiliate_payouts.sql)
-- came back 404 from a live API check while building this migration --
-- meaning it may never actually have been created in this database, despite
-- that migration being on record. Guarded so this is a safe no-op if it
-- really doesn't exist, instead of erroring, and does the real fix (RLS was
-- never enabled on it, so it'd have been readable/writable by any signed-in
-- user via the public anon key) if it does.
do $$
begin
  if to_regclass('public.affiliate_payouts') is not null then
    execute 'alter table public.affiliate_payouts enable row level security';
    execute 'drop policy if exists "crm_staff_manage_affiliate_payouts" on public.affiliate_payouts';
    execute 'create policy "crm_staff_manage_affiliate_payouts" on public.affiliate_payouts
      for all using (public.is_admin() or public.is_marketing())
      with check (public.is_admin() or public.is_marketing())';
  end if;
end $$;
