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
  'fulfillment_method', 'referral_code',
];
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

  // Creating a PaymentIntent is unauthenticated by necessity (guests check
  // out), so this is the one throttle standing between a loop and a pile
  // of Stripe objects plus burnt function quota. See _lib/rate-limit.js
  // for what this does and does not actually cover.
  if (!rateLimit(req, res, { bucket: 'pi', limit: 10, windowMs: 60000 })) return;

  const rawKey = process.env.STRIPE_SECRET_KEY || '';
  const stripeKey = rawKey.trim().replace(/[\r\n\t]/g, '');
  const stripe = Stripe(stripeKey);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { items, state, currency = 'usd', metadata = {}, method } = body;

    // Price the order from the database. Whatever `amount` the caller may
    // have sent is deliberately not read.
    //
    // fulfillment_method is read for one reason only: a warehouse pickup
    // carries no shipping allowance. It rides in metadata (that's where
    // checkout already puts it) rather than as its own body field.
    const priced = await priceCart(items, state, metadata.fulfillment_method);
    if (!priced.ok) return res.status(400).json({ error: priced.error });
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
      discount: priced.discount,
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
