// Creates the Stripe PaymentIntent the checkout page pays against.
//
// The amount is computed HERE, from the products table, and the amount
// sent by the browser is ignored. Before this, `amount` came straight off
// the request body with only an `amount >= 50` cents check -- and because
// the cart lives in localStorage, the browser was the only authority on
// what a customer owed. Editing one number in devtools turned a $4,000
// order into a $0.50 one, and api/stripe-webhook.js writes the charged
// amount into orders.total as the real figure, so nothing downstream
// would have caught it. The client now sends only what it wants to buy
// (sku + quantity) and where it ships.

let Stripe;
try { Stripe = require('stripe'); } catch(e) {
  module.exports = async (req, res) => {
    res.status(500).json({ error: 'stripe module not found: ' + e.message });
  };
  return;
}

const priceCart = require('./_lib/price-cart');
const rateLimit = require('./_lib/rate-limit');

// Same-origin only. This used to be '*', which -- combined with the
// client-supplied amount -- let any site on the internet create
// PaymentIntents against this Stripe account from a visitor's browser.
// Vercel preview deploys are matched so a preview build can still check
// out against test keys.
const ALLOWED_ORIGINS = [
  'https://www.roomreadysupply.com',
  'https://roomreadysupply.com',
];
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

// Stripe caps each metadata value at 500 characters, and a value that
// blows past it fails the whole PaymentIntent (one real order hit 1832
// chars and silently broke card payment for that customer). Only the
// fields the webhook and the receipt actually read are forwarded, each
// truncated -- an arbitrary client-supplied metadata bag is not.
const ALLOWED_METADATA = [
  'order_number', 'customer_name', 'customer_email', 'business_name',
  'phone', 'shipping_address', 'items_count', 'notes', 'order_type',
  'fulfillment_method', 'referral_code', 'liftgate',
];

// Checkout's liftgate checkbox: true/false when the page sent it, undefined
// (server default) for an older page that has no checkbox.
function liftgateOpt(md) {
  const v = md && md.liftgate;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}
// Checkout's coupon ({ code, choice }) plus the customer's email for the
// per-customer limit. Validated and priced in _lib/coupons.js, never here.
function couponOpt(raw, email) {
  if (!raw || typeof raw !== 'object' || !String(raw.code || '').trim()) return undefined;
  return {
    code: String(raw.code).slice(0, 40),
    choice: raw.choice === 'reorder' ? 'reorder' : raw.choice === 'coupon' ? 'coupon' : undefined,
    email: String(email || raw.email || '').slice(0, 200),
  };
}

// What the page needs to show the discount row and the coupon's status.
function discountInfo(q) {
  return {
    discount: q.discount,
    discountKind: q.discountKind,
    reorderDiscount: q.reorderDiscount,
    coupon: q.coupon ? { code: q.coupon.code, applied: q.coupon.applied, discount: q.coupon.discount, description: q.coupon.description, error: q.coupon.error } : null,
  };
}

const BAD_ZIP_MESSAGE = "That ZIP code doesn't look right. Please check it and try again. We ship within the United States only.";

