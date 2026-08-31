-- SEO Roadmap gap: product pages have had real, server-rendered meta tags
-- since Day 6 (see docs/SEO-ROADMAP.md), but every one of them is 100%
-- auto-generated from the product's name/category/overview -- nothing has
-- ever been editable per-page from admin. These two optional columns give
-- staff a manual override; left blank, api/product-meta.js and script.js's
-- populateProductPage() both keep falling back to the exact same
-- auto-generated title/description as before, so nothing changes for the
-- ~120 products that never set one.
alter table public.products
  add column if not exists meta_title       text,
  add column if not exists meta_description text;
