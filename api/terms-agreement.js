const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

/**
 * Backs the public /terms-agreement page. GET fetches the agreement by
 * token (what to show); POST records acceptance (what happens when she
 * clicks the button). Both go through the service-role key -- the
 * terms_agreements table has RLS enabled with no policies, so the anon
 * key cannot read or write it at all, same pattern as orders in
 * api/create-order.js.
 */
module.exports = async (req, res) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (req.method === 'GET') {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const { data, error } = await supabase
      .from('terms_agreements')
      .select('contact_name, business_name, total, status, accepted_at')
      .eq('token', token)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Agreement not found' });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });

    const { data: existing, error: fetchErr } = await supabase
      .from('terms_agreements')
      .select('id, contact_name, business_name, email, total, status')
      .eq('token', token)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'Agreement not found' });

    // Already accepted -- return success rather than an error so a
    // double-click or a page refresh after accepting doesn't look broken,
    // but don't overwrite the original acceptance timestamp/IP.
    if (existing.status === 'accepted') return res.status(200).json({ success: true });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;

    const { error: updateErr } = await supabase
      .from('terms_agreements')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_ip: ip,
        accepted_user_agent: req.headers['user-agent'] || null,
      })
      .eq('id', existing.id);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Best-effort internal notification -- staff should know without
    // having to poll the database, but a failed alert email should never
    // make the acceptance itself look like it failed.
    getResend().emails.send({
      from: 'Room Ready Supply <sales@roomreadysupply.com>',
      to: process.env.INTERNAL_ALERT_EMAIL || 'eric@roomreadysupply.com',
      subject: '✅ Payment Terms Accepted — ' + existing.business_name,
      html: '<div style="font-family:sans-serif;padding:20px;">' +
        '<p><strong>' + existing.contact_name + '</strong> (' + existing.business_name + ', ' + existing.email + ') just accepted the 30-day payment terms agreement.</p>' +
        (existing.total ? '<p>Order total: $' + Number(existing.total).toFixed(2) + '</p>' : '') +
        '<p style="color:#94a3b8;font-size:13px;">Accepted from IP ' + (ip || 'unknown') + '</p>' +
        '</div>',
    }).catch(function (e) { console.error('[terms-agreement] internal alert failed:', e.message); });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
