// Signed delivery-price ticket, so the delivery charge shown is the charge.
//
// WARP can quote the same cart differently a minute apart (the freight
// options endpoint sometimes times out and the single /quote rate is used
// instead), so re-quoting at each step could show $322.59 at checkout and
// charge $230.69 on the payment page. Instead, the first priced quote
// returns this ticket; cart, checkout and payment send it back, and while it
// is valid price-cart.js reuses its amount rather than calling WARP again.
//
// HMAC-signed with a server-only secret, so the browser cannot change the
// amount; bound to the exact cart (sku x quantity) and delivery ZIP, so it
// cannot be reused for a different order; valid for 30 minutes.

const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;

function secret() {
  return String(process.env.QUOTE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
}

// wanted: Map(sku -> quantity) as built in price-cart.js.
function cartHash(wanted, zip) {
  const lines = [...wanted].map(([sku, q]) => `${sku}x${q}`).sort().join('|');
  return crypto.createHash('sha256').update(lines + '@' + String(zip || '')).digest('base64url').slice(0, 22);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function issueShippingToken(wanted, zip, shipping) {
  if (!secret()) return null;
  return sign({ h: cartHash(wanted, zip), s: shipping, e: Date.now() + TTL_MS });
}

// Returns the ticket's shipping amount, or null if it is missing, forged,
// expired or for a different cart/ZIP.
function readShippingToken(token, wanted, zip) {
  try {
    if (!token || !secret()) return null;
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!(p.e > Date.now()) || p.h !== cartHash(wanted, zip)) return null;
    const s = Number(p.s);
    return Number.isFinite(s) && s > 0 ? s : null;
  } catch (_) {
    return null;
  }
}

module.exports = { issueShippingToken, readShippingToken };
