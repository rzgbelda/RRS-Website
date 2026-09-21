const { createClient } = require('@supabase/supabase-js');
const { getTaxRate } = require('../../tax-rates');

/**
 * Recomputes an order total from the database, ignoring whatever the
 * browser claimed it should be.
 *
 * Why this exists: api/create-payment-intent.js used to take `amount`
 * straight off the request body and only check it was >= 50 cents. The
 * cart lives in localStorage, so the browser was the sole authority on
 * what a customer owed -- editing one number in devtools turned a $4,000
 * order into a $0.50 one, and api/stripe-webhook.js then wrote that
 * charged amount into orders.total as the real figure. Nothing downstream
 * would have flagged it.
 *
 * So the client now sends only *what* it wants to buy (sku + quantity)
 * and where it ships; the price of each line, the tier applied, and the
 * tax come from products/tax-rates on the server.
 *
 * The tier and dozen rules below intentionally mirror getTierPrice() /
 * isSoldByDozen() in script.js -- that file is a browser <script> with no
 * module exports, so it cannot be required() here. If the tier thresholds
 * change in one place they must change in the other, or the price shown
 * in the cart and the price actually charged will silently disagree.
 */

// Mirrors isSoldByDozen() in script.js (products.unit === 'dozen').
function isSoldByDozen(row) {
  return String(row && row.unit || '').trim().toLowerCase() === 'dozen';
}

// Mirrors cleanPrice() in script.js.
function cleanPrice(v) {
  return Number(String(v == null ? '' : v).replace('$', '').replace(',', '').trim()) || 0;
}

// Mirrors getTierPrice() in script.js. Tier 3 has no upper bound on
// purpose: a 50+ case order still pays this rate automatically, and any
// further discount is negotiated by sales rather than computed here.
function tierPriceFor(row, qty) {
  const tier1 = cleanPrice(row.price_tier1);
  const tier2 = cleanPrice(row.price_tier2);
  const tier3 = cleanPrice(row.price_tier3);
  const base  = cleanPrice(row.price);

  if (isSoldByDozen(row)) return tier1 || base || 0;
  if (qty >= 30) return tier3 || tier2 || tier1 || base || 0;
  if (qty >= 6)  return tier2 || tier1 || base || 0;
  return tier1 || base || 0;
}

/**
 * items: [{ sku, quantity }] as sent by the browser.
 * state: USPS two-letter code used for sales tax.
 *
 * Returns { ok: true, amountCents, subtotal, tax, total, lines } or
 * { ok: false, error } -- the caller turns a failure into a 400 rather
 * than falling back to a client-supplied figure.
 */
async function priceCart(items, state) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Cart is empty.' };
  }
  if (items.length > 200) {
    return { ok: false, error: 'Too many line items.' };
  }

  // Whether this order is on the Reorder Program, decided HERE from the
  // schedule on each line rather than from any client-sent discount flag
  // or amount -- same reason the totals are recomputed at all. A line is
  // recurring when it carries a real frequency; "Once" (or nothing) is a
  // one-time buy. Mirrors isReorderLine() in script.js.
  const hasReorder = items.some(raw => {
    const r = String(raw && raw.reorder || '').trim().toLowerCase();
    return !!r && r !== 'once';
  });

  // Collapse duplicate SKUs before pricing: two lines of 3 must be priced
  // as one line of 6 (and get the 6-29 tier), which is also how the cart
  // itself stores them.
  const wanted = new Map();
  for (const raw of items) {
    const sku = String(raw && raw.sku || '').trim();
    const qty = Math.floor(Number(raw && raw.quantity));
    if (!sku) return { ok: false, error: 'An item is missing its SKU.' };
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: 'Invalid quantity for ' + sku + '.' };
    }
    if (qty > 100000) return { ok: false, error: 'Quantity too large for ' + sku + '.' };
    wanted.set(sku, (wanted.get(sku) || 0) + qty);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: rows, error } = await supabase
    .from('products')
    .select('sku, name, price, price_tier1, price_tier2, price_tier3, unit, is_active')
    .in('sku', Array.from(wanted.keys()));

  if (error) return { ok: false, error: 'Could not price this order.' };

  const bySku = new Map((rows || []).map(r => [r.sku, r]));

  let subtotal = 0;
  const lines = [];
  for (const [sku, qty] of wanted) {
    const row = bySku.get(sku);
    // A SKU that isn't in the catalog, or has been deactivated (e.g. the
    // discontinued RDU line), must not be purchasable -- otherwise a
    // stale cart or a hand-written request could still buy it.
    if (!row) return { ok: false, error: 'This item is no longer available: ' + sku };
    if (row.is_active === false) {
      return { ok: false, error: 'This item is no longer available: ' + (row.name || sku) };
    }

    const unitPrice = tierPriceFor(row, qty);
    if (!(unitPrice > 0)) {
      return { ok: false, error: 'No price is set for ' + (row.name || sku) + '.' };
    }
    subtotal += unitPrice * qty;
    lines.push({ sku, name: row.name, quantity: qty, unitPrice });
  }

  // Rounded to cents at each step the same way the browser summary does,
  // so the figure the customer saw and the figure charged agree.
  subtotal = Math.round(subtotal * 100) / 100;

  // Reorder Program: 5% off the merchandise subtotal, stacking on top of
  // the per-item volume tiers already applied above. Must stay in step
  // with REORDER_DISCOUNT_RATE in script.js -- that file is a plain
  // browser script with no exports, so the rate cannot be shared by
  // reference, and if the two disagree the customer is shown one number
  // and charged another.
  const REORDER_DISCOUNT_RATE = 0.05;
  const discount = hasReorder
    ? Math.round(subtotal * REORDER_DISCOUNT_RATE * 100) / 100
    : 0;
  const discountedSubtotal = Math.round((subtotal - discount) * 100) / 100;

  // Tax follows the discounted subtotal -- taxing the pre-discount figure
  // would charge sales tax on money the customer never paid.
  const tax = Math.round(discountedSubtotal * getTaxRate(state) * 100) / 100;
  const total = Math.round((discountedSubtotal + tax) * 100) / 100;

  return {
    ok: true,
    amountCents: Math.round(total * 100),
    subtotal,
    discount,
    hasReorder,
    discountedSubtotal,
    tax,
    total,
    lines,
  };
}

module.exports = priceCart;
module.exports.priceCart = priceCart;
module.exports.tierPriceFor = tierPriceFor;
