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
 * Any code not in this table (e.g. DC, a territory, or a blank/unset
 * state) falls back to 0% -- the same rate as the five states that are
 * genuinely tax-free (AK, DE, MT, NH, OR), so an unrecognized code never
 * silently overcharges. Rates are business data the owner supplied
 * directly, not something to alter without being told to.
 */
const TAX_RATES = {
  AL: 0.0400, AK: 0.0000, AZ: 0.0560, AR: 0.0650, CA: 0.0725,
  CO: 0.0290, CT: 0.0635, DE: 0.0000, FL: 0.0600, GA: 0.0400,
  HI: 0.0400, ID: 0.0600, IL: 0.0625, IN: 0.0700, IA: 0.0600,
  KS: 0.0650, KY: 0.0600, LA: 0.0500, ME: 0.0550, MD: 0.0600,
  MA: 0.0625, MI: 0.0600, MN: 0.0688, MS: 0.0700, MO: 0.0423,
  MT: 0.0000, NE: 0.0550, NV: 0.0685, NH: 0.0000, NJ: 0.0663,
  NM: 0.0488, NY: 0.0400, NC: 0.0475, ND: 0.0500, OH: 0.0575,
  OK: 0.0450, OR: 0.0000, PA: 0.0600, RI: 0.0700, SC: 0.0600,
  SD: 0.0420, TN: 0.0700, TX: 0.0625, UT: 0.0610, VT: 0.0600,
  VA: 0.0530, WA: 0.0650, WV: 0.0600, WI: 0.0500, WY: 0.0400,
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
