// Per-distributor shipping: group a cart's lines by the distributor that
// ships them, decide parcel vs freight for each group, and rate each from
// THAT distributor's warehouse to the customer.
//
// RRS is a dropshipper, so one order can leave from several warehouses at
// once (Starlinen in NJ, Sasso in NC, NPS in WI...). Each group is its own
// shipment with its own fee; the customer sees one combined Delivery line.
//
// Pure logic, with the carrier calls injected, so it can be tested without
// UPS. Used by price-cart.js.

// Above this total weight a distributor's shipment goes freight (LTL)
// instead of UPS parcel. UPS parcel tops out at 150 lb per package, and in
// practice anything much heavier ships on a pallet. NPS (one pallet minimum,
// ~600+ lb) and Sasso (36 pails, ~1,600 lb) are always freight; a small
// Starlinen or Wraptite order is parcel. One constant so the rule is easy to
// change.
const FREIGHT_MIN_LB = 150;

// Used when a real rate can't be had (UPS down, vendor has no address, a
// freight shipment with no freight API yet): the standard allowance the site
// has always charged -- $0.50 per packaged pound, $10.99 minimum. Mirrors
// SHIPPING_RATE_PER_LB / SHIPPING_MIN_CHARGE in price-cart.js and script.js.
const ESTIMATE_RATE_PER_LB = 0.50;
const ESTIMATE_MIN_CHARGE = 10.99;

// Where unassigned products ship from: the RRS warehouse.
const RRS_ORIGIN = {
  name: 'Room Ready Supply', street: '609 Washington St', city: 'Plymouth', state: 'NC', zip: '27962',
};

const round2 = n => Math.round(n * 100) / 100;

function classifyShipment(weightLb) {
  return Number(weightLb) > FREIGHT_MIN_LB ? 'freight' : 'parcel';
}

function estimateShipment(weightLb) {
  return round2(Math.max(round2(Number(weightLb) * ESTIMATE_RATE_PER_LB), ESTIMATE_MIN_CHARGE));
}

function originComplete(o) {
  return !!(o && o.street && o.city && o.state && String(o.zip || '').length >= 5);
}

// Weight-based packaging for a parcel shipment: split the shipment into
// packages of up to 50 lb and use the largest case dimensions seen. Rating
// on weight (not a per-line case count) keeps this right whatever a line's
// unit is (case, dozen, pail), since those don't all mean one carton.
function buildPackages(group) {
  const w = Math.max(group.weightLb, 1);
  const n = Math.min(Math.ceil(w / 50), 25);
  const dim = k => Math.max(1, ...group.lines.map(l => Number(l[k]) || 0)) || 1;
  const L = group.lines.some(l => l.length) ? dim('length') : 14;
  const W = group.lines.some(l => l.width) ? dim('width') : 12;
  const H = group.lines.some(l => l.height) ? dim('height') : 10;
  return Array.from({ length: n }, () => ({ weight: w / n, length: L, width: W, height: H }));
}

// lines: [{ distributor, weightLb, length, width, height }]
// vendorsBySlug: Map(slug -> { name, ship_from_street, ship_from_city, ship_from_state, ship_from_zip })
function groupByDistributor(lines, vendorsBySlug) {
  const groups = new Map();
  for (const l of lines) {
    const slug = (l.distributor || '').trim().toLowerCase();
    const key = slug || '__rrs';
    if (!groups.has(key)) {
      const v = slug ? vendorsBySlug.get(slug) : null;
      const origin = v
        ? { name: v.name, street: v.ship_from_street, city: v.ship_from_city, state: v.ship_from_state, zip: v.ship_from_zip }
        : (slug ? null : RRS_ORIGIN);
      groups.set(key, { distributor: slug || null, origin, weightLb: 0, lines: [] });
    }
    const g = groups.get(key);
    g.weightLb += Number(l.weightLb) || 0;
    g.lines.push(l);
  }
  return [...groups.values()];
}

/**
 * Returns { total, shipments: [{ distributor, mode, weightLb, amount, method }] }.
 * `carrier` = { rateParcel(args) -> {amount}, rateFreight?(args) -> {amount} }
 * Any carrier error, missing address or missing freight API falls back to the
 * weight estimate for that shipment only -- checkout never dead-ends on a
 * carrier problem.
 */
async function computeShipping({ lines, vendorsBySlug, destination, carrier }) {
  const groups = groupByDistributor(lines, vendorsBySlug);
  const shipments = [];

  for (const g of groups) {
    const mode = classifyShipment(g.weightLb);
    let amount = null;
    let method = 'estimate';

    const canRate = carrier && destination && destination.zip && originComplete(g.origin);
    try {
      if (canRate && mode === 'parcel' && carrier.rateParcel) {
        const r = await carrier.rateParcel({ origin: g.origin, dest: destination, packages: buildPackages(g) });
        if (r && r.amount > 0) { amount = round2(r.amount); method = 'ups-parcel'; }
      } else if (canRate && mode === 'freight' && carrier.rateFreight) {
        const r = await carrier.rateFreight({ origin: g.origin, dest: destination, weightLb: g.weightLb, lines: g.lines });
        if (r && r.amount > 0) { amount = round2(r.amount); method = 'ups-freight'; }
      }
    } catch (err) {
      console.warn('[shipping] rate failed for', g.distributor || 'rrs', mode, '-', err.message);
    }

    if (amount == null) {
      amount = estimateShipment(g.weightLb);
      method = !originComplete(g.origin) ? 'estimate-no-origin' : (mode === 'freight' && !(carrier && carrier.rateFreight) ? 'estimate-freight' : 'estimate');
    }
    shipments.push({ distributor: g.distributor, mode, weightLb: round2(g.weightLb), amount, method });
  }

  return { total: round2(shipments.reduce((s, x) => s + x.amount, 0)), shipments };
}

module.exports = {
  FREIGHT_MIN_LB, RRS_ORIGIN, classifyShipment, estimateShipment, groupByDistributor, buildPackages, computeShipping,
};
