-- SEO Roadmap Day 21: 4 more cornerstone articles (one extra beyond the
-- day's original "3 more" scope, per explicit request), covering the 4
-- categories that had zero blog coverage after Day 18/19: Bed Sheets &
-- Linens, Guest Amenities, Gloves & PPE, Cleaning Chemicals.
--
-- Same standard as Day 18: real SKU/price/case_qty pulled live from the
-- products table before writing, not guessed. Dollar-quoting used for
-- body_html throughout (not single-quoted strings) -- Day 18's own
-- migration comment documents why: a genuine Supabase SQL Editor bug
-- misparses hyphenated words inside single-quoted literals as
-- expressions (e.g. "guest-facing" read as `guest - facing`).
-- Dollar-quoting has no character that can ever be treated as a
-- delimiter or operator, sidestepping the bug entirely.

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'hotel-bed-sheet-thread-count-guide',
  'Hotel Bed Sheet Guide: Thread Count, T-180 vs. Microfiber, and Sizing by the Case',
  'What thread count and fabric type actually mean for durability under commercial laundering, plus how to order the right sheet sizes by the case.',
  $body$<p>"Thread count" gets thrown around as if it is the only thing that matters in a hotel bed sheet -- it is not even the most important one. For a property doing daily commercial laundering, fabric type and construction determine how a sheet holds up far more than the number printed on the packaging.</p>
<h2>T-180 vs. microfiber: what the numbers actually mean</h2>
<p><strong>T-180</strong> refers to a plain-weave cotton-blend sheet with a 180 thread count -- the standard commercial hospitality grade. It is durable, breathable, and holds up well to repeated high-heat industrial washing and drying, which is the real stress test a retail sheet was never built for.</p>
<p><strong>Microfiber</strong> sheets use fine synthetic fibers woven at a much tighter density. They resist wrinkling, dry faster than cotton blends (a real labor-cost factor on a tight turnover schedule), and hold their color and shape through more wash cycles before showing wear.</p>
<p>Neither is strictly "better" -- T-180 gives a more traditional cotton feel guests recognize, while microfiber often outlasts it in properties running the most aggressive commercial laundry cycles. The right choice depends on your guest expectations and your laundry setup, not the thread count alone.</p>
<h2>Sizing by the case</h2>
<p>Sheets are sold as flat sheets and fitted sheets separately, so a full bed change means ordering both, sized to the mattress: Full XL, Queen, or King. A real case example: <a href="/product?item=RDU-BED-FTS-QN-T180">Queen T-180 Fitted Sheets</a> ship 24 to a case at $127.50 per case, with the matching <a href="/product?item=RDU-BED-FLS-QN-T180">Queen T-180 Flat Sheets</a> at $124.50 per case -- keep flat and fitted case counts matched so a full changeover never runs short on one half of the set.</p>
<p>See the complete range of sizes and fabric types in the <a href="/category/bed-sheets-linens">Bed Sheets &amp; Linens category</a>.</p>
<h2>Building a par level that survives a busy week</h2>
<p>The standard hospitality rule of thumb is <strong>3 sets per bed</strong> in active rotation: one on the bed, one in the laundry cycle, one as a buffer for same-day turnovers or a slow laundry day. A property with same-day turnover pressure (short-term rentals, high-occupancy weekends) should lean toward the higher end of that ratio rather than the lower.</p>
<h2>The short version</h2>
<ul>
<li>T-180 gives a traditional cotton feel; microfiber often outlasts it under the heaviest commercial laundry cycles -- match the choice to your laundry setup, not the thread count number alone.</li>
<li>Order flat and fitted sheets in matched case counts, sized to the actual mattress (Full XL, Queen, King).</li>
<li>Stock roughly 3 sets per bed in active rotation to survive a busy turnover week without a mid-week shortage.</li>
</ul>$body$,
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'hotel-bed-sheet-thread-count-guide');

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'guest-amenities-bulk-vs-individually-wrapped',
  'Guest Amenities: Bulk Dispensers vs. Individually Wrapped, and How to Order Either by the Case',
  'The real tradeoffs between bulk-dispenser and individually wrapped guest amenities, so you can order the format that actually fits your property and guest expectations.',
  $body$<p>Every property eventually asks the same question: should guest amenities be individually wrapped travel-size bottles, or refillable bulk dispensers? The honest answer is that it depends on guest expectations and housekeeping labor, not just per-unit cost.</p>
