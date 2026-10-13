// Per-supplier delivery time, in business days after payment. Server-only:
// supplier names are internal and must never reach the browser, so this
// table is not in the public delivery-estimate.js -- price-cart.js returns
// only the resulting { min, max } numbers. See delivery-estimate.js for how
// the range is shown and why it is a range.

const {
  DELIVERY_ESTIMATE_MIN_BUSINESS_DAYS,
  DELIVERY_ESTIMATE_MAX_BUSINESS_DAYS,
} = require('../../delivery-estimate');

// RRS -> supplier order transmission window, business days after payment.
const TRANSMIT_MIN_BUSINESS_DAYS = 1;
const TRANSMIT_MAX_BUSINESS_DAYS = 2;

// Supplier delivery time in business days from the supplier's order
// acknowledgement, keyed by products.distributor slug. From the RRS
// Supplier Information Report (2026-10-13):
//   Starlinen      ships in 2-3 business days, delivery up to 5
//   Wraptite       1-2 business days (in-stock, before the midday cutoff)
//   Sasso          NC local delivery 1-2 business days; outside NC by LTL,
//                  "longer, confirmed when ordering" -- no number, so the
//                  flat fallback applies (ncOnly below)
//   Imperial Brady 3-5 business days
//   NPS            ~24-hour turnaround + ~3 business days freight, ~4 total
//   InnStyle       2-3, max 5
//   Bargoose       5-7 business days (the long pole: up to ~9 after payment)
const SUPPLIER_DELIVERY_DAYS = {
  'starlinen':      { min: 3, max: 5 },
  'wraptite':       { min: 1, max: 2 },
  'sasso':          { min: 1, max: 2, ncOnly: true },
  'imperial-brady': { min: 3, max: 5 },
  'nps':            { min: 4, max: 4 },
  'innstyle':       { min: 2, max: 5 },
  'bargoose':       { min: 5, max: 7 },
};

// Business days after payment for one supplier's shipment.
function deliveryDaysForSupplier(slug, destState) {
  const s = SUPPLIER_DELIVERY_DAYS[String(slug || '').trim().toLowerCase()];
  if (!s || (s.ncOnly && String(destState || '').trim().toUpperCase() !== 'NC')) {
    return { min: DELIVERY_ESTIMATE_MIN_BUSINESS_DAYS, max: DELIVERY_ESTIMATE_MAX_BUSINESS_DAYS };
  }
  return { min: TRANSMIT_MIN_BUSINESS_DAYS + s.min, max: TRANSMIT_MAX_BUSINESS_DAYS + s.max };
}

// Business days after payment for a whole order: the slowest supplier's
// range. slugs = the distributor of every line (blank = no distributor).
function deliveryDaysForCart(slugs, destState) {
  const list = Array.isArray(slugs) && slugs.length ? slugs : [''];
  return list.map(s => deliveryDaysForSupplier(s, destState)).reduce(
    (acc, d) => ({ min: Math.max(acc.min, d.min), max: Math.max(acc.max, d.max) }),
    { min: 0, max: 0 });
}

module.exports = { deliveryDaysForCart, deliveryDaysForSupplier, SUPPLIER_DELIVERY_DAYS };
