// TForce Freight Rating API client (LTL / pallet shipments). OAuth
// client-credentials token (Microsoft identity platform), cached.
//
// Lives in _lib for the same reason ups.js does: Vercel's Hobby plan caps the
// project at 12 serverless functions.
//
// Used by price-cart.js in two places: with WARP on, for the LTL shipments
// of the distributors in TFORCE_LTL_DISTRIBUTORS (a failure falls back to
// WARP); with WARP off, for all freight when TFORCE_RATING_ENABLED=true (a
// failure falls back to the weight estimate). With neither set, deploying
// this file changes no checkout behaviour.
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
//   TFORCE_API_VERSION         default v1 (production); cie-v1 = TForce's
//                              test environment (its negotiated rates are not
//                              the contract rates)
//   TFORCE_SERVICE_CODE        default 308 (LTL, US/US and US/CA); 349 is
//                              US/Mexico only
//   TFORCE_BILLING_CODE        default 30 (third party): the supplier is the
//                              shipper and RRS pays. Only 30 returns the
//                              contract rate from supplier warehouses; 10
//                              (prepaid) does not (tested 2026-10-22)
//   TFORCE_PAYER_ZIP/CITY/STATE  payer address (RRS billing address); defaults
//                                to the Plymouth NC warehouse
//   TFORCE_DEFAULT_CLASS       fixed freight class; unset = class from pallet
//                              density (NMFC 049260 / 149265 table, below)
//   TFORCE_PALLET_MAX_LB       goods per pallet used to count pallets, default
//                              750 (a 48 in. pallet of linens rarely tops it)
//   TFORCE_PALLET_TARE_LB      weight of the empty pallet, default 40
//   TFORCE_PALLET_MAX_LB_BY_DISTRIBUTOR  per-supplier override of
//                              TFORCE_PALLET_MAX_LB, "slug:lb,..." -- denser
//                              goods fill a pallet with more weight
//                              (defaults below: Sasso pails, NPS paper,
//                              Imperial Brady and Wraptite cases)
//   TFORCE_PALLET_DIMS         "LxWxH" in inches, default 48x40x48
//   TFORCE_MAX_PALLETS         above this many pallets the shipment is
//                              refused (default 6, about 10 linear ft): over
//                              12 ft TForce bills a volume/truckload quote
//                              that only Bruce Basehore can price
//   TFORCE_LIFTGATE            "false" to drop the liftgate-delivery default
//   TFORCE_RESIDENTIAL         "true" to rate delivery as residential

const BASE = process.env.TFORCE_BASE_URL || 'https://api.tforcefreight.com';
// 10 s: TForce is the primary rater now (SHIPPING_RATER=tforce), and a
// timeout leaves the order unpriced; 6 s timed out on a live test.
const TIMEOUT_MS = 10000;

let cachedToken = null; // { token, expiresAt }

async function fetchWithTimeout(url, opts, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) return cachedToken.token;
  // Trimmed: a pasted value with a trailing space or newline is a common
  // reason Microsoft answers 400.
  const env = k => String(process.env[k] || '').trim();
  const id = env('TFORCE_CLIENT_ID'), secret = env('TFORCE_CLIENT_SECRET');
  const url = env('TFORCE_TOKEN_URL'), scope = env('TFORCE_SCOPE');
  if (!id || !secret || !url || !scope) {
    throw new Error('TFORCE_CLIENT_ID / TFORCE_CLIENT_SECRET / TFORCE_TOKEN_URL / TFORCE_SCOPE not configured');
  }
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope });
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    // Microsoft's error text (AADSTS code + reason) names the bad value; it
    // never echoes the secret. Logged so a 400 is diagnosable.
    let why = '';
    try { const e = await resp.json(); why = ` - ${e.error || ''}: ${String(e.error_description || '').split('\r')[0].slice(0, 200)}`; } catch (_) {}
    throw new Error(`TForce token request failed (${resp.status})${why}`);
  }
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

function palletDims(distributor) {
  const slug = String(distributor || '').trim().toLowerCase();
  const m = String(PALLET_DIMS_DEFAULTS[slug] || process.env.TFORCE_PALLET_DIMS || '48x40x48').match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  return m ? { length: Number(m[1]), width: Number(m[2]), height: Number(m[3]), unit: 'IN' } : { length: 48, width: 40, height: 48, unit: 'IN' };
}

