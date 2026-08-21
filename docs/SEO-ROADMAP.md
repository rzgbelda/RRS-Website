# Room Ready Supply — SEO Roadmap

Days 1–9 shipped real, measurable work — GA4, category pages, structured data, title fixes. No plan document survived from that work (only git commit messages), which is exactly the problem this file exists to prevent going forward. Update this file as days are completed instead of letting the record live only in commit history.

## Where Days 1–9 actually left off

Reconstructed from git log, not a surviving plan doc:

- **Day 3** — GA4 installed (`G-69R8R75Q3Y`), orders/quote_requests tracked as conversions
- **Day 4** — Category landing pages, real taxonomy, internal linking
- **Day 5** — Noindex on private pages, shorter category titles, `tools/seo-audit.js` created
- **Day 7** — FAQ content + FAQPage schema on all 8 (now 9) category pages
- **Day 8** — Server-rendered Product + BreadcrumbList JSON-LD
- **Day 9** — Product page titles shortened under Google's 60-char limit
- **Day 1–2, 6** — No trace in git history. Rather than invent fake retroactive work, Day 10 below absorbs the one real gap the audit found and the plan continues cleanly from there.

## Audit findings behind this plan (as of 2026-08-22)

- `category/laundry-cleaning-chemicals.html` is linked from every page site-wide but **missing from `sitemap-categories.xml` and from `tools/seo-audit.js`'s slug list** — crawlable, but invisible to both the sitemap and the audit tooling.
- `sitemap.xml` (static pages) is hand-maintained and stale (`lastmod: 2026-07-25` on every entry, unchanged since). `sitemap-categories.xml` isn't auto-generated either. Only `sitemap-products.xml` regenerates from real data (`tools/generate-sitemap.js`).
- The admin **SEO Health dashboard** (`admin-seo.js`) only checks 6 hardcoded pages (home, catalog, product template, shipping, terms, privacy) — none of the 9 category pages or ~120 real products. The CLI tool (`tools/seo-audit.js`) covers more but has the same missing-category-slug bug above.
- Image `loading="lazy"` is inconsistent — e.g. `category/towels.html` lazy-loads only 1 of 5 images while the homepage lazy-loads 15 of 24.
- No `.webp`/`.avif` image variants anywhere — all `.jpg`/`.png`.
- LocalBusiness schema on the homepage is solid (real geo coordinates, hours, address) but has **no `sameAs`** — nothing links it to a verified Google Business Profile, Facebook, or LinkedIn. No `aggregateRating`/review schema anywhere (no reviews exist to show yet).
- **No blog, no `/blog/` route, no articles table, no content-marketing infrastructure at all.** For a B2B wholesale site this is the single biggest structural gap — no backlink-attracting, long-tail-keyword-targeting content exists.
- No broken-link/orphan-page detection, no Core Web Vitals field data (PSI gives lab data only), no per-URL indexing-status check, no duplicate-content check across product descriptions (many likely share supplier boilerplate verbatim).

## The plan

### Days 10–14 — Fix what Day 1–9 left dangling

| Day | Task | Why |
|---|---|---|
| 10 | Recover the orphaned Laundry & Cleaning Chemicals category — add to `sitemap-categories.xml` and `tools/seo-audit.js`'s slug list | The one page actively being served with zero visibility into whether it's healthy |
| 11 | Auto-generate `sitemap.xml` and `sitemap-categories.xml` the same way products already are | A stale sitemap quietly tells Google nothing has changed, even when it has |
| 12 | Widen the SEO Health dashboard from 6 pages to the whole site (categories + products) | You're only ever checking ~4% of real pages from the dashboard you actually look at |
| 13 | Fix inconsistent image lazy-loading across templates | Below-fold images loading eagerly wastes mobile bandwidth |
| 14 | Modernize image formats to WebP (`<picture>` with fallback) | Next real load-time win after the 93% image-weight cut already done |

### Days 15–16 — Local & trust signals

| Day | Task | Why |
|---|---|---|
| 15 | Claim/verify Google Business Profile, add `sameAs` to homepage schema | Highest-leverage local-SEO move available, currently missing entirely |
| 16 | Post-delivery review-request email flow | Prerequisite for ever adding `aggregateRating` schema |

### Days 17–22 — Content & backlinks (the actual biggest gap)

| Day | Task | Why |
|---|---|---|
| 17 | Blog foundation: `/blog/` route, `articles` table, admin editor | Infrastructure only — same CMS pattern as Hero/About sections |
| 18 | Write & publish first 3 cornerstone articles (buyer-intent, long-tail) | Real content, each linking to 2–3 category/product pages |
| 19 | Internal linking pass + related-posts module | Internal links are free authority — this spends it |
| 20 | Backlink outreach list — 15–20 real targets (hospitality/facility directories, East Coast business directories now that RRS serves beyond NC) | A list to work from, not automated outreach |
| 21 | Publish 3 more articles | Keep the cadence real, not a one-time burst |
| 22 | Duplicate product-description check across the catalog | Many products likely share supplier boilerplate verbatim — real duplicate-content risk |

### Days 23–26 — Deeper tooling & performance

| Day | Task | Why |
|---|---|---|
| 23 | Broken-link & orphan-page detection in `tools/seo-audit.js` | Catch the next "invisible page" before it sits unnoticed for months |
| 24 | Real Core Web Vitals via Chrome UX Report API (field data, not lab) | PSI numbers are simulated; CrUX is what visitors actually experienced |
| 25 | Per-page indexing-status check via Search Console | GSC integration shows clicks/queries but not indexed/excluded status |
| 26 | Validate every JSON-LD type against Google's Rich Results Test | One sitting to confirm each schema type is actually correct, not just present |

### Days 27–29 — Close the month

| Day | Task | Why |
|---|---|---|
| 27 | Publish 3 final articles (9 total for the month) | A sustainable cadence to keep going past Day 29 |
| 28 | Monthly GA4 + GSC report vs. Day 10 baseline | A real before/after, not a vibe check |
| 29 | Retrospective + seed next month's plan | Keep this file updated so the next gap doesn't start with "what day did we stop on?" |

---
*Last updated: 2026-08-22. Update the day-by-day tables above as each is completed — mark it done, note what actually shipped, and keep this file as the source of truth instead of relying on commit-message archaeology.*
