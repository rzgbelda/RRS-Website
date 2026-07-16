const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { sendCustomerConfirmation, sendInternalAlert } = require('./send-emails');

const SUPABASE_FUNCTIONS_URL = 'https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/estes-freight';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function bookEstesShipment(orderNumber, shippingAddr, items, quoteId) {
  const payload = {
    action: 'book',
    payload: {
      order_number: orderNumber,
      quote_id: quoteId || undefined,
      destination: {
        name:   shippingAddr.name   || 'Customer',
        street: shippingAddr.street || '',
        city:   shippingAddr.city   || '',
        state:  shippingAddr.state  || '',
        zip:    shippingAddr.zip    || '',
        phone:  shippingAddr.phone  || '',
      },
      items: (items || []).map(function (i) {
        return {
          description: i.name || 'Supply Item',
          weight_lbs:  parseFloat(i.weight_lbs) || 20,
          quantity:    parseInt(i.quantity) || 1,
        };
      }),
    },
  };

  const res = await fetch(SUPABASE_FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Estes booking failed (' + res.status + ')');
  console.log('[Estes] BOL created:', data.bol_number, '| PRO:', data.pro_number);
  return data;
}

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

    const parsedItems = meta.items ? JSON.parse(meta.items) : [];
    const { error } = await supabase.from('orders').insert(orderData);
    if (error) {
      console.error('Supabase insert error:', error);
    } else {
      const emailOrder = { ...orderData, items: parsedItems };
      const shippingAddr = orderData.shipping_address || {};

      // Run all post-order tasks in parallel — failures log but don't block
      Promise.all([
        // Customer confirmation email
        orderData.customer_email
          ? sendCustomerConfirmation(emailOrder).catch(function (e) { console.error('Customer email failed:', e.message); })
          : Promise.resolve(),

        // Internal alert email
        sendInternalAlert(emailOrder).catch(function (e) { console.error('Internal alert email failed:', e.message); }),

        // Auto-book Estes LTL shipment if we have a full shipping address
        (shippingAddr.street && shippingAddr.city && shippingAddr.state && shippingAddr.zip)
          ? bookEstesShipment(orderData.order_number, shippingAddr, parsedItems, meta.estes_quote_id || null)
              .then(function (bol) {
                if (bol) {
                  return supabase.from('orders')
                    .update({ bol_number: bol.bol_number, pro_number: bol.pro_number, shipping_status: 'booked' })
                    .eq('order_number', orderData.order_number);
                }
              })
              .catch(function (e) { console.error('Estes booking failed:', e.message); })
          : Promise.resolve(),
      ]);
    }
  }

  res.status(200).json({ received: true });
};
