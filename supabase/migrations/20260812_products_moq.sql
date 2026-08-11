-- 41 products move from being sold by the case (with 1-5 / 6-29 / 30+
-- case volume tiers) to being sold by the dozen at a single flat rate
-- with a minimum order -- e.g. 12x12 economy wash cloths start at 50
-- dozen. moq holds that minimum, expressed in whatever `unit` says.
--
-- Default 1 so every product sold by the case or each is unaffected:
-- their minimum is one, which is how they already behave.
alter table public.products
  add column if not exists moq integer not null default 1;
