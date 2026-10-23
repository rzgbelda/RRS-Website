// Credits an order to the sales rep whose code the customer used -- typed
// at checkout, or carried in from the rep's ?ref= link (see the link
// generator on the Sales > My Account tab). Written server-side with the
// service role because sales_referrals deliberately has no client insert
// policy (20260928_sales_team.sql).
//
// Best-effort, like acknowledgements.js: an order must never fail over its
// commission row. unique(order_id) makes the second caller (the browser's
// create-order and the Stripe webhook safety net) a no-op.

// Same rates as SALES_TIER_RATE in admin.js; snapshotted on the row so a
// later tier change never rewrites history.
const SALES_TIER_RATE = { tier1: 0.08, tier2: 0.05 };

async function attributeSalesReferral(supabase, { orderId, code, orderValue }) {
  code = String(code || '').trim();
  if (!orderId || !code) return null;
  try {
    // Same lookup checkout uses: active reps only, case-insensitive.
    const { data: rows } = await supabase.rpc('lookup_sales_code', { p_code: code });
    const rep = Array.isArray(rows) ? rows[0] : rows;
    if (!rep) return null;
    const rate = SALES_TIER_RATE[rep.tier];
    if (!rate) return null;

    const value = Math.max(0, Math.round((Number(orderValue) || 0) * 100) / 100);
    const { error } = await supabase.from('sales_referrals').upsert({
      order_id: orderId,
      sales_rep_id: rep.id,
      order_value: value,
      commission_rate: rate,
      commission_amount: Math.round(value * rate * 100) / 100,
    }, { onConflict: 'order_id', ignoreDuplicates: true });
    if (error) {
      console.error('[sales-attribution] insert failed for order', orderId, '-', error.message);
      return null;
    }
    return rep.id;
  } catch (err) {
    console.error('[sales-attribution] failed for order', orderId, '-', err.message);
    return null;
  }
}

module.exports = { attributeSalesReferral };
