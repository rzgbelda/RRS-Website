const { createClient } = require('@supabase/supabase-js');

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
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const b = req.body || {};

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

  res.status(200).json({ id: data.id });
};