<h2>Individually wrapped: what it actually solves</h2>
<p>Single-use, individually wrapped amenities (30mL shampoo, conditioner, body wash, lotion, and bar soap) are what most guests still expect at a standard hotel or short-term rental. They are simple for housekeeping to restock (drop in a new bottle, no refilling), give every guest a clean unopened item, and scale down easily for lower-occupancy properties without wasted product sitting in a dispenser.</p>
<h2>Bulk dispensers: the real tradeoff</h2>
<p>Bulk dispensers reduce plastic waste per guest-night and can lower long-run cost per ounce at high occupancy, but they add a real housekeeping task (checking and refilling levels, which is easy to skip during a rushed turnover) and require guests to be comfortable with a shared-style dispenser format, which some travelers still associate with budget properties rather than a deliberate sustainability choice.</p>
<h2>A real order example</h2>
<p>For individually wrapped amenities, <a href="/product?item=RDU-AMN-SHM-30ML-STD">30mL Shampoo</a> ships 216 to a case starting at $59.44 per case, with volume pricing down to $48.95 per case at the top tier -- the matching <a href="/product?item=RDU-AMN-CON-30ML-STD">30mL Conditioner</a>, <a href="/product?item=RDU-AMN-BDW-30ML-STD">Body Wash</a>, and <a href="/product?item=RDU-AMN-LOT-30ML-STD">Lotion</a> are priced and cased identically, so a full 4-piece set stays easy to order and restock in matched quantities.</p>
<p>See the complete range of soap, shampoo, and amenity formats in the <a href="/category/guest-amenities">Guest Amenities category</a>.</p>
<h2>The short version</h2>
<ul>
<li>Individually wrapped amenities are simpler for housekeeping and match most guests' default expectations.</li>
<li>Bulk dispensers can lower long-run cost and plastic waste, but add a real refill-checking task to every housekeeping pass.</li>
<li>Order shampoo, conditioner, body wash, and lotion in matched case quantities so a full set restocks together, not piecemeal.</li>
</ul>$body$,
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'guest-amenities-bulk-vs-individually-wrapped');

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'nitrile-gloves-housekeeping-teams-sizing-guide',
  'Nitrile Gloves for Housekeeping Teams: Powder-Free vs. Exam Grade, and Getting Sizing Right',
  'The real difference between powder-free and exam-grade nitrile gloves, and why getting sizing right matters more than most properties realize for housekeeping teams.',
  $body$<p>Nitrile gloves are one of the few supplies a housekeeping team touches on literally every room -- and one of the most common places properties either overspend on a grade they do not need, or undersize a case order that runs out mid-week.</p>
