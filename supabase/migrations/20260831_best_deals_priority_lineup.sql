-- Best Deals page: swap the active lineup to the 5 CEO-priority categories
-- (paper towels/TP, heavy-duty trash liners, towel multi-packs, guest
-- amenity starter packs, sanitizer multi-packs). Reuses the 5 existing
-- best_deals rows (same ids/positions) rather than delete+insert, so
-- nothing that ever referenced these rows by id (e.g. a Campaign's
-- linked_best_deal_id) gets orphaned.
--
-- Every sku below is a REAL, live, active product -- verified directly
-- against the products table before writing this, not guessed:
--   248                    4.0x3.1 Green Heritage Pro 2-Ply Bathroom Tissue  $46.58  (exact price the CEO's memo names)
--   RM3858H                38x58 NAPCO Black Heavy Duty Municipal Liners    $37.64
--   RDU-TWL-BTW-24X50-ECO  Economy 24x50 Bath Towels, 5 Dozen Case          $41.99
--   RDU-AMN-SHM-30ML-STD   30mL Shampoo (guest amenity)                    $59.44
--   11008635042            128oz Pure Bright Germicidal Ultra Bleach, 6-pk  $34.06

update public.best_deals set
  sku = '248',
  hook_title = 'Bulk Paper Towels & Toilet Paper — $46.58/Case',
  pitch_text = 'Commercial-grade 2-ply bathroom tissue at wholesale case pricing. The restock staple every property burns through fastest — priced to keep it that way.',
  position = 1,
  is_active = true,
  updated_at = now()
where id = '79de8b4d-55ac-4b45-ad31-a6b9156bfa3f';

update public.best_deals set
  sku = 'RM3858H',
  hook_title = 'Heavy-Duty Trash & Can Liners',
  pitch_text = 'Municipal-grade 38x58 liners built for daily housekeeping turnover — rip-resistant, wholesale case pricing, always in stock.',
  position = 2,
  is_active = true,
  updated_at = now()
where id = 'b38af438-8a56-45fd-97ce-c25a6e70c5c8';

update public.best_deals set
  sku = 'RDU-TWL-BTW-24X50-ECO',
  hook_title = 'Vacation Rental Towel Multi-Packs',
  pitch_text = '60 durable 100% cotton bath towels per case — the fast, affordable restock every short-term rental and boutique property needs between guests.',
  position = 3,
  is_active = true,
  updated_at = now()
where id = '9e227ea4-26e1-4254-9fce-9f9a6d4caabe';

update public.best_deals set
  sku = 'RDU-AMN-SHM-30ML-STD',
  hook_title = 'Guest Amenity Starter Packs',
  pitch_text = 'Mini shampoos guests actually notice — wholesale case pricing on the amenity restock that keeps every guest room feeling fully stocked.',
  position = 4,
  is_active = true,
  updated_at = now()
where id = '4342bede-54b5-4be9-89a2-7176804b3b37';

update public.best_deals set
  sku = '11008635042',
  hook_title = 'Wholesale Sanitizer Multi-Packs',
  pitch_text = 'EPA-registered germicidal bleach, kills 50+ pathogens including C. diff — six bottles per case, priced for facilities that can''t afford to run out.',
  position = 5,
  is_active = true,
  updated_at = now()
where id = '93636bd0-f31e-4dee-9bb8-8d8c0877b944';
