// Per-distributor shipping: group a cart's lines by the distributor that
// ships them, decide parcel vs freight for each group, and rate each from
// THAT distributor's warehouse to the customer.
//
// RRS is a dropshipper, so one order can leave from several warehouses at
// once (Starlinen in NJ, Sasso in NC, NPS in WI...). Each group is its own
// shipment with its own fee; the customer sees one combined Delivery line.
//
// A distributor can have more than one warehouse (Wraptite: Port Wentworth
// and Savannah, GA). Every warehouse is rated to the customer and the
// cheapest wins -- the closest one in practice, and it uses the carrier's
// real zone pricing instead of a guess at distance. If no rate comes back
// the PRIMARY warehouse (vendors.ship_from_*) is the default.
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

// A vendor's warehouses: the primary first, then any extras.
function vendorOrigins(v) {
  if (!v) return [];
  const primary = { name: v.name, street: v.ship_from_street, city: v.ship_from_city, state: v.ship_from_state, zip: v.ship_from_zip };
  let extras = v.extra_warehouses;
  if (typeof extras === 'string') { try { extras = JSON.parse(extras); } catch (_) { extras = []; } }
  const more = (Array.isArray(extras) ? extras : []).map(w => ({
    name: v.name, street: w.street, city: w.city, state: w.state, zip: w.zip,
  }));
  return [primary, ...more];
}

// lines: [{ distributor, weightLb, length, width, height }]
// vendorsBySlug: Map(slug -> vendor row incl. ship_from_* and extra_warehouses)
function groupByDistributor(lines, vendorsBySlug) {
  const groups = new Map();
  for (const l of lines) {
    const slug = (l.distributor || '').trim().toLowerCase();
    const key = slug || '__rrs';
    if (!groups.has(key)) {
      const origins = slug ? vendorOrigins(vendorsBySlug.get(slug)) : [RRS_ORIGIN];
      groups.set(key, { distributor: slug || null, origins, origin: origins[0] || null, weightLb: 0, lines: [] });
    }
    const g = groups.get(key);
    g.weightLb += Number(l.weightLb) || 0;
    g.lines.push(l);
  }
  return [...groups.values()];
}

// Rates the shipment from every complete warehouse and returns the cheapest
// { amount, origin } -- or null if none of them produced a rate.
async function cheapestAcrossOrigins(origins, rateFn, args) {
  const settled = await Promise.all(origins.map(async o => {
    try {
      const r = await rateFn({ ...args, origin: o });
      return r && r.amount > 0 ? { amount: round2(r.amount), origin: o } : null;
    } catch (err) {
      console.warn('[shipping] rate failed from', o.city || o.zip, '-', err.message);
      return null;
    }
  }));
  const ok = settled.filter(Boolean);
  if (!ok.length) return null;
  // Ties keep the earlier (primary-first) warehouse.
  return ok.reduce((best, r) => (r.amount < best.amount ? r : best), ok[0]);
}

/**
 * Returns { total, shipments: [{ distributor, mode, weightLb, amount, method, from }] }.
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
    const origins = g.origins.filter(originComplete);
    let amount = null;
    let method = 'estimate';
    let from = origins[0] ? `${origins[0].city} ${origins[0].state}` : null;

    const canRate = carrier && destination && destination.zip && origins.length > 0;
    if (canRate && mode === 'parcel' && carrier.rateParcel) {
      const best = await cheapestAcrossOrigins(origins, carrier.rateParcel, { dest: destination, packages: buildPackages(g) });
      if (best) { amount = best.amount; method = 'ups-parcel'; from = `${best.origin.city} ${best.origin.state}`; }
    } else if (canRate && mode === 'freight' && carrier.rateFreight) {
      const best = await cheapestAcrossOrigins(origins, carrier.rateFreight, { dest: destination, weightLb: g.weightLb, lines: g.lines });
      if (best) { amount = best.amount; method = 'ups-freight'; from = `${best.origin.city} ${best.origin.state}`; }
    }

    if (amount == null) {
      amount = estimateShipment(g.weightLb);
      method = !origins.length ? 'estimate-no-origin'
        : (mode === 'freight' && !(carrier && carrier.rateFreight) ? 'estimate-freight' : 'estimate');
    }
    shipments.push({ distributor: g.distributor, mode, weightLb: round2(g.weightLb), amount, method, from });
  }

  return { total: round2(shipments.reduce((s, x) => s + x.amount, 0)), shipments };
}

module.exports = {
  FREIGHT_MIN_LB, RRS_ORIGIN, classifyShipment, estimateShipment, groupByDistributor, buildPackages, computeShipping,
};
