# Bulk Detergent Reel Campaign — Launch Checklist

Derived from the strategy report ("Room Ready Supply Bulk Detergent Reel Campaign"). Ordered so nothing downstream gets built on something upstream that isn't ready yet — the pixel has to exist before it can be tested, the catalog has to exist before a post can tag a SKU, etc.

Each item is tagged **[You]** — a business/account decision or manual step only you can do — or **[Dev]** — something I build in code. Several items need both: you make the account/decision, I wire the code to it.

---

## Phase 0 — Decisions before anything gets built

- [ ] **[You]** Confirm this campaign runs as a tightly geo-fenced push (Plymouth–Raleigh only) *alongside* the broader East Coast site messaging, not instead of it. Nothing technical blocks this, but it's worth being a deliberate choice since the ad script names Raleigh specifically.
- [ ] **[You]** Confirm the landing page URL/slug (e.g. `/bulk-detergent` or similar) and whether it's a standalone page or a filtered view of the existing catalog.
- [ ] **[You]** Confirm the final average price point and MOQ shown publicly ($72.50/bucket, 36-bucket minimum) match what's actually configured on the live Mix & Match group — this is already correct today, just sign off on it before it's in an ad.

## Phase 1 — Technical foundation (must exist before filming/tagging)

- [ ] **[You]** Create or confirm a Meta Business Manager account for Room Ready Supply.
- [ ] **[You]** Create a Meta Commerce Manager catalog under that Business Manager.
- [ ] **[Dev]** Build a Meta product feed (XML, auto-generated the same way `sitemap-products.xml` already is) so the 5-gallon chemical SKUs sync to that catalog automatically instead of being uploaded by hand.
- [ ] **[Dev]** Install the base Meta Pixel site-wide (PageView).
- [ ] **[Dev]** Wire `ViewContent` (product page), `AddToCart` (cart), and `Purchase` (order confirmation) pixel events into the real add-to-cart and checkout flow.
- [ ] **[Dev]** Add server-side Conversions API (CAPI) forwarding from `api/create-order.js` on real purchases — more reliable than the browser pixel alone, especially with ad blockers.
- [ ] **[You]** Get the Pixel ID and a CAPI access token from Meta Events Manager and share them (these become new Vercel/Supabase secrets, same pattern as the Stripe/GA4 keys already in use).
- [ ] **[Dev]** Configure the custom `Local-Cart-Conversion` event, firing only when the checkout shipping state/ZIP falls in the target NC range.
- [x] **[Dev]** ~~Build a dedicated campaign landing page~~ — not needed. **The Best Deals page (`/best-deals`) is the landing page** — confirmed and fixed live (2026-08-24): its cart button now correctly carries the Mix & Match group data (it previously didn't — a real bug, would have let someone check out below the 36-bucket minimum from this exact page), and it now shows the same "MIX & MATCH MOQ: 36" badge the catalog does.
- [ ] **[You]** Add each of the 20 five-gallon chemical SKUs as a Best Deals entry (Admin → Best Deals → Add Deal) with hook/pitch copy — they won't appear on the page at all until they're added there, it's a curated list, not automatic.
- [ ] **[You]** Set a `retail_price` on each of those 20 products (Admin → Products → edit each) — none currently have one set, so today they'd show with no "Save X%" badge even once added as a deal.

## Phase 2 — Content production

- [ ] **[You]** Film the 15-second vertical reel per the shot list (drain pour, jug-pile split screen, stain/wash macro shot, product-tag tap).
- [ ] **[You]** Get real product photography/footage of the 5-gallon bucket and a mixed bucket load (for the split-screen and "mix and match" shots).
- [ ] **[You]** Edit with the high-contrast bold captions per the provided timestamps and on-screen text.
- [ ] **[You]** Fact-check the on-screen cost claims ("$1,200 down the drain," "$0.42 vs $0.12 per load") against real numbers before they're in a public ad — these read as illustrative in the strategy doc, not pulled from your actual cost-per-load data.

## Phase 3 — Publishing & tagging (needs Phase 1's catalog done first)

- [ ] **[You]** Upload the reel natively to Facebook and Instagram.
- [ ] **[You]** Apply native product tagging on the post, pointing at the real catalog SKU (only possible once the Phase 1 catalog sync exists).
- [ ] **[You]** Add local city geo-tags to the post.
- [ ] **[You + Dev]** Before spending any ad money: open Meta Events Manager and confirm `ViewContent`/`AddToCart`/`Purchase`/`Local-Cart-Conversion` are actually firing on a real test click-through — catches a broken pixel before it wastes ad spend.

## Phase 4 — Paid amplification

- [ ] **[You]** Let the post run organically for 48 hours and review performance.
- [ ] **[You]** Load the top-performing reel into Meta Ads Manager under a new campaign.
- [ ] **[You]** Set objective to Sales/Conversions, optimized for Purchase.
- [ ] **[You]** Set geo-fenced targeting to the Plymouth–Raleigh corridor (US-64 W) with Property Management / Hospitality / Hotel Management / Vacation Rental / Housekeeping interest and job-title targeting.
- [ ] **[You]** Set placements strictly to Facebook Reels and Instagram Reels.

## Phase 5 — Fulfillment readiness

- [ ] **[You]** Confirm real capacity on the dedicated weekly US-64 W delivery route before promising free regional delivery at scale.
- [ ] **[You]** Print QR catalog inserts for the buckets (the QR code and catalog PDF already exist on the site — confirm you have a print-ready version).
- [ ] **[Dev]** Verify live that the Mix & Match minimum (36 buckets) and in-house delivery fee are correctly configured for every SKU in this group — this is already built and should already be correct, just a pre-launch sanity check, not new work.

## Measurement, once live

- [ ] **[You]** Set target KPI benchmarks in a tracking sheet: hook rate >35%, avg watch time >8.5s, CTR >2.2%, ROAS 3.5–5.0x, AOV ~$2,610 — and treat these as a stretch goal, since B2B video typically underperforms DTC-style benchmarks like these.
- [ ] **[Dev]** Optionally extend the admin Site Traffic panel (already built) to call out this specific landing page's views the same way it highlights Best Deals today.

---
*This file lives at `docs/BEST-DEALS-DETERGENT-CAMPAIGN-CHECKLIST.md` — check items off directly in it (or ask me to) as they're completed, so progress doesn't rely on remembering where things stood.*
