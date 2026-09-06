-- Strips the shared marketing boilerplate from product overviews.
--
-- 47 of 140 active products (34%) carried the identical two-sentence
-- closer: "Room Ready Supply supplies this <lowercased name> in wholesale
-- case quantities, ensuring your hotel or motel gets reliable, top-quality
-- supplies at competitive prices. We offer fast wholesale delivery and
-- dedicated customer service to help you maintain high guest standards
-- while staying within budget."
--
-- Two problems with it:
--   1. Google assesses quality at site level and judges a site by the pages
--      it has indexed. 47 near-identical descriptions read as templated
--      filler and drag on that assessment -- a plausible contributor to
--      156 of 171 pages never receiving a single impression.
--   2. It injected the product name lowercased mid-sentence, producing
--      "this empress(tm) blue nitrile powder free gloves" -- visibly wrong
--      to a human reader.
--
-- The boilerplate averages 325 chars against 315 chars of genuinely unique
-- copy per product, so this removes roughly half of each affected overview
-- while leaving at least 199 chars of real, product-specific content on
-- every one. Nothing unique is lost.

update public.products
set overview = trim(regexp_replace(
      overview,
      'Room Ready Supply supplies this .*? in wholesale case quantities.*?competitive prices\.\s*We offer fast wholesale delivery and dedicated customer service to help you maintain high guest standards while staying within budget\.',
      '',
      'g'
    )),
    updated_at = now()
where overview ~ 'Room Ready Supply supplies this .* in wholesale case quantities';
