-- Groups Bargoose's 9 BedBug Solution Elite mattress encasements into one
-- catalog card with a variant picker.
--
-- They imported with no product_family/family_key/variant_label: the
-- Converter labelled each row by bed size only, so the three Queen rows
-- (9 / 12 / 16 in. deep) collided on "Queen" and the whole family was
-- dropped. admin.js now adds the first differing comma part ("Fits Up to
-- 9 in. Deep") on such collisions; this backfills the rows already live,
-- using the same labels the fixed Converter produces.

update public.products set
  product_family = 'BedBug Solution Elite Zippered Waterproof Mattress Encasement',
  family_key     = 'bedbug-solution-elite-zippered-waterproof-mattress-encasement',
  variant_label  = v.label,
  updated_at     = now()
from (values
  ('96080ZT',    'Queen - Fits Up to 9 in. Deep'),
  ('96080Z-12T', 'Queen - Fits Up to 12 in. Deep'),
  ('96080Z-16T', 'Queen - Fits Up to 16 in. Deep'),
  ('97880ZT',    'King - Fits Up to 9 in. Deep'),
  ('97880Z-12T', 'King - Fits Up to 12 in. Deep'),
  ('97880Z-16T', 'King - Fits Up to 16 in. Deep'),
  ('97284ZT',    'California King - Fits Up to 9 in. Deep'),
  ('97284Z-12T', 'California King - Fits Up to 12 in. Deep'),
  ('97284Z-16T', 'California King - Fits Up to 16 in. Deep')
) as v(sku, label)
where public.products.sku = v.sku;