// NMFC 049260 (sheets, towels) and 149265 (comforters, pillows, pads) share
// one density scale: [pounds per cubic foot below which, class].
const DENSITY_CLASSES = [
  [1, '400'], [2, '300'], [4, '250'], [6, '175'], [8, '125'], [10, '100'],
  [12, '92.5'], [15, '85'], [22.5, '70'], [30, '65'], [35, '60'], [50, '55'],
];

function classForDensity(pcf) {
  const hit = DENSITY_CLASSES.find(([below]) => pcf < below);
  return hit ? hit[1] : '50';
}

// Goods per pallet, by supplier. Linens (Starlinen, InnStyle) are light for
// their size, 750 lb a 48 in. pallet; a Sasso pallet is 36 five-gallon pails
// (~1,620 lb), an NPS pallet of paper ~650-1,500 lb (1,000 counts its
// heavier pallets as two, the safe direction).
const PALLET_MAX_LB_DEFAULTS = { sasso: 1700, nps: 1000, 'imperial-brady': 1200, wraptite: 1200 };
// NPS paper pallets are ~104 in. tall (masterlist pallet dims, e.g. Retain
// 2-ply: 51 x 42 x 105, 942 lb = class 125); rating them as 48 in. made them
// look twice as dense and quoted class 70.
const PALLET_DIMS_DEFAULTS = { nps: '50x42x102' }; // 102 in. is the API's height limit

function palletMaxLb(distributor) {
  const slug = String(distributor || '').trim().toLowerCase();
  const map = { ...PALLET_MAX_LB_DEFAULTS };
  for (const pair of String(process.env.TFORCE_PALLET_MAX_LB_BY_DISTRIBUTOR || '').split(',')) {
    const [k, v] = pair.split(':').map(x => x && x.trim().toLowerCase());
    if (k && Number(v) > 0) map[k] = Number(v);
  }
  return map[slug] || Number(process.env.TFORCE_PALLET_MAX_LB) || 750;
}