function safeMetadata(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ALLOWED_METADATA) {
    if (raw[key] == null) continue;
    const v = String(raw[key]).slice(0, 500);
    if (v) out[key] = v;
  }
  return out;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // A cross-origin POST from a browser carries an Origin header; a
  // same-origin fetch from payment.html may not send one at all, so an
  // absent Origin is allowed and only a present-but-foreign one is
  // refused.
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // Quote only: prices the cart (including the carrier shipping rate for the
  // ZIP) and returns the totals WITHOUT creating a PaymentIntent. Lets the
  // checkout page show the real delivery fee as soon as a ZIP is entered,
  // instead of the weight-formula preview. Its own throttle -- it calls the
  // carriers -- and it lives here because the project is at Vercel's
  // 12-function limit.
  try {
    const qb = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (qb && qb.quote_only === true) {
      if (!rateLimit(req, res, { bucket: 'quote', limit: 30, windowMs: 60000 })) return;
      const md = qb.metadata || {};
      const q = await priceCart(qb.items, qb.state, md.fulfillment_method, md.shipping_address, { shippingToken: qb.shipping_token, liftgate: liftgateOpt(md), coupon: couponOpt(qb.coupon, md.customer_email) });
      if (!q.ok) return res.status(400).json({ error: q.error });
      // Volume (freight) orders get no delivery figure: they go to a custom
      // quote instead (see needsFreightQuote in _lib/price-cart.js).
      if (q.needsFreightQuote) {
        return res.status(200).json({ freightQuote: true, shipping: null, tax: q.tax, subtotal: q.subtotal, ...discountInfo(q), deliveryDays: q.deliveryDays });
      }
      // Delivery could not be priced yet ('zip': no destination entered;
      // 'badzip': no such ZIP; 'unpriced': no rate came back). No figure is
      // shown or charged. A bad ZIP carries the message the page shows.
      if (q.shippingUnavailable) {
        return res.status(200).json({ shippingUnavailable: q.shippingUnavailable, ...(q.shippingUnavailable === 'badzip' ? { error: BAD_ZIP_MESSAGE } : {}), shipping: null, tax: q.tax, subtotal: q.subtotal, ...discountInfo(q), deliveryDays: q.deliveryDays });
      }
      return res.status(200).json({ shipping: q.shipping, tax: q.tax, total: q.total, subtotal: q.subtotal, ...discountInfo(q), deliveryDays: q.deliveryDays, shippingToken: q.shippingToken });
    }
  } catch (err) {
    console.error('[quote]', err && err.message);
    return res.status(500).json({ error: 'Could not price the order.' });
  }

  // Creating a PaymentIntent is unauthenticated by necessity (guests check
  // out), so this is the one throttle standing between a loop and a pile
  // of Stripe objects plus burnt function quota. See _lib/rate-limit.js
  // for what this does and does not actually cover.
  if (!rateLimit(req, res, { bucket: 'pi', limit: 10, windowMs: 60000 })) return;

  // A paid order needs an email for its receipt and order updates
  // (2026-10-28 website audit, H1). Checkout requires one; this catches a
  // stale page or a hand-built request before a charge exists.
  {
    const b0 = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const email = String((b0.metadata && b0.metadata.customer_email) || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Please go back to checkout and enter a valid email address. Your receipt is sent there.' });
    }
  }

  const rawKey = process.env.STRIPE_SECRET_KEY || '';
  const stripeKey = rawKey.trim().replace(/[\r\n\t]/g, '');
  const stripe = Stripe(stripeKey);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { items, state, currency = 'usd', metadata = {}, method, shipping_token, coupon } = body;

    // Price the order from the database. Whatever `amount` the caller may
    // have sent is deliberately not read.
    //
    // fulfillment_method is read for one reason only: a warehouse pickup
    // carries no shipping allowance. It rides in metadata (that's where
    // checkout already puts it) rather than as its own body field.
    // The customer's address rides in metadata.shipping_address (JSON):
    // per-distributor shipping is rated from each warehouse to this ZIP.
    const priced = await priceCart(items, state, metadata.fulfillment_method, metadata.shipping_address, { shippingToken: shipping_token, liftgate: liftgateOpt(metadata), coupon: couponOpt(coupon, metadata.customer_email) });
    if (!priced.ok) return res.status(400).json({ error: priced.error });
    // Enforced here, not just in the checkout UI: a volume order is never
    // charged a guessed freight figure, even from a stale page or a
    // hand-built request.
    if (priced.needsFreightQuote) {
      return res.status(409).json({
        freightQuote: true,
        error: 'This order ships by freight. Please request a custom quote so we can secure the best freight rate for you.',
      });
    }
    // The delivery charge shown is the charge (final update package,
    // 2026-10-13): payment is never taken without a real WARP price.
    if (priced.shippingUnavailable) {
      return res.status(409).json({
        shippingUnavailable: priced.shippingUnavailable,
        error: priced.shippingUnavailable === 'zip'
          ? 'Please enter your delivery ZIP code so we can price delivery.'
          : priced.shippingUnavailable === 'badzip' ? BAD_ZIP_MESSAGE
          : "We couldn't calculate delivery for this order right now. Please try again in a minute, or call (252) 616-0088 and we'll help you complete your order.",
      });
    }
    if (priced.amountCents < 50) {
      return res.status(400).json({ error: 'Order total is below the $0.50 minimum.' });
    }

    // ACH (us_bank_account) gets its own PaymentIntent, kept entirely
    // separate from the card one -- a single intent's payment_method_types
    // is fixed at creation, and the card checkout already renders its own
    // dedicated Card Element, so a shared intent would make Stripe's
    // Payment Element show a second, redundant card entry form alongside
    // it. The frontend only ever creates this one lazily, when the
    // customer actually picks "Bank Account (ACH)".
    const isAch = method === 'ach';

    // Stripe does not support manual-capture (the auth-hold used here for
    // orders over $10,000) on ACH -- a bank debit is fully async already,
    // there is no "authorize now, capture later" step to hold. ACH orders
    // of any size settle automatically once the debit clears.
    const captureMethod = isAch ? 'automatic' : (priced.amountCents > 1000000 ? 'manual' : 'automatic');

    const paymentIntent = await stripe.paymentIntents.create({
      amount: priced.amountCents,
      currency,
      payment_method_types: isAch ? ['us_bank_account'] : ['card'],
      capture_method: captureMethod,
      metadata: {
        order_source: 'roomreadysupply.com',
        ...safeMetadata(metadata),
        // Server-computed, so the webhook's orders.tax figure comes from
        // the same pass that set the charge amount rather than from a
        // number the browser supplied alongside it.
        tax_amount: String(Math.round(priced.tax * 100)),
        // Same reasoning as tax_amount: the webhook writes orders.shipping
        // from the pass that set the charge, not from a browser figure.
        shipping_amount: String(Math.round(priced.shipping * 100)),
        // Per-supplier delivery estimate (business days after payment), so
        // the confirmation email shows the same range as checkout.
        delivery_days_min: String(priced.deliveryDays.min),
        delivery_days_max: String(priced.deliveryDays.max),
        // The coupon this charge was priced with, so create-order and the
        // webhook record exactly what was charged, not a re-evaluation.
        ...(priced.coupon && priced.coupon.applied ? {
          coupon_id: priced.coupon.id,
          coupon_code: priced.coupon.code,
          coupon_discount: String(Math.round(priced.coupon.discount * 100)),
        } : {}),
      },
    });

    // The priced totals go back so the page can show exactly what will be
    // charged -- if the browser's own arithmetic ever drifts from the
    // server's, the customer sees the server's figure, not a stale one.
    //
    // `discount` and `shipping` are included because payment.html renders
    // both as their own summary lines; without them those lines stay
    // hidden and the displayed rows wouldn't add up to the total charged.
    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      subtotal: priced.subtotal,
      ...discountInfo(priced),
      tax: priced.tax,
      shipping: priced.shipping,
      total: priced.total,
      amountCents: priced.amountCents,
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Could not start payment. Please try again.' });
  }
};
