// Coupon validation and discount maths for checkout (coupons phase 2).
//
// Called from price-cart.js with the service role: customers have no read
// access to public.coupons, and the browser is never the authority on a
// discount -- the same rule price-cart.js enforces for prices. The rules
// below are the contract written in 20261019_coupons.sql; couponCovers()
// mirrors the one in admin-coupons.js, which shows staff what a coupon
// covers -- if eligibility changes in one place it must change in both.

function couponCovers(c, p, dealSkus) {
  if (!c.include_best_deals && dealSkus.has(p.sku)) return false;
  if (c.applies_to === 'products') return (c.product_skus || []).includes(p.sku);
  if ((c.exclude_skus || []).includes(p.sku)) return false;
  if (c.applies_to === 'categories') return (c.category_names || []).includes(p.category_name);
  return true;
}

const round2 = n => Math.round(n * 100) / 100;
const money = n => '$' + Number(n).toFixed(2);

/**
 * code:     what the customer typed
 * email:    the customer's email, when known -- needed for per_customer_limit
 * lines:    [{ sku, category_name, lineTotal }] as priced by price-cart.js
 * dealSkus: Set of SKUs with an active Best Deal
 * subtotal: whole merchandise subtotal (min_subtotal is checked against it)
 *
 * Returns { ok: true, coupon, discount } or { ok: false, error } with an
 * error worded for the customer.
 */
async function evaluateCoupon(supabase, { code, email, lines, dealSkus, subtotal }) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) return { ok: false, error: "That code isn't valid." };

  const { data: c, error } = await supabase.from('coupons').select('*').eq('code', code).maybeSingle();
  if (error) {
    console.error('[coupons] lookup failed:', error.message);
    return { ok: false, error: "We couldn't check that code right now. Please try again." };
  }
  if (!c || !c.is_active) return { ok: false, error: "That code isn't valid." };

  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { ok: false, error: "This code isn't active yet." };
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return { ok: false, error: 'This code has expired.' };
  if (c.usage_limit != null && c.times_used >= c.usage_limit) return { ok: false, error: 'This code has reached its usage limit.' };
  if (c.min_subtotal != null && subtotal < Number(c.min_subtotal)) {
    return { ok: false, error: 'Spend ' + money(c.min_subtotal) + ' or more on products to use this code.' };
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (c.per_customer_limit != null && cleanEmail) {
    const { count, error: cntErr } = await supabase
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', c.id)
      .eq('email', cleanEmail); // redeem_coupon() stores it lower-cased
    if (cntErr) console.warn('[coupons] redemption count failed:', cntErr.message);
    else if (count >= c.per_customer_limit) {
      return { ok: false, error: c.per_customer_limit === 1 ? "You've already used this code." : "You've used this code the maximum number of times." };
    }
  }

  const eligible = lines.filter(l => couponCovers(c, l, dealSkus));
  const eligibleSubtotal = round2(eligible.reduce((s, l) => s + l.lineTotal, 0));
  if (!(eligibleSubtotal > 0)) {
    const dealsOnly = !c.include_best_deals && lines.some(l => dealSkus.has(l.sku));
    return { ok: false, error: "This code doesn't apply to the items in your cart" + (dealsOnly ? ' (Best Deals items are excluded).' : '.') };
  }

  let discount;
  if (c.discount_type === 'percent') {
    discount = round2(eligibleSubtotal * Number(c.discount_value) / 100);
    if (c.max_discount != null) discount = Math.min(discount, Number(c.max_discount));
  } else {
    discount = Math.min(Number(c.discount_value), eligibleSubtotal);
  }
  discount = round2(discount);
  if (!(discount > 0)) return { ok: false, error: "This code doesn't apply to the items in your cart." };

  return { ok: true, coupon: c, discount };
}

// Records the redemption and bumps times_used, once per order. Best-effort:
// the order already exists, so a failure is logged, never thrown.
async function redeemCoupon(supabase, { couponId, orderId, code, email, discount }) {
  if (!couponId || !orderId) return;
  try {
    const { error } = await supabase.rpc('redeem_coupon', {
      p_coupon_id: couponId, p_order_id: orderId, p_code: code, p_email: email || null, p_discount: discount || 0,
    });
    if (error) console.error('[coupons] redeem failed for order', orderId, '-', error.message);
  } catch (err) {
    console.error('[coupons] redeem failed for order', orderId, '-', err.message);
  }
}

module.exports = { evaluateCoupon, redeemCoupon, couponCovers };
