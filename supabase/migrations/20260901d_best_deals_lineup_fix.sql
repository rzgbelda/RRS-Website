-- 20260831_best_deals_priority_lineup.sql was never actually run -- staff
-- hand-edited 2 of the 5 slots directly in admin since (position 2's
-- trash-liner copy is good, kept as-is), which left the lineup half-
-- finished and introduced a real bug: two rows both claim position 4
-- (4342bede/PP40PAIL and 9e227ea4/ENEL2003), so which card renders where
-- at that slot was undefined. Only 2 of the memo's 5 named categories
-- were actually represented; SKU 585 (kitchen roll towels) overlapped
-- with slot 1's intended product instead of filling a distinct category.
--
-- Reconciles all 6 live rows back to exactly the 5 named categories,
-- reusing existing row ids (not delete+insert) so anything that already
-- references one by id (e.g. a Campaign's linked_best_deal_id) doesn't
-- orphan. Every sku below is real and verified live against products
-- before writing this, not guessed:
--   248                    4.0x3.1 Green Heritage Pro 2-Ply Bathroom Tissue  $46.58
--   RM3858H                38x58 NAPCO Black Heavy Duty Municipal Liners    $37.64  (untouched -- already correct)
--   RDU-TWL-BTW-24X50-ECO  Economy 24x50 Bath Towels, 5 Dozen Case          $41.99
--   RDU-AMN-SHM-30ML-STD   30mL Shampoo (guest amenity)                    $59.44
--   11008635042            128oz Pure Bright Germicidal Ultra Bleach, 6-pk  $34.06

-- Slot 1: restore the exact $46.58 product the memo names "front and
-- center" -- was still carrying its old, generic pre-migration copy.
update public.best_deals set
  sku = '248',
  hook_title = 'Bulk Paper Towels & Toilet Paper — $46.58/Case',
  pitch_text = 'Commercial-grade 2-ply bathroom tissue at wholesale case pricing. The restock staple every property burns through fastest — priced to keep it that way.',
  position = 1,
  is_active = true,
  updated_at = now()
where id = '79de8b4d-55ac-4b45-ad31-a6b9156bfa3f';

-- Slot 2: already correct (RM3858H, heavy-duty trash liners) -- left
-- untouched on purpose, no update statement for this row.

-- Slot 3: was SKU 585 (kitchen roll towels), which duplicated slot 1's
-- paper-products category instead of filling "Vacation Rental Essential
-- Linen Bundles" -- repurposed to a real towel multi-pack.
update public.best_deals set
  sku = 'RDU-TWL-BTW-24X50-ECO',
  hook_title = 'Vacation Rental Towel Multi-Packs',
  pitch_text = '60 durable 100% cotton bath towels per case — the fast, affordable restock every short-term rental and boutique property needs between guests.',
  position = 3,
  is_active = true,
  updated_at = now()
where id = 'b7efa97c-3e87-4761-b737-56b77138a260';

-- Slot 4: was PP40PAIL (laundry detergent), one of two rows both sitting
-- at position 4 -- repurposed to Guest Amenity Starter Packs.
update public.best_deals set
  sku = 'RDU-AMN-SHM-30ML-STD',
  hook_title = 'Guest Amenity Starter Packs',
  pitch_text = 'Mini shampoos guests actually notice — wholesale case pricing on the amenity restock that keeps every guest room feeling fully stocked.',
  position = 4,
  is_active = true,
  updated_at = now()
where id = '4342bede-54b5-4be9-89a2-7176804b3b37';

-- Slot 5: was ENEL2003 (exam gloves), the OTHER row sitting at the
-- duplicate position 4 -- repurposed to Sanitizer Multi-Packs and moved
-- to its own real slot (5), resolving the duplicate.
update public.best_deals set
  sku = '11008635042',
  hook_title = 'Wholesale Sanitizer Multi-Packs',
  pitch_text = 'EPA-registered germicidal bleach, kills 50+ pathogens including C. diff — six bottles per case, priced for facilities that can''t afford to run out.',
  position = 5,
  is_active = true,
  updated_at = now()
where id = '9e227ea4-26e1-4254-9fce-9f9a6d4caabe';

-- The old ice-liner row is now the 6th row beyond the memo's 5 named
-- slots -- deactivated, not deleted, same convention used elsewhere in
-- this table for retiring a lineup entry without breaking referential
-- integrity if anything already points at its id.
update public.best_deals set
  is_active = false,
  updated_at = now()
where id = '93636bd0-f31e-4dee-9bb8-8d8c0877b944';
