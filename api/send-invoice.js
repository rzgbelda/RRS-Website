const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

let Stripe;
try { Stripe = require('stripe'); } catch (e) { Stripe = null; }

const BRAND = { navy: '#0B1F38', orange: '#ED7226' };

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function invoiceEmailHtml(o) {
  const rows = o.items.map(i =>
    '<tr>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">' + esc(i.name) + '</td>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:center;">' + i.quantity + '</td>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:right;">$' + i.unit_price.toFixed(2) + '</td>' +
    '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0B1F38;font-weight:700;text-align:right;">$' + (i.unit_price * i.quantity).toFixed(2) + '</td>' +
    '</tr>'
  ).join('') + (
    Number(o.delivery_fee) > 0
      ? '<tr>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">In-House Delivery' +
          '<span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px;">Delivered by Room Ready Supply</span></td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:center;">&mdash;</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:right;">&mdash;</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0B1F38;font-weight:700;text-align:right;">$' + Number(o.delivery_fee).toFixed(2) + '</td>' +
        '</tr>'
      : ''
  );

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' +
    '<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">' +

    '<div style="background:' + BRAND.navy + ';padding:32px 40px;text-align:center;">' +
    '<p style="color:' + BRAND.orange + ';font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin:0 0 8px;">Room Ready Supply</p>' +
    '<h1 style="color:#fff;font-size:26px;font-weight:900;margin:0 0 8px;letter-spacing:-.5px;">Invoice ' + esc(o.order_number) + '</h1>' +
    '<p style="color:rgba(255,255,255,.65);font-size:14px;margin:0;">Ready to pay online, whenever is convenient for you.</p>' +
    '</div>' +

    '<div style="padding:32px 40px;">' +
    '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 24px;">Hi ' + esc(o.customer_name) + ', here is your invoice for ' + esc(o.business_name) + '. Click the button below to pay securely by card &mdash; no need to visit the site or sign in.</p>' +

    '<table style="width:100%;border-collapse:collapse;border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:20px;">' +
    '<thead><tr style="background:#f8fafc;">' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:left;">Product</th>' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:center;">Qty</th>' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:right;">Unit Price</th>' +
    '<th style="padding:10px 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:right;">Total</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +

    '<table style="width:100%;border-collapse:collapse;margin-bottom:28px;">' +
    '<tr style="border-top:2px solid #e2e8f0;"><td style="padding:12px 0 0;font-size:16px;font-weight:900;color:#0B1F38;">Total Due</td><td style="padding:12px 0 0;font-size:16px;font-weight:900;color:#0B1F38;text-align:right;">$' + o.total.toFixed(2) + '</td></tr>' +
    '</table>' +

    '<a href="' + esc(o.payment_link) + '" style="display:block;background:' + BRAND.orange + ';color:#fff;text-decoration:none;text-align:center;padding:16px 24px;border-radius:10px;font-weight:800;font-size:16px;margin-bottom:24px;">Pay Invoice Now &rarr;</a>' +

    '<p style="font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;margin:0;">Questions about this invoice? Reply to this email or call us at <strong style="color:#334155;">(252) 227-0073</strong></p>' +
    '</div>' +

    '<div style="background:#f8fafc;border-top:1.5px solid #e2e8f0;padding:20px 40px;text-align:center;">' +
    '<p style="font-size:12px;color:#94a3b8;margin:0;">Room Ready Supply &bull; <a href="https://www.roomreadysupply.com" style="color:' + BRAND.orange + ';text-decoration:none;">roomreadysupply.com</a></p>' +
    '</div>' +

    '</div></body></html>';
}

