-- Marketing can upload to the product-images Storage bucket.
-- (Already applied by hand in the Supabase SQL Editor on 2026-10-14; kept
-- here so the repo matches the live database.)
--
-- 20260828d gave the marketing role access to the products and
-- product_images TABLES, but the bucket's upload policy only checks
-- is_admin() (admin/owner), so image uploads from a marketing account
-- (Hero banner, About banner, product photos) failed with "new row
-- violates row-level security policy".
--
-- admin.js uploads with { upsert: true }, which Storage only allows when
-- the role also has SELECT and UPDATE on the object. Scoped to this one
-- bucket; purely additive.

drop policy if exists "marketing_upload_product_images" on storage.objects;
drop policy if exists "marketing_read_product_images"   on storage.objects;
drop policy if exists "marketing_update_product_images" on storage.objects;

create policy "marketing_upload_product_images" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_marketing());

create policy "marketing_read_product_images" on storage.objects
  for select using (bucket_id = 'product-images' and public.is_marketing());

create policy "marketing_update_product_images" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_marketing())
  with check (bucket_id = 'product-images' and public.is_marketing());
