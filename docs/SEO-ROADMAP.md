# Room Ready Supply — SEO Roadmap

Days 1–9 shipped real, measurable work — GA4, category pages, structured data, title fixes. A "30-day plan" is referenced in the Day 6 report as having existed at the time, but it could not be located when this file was written (confirmed lost, not just unsearched) — only git commit messages and one recovered day-report survived. That's exactly the problem this file exists to prevent going forward. Update this file as days are completed instead of letting the record live only in commit history.

## Where Days 1–9 actually left off

Reconstructed from git log, not a surviving plan doc:

- **Day 3** — GA4 installed (`G-69R8R75Q3Y`), orders/quote_requests tracked as conversions
- **Day 4** — Category landing pages, real taxonomy, internal linking
- **Day 5** — Noindex on private pages, shorter category titles, `tools/seo-audit.js` created
- **Day 6** — Server-rendered product page meta tags (title/description/OG image), fixing all 120 product pages that were sending search engines and link-preview crawlers an identical blank listing. Also fixed a duplicate-size bug in product titles ("22×44 Economy 22×44 Bath Towels"). Confirmed via a real report (`RRS-SEO-Day6-Report.html`, dated 11 Aug 2026) — the commit just wasn't labeled "SEO Day 6:" in git the way Days 5/7/8/9 were, which is why it didn't show up in the initial git-log reconstruction below.
- **Day 7** — FAQ content + FAQPage schema on all 8 (now 9) category pages
- **Day 8** — Server-rendered Product + BreadcrumbList JSON-LD
- **Day 9** — Product page titles shortened under Google's 60-char limit
- **Day 1–2** — No trace in git history or a surviving report. Likely pre-tooling setup (GA4 account creation, initial planning) that predates code changes.

> **Known trap from the Day 6 report, worth re-checking periodically:** the fix required renaming the old static product page file, because the host's redirect rule only fires when the requested address doesn't already match an existing file — the old file was silently winning every time otherwise. A code comment warns against renaming it back. If product pages ever start serving blank listings again, check that file hasn't been reintroduced before debugging anything else.

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

| Day | Task | Why | Status |
|---|---|---|---|
| 10 | Recover the orphaned Laundry & Cleaning Chemicals category — add to `sitemap-categories.xml` and `tools/seo-audit.js`'s slug list | The one page actively being served with zero visibility into whether it's healthy | ✅ Done (2026-08-22) |
| 11 | Auto-generate `sitemap.xml` and `sitemap-categories.xml` the same way products already are | A stale sitemap quietly tells Google nothing has changed, even when it has | ✅ Done (2026-08-22) — `tools/generate-sitemap.js` now regenerates all 3 sitemaps + the index; categories are read from the `category/` folder itself, not a hand-typed list, so Day 10's bug class can't recur silently |
| 12 | Widen the SEO Health dashboard from 6 pages to the whole site (categories + products) | You're only ever checking ~4% of real pages from the dashboard you actually look at | ✅ Done (2026-08-22) — now checks all 9 categories + 5 real products sampled live from the sitemap (20 pages total); product pages audited as fully server-rendered per SEO Days 6/8, not skipped |
| 13 | Fix inconsistent image lazy-loading across templates | Below-fold images loading eagerly wastes mobile bandwidth | ✅ Done (2026-08-25) — the "1/5 lazy" finding was mostly header logo/nav icons (correctly eager); the 2 real gaps (About feature icon, floating QR image on 6 pages) are now lazy |
| 14 | Modernize image formats to WebP (`<picture>` with fallback) | Next real load-time win after the 93% image-weight cut already done | ✅ Done (2026-08-25) — logo/hero/about/best-deals banners converted to WebP with `<picture>` fallback across all 26 pages carrying the logo; `optimizeImageUrl()` added to script.js to auto-serve optimal format/quality for the ~98% of product photos that are Cloudinary-hosted, with zero new files needed |

### Backend gap closed outside the day-by-day plan

- **2026-09-01** — Product meta title/description became editable per-product from admin (`meta_title`/`meta_description` columns, `20260901c_products_meta_override.sql`). Day 6 gave every product page real server-rendered tags, but 100% auto-generated with nothing manually overridable — this was that gap. Blank stays blank (same auto-generated behavior); JSON-LD's Product name/description deliberately keep using the real auto-generated values regardless, so a marketing-crafted SEO title never makes a product's own rich-result entry disagree with what it actually is.

### Days 15–16 — Local & trust signals

| Day | Task | Why |
|---|---|---|
| 15 | Claim/verify Google Business Profile, add `sameAs` to homepage schema | Highest-leverage local-SEO move available, currently missing entirely | ✅ Done (2026-09-01) — Google Business Profile created (category: Wholesaler) and Facebook Page claimed; both added to `sameAs` on the homepage's LocalBusiness schema and best-deals.html's Organization schema |
| 16 | Post-delivery review-request email flow | Prerequisite for ever adding `aggregateRating` schema | ✅ Done (2026-09-02) — reused the trigger→delay→email automation engine built for the marketing work (a 3rd trigger type, `order_delivered`, alongside the existing lead/quote triggers) rather than building a second system. A real "Post-Delivery Review Request" automation is seeded (3-day delay, links to the Day 15 Google Business Profile), created **paused** — staff review the copy and delay in Campaigns → Automations before turning it on. `aggregateRating` schema itself is still a separate, later step: real reviews have to actually accumulate first |

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
