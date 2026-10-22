// WARP shipping-quote client (final update package, 2026-10-13: every
// order, at every weight, is priced at the cart by the WARP API and paid at
// checkout -- no freight-quote step, no shipping invoice later).
//
// Lives in _lib for the same reason ups.js does: Vercel's Hobby plan caps
// the project at 12 serverless functions.
//
// Endpoint and fields are from WARP's published OpenAPI spec
// (https://developer.wearewarp.com/docs/freight/openapi.json):
//   POST {base}/freights/quote, header `apikey: <key>`
//   body: pickupDate, pickupInfo.zipcode, deliveryInfo.zipcode, listItems[],
//         shipmentType "PARCEL" | "LTL" | "FTL"
//   200:  { quote_id, price: { amount, currency_code }, transit_time, ... }
// PARCEL returns a single WARP Parcel rate.
//
// Freight (LTL) also asks POST /freights/freight-quote, which lists every
// carrier option (body uses `items`, each option has `rate`). On some lanes
// the single /quote rate is WARP's own network price and far above the
// market -- tested 2026-10-13, 345 lb pallet Port Wentworth GA -> Raleigh
// NC: /quote $1,081.26, cheapest option $251.52 -- so the lower valid price
// of the two is used. Either one alone is enough to price the order; the
// options endpoint is marked experimental by WARP and fails on some lanes.
//
// Only quotes are requested here -- nothing is booked with WARP. RRS
// dropships: the supplier ships the order.
//
// Env:
//   WARP_API_KEY            required
//   WARP_TEST_MODE          "true" = staging server
//   WARP_PARCEL_PACKAGING   item packaging label for PARCEL quotes, default
//                           "Box" (the spec gives no list of values; its
//                           default, "Pallet", is only right for LTL)
//   WARP_PALLET_MAX_LB      pallet weight used to count LTL pallets, default 1500
//   WARP_PALLET_DIMS        "LxWxH" inches, default 48x40x48
//   WARP_DELIVERY_SERVICES  comma-separated delivery services added to every
//                           LTL quote (e.g. "liftgate-delivery"), default none

const TIMEOUT_MS = 6000;
// /freights/freight-quote polls many carriers and took ~9 s in testing.
const OPTIONS_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 400;

function base() {
  return String(process.env.WARP_TEST_MODE || '').toLowerCase() === 'true'
    ? 'https://stg.wearewarp.com/api/v1'
    : 'https://gw.wearewarp.com/api/v1';
}

const round2 = n => Math.round(n * 100) / 100;

