const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { sendCustomerConfirmation, sendInternalAlert } = require('./send-emails');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const meta = pi.metadata || {};

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const orderData = {
      order_number: meta.order_number || `RRS-${Date.now()}`,
      status: 'paid',
      payment_status: 'paid',
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: pi.latest_charge || null,
      amount_total: pi.amount,
      currency: pi.currency,
      customer_name: meta.customer_name || null,
      customer_email: meta.customer_email || null,
      business_name: meta.business_name || null,
      phone: meta.phone || null,
      shipping_address: meta.shipping_address ? JSON.parse(meta.shipping_address) : null,
      items: meta.items ? JSON.parse(meta.items) : [],
      notes: meta.notes || null,
      order_type: meta.order_type || 'one_time',
      referral_code: meta.referral_code || null,
      sub_distributor: meta.sub_distributor || null,
      tax_amount: meta.tax_amount ? parseInt(meta.tax_amount) : 0,
      shipping_cost: null, // pending freight quote
      shipping_status: 'awaiting_freight_quote',
      po_number: meta.po_number || null,
    };

    const { error } = await supabase.from('orders').insert(orderData);
    if (error) {
      console.error('Supabase insert error:', error);
    } else {
      // Send emails in parallel — don't let email failure block the 200 response
      const emailOrder = { ...orderData, items: meta.items ? JSON.parse(meta.items) : [] };
      Promise.all([
        orderData.customer_email ? sendCustomerConfirmation(emailOrder).catch(function (e) { console.error('Customer email failed:', e.message); }) : Promise.resolve(),
        sendInternalAlert(emailOrder).catch(function (e) { console.error('Internal alert email failed:', e.message); }),
      ]);
    }
  }

  res.status(200).json({ received: true });
};
