-- SEO Roadmap Day 18: first 3 cornerstone articles, published live.
-- Each links to a real category page and a real, currently-priced
-- product (SKU/price/case_qty verified live against the products table
-- before writing this, not guessed) -- the "buyer-intent, long-tail"
-- content the roadmap calls the site's single biggest structural gap.
--
-- Written as three separate INSERTs (each guarded by its own not-exists
-- check on slug, so safe to re-run) rather than one INSERT ... SELECT
-- FROM (VALUES ...) AS v(...) -- the VALUES-with-alias form hit a
-- "relation is not exist" error in the Supabase SQL Editor.

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'how-much-toilet-paper-should-a-hotel-stock',
  'How Much Toilet Paper &amp; Paper Towels Should a Hotel Stock Per Room?',
  'A practical formula for sizing your paper products order by room count and occupancy, plus real case pricing so you can budget the restock accurately.',
  '<p>Running out of bathroom tissue mid-turnover is one of the most avoidable housekeeping failures &mdash; and one of the most common, because most properties are still guessing at order quantities instead of working from a real formula.</p>' ||
  '<h2>The baseline formula</h2>' ||
  '<p>A good starting point for a mid-stay hotel room is <strong>1 roll of bathroom tissue per guest, per 2&ndash;3 days</strong>, plus a spare roll left in the room for guest convenience. For a 100-room property running at 70% average occupancy, that works out to roughly 35&ndash;50 rolls consumed per day across the property, before accounting for public restrooms and back-of-house use.</p>' ||
  '<p>Paper towels for public restrooms and back-of-house pantries follow a steeper curve &mdash; high-traffic lobby restrooms alone can burn through a full roll every few hours during peak check-in/check-out windows.</p>' ||
  '<h2>Building in a buffer, not just a number</h2>' ||
  '<p>The formula above gets you a daily consumption estimate, but the number that actually matters for ordering is your <strong>reorder point</strong>: how much safety stock you keep on hand so a late delivery or an unexpectedly busy weekend never turns into a guest-facing shortage. Most properties are comfortable with a 10&ndash;14 day buffer on paper products specifically, since they store compactly and don''t expire.</p>' ||
  '<h2>What this looks like in a real case order</h2>' ||
  '<p>Room Ready Supply''s <a href="/product?item=248">4.0x3.1 Green Heritage Pro 2-Ply Bathroom Tissue</a> ships 96 rolls per case at $46.58/case (case pricing scales down further at volume) &mdash; commercial-grade 2-ply built for exactly this kind of steady, high-turnover use, not a retail multi-pack stretched further than it was designed for.</p>' ||
  '<p>For a full breakdown of paper towel, tissue, and napkin options by roll count and ply, see the complete <a href="/category/paper-products">Paper Products category</a>.</p>' ||
  '<h2>The short version</h2>' ||
  '<ul>' ||
  '<li>Budget roughly 1 roll of tissue per guest every 2&ndash;3 days, plus a spare per room.</li>' ||
  '<li>Keep a 10&ndash;14 day buffer on hand &mdash; paper products store easily and don''t expire, so overbuying slightly costs far less than running out.</li>' ||
  '<li>Order commercial-grade product built for high-turnover use, not scaled-up retail packaging.</li>' ||
  '</ul>',
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'how-much-toilet-paper-should-a-hotel-stock');

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'bath-towel-buying-guide-vacation-rentals-boutique-hotels',
  'Bath Towel Buying Guide for Vacation Rentals &amp; Boutique Hotels',
  'GSM, cotton grade, and case sizing explained in plain terms, so you can order towels that actually hold up to commercial laundering instead of wearing thin after a season.',
  '<p>Retail bath towels are built for a home washing machine running once a week. A rental property or boutique hotel is running commercial laundry cycles daily &mdash; and a towel that looked identical to a retail one on day one often looks visibly worn by week six. Buying for durability, not just softness, is the real skill here.</p>' ||
  '<h2>What actually determines durability</h2>' ||
  '<p><strong>GSM (grams per square meter)</strong> is the standard measure of towel density &mdash; roughly, how much material is actually in the towel. Retail towels often sit in the 400&ndash;500 GSM range for a plush feel on a shelf. Commercial hospitality towels typically run 500&ndash;600+ GSM specifically because the extra density is what survives repeated high-heat commercial drying without thinning out.</p>' ||
  '<p><strong>Cotton grade</strong> matters just as much: 100% cotton (not a poly blend) is what gives a towel its absorbency and lets it recover its loft wash after wash, rather than going flat and rough.</p>' ||
  '<h2>Sizing the order to your turnover cycle</h2>' ||
  '<p>The industry rule of thumb is <strong>3 full towel sets per bed/bathroom</strong> in active rotation: one in use, one in the laundry cycle, one as a buffer for same-day turnovers. A property with a fast weekend-turnover cycle (Friday-to-Friday vacation rentals, for example) should lean toward the higher end of that ratio rather than the lower.</p>' ||
  '<h2>A real example</h2>' ||
  '<p>Room Ready Supply''s <a href="/product?item=rdu-twl-btw-24x50-eco">Economy 24x50 Bath Towels</a> are 100% cotton, sold 60 to a case (5 dozen) at $41.99/case &mdash; sized specifically for exactly this kind of multi-unit, high-turnover buying rather than a small home order.</p>' ||
  '<p>See the full range of hand towels, bath towels, and washcloths sized for commercial laundering in the <a href="/category/towels">Towels category</a>.</p>' ||
  '<h2>The short version</h2>' ||
  '<ul>' ||
  '<li>Look for 500+ GSM, 100% cotton &mdash; not just a soft feel on the shelf.</li>' ||
  '<li>Stock roughly 3 sets per bed/bathroom in active rotation.</li>' ||
  '<li>Buy in case quantities built for commercial laundry cycles, not retail multi-packs.</li>' ||
  '</ul>',
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'bath-towel-buying-guide-vacation-rentals-boutique-hotels');