// One rate for `weightLb` of palletised freight from `origin` to `dest`.
// Returns { amount, service, transitDays } or throws.
async function rateFreight({ origin, dest, weightLb, liftgate, distributor }) {
  // The portal lists an Ocp-Apim-Subscription-Key header, but TForce's
  // integration guide only describes OAuth and a fresh developer profile has
  // no subscription to take a key from -- so it is sent only when set.
  const key = process.env.TFORCE_SUBSCRIPTION_KEY;
  const token = await getToken();

  const maxPallet = palletMaxLb(distributor);
  const pallets = Math.max(1, Math.ceil(weightLb / maxPallet));
  const maxPallets = Number(process.env.TFORCE_MAX_PALLETS) || 6;
  if (pallets > maxPallets) throw new Error(`${pallets} pallets needs a volume/truckload quote`);
  const dims = palletDims(distributor);
  // Billed weight includes the pallets themselves, as on a real BOL.
  const tare = process.env.TFORCE_PALLET_TARE_LB != null ? Number(process.env.TFORCE_PALLET_TARE_LB) : 40;
  const grossLb = weightLb + pallets * tare;
  const cubicFt = pallets * dims.length * dims.width * dims.height / 1728;
  // Class from density, as TForce rates it (Bruce's quotes: 227 lb on one
  // pallet = class 175). A fixed TFORCE_DEFAULT_CLASS still overrides.
  const cls = String(process.env.TFORCE_DEFAULT_CLASS || classForDensity(grossLb / cubicFt));

  const payer = {
    city: process.env.TFORCE_PAYER_CITY || 'Plymouth',
    state: process.env.TFORCE_PAYER_STATE || 'NC',
    zip: process.env.TFORCE_PAYER_ZIP || '27962',
  };

  // Delivery accessorials (API enum: NTFN INDE RESD LADL LIFD TRDS GWHD).
  const residential = String(process.env.TFORCE_RESIDENTIAL || '').toLowerCase() === 'true';
  const delivery = [];
  if (residential) delivery.push('RESD');
  // The buyer's checkout choice wins; TFORCE_LIFTGATE is the default for a
  // request that doesn't say (cart estimate, older page).
  const wantLiftgate = typeof liftgate === 'boolean' ? liftgate
    : String(process.env.TFORCE_LIFTGATE || 'true').toLowerCase() !== 'false';
  if (wantLiftgate) delivery.push('LIFD');

  const body = {
    requestOptions: {
      serviceCode: process.env.TFORCE_SERVICE_CODE || '308',
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
      billingCode: process.env.TFORCE_BILLING_CODE || '30',
    },
    serviceOptions: delivery.length ? { delivery } : undefined,
    // No handlingUnits: with them the API switches to density rating, which
    // RRS's account doesn't have, and answers 400 "NMFC and class number are
    // missing" (tested 2026-10-20). Class rating on the commodity line only.
    commodities: [{
      class: cls,
      pieces: pallets,
      weight: { weight: Math.round(grossLb * 10) / 10, weightUnit: 'LBS' },
      packagingType: 'PLT',
      dimensions: dims,
    }],
  };

  const version = encodeURIComponent(process.env.TFORCE_API_VERSION || 'v1');
  const post = () => fetchWithTimeout(`${BASE}/rating/getRate?api-version=${version}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(key ? { 'Ocp-Apim-Subscription-Key': key } : {}),
    },
    body: JSON.stringify(body),
  });
  // One retry on a timeout, 429 or 5xx: TForce occasionally stalls for
  // >10 s on a lane that answers in 2-3 s a moment later (2026-10-23 tests),
  // and with TForce as the primary rater a stall would block the sale.
  let resp;
  try {
    resp = await post();
    if (resp.status === 429 || resp.status >= 500) throw new Error('HTTP ' + resp.status);
  } catch (err) {
    console.warn('[tforce] retrying rating after', err.message);
    await new Promise(r => setTimeout(r, 800));
    resp = await post();
  }
  if (!resp.ok) {
    let why = '';
    try { why = ' - ' + (await resp.text()).slice(0, 300); } catch (_) {}
    throw new Error(`TForce rating failed (${resp.status})${why}`);
  }
  const data = await resp.json();
  // publishedRates=true means the tariff came back, not the contract rate --
  // usually a payer address that doesn't match the TForce account.
  if (data && data.summary && data.summary.publishedRates) {
    console.warn('[tforce] published (non-negotiated) rates returned');
  }

  const detail = (data && data.detail) || [];
  const priced = detail.map(d => {
    const total = d.shipmentCharges && d.shipmentCharges.total && d.shipmentCharges.total.value;
    const amount = Number(String(total == null ? '' : total).replace(/[$,]/g, ''));
    return {
      amount,
      service: d.service && d.service.code,
      // The live API returns timeInTransit.timeInTransit; the spec says .value.
      transitDays: d.timeInTransit && (d.timeInTransit.timeInTransit || d.timeInTransit.value),
    };
  }).filter(r => Number.isFinite(r.amount) && r.amount > 0);
  if (!priced.length) {
    const msg = (data && data.summary && data.summary.responseStatus && data.summary.responseStatus.message) || 'no usable rate';
    throw new Error('TForce rating returned ' + msg);
  }
  return priced.reduce((best, r) => (r.amount < best.amount ? r : best), priced[0]);
}

// RRS, the third-party payer on every booking (billing code 30, as on
// Bruce Basehore's sample eBOL: supplier ships, RRS pays).
const RRS_PAYER = {
  name: 'ROOM READY SUPPLY',
  phone: { number: '2522270073' },
  address: { addressLine: '609 WASHINGTON ST', city: 'PLYMOUTH', stateProvinceCode: 'NC', postalCode: '27962', country: 'US' },
};

const digits = s => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').slice(0, 15);
const up = (s, n = 100) => String(s || '').trim().toUpperCase().slice(0, n);
// The Shipping API wants pickup times as HH:MM:SS (it rejects the HHMM its
// manual shows -- tested in CIE 2026-10-23).
function hms(t, fallback) {
  const m = String(t || '').match(/^(\d{1,2}):?(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:00` : fallback;
}

// Books an LTL shipment: creates the BOL (PRO assigned), schedules the
// pickup and returns the BOL and 4x6 label PDFs, in one Shipping API call.
// test=true sends it to TForce's CIE test system -- same response, no real
// pickup. Returns { bolId, pro, originTerminal, pickupConfirmation,
// quotedTotal, transitDays, bolPdf, labelPdf, request } or throws.
//
// shipFrom/shipTo: { name, contact, phone, street, city, state, zip }
// freight: { pallets, weightLb, freightClass, nmfcPrime, nmfcSub, description }
// pickup: { date (YYYY-MM-DD), readyTime, closeTime (HH:MM) }
// requester: { contactName, email, phone }
async function createBol({ shipFrom, shipTo, freight, pickup, requester, liftgate, residential, reference, test }) {
  const party = p => ({
    name: up(p.name),
    phone: { number: digits(p.phone) },
    ...(p.contact ? { contact: up(p.contact) } : {}),
    address: {
      addressLine: up(p.street), city: up(p.city),
      stateProvinceCode: up(p.state, 2), postalCode: String(p.zip || '').slice(0, 5), country: 'US',
    },
  });
  const delivery = [];
  if (liftgate) delivery.push('LIFD');
  if (residential) delivery.push('RESD');
  const nmfc = freight.nmfcPrime && freight.nmfcSub
    ? { nmfc: { prime: String(freight.nmfcPrime).padStart(6, '0'), sub: String(freight.nmfcSub).padStart(2, '0') } }
    : {};

  const body = {
    requestOptions: {
      serviceCode: '308',
      pickupDate: pickup.date,
      previewRate: true,
      timeInTransit: true,
      bolPrintFormat: 'TFF',
      ...(reference ? { customerContext: String(reference).slice(0, 40) } : {}),
    },
    shipFrom: party(shipFrom),
    shipTo: { ...party(shipTo), ...(residential ? { isResidential: true } : {}) },
    payment: { payer: RRS_PAYER, billingCode: '30' },
    handlingUnitOne: { quantity: freight.pallets, typeCode: 'PLT' },
    commodities: [{
      description: up(freight.description || 'MERCHANDISE', 100),
      class: String(freight.freightClass),
      ...nmfc,
      pieces: freight.pallets,
      weight: { weight: Math.round(freight.weightLb), weightUnit: 'LBS' },
      packagingType: 'PLT',
    }],
    ...(reference ? { references: [{ number: String(reference).slice(0, 30), type: 'PO' }] } : {}),
    ...(delivery.length ? { serviceOptions: { delivery } } : {}),
    pickupRequest: {
      pickup: {
        date: pickup.date,
        time: hms(pickup.readyTime, '10:00:00'),
        openTime: hms(pickup.readyTime, '10:00:00'),
        closeTime: hms(pickup.closeTime, '16:00:00'),
      },
      requester: {
        companyName: 'ROOM READY SUPPLY',
        contactName: requester.contactName || 'Shipping Desk',
        email: requester.email || 'sales@roomreadysupply.com',
        phone: { number: digits(requester.phone) || '2522270073' },
        thirdParty: true,
      },
      pomIndicator: false,
    },
    documents: { image: [
      { type: '20', format: '01' },                                               // BOL, PDF
      { type: '30', format: '01', label: { type: '07', startPosition: 1, numberOfStickers: freight.pallets } }, // 4x6 labels
    ] },
  };

  const token = await getToken();
  const version = test ? 'cie-v1' : 'v1';
  const resp = await fetchWithTimeout(`${BASE}/shipping/bol/create?api-version=${version}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }, 25000); // booking + pickup + PDFs is slower than a rate
  const text = await resp.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  const d = data && data.detail;
  if (!resp.ok || !d || !d.pro) {
    const msg = (data && ((data.summary && data.summary.message) || (data.responseStatus && data.responseStatus.description))) || text.slice(0, 300);
    throw new Error(`TForce booking failed (${resp.status}): ${msg}`);
  }
  const rate = (d.rateDetail || [])[0] || {};
  const doc = t => ((d.documents && d.documents.image) || []).find(i => String(i.type) === t && i.data);
  return {
    bolId: d.bolId != null ? String(d.bolId) : null,
    pro: d.pro,
    originTerminal: d.originServiceCenter || null,
    pickupConfirmation: d.pickup && d.pickup.transactionReference && d.pickup.transactionReference.confirmationNumber || null,
    pickupError: d.pickup && d.pickup.responseStatus && String(d.pickup.responseStatus.code) !== '1'
      ? (d.pickup.responseStatus.description || 'pickup not scheduled') : null,
    quotedTotal: rate.shipmentCharges && rate.shipmentCharges.total ? Number(rate.shipmentCharges.total.value) : null,
    transitDays: rate.timeInTransit ? (rate.timeInTransit.timeInTransit || rate.timeInTransit.value || null) : null,
    bolPdf: doc('20') ? doc('20').data : null,
    labelPdf: doc('30') ? doc('30').data : null,
    request: body,
  };
}

module.exports = { rateFreight, getToken, createBol, classForDensity, palletMaxLb, palletDims };
