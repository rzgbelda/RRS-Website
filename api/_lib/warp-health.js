// Daily WARP self-check, run from the daily cron in api/create-order.js.
//
// Every supplier warehouse that has active products gets one test parcel
// quote and one test LTL quote to a fixed destination. Any failure emails
// Eric (via _lib/shipping-alert.js) so a broken key, a bad warehouse
// address or a WARP outage is found in the morning -- not by a buyer at
// checkout. Quotes only; nothing is booked.
//
// Env: WARP_HEALTH_ZIP (default 27603, Raleigh NC).

const { rateWarp } = require('./warp');
const { sendShippingAlert } = require('./shipping-alert');

async function runWarpHealthCheck(supabase) {
  if (String(process.env.WARP_RATING_ENABLED || '').toLowerCase() !== 'true') return { skipped: 'WARP_RATING_ENABLED is off' };
  if (String(process.env.SHIPPING_RATER || '').trim().toLowerCase() === 'tforce') return { skipped: 'SHIPPING_RATER=tforce (WARP not used at checkout)' };
  const dest = { zip: process.env.WARP_HEALTH_ZIP || '27603' };

  const { data: products, error: pErr } = await supabase.from('products').select('distributor').eq('is_active', true);
  if (pErr) return { error: pErr.message };
  const inUse = [...new Set((products || []).map(p => String(p.distributor || '').trim().toLowerCase()))];

  const { data: vendors, error: vErr } = await supabase
    .from('vendors').select('slug, name, ship_from_street, ship_from_city, ship_from_state, ship_from_zip');
  if (vErr) return { error: vErr.message };
  const bySlug = new Map((vendors || []).filter(v => v.slug).map(v => [String(v.slug).toLowerCase(), v]));

  const failed = [];
  let ok = 0;
  for (const slug of inUse) {
    const v = bySlug.get(slug);
    if (!slug || !v || !/^\d{5}/.test(String(v.ship_from_zip || ''))) {
      failed.push({ distributor: slug || '(none)', mode: '-', weightLb: '-', error: 'active products but no vendor warehouse address' });
      continue;
    }
    const origin = { zip: v.ship_from_zip };
    const tests = [
      { mode: 'parcel', weightLb: 20, args: { packages: [{ weight: 20, length: 14, width: 12, height: 10 }] } },
      { mode: 'freight', weightLb: 500, args: { weightLb: 500 } },
    ];
    for (const t of tests) {
      try {
        await rateWarp({ mode: t.mode, origin, dest, ...t.args });
        ok++;
      } catch (err) {
        failed.push({ distributor: slug, mode: t.mode, weightLb: t.weightLb, error: err.message });
      }
    }
  }
  if (failed.length) await sendShippingAlert({ context: 'health-check', failed, destination: dest, items: [] });
  return { ok, failed: failed.length };
}

module.exports = { runWarpHealthCheck };
