-- SECURITY: logged-in customers could read supplier cost and distributor.
--
-- 20261003_lock_products_costs.sql dropped "public_read_active_products" and
-- revoked anon, but a second, dashboard-created policy with the same effect
-- -- "Anyone can view active products" (select where is_active) -- was never
-- in a migration and survived. anon is blocked by the revoke, but any
-- logged-in customer could call
--   GET /rest/v1/products?select=sku,cost_per_case,tier1_cost,distributor
-- and read it for every active product (confirmed 2026-10-27 with a
-- customer-role account).
--
-- Nothing non-staff needs the base table: the storefront, account,
-- checkout, the sales catalog and the affiliate partner tab read
-- products_public; server routes use the service role. Staff keep access
-- through admin_manage_products, marketing_manage_products and
-- supply_chain_manage_products.

drop policy if exists "Anyone can view active products" on public.products;

-- Verify: only staff policies should remain.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'products'
order by policyname;
