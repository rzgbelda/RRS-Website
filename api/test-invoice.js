const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

let Stripe;
try { Stripe = require('stripe'); } catch (e) { Stripe = null; }

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

/**
 * One-off manual verification for the invoice-by-email feature -- NOT
 * linked from any UI. Exercises the exact same order-insert + Stripe
 * Payment Link + email steps as api/send-invoice.js, but for a hardcoded
 * $1 test item instead of a real quote, so a real person can pay a real
 * $1 and confirm the whole loop (payment -> webhook -> paid + emails)
 * actually works before it's used on a paying customer.
 *
 * Tagged order_type 'test' and an 'RRS-TEST-' order number so it's
 * obviously not a real order in the admin Orders tab, and safe to delete
 * or ignore afterward. Delete this file once verified.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!Stripe) return res.status(500).json({ error: 'stripe module not available' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const order_number = 'RRS-TEST-' + Date.now();
  const item = { name: 'Stripe Test Item — $1 Verification', quantity: 1, unit_price: 1.00 };

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_number,
      customer_name: 'Stripe Test',
      customer_email: email,
      business_name: 'Internal Test',
      subtotal: item.unit_price,
      total: item.unit_price,
      payment_method: 'card',
      payment_status: 'pending_invoice',
      status: 'pending',
      order_type: 'test',
      notes: 'One-off $1 test of the invoice-by-email feature -- safe to delete.',
    })
    .select('id')
    .single();

  if (orderErr) return res.status(500).json({ error: orderErr.message });

  await supabase.from('order_items').insert({
    order_id: order.id,
    product_name: item.name,
    price_per_case: item.unit_price,
    quantity: item.quantity,
  });

  const rawKey = (process.env.STRIPE_SECRET_KEY || '').trim().replace(/[\r\n\t]/g, '');
  const stripe = Stripe(rawKey);

  let link;
  try {
    link = await stripe.paymentLinks.create({
      line_items: [{
        price_data: { currency: 'usd', product_data: { name: item.name }, unit_amount: 100 },
        quantity: 1,
      }],
      payment_intent_data: { metadata: { order_number, order_type: 'test' } },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: { custom_message: 'Test payment received -- the invoice pipeline works end to end.' },
      },
      metadata: { order_number, business_name: 'Internal Test' },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Stripe payment link failed: ' + err.message });
  }

  try {
    await getResend().emails.send({
      from: 'Room Ready Supply <sales@roomreadysupply.com>',
      to: email,
      reply_to: 'sales@roomreadysupply.com',
      subject: 'TEST — Invoice ' + order_number + ' (Room Ready Supply)',
      html:
        '<div style="font-family:sans-serif;max-width:520px;margin:32px auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">' +
        '<p style="font-size:12px;font-weight:700;color:#ED7226;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px;">Internal Test — Not a Real Order</p>' +
        '<h2 style="margin:0 0 16px;color:#0B1F38;">Invoice ' + order_number + '</h2>' +
        '<p style="color:#334155;line-height:1.6;">This confirms the invoice-by-email pipeline: 1 item, $1.00 total.</p>' +
        '<p style="color:#334155;"><strong>' + item.name + '</strong> — $1.00</p>' +
        '<a href="' + link.url + '" style="display:block;background:#ED7226;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:800;margin:20px 0;">Pay $1.00 Test Invoice &rarr;</a>' +
        '<p style="font-size:12px;color:#94a3b8;">After paying, check Admin &rarr; Orders for ' + order_number + ' (should show "paid"), and watch for a second, real order-confirmation email.</p>' +
        '</div>',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Email failed: ' + err.message, order_number, payment_link: link.url });
  }

  res.status(200).json({ success: true, order_number, payment_link: link.url });
};
