-- Remove test/dev orders before launch (item 1.8)
-- Review list first, then uncomment the DELETE

-- Step 1: Review what will be deleted
SELECT id, order_number, customer_name, customer_email, amount_total, created_at
FROM orders
WHERE
  customer_email ILIKE '%test%'
  OR customer_email ILIKE '%example%'
  OR customer_email ILIKE '%@mailinator%'
  OR customer_name  ILIKE '%test%'
  OR order_number IN ('RRS-000017', 'RRS-000018', 'RRS-000019')
  OR amount_total = 0
ORDER BY created_at DESC;

-- Step 2: Once reviewed, uncomment and run to delete
-- DELETE FROM orders
-- WHERE
--   customer_email ILIKE '%test%'
--   OR customer_email ILIKE '%example%'
--   OR customer_email ILIKE '%@mailinator%'
--   OR customer_name  ILIKE '%test%'
--   OR order_number IN ('RRS-000017', 'RRS-000018', 'RRS-000019')
--   OR amount_total = 0;
