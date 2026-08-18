const { createClient } = require('@supabase/supabase-js');

let Stripe;
try { Stripe = require('stripe'); } catch (e) { Stripe = null; }

/**
 * Backfills real proof-of-payment (stripe_payment_intent_id,
 * stripe_charge_id, receipt_url, paid_at) onto an order that was already
 * marked 'paid' before that capture existed -- api/stripe-webhook.js only
 * writes these fields at the moment a payment actually completes, so any
 * order paid before that fix has nothing stored to verify it against.
 *
 * Finds the real Stripe PaymentIntent by searching a window of intents
 * around the order's creation time for one whose metadata.order_number
 * matches -- the exact same metadata api/send-invoice.js and payment.html
 * already stamp onto every charge this app creates, so this is looking
 * for the real transaction, not guessing at one.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!Stripe) return res.status(500).json({ error: 'stripe module not available' });

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ error: 'order_id is required' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, payment_status, created_at, stripe_payment_intent_id')
    .eq('id', order_id)
    .single();

  if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });
  if (order.payment_status !== 'paid') {
    return res.status(400).json({ error: 'This order is not marked paid -- nothing to look up.' });
  }
  if (order.stripe_payment_intent_id) {
    return res.status(400).json({ error: 'This order already has payment proof attached.' });
  }

  const rawKey = (process.env.STRIPE_SECRET_KEY || '').trim().replace(/[\r\n\t]/g, '');
  const stripe = Stripe(rawKey);

  // Search a window starting a day before the order was created (a paid
  // invoice's PaymentIntent is created when the customer actually pays,
  // which can be well after the order row itself was inserted as
  // pending_invoice) through now.
  const createdAfter = Math.floor(new Date(order.created_at).getTime() / 1000) - 86400;

  let match = null;
  try {
    let startingAfter;
    for (let page = 0; page < 20 && !match; page++) {
      const list = await stripe.paymentIntents.list({
        limit: 100,
        created: { gte: createdAfter },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      match = list.data.find((pi) => pi.metadata?.order_number === order.order_number) || null;
      if (!list.has_more || !list.data.length) break;
      startingAfter = list.data[list.data.length - 1].id;
    }
  } catch (err) {
    console.error('[lookup-payment-proof] Stripe list failed:', err.message);
    return res.status(500).json({ error: 'Stripe lookup failed: ' + err.message });
  }

  if (!match) {
    return res.status(404).json({ error: 'No matching Stripe payment found for order ' + order.order_number + ' -- it may predate what this search window covers, or was recorded under a different order number.' });
  }

  // Re-fetch with the charge expanded to get receipt_url -- list() doesn't
  // reliably include it without asking.
  let full = match;
  try {
    full = await stripe.paymentIntents.retrieve(match.id, { expand: ['latest_charge'] });
  } catch (err) {
    console.error('[lookup-payment-proof] retrieve/expand failed, using list result:', err.message);
  }

  const chargeObj = (full.latest_charge && typeof full.latest_charge === 'object') ? full.latest_charge : null;
  const paymentProof = {
    stripe_payment_intent_id: full.id || null,
    stripe_charge_id: (typeof full.latest_charge === 'string' ? full.latest_charge : chargeObj?.id) || null,
    receipt_url: chargeObj?.receipt_url || null,
    stripe_livemode: typeof full.livemode === 'boolean' ? full.livemode : null,
    paid_at: full.created ? new Date(full.created * 1000).toISOString() : new Date().toISOString(),
  };

  const { error: updateErr } = await supabase.from('orders').update(paymentProof).eq('id', order_id);
  if (updateErr) {
    console.error('[lookup-payment-proof] order update failed:', updateErr.message);
    return res.status(500).json({ error: updateErr.message });
  }

  res.status(200).json({ success: true, ...paymentProof });
};
