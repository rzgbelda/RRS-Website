-- The 11 Starlinen sheet/pillowcase SKUs switched back on 2026-11-12 came back
-- with product_tier blank on the 74xxx ones and tier1_min_qty = 1 while their
-- moq is 2 / 6 / 12. Their siblings (74027, 74036, 74019, 74108...) carry
-- product_tier + tier1_min_qty = moq, so match that. Prices are not touched.
begin;

update public.products set product_tier = v.t, updated_at = now()
from (values ('74000WH402','180'), ('74025WH402','200'),
             ('74102WH402','250'), ('74104WH402','250'), ('74106WH402','250')) as v(sku, t)
where products.sku = v.sku;

update public.products set tier1_min_qty = moq, updated_at = now()
where sku in ('74000WH402','74025WH402','74102WH402','74104WH402','74106WH402',
              '37203WH287','37204WH287')
  and moq is not null;

commit;
