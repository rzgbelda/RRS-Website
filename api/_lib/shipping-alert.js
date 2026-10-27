// Emails Eric when a shipment can't be priced at checkout (final update package,
// 2026-10-13: "No silent fallback ... Surface the failure to Eric instead").
// Same recipient as the new-order alert (INTERNAL_ALERT_EMAIL).
//
// Throttled: the checkout re-quotes as the buyer types, so one bad ZIP or
// one outage would otherwise send dozens of identical emails. Each distinct
// problem (distributor + reason) is emailed at most once per 30 minutes per
// function instance. Best-effort -- never throws.

const { Resend } = require('resend');

const THROTTLE_MS = 30 * 60 * 1000;
const lastSent = new Map();

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * context: 'checkout' (a buyer is waiting).
 * failed: shipments from computeShipping() with amount null.
 * destination: { zip, state }; items: [{ sku, quantity }].
 */
async function sendShippingAlert({ context, failed, destination, items }) {
  try {
    const key = (failed || []).map(f => `${f.distributor}|${String(f.error || '').slice(0, 80)}`).sort().join(',');
    const now = Date.now();
    if (lastSent.has(key) && now - lastSent.get(key) < THROTTLE_MS) return false;
    lastSent.set(key, now);

    if (!process.env.RESEND_API_KEY) { console.error('[shipping-alert] RESEND_API_KEY not set; alert not emailed:', key); return false; }
    const rows = (failed || []).map(f =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(f.distributor || '(no distributor)')}</td>` +
      `<td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(f.mode)} &middot; ${esc(f.weightLb)} lb</td>` +
      `<td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(f.error)}</td></tr>`).join('');
    const cart = (items || []).map(i => `${esc(i.sku)} &times; ${esc(i.quantity)}`).join(', ');
    const html =
      `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px">` +
      `<h2 style="color:#b91c1c;margin:0 0 8px">Shipping could not be priced</h2>` +
      `<p style="margin:0 0 12px;color:#334155">A buyer was stopped at checkout because no delivery price came back (TForce for pallets, UPS for parcels). They were asked to try again or call (252) 616-0088.</p>` +
      `<p style="margin:0 0 12px;color:#334155"><strong>Destination:</strong> ${esc(destination && destination.zip) || '-'} ${esc(destination && destination.state)}` +
      (cart ? `<br><strong>Cart:</strong> ${cart}` : '') + `</p>` +
      `<table style="border-collapse:collapse;font-size:13px;width:100%"><tr style="background:#f8fafc">` +
      `<th align="left" style="padding:6px 10px">Distributor</th><th align="left" style="padding:6px 10px">Shipment</th><th align="left" style="padding:6px 10px">Reason</th></tr>${rows}</table>` +
      `<p style="font-size:12px;color:#94a3b8;margin-top:14px">Repeats of this same problem are suppressed for 30 minutes.</p></div>`;

    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Room Ready Supply Alerts <orders@roomreadysupply.com>',
      to: process.env.INTERNAL_ALERT_EMAIL || 'eric@roomreadysupply.com',
      subject: '[Shipping] Delivery could not be priced at checkout',
      html,
    });
    return true;
  } catch (err) {
    console.error('[shipping-alert] failed to send:', err.message);
    return false;
  }
}

module.exports = { sendShippingAlert };
