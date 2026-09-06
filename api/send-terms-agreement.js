const crypto = require('crypto');
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

const BRAND = { navy: '#0B1F38', orange: '#ED7226' };
const PDF_URL = 'https://www.roomreadysupply.com/assets/legal/RRS-Payment-Terms-and-Conditions.pdf';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The 30-day due date, late fee (10%), and suspension (day 40) clauses
 * below are fixed intentionally, not template parameters: this confirms a
 * specific negotiated exception, so the wording should not silently drift
 * per-send. If a future customer needs different numbers, that is a new
 * negotiated exception and deserves its own reviewed copy, not a form
 * field that could be filled in wrong under time pressure.
 *
 * accept_url is '#preview-only' in preview mode (no token exists yet) --
 * inert inside the sandboxed preview iframe, same pattern as the invoice
 * preview's Pay Now button.
 */
function agreementEmailHtml(o) {
  const totalLine = o.total
    ? '<p style="font-size:14px;color:#334155;margin:0 0 4px;"><strong>Order total:</strong> $' + Number(o.total).toFixed(2) + '</p>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;">' +
    '<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">' +

    '<div style="background:' + BRAND.navy + ';padding:32px 40px;text-align:center;">' +
    '<p style="color:' + BRAND.orange + ';font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin:0 0 8px;">Room Ready Supply</p>' +
    '<h1 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 8px;letter-spacing:-.5px;">Payment Terms Confirmation</h1>' +
    '<p style="color:rgba(255,255,255,.65);font-size:14px;margin:0;">30-Day Account Terms</p>' +
    '</div>' +

    '<div style="padding:32px 40px;">' +
    '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">Dear ' + esc(o.contact_name) + ',</p>' +
    '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">This confirms the payment terms Room Ready Supply has approved for ' + esc(o.business_name) + ', as discussed with our team.</p>' +

    '<div style="background:#fffbf7;border:1.5px solid #fde8d4;border-radius:12px;padding:20px;margin-bottom:24px;">' +
    '<h2 style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:' + BRAND.orange + ';margin:0 0 14px;">Approved Payment Terms</h2>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 10px;line-height:1.6;">Your order will be shipped now, and payment will be due in full <strong>30 calendar days from your confirmed delivery date</strong> &mdash; an exception to our standard 20-day terms, approved specifically for your account. All other terms in our Payment Terms &amp; Conditions (attached) continue to apply, including:</p>' +
    '<p style="font-size:14px;color:#334155;margin:0 0 6px;">&bull; A one-time <strong>10% late fee</strong> if payment is not received by the 30-day due date</p>' +
    '<p style="font-size:14px;color:#334155;margin:0;">&bull; Your account may be <strong>suspended</strong> if payment remains outstanding 40 calendar days after delivery</p>' +
    '</div>' +

    (totalLine ? '<div style="margin-bottom:24px;">' + totalLine + '</div>' : '') +

    '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">Please review the attached Payment Terms &amp; Conditions, then click below to confirm your agreement.</p>' +

    '<a href="' + esc(o.accept_url) + '" style="display:block;background:' + BRAND.orange + ';color:#fff;text-decoration:none;text-align:center;padding:16px 24px;border-radius:10px;font-weight:800;font-size:16px;margin-bottom:24px;">I Agree to These Terms &rarr;</a>' +

    '<p style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0 0 24px;">The complete Payment Terms &amp; Conditions governing this and all Room Ready Supply orders is attached to this email. Once delivery is confirmed, we\'ll follow up with your invoice.</p>' +

    '<p style="font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;margin:0;">Questions? Reply to this email or call us at <strong style="color:#334155;">(252) 227-0073</strong></p>' +
    '</div>' +

    '<div style="background:#f8fafc;border-top:1.5px solid #e2e8f0;padding:20px 40px;text-align:center;">' +
    '<p style="font-size:12px;color:#94a3b8;margin:0;">Room Ready Supply &bull; 609 Washington St, Plymouth, NC 27962 &bull; <a href="https://www.roomreadysupply.com" style="color:' + BRAND.orange + ';text-decoration:none;">roomreadysupply.com</a></p>' +
    '</div>' +

    '</div></body></html>';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { contact_name, business_name, email, total, quote_request_id, order_id, preview_only } = req.body || {};
  if (!contact_name || !business_name || !email) {
    return res.status(400).json({ error: 'contact_name, business_name, and email are all required' });
  }

  if (preview_only) {
    return res.status(200).json({
      html: agreementEmailHtml({ contact_name, business_name, total, accept_url: '#preview-only' }),
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const token = crypto.randomBytes(24).toString('base64url');

  const { error: insertErr } = await supabase.from('terms_agreements').insert({
    token,
    contact_name,
    business_name,
    email,
    total: total || null,
    status: 'pending',
    quote_request_id: quote_request_id || null,
    order_id: order_id || null,
  });

  if (insertErr) {
    console.error('[send-terms-agreement] insert failed:', insertErr.message);
    return res.status(500).json({ error: insertErr.message });
  }

  // Denormalized onto the quote/order itself so admin.js's existing list
  // reads pick up status for free -- see the migration for why. A terms
  // agreement is only ever tied to one or the other, never both.
  if (quote_request_id) {
    const { error: quoteUpdateErr } = await supabase
      .from('quote_requests')
      .update({ terms_status: 'pending', terms_sent_at: new Date().toISOString(), terms_token: token })
      .eq('id', quote_request_id);
    if (quoteUpdateErr) console.error('[send-terms-agreement] quote_requests update failed:', quoteUpdateErr.message);
  }
  if (order_id) {
    const { error: orderUpdateErr } = await supabase
      .from('orders')
      .update({ terms_status: 'pending', terms_sent_at: new Date().toISOString(), terms_token: token })
      .eq('id', order_id);
    if (orderUpdateErr) console.error('[send-terms-agreement] orders update failed:', orderUpdateErr.message);
  }

  const accept_url = 'https://www.roomreadysupply.com/terms-agreement?token=' + token;

  let pdfBuffer;
  try {
    const pdfRes = await fetch(PDF_URL);
    if (!pdfRes.ok) throw new Error('HTTP ' + pdfRes.status);
    pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  } catch (err) {
    return res.status(500).json({ error: 'Could not load the Payment Terms PDF to attach: ' + err.message });
  }

  try {
    await getResend().emails.send({
      from: 'Room Ready Supply <sales@roomreadysupply.com>',
      to: email,
      reply_to: 'sales@roomreadysupply.com',
      subject: 'Payment Terms Confirmation — ' + business_name + ' (30-Day Account Terms)',
      html: agreementEmailHtml({ contact_name, business_name, total, accept_url }),
      attachments: [{
        filename: 'RRS-Payment-Terms-and-Conditions.pdf',
        content: pdfBuffer,
      }],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Email failed: ' + err.message });
  }

  res.status(200).json({ success: true });
};
