let Stripe;
try { Stripe = require('stripe'); } catch(e) {
  module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'stripe module not found: ' + e.message });
  };
  return;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawKey = process.env.STRIPE_SECRET_KEY || '';
  const stripeKey = rawKey.trim().replace(/[\r\n\t]/g, '');
  console.log('[stripe] key prefix:', stripeKey.slice(0, 12), 'length:', stripeKey.length);
  const stripe = Stripe(stripeKey);

  try {
    const { amount, currency = 'usd', metadata = {}, method } = req.body;

    if (!amount || amount < 50) {
      return res.status(400).json({ error: 'Invalid amount' });
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
    const captureMethod = isAch ? 'automatic' : (amount > 1000000 ? 'manual' : 'automatic');

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // cents
      currency,
      payment_method_types: isAch ? ['us_bank_account'] : ['card'],
      capture_method: captureMethod,
      metadata: {
        order_source: 'roomreadysupply.com',
        ...metadata,
      },
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
