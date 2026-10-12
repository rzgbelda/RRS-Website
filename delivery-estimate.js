/**
 * Estimated delivery date range shown on the Delivery line (cart.html,
 * checkout.html) and in the order confirmation email -- a RANGE, never a
 * single date, per the CEO's explicit instruction (2026-10-13): a single
 * date reads as a promise, a range reads honest.
 *
 * Formula: payment date (or "today" as a stand-in before payment) + 4
 * business days for the near end, + 7 business days for the far end,
 * skipping weekends. This is Adam's conservative 7-business-day SOP,
 * used ONLY because no real per-ZIP/per-carrier transit-day data exists
 * yet anywhere in this codebase (confirmed by a full-repo search
 * 2026-10-13 -- the one real carrier-sourced transit number, TForce's
 * transitDays, is fetched but discarded in api/_lib/shipping.js before
 * it reaches checkout, and only covers freight/150+lb orders anyway).
 * Once Jonas's actual supplier lead-time data lands, replace the flat
 * 4/7 constants below with real per-distributor/per-ZIP numbers --
 * this file is the one place to change.
 *
 * No federal holiday calendar exists in this codebase (only weekends are
 * skipped here, same gap as every other business-day helper in the repo
 * -- api/_lib/tforce.js's pickupDate(), supabase/functions/warp-freight's
 * nextBusinessDay()). A holiday landing inside the window will make the
 * real delivery land a day or two later than shown; the 4-7 day spread
 * already exists partly to absorb exactly that kind of slippage.
 *
 * Dual-exported like tax-rates.js: window.* for browser pages
 * (cart.html, checkout.html), module.exports for Node (api/_lib
 * callers building the confirmation email).
 */
const DELIVERY_ESTIMATE_MIN_BUSINESS_DAYS = 4;
const DELIVERY_ESTIMATE_MAX_BUSINESS_DAYS = 7;

function addBusinessDays(date, n) {
  const d = new Date(date);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

function formatEstimateDate(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// fromDate defaults to "today" -- the right stand-in on cart.html/
// checkout.html, where the order hasn't been paid yet. The confirmation
// email (sent right after a successful charge) should pass the actual
// payment timestamp instead, so the range in the email matches what was
// shown at checkout as closely as possible.
function getDeliveryEstimateRange(fromDate) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const start = addBusinessDays(base, DELIVERY_ESTIMATE_MIN_BUSINESS_DAYS);
  const end   = addBusinessDays(base, DELIVERY_ESTIMATE_MAX_BUSINESS_DAYS);
  return {
    start,
    end,
    startLabel: formatEstimateDate(start),
    endLabel: formatEstimateDate(end),
    rangeLabel: `${formatEstimateDate(start)} – ${formatEstimateDate(end)}`,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDeliveryEstimateRange, addBusinessDays, DELIVERY_ESTIMATE_MIN_BUSINESS_DAYS, DELIVERY_ESTIMATE_MAX_BUSINESS_DAYS };
}
if (typeof window !== 'undefined') {
  window.getDeliveryEstimateRange = getDeliveryEstimateRange;
  window.addBusinessDays = addBusinessDays;
}
