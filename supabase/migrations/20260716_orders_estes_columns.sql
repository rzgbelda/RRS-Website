-- Add Estes shipment tracking fields to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bol_number   text,
  ADD COLUMN IF NOT EXISTS pro_number   text;

-- Update shipping_status to include 'booked' state
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_shipping_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_shipping_status_check
  CHECK (shipping_status IN (
    'awaiting_freight_quote',
    'booked',
    'in_transit',
    'delivered'
  ));