<h2>Powder-free vs. exam grade: what the difference actually is</h2>
<p><strong>Powder-free nitrile gloves</strong> are the standard commercial housekeeping grade -- puncture-resistant, latex-free (important for both guest and staff allergy concerns), and built for repeated general-purpose cleaning and turnover work.</p>
<p><strong>Exam-grade nitrile gloves</strong> meet a higher medical-testing standard for barrier protection, which matters for healthcare-adjacent facilities or properties with stricter sanitation protocols, but is genuine overkill -- and real added cost -- for standard hotel or short-term rental housekeeping. Most properties only need exam grade if a specific compliance requirement calls for it.</p>
<h2>Why sizing is worth getting right</h2>
<p>A glove that is too large loses dexterity and tears more easily at the seams under real cleaning work; too small tears from stretching and causes hand fatigue over a full shift. Case boxes are sized Small through XL -- worth stocking at least two sizes if your housekeeping team has a real range of hand sizes, rather than ordering one size for the whole team and accepting the fit problems.</p>
<h2>A real order example</h2>
<p><a href="/product?item=ENPFM2002">Empress Blue Nitrile Powder Free Gloves, Medium</a> ship 10 boxes of 100 per case at $66.15 per case, with volume pricing down to $59.78 per case at the top tier -- the same case pricing and count applies across Small, Large, and XL, so mixing sizes for your team does not mean juggling different case structures.</p>
<p>See the complete range of sizes and grades in the <a href="/category/gloves-ppe">Gloves &amp; PPE category</a>.</p>
<h2>The short version</h2>
<ul>
<li>Powder-free nitrile is the right grade for standard housekeeping work; exam grade is real added cost most properties do not need without a specific compliance reason.</li>
<li>Stock at least two sizes if your team has a real range of hand sizes -- a poor fit tears gloves faster and slows the work down.</li>
<li>Case pricing and count are consistent across sizes, so mixing Small/Medium/Large/XL in one order is simple to plan.</li>
</ul>$body$,
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'nitrile-gloves-housekeeping-teams-sizing-guide');

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'epa-registered-disinfectants-what-hotels-need',
  'EPA-Registered Disinfectants: What Hotels Actually Need to Stock',
  'What "EPA-registered" actually means for a cleaning chemical, and which disinfectant types cover the real surfaces a hotel or rental cleaning team touches daily.',
  $body$<p>Not every cleaning product marketed to hotels is actually a registered disinfectant -- and knowing the difference matters both for guest safety and for meeting the standard your brand or booking platform may require.</p>
<h2>What "EPA-registered" actually means</h2>
<p>An EPA-registered disinfectant has been tested and confirmed to kill a specific list of pathogens at a specific contact time, and carries an EPA registration number on the label. A general "cleaner" or "sanitizer" is not the same thing -- cleaners remove dirt and grime, sanitizers reduce germs to a safer level, but only a true registered disinfectant is tested and labeled to actually kill disease-causing organisms on a surface.</p>
<h2>The core categories a property actually needs</h2>
<p>Most properties do not need one universal chemical -- they need a small, deliberate set covering different surfaces and use cases: a germicidal bleach cleaner for bathrooms and high-touch hard surfaces, disinfecting wipes for quick high-touch turnover (door handles, remote controls, light switches), and a glass cleaner kept as a separate, non-disinfectant product since disinfectant residue and streak-free glass cleaning are different jobs.</p>
<h2>A real order example</h2>
<p><a href="/product?item=68970">Clorox Healthcare Bleach Germicidal Cleaner</a> ships 6 to a case at $94.11 per case, with volume pricing down to $84.03 per case at the top tier -- built for exactly the bathroom and high-touch hard-surface disinfecting work a daily turnover requires. Pair it with <a href="/product?item=31547">CloroxPro Disinfecting Wipes</a> (700 count) at $59.54 per case for fast high-touch spot cleaning between full room resets.</p>
<p>See the complete range of disinfectants, degreasers, and glass cleaners in the <a href="/category/cleaning-chemicals">Cleaning Chemicals category</a>.</p>
<h2>The short version</h2>
<ul>
<li>"EPA-registered" is a specific, tested claim -- a general cleaner or sanitizer is not automatically the same thing.</li>
<li>Stock a small, deliberate set by use case: germicidal bleach cleaner for bathrooms/high-touch surfaces, disinfecting wipes for fast spot cleaning, and a separate glass cleaner.</li>
<li>Case pricing scales down meaningfully at volume -- worth ordering the core disinfectants at the tier your actual monthly usage supports.</li>
</ul>$body$,
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'epa-registered-disinfectants-what-hotels-need');
