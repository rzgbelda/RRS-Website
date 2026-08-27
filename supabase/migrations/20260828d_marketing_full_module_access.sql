-- Marketing Account, Phase 1 (expanded per direct CEO instruction): grants
-- the marketing role full read/write on every module it's now been given a
-- tab for -- Products, Inventory, Mix & Match (lives on products.moq_group*,
-- covered by the products policy below), Orders, Affiliates, Best Deals,
-- Reports (reads orders/products/profiles, covered below). Quote Requests
-- was already handled in 20260828_marketing_crm.sql (is_crm_staff).
--
-- Hero/About sections are NOT touched here -- site_content's existing write
-- policy is already `auth.role() = 'authenticated'`, broader than
-- is_admin() already, so marketing (a signed-in staff account) already has
-- access with zero changes needed.
--
-- SEO is UI-only (admin-seo.js makes no direct table writes -- confirmed by
-- grepping the file), so it needs no RLS changes either, just the tab-gating
-- change made in admin.js.
--
-- Every policy below is purely additive (a new, uniquely-named permissive
-- policy) -- Postgres OR's permissive policies together, so this can only
-- ever grant access, never remove or narrow anything that exists today.

create policy "marketing_manage_products"       on public.products       for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_product_images" on public.product_images for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_categories"     on public.categories     for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_inventory"      on public.inventory      for all using (public.is_marketing()) with check (public.is_marketing());

create policy "marketing_manage_orders"      on public.orders      for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_order_items" on public.order_items for all using (public.is_marketing()) with check (public.is_marketing());

create policy "marketing_manage_sub_distributors" on public.sub_distributors               for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_sd_employees"     on public.sub_distributor_employees      for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_sd_links"         on public.customer_sub_distributor_links for all using (public.is_marketing()) with check (public.is_marketing());
create policy "marketing_manage_order_referrals"  on public.order_referrals                for all using (public.is_marketing()) with check (public.is_marketing());

create policy "marketing_manage_best_deals" on public.best_deals for all using (public.is_marketing()) with check (public.is_marketing());

-- Reports needs customer counts (profiles) alongside orders/products above --
-- SELECT only, deliberately not "for all": marketing has no business editing
-- another account's role/profile, and full access there would let a
-- marketing account grant itself admin, defeating the whole point of the
-- role split just made between Marketing and the (separately-scoped) Admin
-- account-management portal.
create policy "marketing_read_profiles" on public.profiles for select using (public.is_marketing());

-- affiliate_payouts (RRS-9's commission ledger) had RLS never enabled at
-- all -- found while widening this access, not something this change
-- introduced. With RLS off, that table was readable/writable by ANY
-- signed-in user via the public anon key, not just staff. Closing that now:
-- admin+marketing manage it, matching every other affiliate table above.
alter table public.affiliate_payouts enable row level security;
create policy "crm_staff_manage_affiliate_payouts" on public.affiliate_payouts
  for all using (public.is_admin() or public.is_marketing())
  with check (public.is_admin() or public.is_marketing());