insert into public.articles (slug, title, excerpt, body_html, status, meta_title, meta_description)
select
  'trash-liner-sizing-guide-right-can-liner-every-bin',
  'Trash Liner Sizing Guide: Picking the Right Can Liner for Every Bin',
  'How to match liner size and gauge to your actual bins, so bags stop tearing under normal use and you stop overpaying for liners bigger than the can needs.',
  '<p>The most common trash liner mistake isn''t buying the wrong brand &mdash; it''s buying the wrong <em>size</em>, either too small (constant overflow and tearing at the seams) or too large (wasted material and awkward bunching that looks unprofessional in guest-facing areas).</p>' ||
  '<h2>Matching liner size to bin size</h2>' ||
  '<p>Liner dimensions are listed as width x height in inches. As a general guide:</p>' ||
  '<ul>' ||
  '<li><strong>Small bathroom/office bins (10&ndash;15 gallon):</strong> roughly 24x33 liners.</li>' ||
  '<li><strong>Kitchen/housekeeping cart bins (23&ndash;30 gallon):</strong> roughly 33x39 liners.</li>' ||
  '<li><strong>Large municipal/outdoor bins (44&ndash;55 gallon):</strong> 38x58 or larger, heavy-duty gauge.</li>' ||
  '</ul>' ||
  '<h2>Why gauge (thickness) matters more than most buyers realize</h2>' ||
  '<p>A liner rated for the right size but too thin a gauge will tear under real-world weight &mdash; wet waste, broken glass, or just being dragged to a dumpster &mdash; even if it technically "fits" the bin. Heavy-duty municipal liners are built with a thicker gauge specifically so they survive that handling instead of splitting mid-carry, which is a real liability and cleanup cost, not just an inconvenience.</p>' ||
  '<h2>A real example</h2>' ||
  '<p>Room Ready Supply''s <a href="/product?item=rm3858h">38x58 NAPCO Black Heavy Duty Municipal Liners</a> are sized for large outdoor and municipal bins specifically, at $37.64/case &mdash; built to hold up under real collection-day handling rather than tearing the first time they''re lifted.</p>' ||
  '<p>See the full range of can liner sizes and gauges in the <a href="/category/trash-liners-can-liners">Trash Liners &amp; Can Liners category</a>.</p>' ||
  '<h2>The short version</h2>' ||
  '<ul>' ||
  '<li>Match liner dimensions to your actual bin size &mdash; not a one-size-fits-all default.</li>' ||
  '<li>For outdoor/municipal bins carrying real weight, prioritize gauge (thickness) over just size.</li>' ||
  '<li>A liner that tears mid-carry costs more in cleanup than a slightly heavier-duty liner would have upfront.</li>' ||
  '</ul>',
  'published',
  null, null
where not exists (select 1 from public.articles where slug = 'trash-liner-sizing-guide-right-can-liner-every-bin');
