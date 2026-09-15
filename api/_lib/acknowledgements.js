// Records a customer ticking an acknowledgement box, into the shared
// public.acknowledgements table (migration 20260915d).
//
// Every acknowledgement across the site goes through here, so staff can see
// all of them in one place rather than each one hiding in its own column.
//
// Deliberately best-effort: an order must never fail because its audit row
// could not be written. A missing row is a gap in the trail; a failed order
// is lost revenue and a confused customer. Failures are logged loudly so the
// gap is visible rather than silent.
//
// The wording is stored verbatim rather than as a version pointer: if the
// copy is edited next year, this row still says what THIS customer read.

const MAX_TEXT = 2000;

/** First public IP from the proxy chain Vercel sets. */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || null;
}

/**
 * @param supabase  service-role client
 * @param req       the incoming request (for IP / user-agent)
 * @param fields    { kind, context, terms_text, order_id?, quote_id?,
 *                    user_id?, email?, business_name? }
 * @returns true when a row was written
 */
async function recordAcknowledgement(supabase, req, fields) {
  try {
    const kind = String(fields?.kind || '').trim();
    const context = String(fields?.context || '').trim();
    if (!kind || !context) {
      console.error('[acknowledgements] refusing to record without kind/context');
      return false;
    }

    // The client sends the exact text it displayed. If that is missing the
    // acknowledgement is still worth recording -- who and when is the bulk
    // of the evidence -- but flag it, since a row with no wording is much
    // weaker if it is ever actually relied on.
    const text = String(fields.terms_text || '').trim().slice(0, MAX_TEXT);
    if (!text) console.warn('[acknowledgements] recording', kind, 'with no terms_text');

    const { error } = await supabase.from('acknowledgements').insert({
      kind,
      context,
      terms_text: text || '(wording not captured)',
      order_id: fields.order_id || null,
      quote_id: fields.quote_id || null,
      user_id: fields.user_id || null,
      email: fields.email || null,
      business_name: fields.business_name || null,
      accepted_ip: clientIp(req),
      accepted_user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    });

    if (error) {
      // 42P01 = table missing, i.e. the migration has not been run yet.
      if (error.code === '42P01') {
        console.error('[acknowledgements] table missing -- run migration 20260915d_acknowledgements.sql');
      } else {
        console.error('[acknowledgements] insert failed:', error.code, error.message);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error('[acknowledgements] unexpected failure:', err.message);
    return false;
  }
}

module.exports = { recordAcknowledgement };
