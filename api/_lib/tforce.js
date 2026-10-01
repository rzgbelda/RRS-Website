// TForce Freight Rating API client (LTL / pallet shipments). OAuth
// client-credentials token (Microsoft identity platform), cached.
//
// Lives in _lib for the same reason ups.js does: Vercel's Hobby plan caps the
// project at 12 serverless functions.
//
// Nothing here is used unless TFORCE_RATING_ENABLED=true (see price-cart.js),
// and any failure falls back to the weight estimate in shipping.js, so
// deploying this file changes no checkout behaviour by itself.
//
// Env (all required once enabled):
//   TFORCE_CLIENT_ID, TFORCE_CLIENT_SECRET   OAuth app from the TForce portal
//   TFORCE_TOKEN_URL                         token endpoint from the portal's
//                                            integration guide
//   TFORCE_SCOPE                             scope from the same guide
// Optional:
//   TFORCE_SUBSCRIPTION_KEY    Ocp-Apim-Subscription-Key, only if TForce
//                              issues one (the OAuth token alone may suffice)
//   TFORCE_BASE_URL            default https://api.tforcefreight.com
//   TFORCE_SERVICE_CODE        default 349 (Standard LTL); 308 = LTL
//   TFORCE_BILLING_CODE        default 10 (prepaid by RRS)
//   TFORCE_PAYER_ZIP/CITY/STATE  payer address (RRS billing address); defaults
//                                to the Plymouth NC warehouse
//   TFORCE_DEFAULT_CLASS       freight class, default 70
//   TFORCE_PALLET_MAX_LB       pallet weight used to count pallets, default 2000
//   TFORCE_PALLET_DIMS         "LxWxH" in inches, default 48x40x48
//   TFORCE_LIFTGATE            "false" to drop the liftgate-delivery default
//   TFORCE_RESIDENTIAL         "true" to rate delivery as residential

const BASE = process.env.TFORCE_BASE_URL || 'https://api.tforcefreight.com';
const TIMEOUT_MS = 6000;

let cachedToken = null; // { token, expiresAt }

async function fetchWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) return cachedToken.token;
  const { TFORCE_CLIENT_ID: id, TFORCE_CLIENT_SECRET: secret, TFORCE_TOKEN_URL: url, TFORCE_SCOPE: scope } = process.env;
  if (!id || !secret || !url || !scope) {
    throw new Error('TFORCE_CLIENT_ID / TFORCE_CLIENT_SECRET / TFORCE_TOKEN_URL / TFORCE_SCOPE not configured');
  }
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope });
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`TForce token request failed (${resp.status})`);
  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

function addr(a) {
  return {
    city: a.city || undefined,
    stateProvinceCode: a.state ? String(a.state).toUpperCase().slice(0, 2) : undefined,
    postalCode: String(a.zip || '').slice(0, 5),
    country: 'US',
  };
}

// Next business day, YYYY-MM-DD (the API requires a pickup date).
function pickupDate() {
  const d = new Date();
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

function palletDims() {
  const m = String(process.env.TFORCE_PALLET_DIMS || '48x40x48').match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  return m ? { length: Number(m[1]), width: Number(m[2]), height: Number(m[3]), unit: 'IN' } : { length: 48, width: 40, height: 48, unit: 'IN' };
}

// One rate for `weightLb` of palletised freight from `origin` to `dest`.
// Returns { amount, service, transitDays } or throws.
async function rateFreight({ origin, dest, weightLb }) {
  // The portal lists an Ocp-Apim-Subscription-Key header, but TForce's
  // integration guide only describes OAuth and a fresh developer profile has
  // no subscription to take a key from -- so it is sent only when set.
  const key = process.env.TFORCE_SUBSCRIPTION_KEY;
  const token = await getToken();

  const maxPallet = Number(process.env.TFORCE_PALLET_MAX_LB) || 2000;
  const pallets = Math.max(1, Math.ceil(weightLb / maxPallet));
  const perPallet = Math.round((weightLb / pallets) * 10) / 10;
  const dims = palletDims();
  const cls = String(process.env.TFORCE_DEFAULT_CLASS || '70');

  const payer = {
    city: process.env.TFORCE_PAYER_CITY || 'Plymouth',
    state: process.env.TFORCE_PAYER_STATE || 'NC',
    zip: process.env.TFORCE_PAYER_ZIP || '27962',
  };

  // Delivery accessorials (API enum: NTFN INDE RESD LADL LIFD TRDS GWHD).
  const residential = String(process.env.TFORCE_RESIDENTIAL || '').toLowerCase() === 'true';
  const delivery = [];
  if (residential) delivery.push('RESD');
  if (String(process.env.TFORCE_LIFTGATE || 'true').toLowerCase() !== 'false') delivery.push('LIFD');

  const body = {
    requestOptions: {
      serviceCode: process.env.TFORCE_SERVICE_CODE || '349',
      pickupDate: pickupDate(),
      type: 'L',
      densityEligible: false,
      timeInTransit: true,
      customerContext: 'rrs-checkout',
    },
    shipFrom: { address: addr(origin) },
    shipTo: {
      address: addr(dest),
      isResidential: residential,
    },
    payment: {
      payer: { address: addr(payer) },
      billingCode: process.env.TFORCE_BILLING_CODE || '10',
    },
    serviceOptions: delivery.length ? { delivery } : undefined,
    commodities: [{
      class: cls,
      pieces: pallets,
      weight: { weight: Math.round(weightLb * 10) / 10, weightUnit: 'LBS' },
      packagingType: 'PLT',
      dimensions: dims,
    }],
    handlingUnits: [{
      pieces: pallets,
      weight: { weight: perPallet, weightUnit: 'LBS' },
      packagingType: 'PLT',
      dimensions: dims,
    }],
  };

  const resp = await fetchWithTimeout(`${BASE}/rating/getRate?api-version=v1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(key ? { 'Ocp-Apim-Subscription-Key': key } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`TForce rating failed (${resp.status})`);
  const data = await resp.json();

  const detail = (data && data.detail) || [];
  const priced = detail.map(d => {
    const total = d.shipmentCharges && d.shipmentCharges.total && d.shipmentCharges.total.value;
    const amount = Number(String(total == null ? '' : total).replace(/[$,]/g, ''));
    return {
      amount,
      service: d.service && d.service.code,
      transitDays: d.timeInTransit && d.timeInTransit.value,
    };
  }).filter(r => Number.isFinite(r.amount) && r.amount > 0);
  if (!priced.length) {
    const msg = (data && data.summary && data.summary.responseStatus && data.summary.responseStatus.message) || 'no usable rate';
    throw new Error('TForce rating returned ' + msg);
  }
  return priced.reduce((best, r) => (r.amount < best.amount ? r : best), priced[0]);
}

module.exports = { rateFreight, getToken };
