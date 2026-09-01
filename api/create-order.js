const { createClient } = require('@supabase/supabase-js');
const sendInvoiceHandler = require('./send-invoice.js');

/**
 * Creates an order row using the service role key, bypassing RLS.
 *
 * Guest (not logged in) checkout was completely broken for this reason:
 * the `orders` table's INSERT policy does allow a guest row (user_id is
 * null), but the client immediately asks for that row back
 * (.select('id').single()) to link order_items and trigger freight
 * booking -- and no SELECT policy lets an anonymous visitor read back a
 * user_id-null row. Confirmed live: the same insert with no .select()
 * succeeds (201), the .select().single() version fails with 42501.
 *
 * The fix is NOT to add a public SELECT policy for user_id IS NULL --
 * that would let any visitor read every guest order ever placed (name,
 * email, phone, address). Instead this endpoint does the insert
 * server-side, the same way the Stripe webhook already does, and only
 * ever returns the one row it just created.
 *
 * This file also owns the reorder schedule lifecycle (the daily cron
 * sweep and the customer-facing cancel action) rather than living in
 * their own route files -- Vercel's Hobby plan caps a project at 12
 * serverless functions and this project is already at that cap, so new
 * order-lifecycle behavior has to live inside an existing route instead
 * of adding one. Dispatched by method/action below; the original
 * POST-with-no-action behavior is unchanged for payment.html.
 */
