const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { Webhook } = require('svix');
const { sendCustomerConfirmation, sendInternalAlert, sendPaymentFailedAlert } = require('./_lib/send-emails');

// Resend signs every webhook event with Svix; RESEND_WEBHOOK_SECRET is the
// "whsec_..." signing secret from the Resend dashboard's Webhooks page
// (a different value from RESEND_API_KEY). Verifying this is what stops
// anyone from POSTing fake open/click events here to fabricate campaign
// stats -- there is no other auth on this endpoint.
const RESEND_EVENT_MAP = {
  'email.sent':             'sent',
  'email.delivered':        'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened':           'opened',
  'email.clicked':          'clicked',
  'email.bounced':          'bounced',
  'email.complained':       'complained',
};

async function handleResendWebhook(req, res) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[resend webhook] RESEND_WEBHOOK_SECRET is not set -- rejecting.');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let payload;
  try {
    const rawBody = await getRawBody(req);
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(rawBody, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    console.error('[resend webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const eventType = RESEND_EVENT_MAP[payload.type];
  if (!eventType) return res.status(200).json({ received: true, ignored: payload.type });

  const d = payload.data || {};
  const recipient = Array.isArray(d.to) ? d.to[0] : d.to;
  if (!recipient || !d.email_id) return res.status(200).json({ received: true, ignored: 'missing recipient/email_id' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // campaign_id/automation_id aren't in Resend's payload -- backfilled by
  // matching resend_email_id against whichever 'sent' row this endpoint
  // already logged for this same send (send_campaign in send-invoice.js
  // and the automation sweep in create-order.js both insert one at send
  // time with the real Resend id).
  let campaignId = null, automationId = null;
  const { data: sentRow } = await supabase
    .from('campaign_email_events')
    .select('campaign_id, automation_id')
    .eq('resend_email_id', d.email_id)
    .eq('event_type', 'sent')
    .limit(1)
    .maybeSingle();
  if (sentRow) { campaignId = sentRow.campaign_id; automationId = sentRow.automation_id; }

  const { error } = await supabase.from('campaign_email_events').insert({
    campaign_id: campaignId,
    automation_id: automationId,
    resend_email_id: d.email_id,
    recipient,
    event_type: eventType,
    link_url: d.click?.link || null,
    occurred_at: payload.created_at || new Date().toISOString(),
    raw: payload,
  });
  if (error) console.error('[resend webhook] insert failed:', error.message);

  return res.status(200).json({ received: true });
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const SUPABASE_FUNCTIONS_URL = 'https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/warp-freight';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function bookWarpShipment(orderNumber, shippingAddr, items) {
  // No quote_id survives to this fallback path (nothing ever set an
  // estes_quote_id/warp_quote_id in the payment-intent metadata this webhook
  // reads from) -- Warp still books fine without one, just without the
  // price-lock guarantee a prior quote would give.
  const payload = {
    action: 'book',
    payload: {
      order_number: orderNumber,
      destination: {
        name:   shippingAddr.name   || 'Customer',
        street: shippingAddr.street || '',
        city:   shippingAddr.city   || '',
        state:  shippingAddr.state  || '',
        zip:    shippingAddr.zip    || '',
        phone:  shippingAddr.phone  || '',
        email:  shippingAddr.email  || '',
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
  if (!res.ok || data.error) throw new Error(data.error || 'Warp booking failed (' + res.status + ')');
  console.log('[Warp] booked — order #:', data.warp_order_number, '| tracking #:', data.tracking_number);
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // Resend's delivery/open/click/bounce/unsubscribe webhook shares this
  // endpoint -- distinguished by its own svix-signature header, which
  // Stripe never sends. Both need the raw, unparsed body for signature
  // verification (bodyParser is already off for this whole file, for
  // Stripe's own signing below), so this has to branch before any JSON
  // parsing happens, not after. Sharing the file rather than adding a
  // 13th Vercel function (Hobby plan caps at 12, already at that cap).
  if (req.headers['svix-signature']) {
    return handleResendWebhook(req, res);
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const meta = pi.metadata || {};

    // Real proof of payment, not just a status flag: pi.id is always
    // present; the charge id/receipt url depend on the Stripe API version
    // (newer versions expose latest_charge as a bare id string, older ones
    // nest a full charges list) so both shapes are checked rather than
    // assuming one. receipt_url is Stripe's own hosted receipt page --
    // when present it's the most direct "proof the customer paid" link
    // available, since it's rendered by Stripe itself, not this app.
    const chargeObj  = pi.charges?.data?.[0] || null;
    const paymentProof = {
      stripe_payment_intent_id: pi.id || null,
      stripe_charge_id: (typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id) || chargeObj?.id || null,
      receipt_url: chargeObj?.receipt_url || null,
      stripe_livemode: typeof pi.livemode === 'boolean' ? pi.livemode : null,
      paid_at: new Date().toISOString(),
    };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Columns must match the live orders table. It has no amount_total,
    // currency, items, tax_amount, po_number, or shipping_status columns
    // -- inserting those made this handler fail every time. stripe_* and
    // paid_at DO exist as of the payment-proof migration above.
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
      fulfillment_method: meta.fulfillment_method || 'ship',
      ...paymentProof,
    };

    // Item detail no longer travels through Stripe metadata (it blew past
    // the 500-char per-field cap on any order with more than a handful of
    // products). The browser writes items directly to order_items right
    // after charge success, so in the normal case this handler is a no-op
    // and never needed them. If this handler had to record the order itself
    // (browser died mid-flow), there is no item detail to recover here --
    // items_count is a hint only. The customer's receipt email still carries
    // full item detail as a fallback for manual reconciliation.
    const parsedItems = [];
    const expectedItemCount = parseInt(meta.items_count) || 0;

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
      console.log('[webhook]', orderData.order_number, createdHere ? 'recorded (browser did not)' : 'already recorded by browser',
        createdHere ? `(expected ${expectedItemCount} items, none recoverable from metadata -- see receipt email)` : '');

      // Everything below is fallback work. When the browser completed
      // normally it has already sent the receipt and booked freight, so
      // repeating it here would double-send email and -- more expensively --
      // book a second Warp shipment against the same order. Only run when
      // this handler was the one that had to record the order.
      if (createdHere) {
        const emailOrder = { ...orderData, items: parsedItems, amount_total: pi.amount };
        const shippingAddr = orderData.shipping_address || {};

        Promise.all([
          orderData.customer_email
            ? sendCustomerConfirmation(emailOrder).catch(function (e) { console.error('Customer email failed:', e.message); })
            : Promise.resolve(),

          sendInternalAlert(emailOrder).catch(function (e) { console.error('Internal alert email failed:', e.message); }),

          // No item detail survives to this fallback path (see note above),
          // and freight can't be booked sensibly with an empty commodity
          // list, so skip auto-booking rather than send Warp a bogus
          // zero-item request. Staff can book manually from the admin panel
          // -- this only triggers in the rare case the browser died mid-flow.
          (shippingAddr.street && shippingAddr.city && shippingAddr.state && shippingAddr.zip && parsedItems.length)
            ? bookWarpShipment(orderData.order_number, shippingAddr, parsedItems)
                .then(function (booked) {
                  if (booked) {
                    return supabase.from('orders')
                      .update({
                        bol_number:     booked.warp_order_number,
                        pro_number:     booked.tracking_number,
                        bol_created_at: new Date().toISOString(),
                        status:         'processing',
                      })
                      .eq('order_number', orderData.order_number);
                  }
                })
                .catch(function (e) { console.error('Warp booking failed:', e.message); })
            : Promise.resolve(),
        ]);
      } else {
        // Order already existed. This is the normal path for an emailed
        // invoice paid via a Stripe Payment Link: api/send-invoice.js
        // inserts the order up front as payment_status 'pending_invoice'
        // (no browser checkout ever runs), so this is the only place that
        // ever flips it to paid and sends the confirmation emails.
        //
        // Guarded on payment_status !== 'paid' so a Stripe retry of the
        // same event -- or a normal browser-completed card order, which
        // already inserted as 'paid' -- can never double-send.
        const { data: existing, error: fetchErr } = await supabase
          .from('orders')
          .select('id, payment_status, order_number, customer_name, customer_email, business_name, phone, shipping_address, subtotal, total')
          .eq('order_number', orderData.order_number)
          .single();

        if (!fetchErr && existing && existing.payment_status !== 'paid') {
          await supabase.from('orders').update({ payment_status: 'paid', ...paymentProof }).eq('id', existing.id);

          const { data: items } = await supabase
            .from('order_items')
            .select('product_name, price_per_case, quantity')
            .eq('order_id', existing.id);

          const emailOrder = {
            ...existing,
            items: (items || []).map(function (i) { return { name: i.product_name, price: i.price_per_case, quantity: i.quantity }; }),
            amount_total: pi.amount,
          };

          Promise.all([
            existing.customer_email
              ? sendCustomerConfirmation(emailOrder).catch(function (e) { console.error('Customer email failed:', e.message); })
              : Promise.resolve(),
            sendInternalAlert(emailOrder).catch(function (e) { console.error('Internal alert email failed:', e.message); }),
          ]);
        }
      }
    }
  }

  // A bank debit (ACH) can bounce days after checkout -- insufficient
  // funds, closed account, etc. -- unlike a card, which declines instantly
  // at checkout if it's going to fail at all. The order was already
  // recorded as payment_status 'processing' at checkout time; this is what
  // actually catches the failure and flags it for staff to follow up,
  // since nothing else in this codebase ever will.
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const meta = pi.metadata || {};
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: existing, error: fetchErr } = await supabase
      .from('orders')
      .select('id, order_number, payment_status, customer_name, customer_email, business_name, total')
      .eq('stripe_payment_intent_id', pi.id)
      .single();

    // Guarded on payment_status !== 'paid': an order that already cleared
    // (payment_intent.succeeded arrived first, or the browser's own charge
    // confirmation already ran) must never be flipped back to failed by a
    // late/out-of-order webhook delivery.
    if (!fetchErr && existing && existing.payment_status !== 'paid' && existing.payment_status !== 'failed') {
      await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', existing.id);
      console.log('[webhook] payment failed for', existing.order_number, '-', pi.last_payment_error?.message || 'no reason given');

      sendPaymentFailedAlert({
        order_number: existing.order_number || meta.order_number,
        customer_name: existing.customer_name || meta.customer_name,
        customer_email: existing.customer_email || meta.customer_email,
        business_name: existing.business_name || meta.business_name,
        amount_total: pi.amount,
        payment_failure_reason: pi.last_payment_error?.message || 'No reason given by the bank.',
      }).catch(function (e) { console.error('Payment-failure alert email failed:', e.message); });
    }
  }

  res.status(200).json({ received: true });
};

// Stripe signature verification needs the raw, unparsed request body --
// Vercel parses JSON automatically by default, which silently replaces the
// exact bytes Stripe signed with a re-serialized object. This was confirmed
// live: a correctly-signed test request came back with Stripe's own
// "Webhook payload must be provided as a string or Buffer... Payload was
// provided as a parsed JavaScript object instead" error, meaning every real
// webhook Stripe ever sent to this endpoint would have failed the same way.
// Must be set on module.exports.config AFTER the handler assignment above --
// setting it before gets wiped out when module.exports is reassigned to the
// handler function.
module.exports.config = { api: { bodyParser: false } };
