-- One-time data restore, not a schema change.
--
-- Reconstructs the order that was permanently deleted before soft-delete
-- existed (see 20260918_orders_soft_delete.sql) from the customer's own
-- invoice PDF, RRS-INV-1786133040344 (Nc Wellness / Lashanda Moore,
-- August 5, 2026), plus two corrections the CEO gave directly:
--   - the free-item tissue line (6 cases at $0.00 on the original invoice)
--     gets 7 more cases added as a SEPARATE, priced line -- $44.55/case,
--     product 248 in products.csv, the exact size/weight match for
--     "4.0x3.1 Green Heritage Pro 2-Ply Bathroom Tissue". The original 6
--     free cases are kept as-is, not repriced.
--   - in-house delivery of $348.06 (this order was not a Warp/freight
--     shipment)
--   - gloves are explicitly UNCHANGED at the original invoice's 6 cases
--     ($62.72/case) -- an earlier request to add a 7th case was retracted
--
-- Math, using the same formula admin.js's saveOrderTax() uses so this
-- restored order is byte-for-byte consistent with what the app would
-- have computed:
--   items subtotal        7790.76 (16 original lines, unchanged)
--                        +  311.85 (7 new tissue cases @ $44.55)
--                        = 8102.61
--   in-house delivery     +  348.06
--   taxable base           8450.67
--   NC tax @ 4.75%          401.41   (8450.67 * 0.0475, rounded to cents)
--   total                  8852.08
--
-- This is a genuine reconstruction, not a system record of what actually
-- happened at checkout -- there is no Stripe payment tied to it and
-- payment_status is left as 'pending_invoice' so the Orders tab and any
-- financial report correctly show it as unpaid/outstanding rather than
-- implying money has moved. created_at is backdated to the invoice date
-- so it sorts and reports correctly alongside orders from that period.

do $$
declare
  v_order_id uuid;
begin
  insert into public.orders (
    order_number, customer_name, customer_email, business_name,
    subtotal, total, payment_method, payment_status, status, order_type,
    fulfillment_method, in_house_delivery_fee,
    tax_rate, tax_amount,
    shipping_address,
    notes,
    created_at, updated_at
  ) values (
    'RRS-INV-1786133040344',
    'Lashanda moore',
    'lewterdontray31@gmail.com',
    'Nc wellness',
    8102.61,
    8852.08,
    'invoice',
    'pending_invoice',
    'pending',
    'invoice',
    'in_house',
    348.06,
    0.0475,
    401.41,
    null,  -- not on the invoice PDF; fill in from the customer if known
    'Reconstructed ' || to_char(now(), 'YYYY-MM-DD') || ' after the original order was permanently deleted '
      || '(pre-dates soft-delete). Source: invoice RRS-INV-1786133040344, Aug 5 2026. '
      || 'Kitchen Roll Towel increased from 6 to 12 cases; 22x44 economy bath towel discontinued, '
      || 'replaced with 24x28. Added 7 cases of 4.0x3.1 Green Heritage Pro 2-Ply Bathroom Tissue '
      || 'at $44.55/case (product 248) on top of the original 6 free promotional cases. '
      || 'Net 30 terms per original invoice; due date on that invoice was Sep 4, 2026 (now past -- '
      || 'confirm current status with the customer before treating this as a live receivable).',
    '2026-08-05T00:00:00Z',
    now()
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, product_name, price_per_case, quantity) values
    (v_order_id, '85ct. Green® Heritage Pro Kitchen Roll Towel',                        32.40,  12),
    (v_order_id, '128oz. Pure Bright® Germicidal Ultra Bleach',                          32.12,   6),
    (v_order_id, '19oz. Professional Lysol® Disinfectant Spray',                        135.38,   6),
    (v_order_id, '32oz. Clorox® Healthcare® Bleach Germicidal Cleaner',                  88.73,   6),
    (v_order_id, '700ct. CloroxPro™ Clorox® Disinfecting Wipes',                         56.14,   6),
    (v_order_id, '40lb. Performance Plus™ Low Suds Powder Laundry Detergent',            30.99,   6),
    (v_order_id, '150oz. Purex® Mountain Breeze® Liquid Laundry Detergent',              73.31,   6),
    (v_order_id, '80oz. CloroxPro™ Pine-Sol® Multi-Surface Cleaner',                     52.38,   6),
    (v_order_id, '5Gal. Dawn® Professional Manual Pot & Pan Detergent Dispenser',       126.39,   6),
    (v_order_id, '24x33 Inteplast HDPE Institutional Trash Can Liners',                  43.58,   6),
    (v_order_id, '38x58 NAPCO Black Heavy Duty Municipal Liners',                        35.05,   6),
    (v_order_id, 'Empress™ Blue Nitrile Powder Free Gloves',                             62.72,   6),
    (v_order_id, 'Economy 12x12 Wash Cloths - White, 50 Dozen Case',                    172.00,   6),
    (v_order_id, 'Economy 16x27 Hand Towels - White, 10 Dozen Case',                    109.30,   6),
    (v_order_id, 'Economy 24x28 Bath Towels - White, 5 Dozen Case (replacement item)',  215.57,   6),
    (v_order_id, '4.0x3.1 Green® Heritage Pro 2-Ply Bathroom Tissue — Complimentary',     0.00,   6),
    (v_order_id, '4.0x3.1 Green® Heritage Pro 2-Ply Bathroom Tissue',                    44.55,   7);

  raise notice 'Restored order % as id %', 'RRS-INV-1786133040344', v_order_id;
end $$;
