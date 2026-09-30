// UPS Rating API client (parcel). OAuth client-credentials token, cached.
//
// Lives in _lib (not as its own function) because Vercel's Hobby plan caps
// the project at 12 serverless functions and api/ is already at 12.
//
// Nothing here is used unless UPS_RATING_ENABLED=true (see shipping.js), so
// deploying this file changes no checkout behaviour by itself.
//
// Env: UPS_CLIENT_ID, UPS_CLIENT_SECRET (same app as tracking; the Rating
// product must be added to that app), UPS_ACCOUNT_NUMBER (negotiated rates),
// optional UPS_RATING_VERSION (default v2403), UPS_BASE_URL.

const UPS_BASE = process.env.UPS_BASE_URL || 'https://onlinetools.ups.com';
const RATING_VERSION = process.env.UPS_RATING_VERSION || 'v2403';
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
  const id = process.env.UPS_CLIENT_ID;
  const secret = process.env.UPS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('UPS_CLIENT_ID / UPS_CLIENT_SECRET not configured');
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const resp = await fetchWithTimeout(`${UPS_BASE}/security/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) throw new Error(`UPS token request failed (${resp.status})`);
  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

function addr(a) {
  return {
    AddressLine: [a.street || ''].filter(Boolean),
    City: a.city || '',
    StateProvinceCode: a.state || '',
    PostalCode: String(a.zip || '').slice(0, 5),
    CountryCode: 'US',
  };
}

// Cheapest available service ("Shop") for one shipment from `origin` to
// `dest`. `packages` = [{ weight, length, width, height }] in lb / inches.
// Returns { amount, service, negotiated } or throws.
async function rateParcelCheapest({ origin, dest, packages, shipper }) {
  const token = await getToken();
  const account = process.env.UPS_ACCOUNT_NUMBER;
  if (!account) throw new Error('UPS_ACCOUNT_NUMBER not configured');

  const body = {
    RateRequest: {
      Request: { TransactionReference: { CustomerContext: 'rrs-checkout' } },
      Shipment: {
        Shipper: { Name: 'Room Ready Supply', ShipperNumber: account, Address: addr(shipper || origin) },
        ShipTo: { Name: 'Customer', Address: addr(dest) },
        ShipFrom: { Name: origin.name || 'Warehouse', Address: addr(origin) },
        ShipmentRatingOptions: { NegotiatedRatesIndicator: '' },
        Package: packages.map(p => ({
          PackagingType: { Code: '02' },
          Dimensions: {
            UnitOfMeasurement: { Code: 'IN' },
            Length: String(Math.max(1, Math.ceil(p.length))),
            Width: String(Math.max(1, Math.ceil(p.width))),
            Height: String(Math.max(1, Math.ceil(p.height))),
          },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'LBS' },
            Weight: String(Math.max(1, Math.ceil(p.weight * 10) / 10)),
          },
        })),
      },
    },
  };

  const resp = await fetchWithTimeout(`${UPS_BASE}/api/rating/${RATING_VERSION}/Shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, transId: 'rrs-' + Date.now(), transactionSrc: 'rrs' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`UPS rating failed (${resp.status})`);
  const data = await resp.json();

  let shipments = data && data.RateResponse && data.RateResponse.RatedShipment;
  if (!shipments) throw new Error('UPS rating returned no rates');
  if (!Array.isArray(shipments)) shipments = [shipments];

  const priced = shipments.map(r => {
    const neg = r.NegotiatedRateCharges && r.NegotiatedRateCharges.TotalCharge && r.NegotiatedRateCharges.TotalCharge.MonetaryValue;
    const list = r.TotalCharges && r.TotalCharges.MonetaryValue;
    const amount = Number(neg != null ? neg : list);
    return { amount, service: r.Service && r.Service.Code, negotiated: neg != null };
  }).filter(r => Number.isFinite(r.amount) && r.amount > 0);
  if (!priced.length) throw new Error('UPS rating returned no usable rate');

  return priced.reduce((best, r) => (r.amount < best.amount ? r : best), priced[0]);
}

module.exports = { rateParcelCheapest, getToken };
