-- Real sales-tax storage for orders, matching the pattern quote_requests
-- already uses. The create-orders migration defines tax_amount but it was
-- never actually applied live (confirmed via direct query: 42703) -- this
-- adds both tax_rate and tax_amount for real, plus the missing subtotal
-- companion tax_amount needs to make sense against.
alter table orders add column if not exists tax_rate numeric;
alter table orders add column if not exists tax_amount numeric(10,2);