module.exports = async (req, res) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Vercel Cron hits this route with GET once a day and, when CRON_SECRET
  // is set as a project env var, automatically sends it as this bearer
  // token -- the one thing standing between the reorder sweep and anyone
  // on the internet triggering it by hand.
  if (req.method === 'GET') {
    const auth = req.headers.authorization || '';
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return runDueReorders(supabase, res);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body || {};

  if (b.action === 'cancel_reorder') {
    return cancelReorder(supabase, b, res);
  }

  // Only the fields payment.html actually sends -- no arbitrary columns
  // accepted from the client into a service-role write.
  const orderData = {
    order_number:      b.order_number || null,
    user_id:            b.user_id || null,
    customer_name:      b.customer_name || '',
    customer_email:     b.customer_email || '',
    business_name:      b.business_name || 'N/A',
    phone:              b.phone || '',
    shipping_address:   b.shipping_address || null,
    subtotal:           b.subtotal ?? b.total ?? 0,
    total:              b.total ?? 0,
    payment_method:     b.payment_method || '',
    payment_status:     b.payment_status || 'pending',
    status:             b.status || 'pending',
    order_type:         b.order_type || 'one_time',
    notes:              b.notes || '',
    fulfillment_method: b.fulfillment_method || 'ship',
    // Real proof of payment for a card order paid directly at checkout
    // (as opposed to an emailed invoice, which api/stripe-webhook.js
    // captures separately once the customer pays the Payment Link). The
    // browser already has this the moment Stripe confirms the charge --
    // capturing it here means the webhook doesn't have to backfill it,
    // which it wouldn't anyway: this insert already sets payment_status
    // to 'paid' when Stripe succeeds, so the webhook's own guard
    // (`payment_status !== 'paid'`) skips it as an intentional
    // double-send prevention.
    stripe_payment_intent_id: b.stripe_payment_intent_id || null,
    // The order that starts a schedule IS the subscription record --
    // reorder_active/reorder_next_date drive runDueReorders() below.
    // false/null unless the customer actually chose "Set Up Reorder" and
    // picked a real schedule at checkout.
    reorder_frequency:    b.reorder_frequency || null,
    reorder_next_date:    b.reorder_next_date || null,
    reorder_custom_dates: b.reorder_custom_dates || null,
    reorder_active:       !!b.reorder_active,
  };

  if (!orderData.order_number) return res.status(400).json({ error: 'order_number is required' });

  const { data, error } = await supabase
    .from('orders')
    .insert(orderData)
    .select('id')
    .single();

  if (error) {
    console.error('[create-order] insert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  // Best-effort, awaited before responding (a serverless function isn't
  // guaranteed to keep running once its response is sent) -- RRS's own
  // stock numbers (the only live stock data that exists -- see the
  // fulfillment-pipeline migration) are checked against what the cart in
  // localStorage said it was buying. "Possible" because that number isn't
  // independently verified against a live vendor feed -- this raises a
  // signal in the new Order Exceptions tab for staff to check rather than
  // silently blocking a payment that already went through on data that
  // might be stale. Failure here never blocks the order response itself.
  if (Array.isArray(b.cart_items) && b.cart_items.length) {
    try {
      await flagPossibleStockouts(supabase, data.id, b.cart_items);
    } catch (err) {
      console.error('[create-order] stockout check failed:', err.message);
    }
  }

  res.status(200).json({ id: data.id });
};

async function flagPossibleStockouts(supabase, orderId, cartItems) {
  const skus = [...new Set(cartItems.map(i => i.sku || i.itemNumber).filter(Boolean))];
  if (!skus.length) return;

  const { data: products } = await supabase
    .from('products').select('id, sku, inventory(stock_qty)').in('sku', skus);
  if (!products?.length) return;

  const bySku = Object.fromEntries(products.map(p => [p.sku, p]));
  const shortfalls = [];
  for (const item of cartItems) {
    const sku = item.sku || item.itemNumber;
    const p = bySku[sku];
    const stock = p?.inventory?.[0]?.stock_qty;
    const qty = Number(item.quantity ?? item.qty ?? 1);
    if (stock != null && stock < qty) {
      shortfalls.push(`${sku}: wanted ${qty}, ${stock} on hand`);
    }
  }
  if (!shortfalls.length) return;

  const { error } = await supabase.from('order_exceptions').insert({
    order_id: orderId,
    reason_code: 'possible_stockout',
    note: shortfalls.join('; '),
  });
  if (error) console.error('[create-order] order_exceptions insert failed:', error.message);
}

/**
 * Advances (or closes out) an original schedule-holding order's next due
 * date. Fixed-interval frequencies just add the interval; 'custom' pops
 * the date that just fired off the remaining list and moves to whichever
 * is next, closing the schedule once the list is empty.
 */
function nextReorderState(o) {
  if (o.reorder_frequency === 'custom') {
    const remaining = (o.reorder_custom_dates || []).filter(d => d !== o.reorder_next_date).sort();
    return remaining.length
      ? { reorder_next_date: remaining[0], reorder_active: true, reorder_custom_dates: remaining }
      : { reorder_next_date: null, reorder_active: false, reorder_custom_dates: [] };
  }
  const d = new Date((o.reorder_next_date || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
  if (o.reorder_frequency === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else {
    const days = { weekly: 7, every_2_weeks: 14, '45_days': 45, '60_days': 60 }[o.reorder_frequency] || 30;
    d.setUTCDate(d.getUTCDate() + days);
  }
  return { reorder_next_date: d.toISOString().slice(0, 10), reorder_active: true, reorder_custom_dates: o.reorder_custom_dates };
}

/**
 * Daily cron entry point: clones every order whose reorder schedule is due
 * into a new draft order, sends a payment-link email for each (reusing
 * send-invoice.js's existing "existing unpaid order" path in-process --
 * no network hop, no extra Vercel function), and advances the original
 * order's schedule. Best-effort per row: one failure doesn't stop the rest
 * of the day's reorders from going out.
 */
async function runDueReorders(supabase, res) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: due, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('reorder_active', true)
    .lte('reorder_next_date', today);

  if (error) {
    console.error('[create-order] reorder sweep query failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const results = [];
  for (const o of (due || [])) {
    try {
      if (!o.order_items || !o.order_items.length) throw new Error('source order has no line items');

      const newOrderNumber = 'RRS-RO-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const { data: newOrder, error: insErr } = await supabase
        .from('orders')
        .insert({
          order_number: newOrderNumber,
          user_id: o.user_id,
          customer_name: o.customer_name,
          customer_email: o.customer_email,
          business_name: o.business_name,
          phone: o.phone,
          shipping_address: o.shipping_address,
          subtotal: o.subtotal,
          total: o.total,
          payment_method: o.payment_method,
          payment_status: 'pending_invoice',
          status: 'pending',
          order_type: 'reorder',
          notes: o.notes,
          fulfillment_method: o.fulfillment_method,
          in_house_delivery_fee: o.in_house_delivery_fee,
          tax_rate: o.tax_rate,
          tax_amount: o.tax_amount,
          // The clone is a delivered instance of the schedule, not the
          // schedule itself -- only the original row keeps progressing.
          reorder_active: false,
          reorder_source_order_id: o.id,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      const items = o.order_items.map(i => ({
        order_id: newOrder.id,
        product_id: i.product_id,
        product_name: i.product_name,
        price_per_case: i.price_per_case,
        quantity: i.quantity,
      }));
      const { error: itemsErr } = await supabase.from('order_items').insert(items);
      if (itemsErr) throw itemsErr;

      const fakeReq = { method: 'POST', body: { order_id: newOrder.id } };
      let invoiceStatus = 200, invoiceBody = {};
      const fakeRes = {
        status(c) { invoiceStatus = c; return this; },
        json(b) { invoiceBody = b; return this; },
      };
      await sendInvoiceHandler(fakeReq, fakeRes);
      if (invoiceStatus >= 400) {
        console.error('[create-order] reorder invoice failed for', newOrderNumber, invoiceBody.error);
      }

      const { error: advErr } = await supabase
        .from('orders')
        .update(nextReorderState(o))
        .eq('id', o.id);
      if (advErr) console.error('[create-order] failed to advance schedule for', o.order_number, advErr.message);

      results.push({ source_order: o.order_number, new_order: newOrderNumber, invoiced: invoiceStatus < 400 });
    } catch (err) {
      console.error('[create-order] reorder generation failed for', o.order_number, err.message);
      results.push({ source_order: o.order_number, ok: false, error: err.message });
    }
  }

  return res.status(200).json({ processed: results.length, results });
}

/**
 * Customer- or staff-triggered cancellation. Reachable from account.html
 * by any logged-in customer, so it must not let one customer cancel
 * another's schedule just by guessing an order id -- requester_email has
 * to match the order's own customer_email when provided. Admin calls this
 * with no requester_email (already trusted via its own RLS session), same
 * as every other admin write in this codebase.
 */
async function cancelReorder(supabase, b, res) {
  const { order_id, requester_email } = b;
  if (!order_id) return res.status(400).json({ error: 'order_id is required' });

  const { data: o, error } = await supabase
    .from('orders')
    .select('id, customer_email, reorder_active')
    .eq('id', order_id)
    .single();
  if (error || !o) return res.status(404).json({ error: 'Order not found' });

  if (requester_email && o.customer_email && requester_email.toLowerCase() !== o.customer_email.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized to cancel this order.' });
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ reorder_active: false })
    .eq('id', order_id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  return res.status(200).json({ success: true });
}
