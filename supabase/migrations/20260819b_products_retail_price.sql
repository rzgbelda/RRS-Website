-- "Retail Price" for best-deals savings messaging (e.g. "Retail Price: $65.91").
-- Deliberately separate from products.price (this app's actual wholesale price,
-- used at checkout) and sale_price (the regular-storefront discount field) --
-- retail_price is only ever a "compare at" reference number, never charged.
alter table products add column if not exists retail_price numeric(10,2);