/**
 * Turns an already-quoted quote_requests row into a real payable invoice:
 * records an order (payment_status: 'pending_invoice', matching the value
 * the existing "Invoice Me" checkout path already uses), creates a Stripe
 * Payment Link for the exact quoted total, and emails the customer a
 * one-click "Pay Invoice Now" link. No site visit or login required on her
 * end -- api/stripe-webhook.js flips payment_status to 'paid' and sends the
 * usual order-confirmation emails the moment she completes payment.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!Stripe) return res.status(500).json({ error: 'stripe module not available' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { quote_request_id, preview_only } = req.body || {};
  if (!quote_request_id) return res.status(400).json({ error: 'quote_request_id is required' });

  const { data: q, error: qErr } = await supabase
    .from('quote_requests')
    .select('id, business_name, contact_name, email, quote_number, quote_items, grand_total, status, fulfillment_method, in_house_delivery_fee')
    .eq('id', quote_request_id)
    .single();

  if (qErr || !q) return res.status(404).json({ error: 'Quote request not found' });
  if (!q.quote_items || !q.quote_items.length) return res.status(400).json({ error: 'This quote has no priced line items yet -- send the quote first.' });
  if (!q.email) return res.status(400).json({ error: 'This quote request has no customer email on file.' });

  const items = q.quote_items.map(i => ({
    name: String(i.name || 'Item'),
    quantity: Math.max(1, parseInt(i.quantity) || 1),
    unit_price: Math.max(0, parseFloat(i.unit_price) || 0),
  })).filter(i => i.unit_price > 0);

  if (!items.length) return res.status(400).json({ error: 'No priced line items to invoice.' });

  // In-house delivery: we deliver the order ourselves and charge a fee set
  // by hand on the quote, instead of an Estes/Shippo carrier rate. It is a
  // real payable line, so it has to reach the invoice total AND the Stripe
  // payment link below -- billing only the items would undercharge by
  // exactly the delivery amount.
  const deliveryFee = q.fulfillment_method === 'in_house'
    ? Math.max(0, parseFloat(q.in_house_delivery_fee) || 0)
    : 0;

  const itemsTotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  // Prefer the stored grand_total, but some quotes were sent before the
  // send-quote edge function was fixed to save it -- quote_items has
  // everything needed to invoice regardless, so fall back to summing it.
  // The fallback must add the fee back in; grand_total already includes it.
  const total = q.grand_total > 0 ? q.grand_total : itemsTotal + deliveryFee;
  if (!total || total <= 0) return res.status(400).json({ error: 'Quote total is $0 -- nothing to invoice.' });

  // Preview: render the exact email that would be sent, with no order
  // inserted, no Stripe Payment Link created, and no email dispatched --
  // so staff can check prices and layout before anything real happens.
  if (preview_only) {
    return res.status(200).json({
      html: invoiceEmailHtml({
        order_number: '(assigned when sent)',
        customer_name: q.contact_name || 'there',
        business_name: q.business_name || '',
        items,
        total,
        delivery_fee: deliveryFee,
        payment_link: '#preview-only',
      }),
    });
  }

  const order_number = 'RRS-INV-' + Date.now();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_number,
      customer_name:  q.contact_name || '',
      customer_email: q.email,
      business_name:  q.business_name || 'N/A',
      subtotal:       total - deliveryFee,
      total:          total,
      payment_method: 'card',
      payment_status: 'pending_invoice',
      status:         'pending',
      order_type:     'invoice',
      // Carries the choice onto the order so the admin order modal shows
      // the in-house delivery panel instead of the Estes freight flow.
      fulfillment_method:    q.fulfillment_method === 'in_house' ? 'in_house' : 'ship',
      in_house_delivery_fee: deliveryFee,
      notes:          q.quote_number ? ('Invoiced from quote ' + q.quote_number) : 'Invoiced from an admin quote request',
    })
    .select('id')
    .single();

  if (orderErr) {
    console.error('[send-invoice] order insert failed:', orderErr.message);
    return res.status(500).json({ error: orderErr.message });
  }

  const orderItems = items.map(i => ({
    order_id: order.id,
    product_name: i.name,
    price_per_case: i.unit_price,
    quantity: i.quantity,
  }));
  const { error: itemsErr } = await supabase.from('order_items').insert(orderItems);
  if (itemsErr) console.error('[send-invoice] order_items insert failed:', itemsErr.message);

  const rawKey = (process.env.STRIPE_SECRET_KEY || '').trim().replace(/[\r\n\t]/g, '');
  const stripe = Stripe(rawKey);

  let link;
  try {
    link = await stripe.paymentLinks.create({
      // The delivery fee is appended as its own Stripe line so the amount
      // charged matches the invoice total exactly. Without it Stripe would
      // collect only the goods and we would eat the delivery cost.
      line_items: items.map(i => ({
        price_data: {
          currency: 'usd',
          product_data: { name: i.name },
          unit_amount: Math.round(i.unit_price * 100),
        },
        quantity: i.quantity,
      })).concat(deliveryFee > 0 ? [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'In-House Delivery' },
          unit_amount: Math.round(deliveryFee * 100),
        },
        quantity: 1,
      }] : []),
      payment_intent_data: {
        metadata: { order_number, order_type: 'invoice', quote_number: q.quote_number || '' },
      },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: 'Thank you! Your payment has been received and our team will begin processing your order right away. A confirmation email is on its way.',
        },
      },
      metadata: { order_number, business_name: q.business_name || '', quote_number: q.quote_number || '' },
    });
  } catch (err) {
    console.error('[send-invoice] Stripe payment link failed:', err.message);
    // The order row already exists as pending_invoice -- leave it in place
    // for staff to retry rather than deleting, since deleting here would
    // race a webhook that (very unlikely, but possible) already fired.
    return res.status(500).json({ error: 'Could not create the payment link: ' + err.message });
  }

  try {
    await getResend().emails.send({
      from: 'Room Ready Supply <sales@roomreadysupply.com>',
      to: q.email,
      reply_to: 'sales@roomreadysupply.com',
      subject: 'Your Invoice ' + order_number + ' — Room Ready Supply',
      html: invoiceEmailHtml({
        order_number,
        customer_name: q.contact_name || 'there',
        business_name: q.business_name || '',
        items,
        total,
        delivery_fee: deliveryFee,
        payment_link: link.url,
      }),
    });
  } catch (err) {
    console.error('[send-invoice] email failed:', err.message);
    return res.status(500).json({
      error: 'Invoice and payment link were created, but the email failed to send: ' + err.message,
      order_number,
      payment_link: link.url,
    });
  }

  res.status(200).json({ success: true, order_number, payment_link: link.url });
};
