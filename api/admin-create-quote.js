const { createClient } = require('@supabase/supabase-js');

/**
 * Creates a quote_requests row for a customer the admin is entering by hand
 * (someone the CEO knows personally who doesn't have an account and never
 * submitted the public "Request a Quote" form). Uses the service role key
 * for the same reason api/create-order.js does: quote_requests has no
 * documented INSERT policy for the anon key, and every other write path to
 * this table (the quote-request edge function, send-quote) already goes
 * through the service role / bypasses RLS.
 *
 * user_id is always null -- this is the exact "guest" shape the
 * quote-request edge function already produces for anonymous public
 * submissions, and every downstream step (composer, send-quote,
 * send-invoice, terms agreement) reads customer info straight off this
 * row's own columns and never joins profiles/auth.users. So a row created
 * here is indistinguishable, to the rest of the system, from one a real
 * customer submitted themselves.
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const b = req.body || {};
  const email = (b.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Customer email is required' });

  const quoteData = {
    user_id:          null,
    business_name:    (b.business_name || '').trim(),
    contact_name:     (b.contact_name || '').trim(),
    email,
    phone_number:     (b.phone_number || '').trim(),
    customer_type:    (b.customer_type || '').trim(),
    notes:            (b.notes || '').trim(),
    requested_items:  [],
    status:           'new',
    marketing_opt_in: false,
    customer_visible: false,
  };

  const { data, error } = await supabase
    .from('quote_requests')
    .insert(quoteData)
    .select('id')
    .single();

  if (error) {
    console.error('[admin-create-quote] insert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ id: data.id });
};
