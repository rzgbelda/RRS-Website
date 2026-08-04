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

    // Columns must match the live orders table. It has no amount_total,
    // currency, items, tax_amount, po_number, stripe_* or shipping_status
    // columns -- inserting those made this handler fail every time.
    const totalDollars = (pi.amount || 0) / 100;
    const taxDollars   = meta.tax_amount ? parseInt(meta.tax_amount) / 100 : 0;

    const orderData = {
      order_number:   meta.order_number || `RRS-${Date.now()}`,
      status:         'pending',
      payment_status: 'paid',
      payment_method: 'card',
      customer_name:  meta.customer_name  || null,
      customer_email: meta.customer_email || null,
      business_name:  meta.business_name || meta.customer_name || 'N/A',
      phone:          meta.phone || null,
      shipping_address: meta.shipping_address ? JSON.parse(meta.shipping_address) : null,
      subtotal:       Math.max(0, totalDollars - taxDollars),
      total:          totalDollars,
      notes:          meta.notes || null,
      order_type:     meta.order_type || 'one_time',
    };

    const parsedItems = meta.items ? JSON.parse(meta.items) : [];

    // The browser already inserts this order client-side on a successful
    // charge. This handler exists as the safety net for when it does not
    // (customer closes the tab, connection drops). Upserting on
    // order_number means it records the order if it is missing and is a
    // no-op if the browser already got there -- never a duplicate.
    const { data: upserted, error } = await supabase
      .from('orders')
      .upsert(orderData, { onConflict: 'order_number', ignoreDuplicates: true })
      .select('id');

    if (error) {
      console.error('Supabase upsert error:', error);
    } else {
      const createdHere = Array.isArray(upserted) && upserted.length > 0;
      console.log('[webhook]', orderData.order_number, createdHere ? 'recorded (browser did not)' : 'already recorded by browser');

      // Only write line items for an order this handler actually created.
      if (createdHere && parsedItems.length) {
        const itemRows = parsedItems.map(function (i) {
          return {
            order_id:       upserted[0].id,
            product_name:   i.name || 'Product',
            price_per_case: parseFloat(i.price) || 0,
            quantity:       parseInt(i.qty || i.quantity) || 1,
          };
        });
        const itemsRes = await supabase.from('order_items').insert(itemRows);
        if (itemsRes.error) console.error('order_items insert error:', itemsRes.error.message);
      }

      // Everything below is fallback work. When the browser completed
      // normally it has already sent the receipt and booked freight, so
      // repeating it here would double-send email and -- more expensively --
      // book a second Estes BOL against the same order. Only run when this
      // handler was the one that had to record the order.
      if (createdHere) {
        const emailOrder = { ...orderData, items: parsedItems, amount_total: pi.amount };
        const shippingAddr = orderData.shipping_address || {};

        Promise.all([
          orderData.customer_email
            ? sendCustomerConfirmation(emailOrder).catch(function (e) { console.error('Customer email failed:', e.message); })
            : Promise.resolve(),

          sendInternalAlert(emailOrder).catch(function (e) { console.error('Internal alert email failed:', e.message); }),

          (shippingAddr.street && shippingAddr.city && shippingAddr.state && shippingAddr.zip)
            ? bookEstesShipment(orderData.order_number, shippingAddr, parsedItems, meta.estes_quote_id || null)
                .then(function (bol) {
                  if (bol) {
                    return supabase.from('orders')
                      .update({
                        bol_number:     bol.bol_number,
                        pro_number:     bol.pro_number,
                        bol_created_at: new Date().toISOString(),
                        status:         'processing',
                      })
                      .eq('order_number', orderData.order_number);
                  }
                })
                .catch(function (e) { console.error('Estes booking failed:', e.message); })
            : Promise.resolve(),
        ]);
      }
    }
  }

  res.status(200).json({ received: true });
};
