/**
 * US state sales tax rates, keyed by USPS two-letter code -- the same
 * format already stored everywhere a state is captured on this site
 * (checkout.html's #checkout-state <option value>, orders.shipping_address
 * .state). Single source of truth: loaded as a plain <script> in browser
 * pages (admin.html, checkout.html, payment.html -- exposes
 * window.TAX_RATES) and required() by Vercel API routes (exposes
 * module.exports). Supabase Edge Functions run on Deno and can't require()
 * this file, so supabase/functions/send-quote/index.ts keeps its own
 * copy -- marked there to be kept in sync with this one.
 *
 * Room Ready Supply only has nexus in North Carolina (confirmed by the
 * owner 2026-10-13; see terms.html's "Sales and Use Taxes" section), so
 * every other state is 0% here, not a real published rate -- these are
 * NOT the actual state rates, they're zeroed on purpose because we have
 * no obligation to collect outside NC. If nexus is ever established in
 * another state, update that state's rate here (and in the Deno copy
 * below) to the real published rate for that state.
 *
 * Any code not in this table (e.g. DC, a territory, or a blank/unset
 * state) falls back to 0%, so an unrecognized code never silently
 * overcharges. Rates are business data the owner supplied directly, not
 * something to alter without being told to.
 */
const TAX_RATES = {
  AL: 0.0000, AK: 0.0000, AZ: 0.0000, AR: 0.0000, CA: 0.0000,
  CO: 0.0000, CT: 0.0000, DE: 0.0000, FL: 0.0000, GA: 0.0000,
  HI: 0.0000, ID: 0.0000, IL: 0.0000, IN: 0.0000, IA: 0.0000,
  KS: 0.0000, KY: 0.0000, LA: 0.0000, ME: 0.0000, MD: 0.0000,
  MA: 0.0000, MI: 0.0000, MN: 0.0000, MS: 0.0000, MO: 0.0000,
  MT: 0.0000, NE: 0.0000, NV: 0.0000, NH: 0.0000, NJ: 0.0000,
  NM: 0.0000, NY: 0.0000, NC: 0.0475, ND: 0.0000, OH: 0.0000,
  OK: 0.0000, OR: 0.0000, PA: 0.0000, RI: 0.0000, SC: 0.0000,
  SD: 0.0000, TN: 0.0000, TX: 0.0000, UT: 0.0000, VT: 0.0000,
  VA: 0.0000, WA: 0.0000, WV: 0.0000, WI: 0.0000, WY: 0.0000,
};

function getTaxRate(stateCode) {
  return TAX_RATES[String(stateCode || '').trim().toUpperCase()] || 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TAX_RATES;
  module.exports.TAX_RATES = TAX_RATES;
  module.exports.getTaxRate = getTaxRate;
}
if (typeof window !== 'undefined') {
  window.TAX_RATES = TAX_RATES;
  window.getTaxRate = getTaxRate;
}
