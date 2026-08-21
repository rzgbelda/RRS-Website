-- RRS-13: products could only ever carry one image (image_url). This adds
-- a second, optional column for extra gallery photos shown on the product
-- detail page -- image_url stays exactly as-is and keeps being the one
-- cover photo every other surface (catalog cards, cart, featured rail,
-- Best Deals) already reads, so nothing else needs to change.
alter table products add column if not exists images jsonb default '[]'::jsonb;
