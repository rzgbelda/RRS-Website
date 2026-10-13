/**
 * Estimated delivery date range shown on the Delivery line (cart.html,
 * checkout.html) and in the order confirmation email -- a RANGE, never a
 * single date, per the CEO's explicit instruction (2026-10-13): a single
 * date reads as a promise, a range reads honest.
 *
 * Per supplier (final update package, 2026-10-13): RRS transmits the order
 * to the supplier within 1-2 business days after payment, and the
 * supplier's own delivery time (from the RRS Supplier Information Report,
 * 2026-10-13) starts at the supplier's order acknowledgement, AFTER that.
 * So each supplier's range is
 *   [1 + supplier min, 2 + supplier max] business days after payment,
 * and an order from several suppliers shows the slowest one's range, since
 * the order is not all there until the last shipment arrives.
 *
 * The per-supplier table lives server-side in api/_lib/delivery-days.js:
 * products.distributor is internal and supplier names must never reach the
 * browser (this file is public), so the browser only ever receives the
 * resulting { min, max } day counts from api/_lib/price-cart.js. A supplier
 * with no published time, or a product with no distributor, falls back to
 * the flat 4-7 business days below.
 *
 * No federal holiday calendar exists in this codebase (only weekends are
 * skipped here, same gap as every other business-day helper in the repo
 * -- api/_lib/tforce.js's pickupDate(), supabase/functions/warp-freight's
 * nextBusinessDay()). A holiday landing inside the window will make the
 * real delivery land a day or two later than shown.
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
//
// days = { min, max } business days from deliveryDaysForCart (via the
// server); omitted or invalid, the flat 4-7 fallback applies.
function getDeliveryEstimateRange(fromDate, days) {
  const base = fromDate ? new Date(fromDate) : new Date();
  const ok = days && Number(days.min) > 0 && Number(days.max) >= Number(days.min);
  const start = addBusinessDays(base, ok ? Number(days.min) : DELIVERY_ESTIMATE_MIN_BUSINESS_DAYS);
  const end   = addBusinessDays(base, ok ? Number(days.max) : DELIVERY_ESTIMATE_MAX_BUSINESS_DAYS);
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