// Earliest pickup: RRS transmits the order within 1-2 business days after
// payment, so the supplier can hand it to the carrier 2 business days out.
function pickupDate(from = new Date()) {
  const d = new Date(from);
  let left = 2;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

function palletDims() {
  const m = String(process.env.WARP_PALLET_DIMS || '').match(/^(\d+)x(\d+)x(\d+)$/i);
  return m ? { length: +m[1], width: +m[2], height: +m[3] } : { length: 48, width: 40, height: 48 };
}

// Parcel: the boxes from shipping.js buildPackages() (<= 50 lb each, all the
// same size), as one WARP line. WARP's totalWeight is the whole line.
function parcelItems(packages) {
  const p = packages[0];
  return [{
    name: 'Carton',
    length: p.length, width: p.width, height: p.height, sizeUnit: 'IN',
    quantity: packages.length,
    totalWeight: round2(packages.reduce((s, x) => s + x.weight, 0)),
    weightUnit: 'lbs',
    packaging: process.env.WARP_PARCEL_PACKAGING || 'Box',
    stackable: true,
  }];
}

// LTL: the shipment's weight on standard pallets.
function palletItems(weightLb) {
  const max = Number(process.env.WARP_PALLET_MAX_LB) || 1500;
  const dims = palletDims();
  return [{
    name: 'Pallet',
    ...dims, sizeUnit: 'IN',
    quantity: Math.max(1, Math.ceil(weightLb / max)),
    totalWeight: round2(weightLb),
    weightUnit: 'lbs',
    packaging: 'Pallet',
    stackable: false,
  }];
}

async function postOnce(body, pathName = '/freights/quote', timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(base() + pathName, {
      method: 'POST',
      headers: { apikey: String(process.env.WARP_API_KEY || '').trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!resp.ok) {
      const err = new Error(`WARP quote ${resp.status}: ${(data && (data.message || data.code)) || text.slice(0, 200)}`);
      err.retryable = resp.status === 429 || resp.status >= 500;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') { const e = new Error('WARP quote timed out'); e.retryable = true; throw e; }
    if (err.retryable === undefined) err.retryable = true; // network failure
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * mode: 'parcel' | 'freight'. origin/dest: { zip }. Parcel takes `packages`,
 * freight takes `weightLb`. Returns { amount, transitDays, quoteId, mode }.
 * Throws if WARP gives no usable price -- the caller must not guess one.
 */
async function rateWarp({ mode, origin, dest, packages, weightLb, liftgate }) {
  if (!process.env.WARP_API_KEY) throw new Error('WARP_API_KEY not configured');
  const body = {
    pickupDate: pickupDate(),
    pickupInfo: { zipcode: String(origin.zip).slice(0, 5), country: 'US' },
    deliveryInfo: { zipcode: String(dest.zip).slice(0, 5), country: 'US' },
    listItems: mode === 'parcel' ? parcelItems(packages) : palletItems(weightLb),
    shipmentType: mode === 'parcel' ? 'PARCEL' : 'LTL',
  };
  let services = String(process.env.WARP_DELIVERY_SERVICES || '').split(',').map(s => s.trim()).filter(Boolean);
  // Checkout's liftgate checkbox overrides WARP_DELIVERY_SERVICES for that
  // one service; undefined (no checkbox) keeps the env list as is.
  if (liftgate === true && !services.includes('liftgate-delivery')) services.push('liftgate-delivery');
  if (liftgate === false) services = services.filter(s => s !== 'liftgate-delivery');
  if (mode !== 'parcel' && services.length) body.deliveryServices = services.map(service => ({ service, quantity: 1 }));

  const single = (async () => {
    let data;
    try {
      data = await postOnce(body);
    } catch (err) {
      if (!err.retryable) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      data = await postOnce(body);
    }
    const amount = Number(data && data.price && data.price.amount);
    if (!(amount > 0)) throw new Error('WARP returned no price' + (data && data.status ? ` (status ${data.status})` : ''));
    return { amount: round2(amount), transitDays: data.transit_time == null ? null : Number(data.transit_time), quoteId: data.quote_id || null, mode };
  })();

  if (mode === 'parcel') return single;

  // Freight: the cheapest LTL option from /freights/freight-quote as well.
  const options = (async () => {
    const { listItems, shipmentType, ...rest } = body;
    const data = await postOnce({ ...rest, items: listItems }, '/freights/freight-quote', OPTIONS_TIMEOUT_MS);
    const best = (data && Array.isArray(data.options) ? data.options : [])
      .filter(o => Number(o.rate) > 0 && (!o.shipmentType || o.shipmentType === 'LTL'))
      .sort((a, b) => Number(a.rate) - Number(b.rate))[0];
    if (!best) throw new Error('WARP freight-quote returned no LTL option');
    return {
      amount: round2(Number(best.rate)),
      transitDays: best.transitTime ? Math.round(Number(best.transitTime) / 86400) : null,
      quoteId: best.id || null,
      mode,
    };
  })();

  const [a, b] = await Promise.allSettled([single, options]);
  const ok = [a, b].filter(r => r.status === 'fulfilled').map(r => r.value);
  if (!ok.length) throw new Error([a, b].map(r => r.reason && r.reason.message).join(' | '));
  return ok.reduce((lo, r) => (r.amount < lo.amount ? r : lo));
}

module.exports = { rateWarp, pickupDate, parcelItems, palletItems };
