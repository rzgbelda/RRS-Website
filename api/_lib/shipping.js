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

// There is deliberately no fallback estimate (the old $0.50/lb allowance was
// retired 2026-10-06): a shipment either gets a real carrier rate or none,
// and price-cart.js decides what an unrated shipment means for checkout.

// Where unassigned products ship from: the RRS warehouse.
const RRS_ORIGIN = {
  name: 'Room Ready Supply', street: '609 Washington St', city: 'Plymouth', state: 'NC', zip: '27962',
};

const round2 = n => Math.round(n * 100) / 100;

function classifyShipment(weightLb) {
  return Number(weightLb) > FREIGHT_MIN_LB ? 'freight' : 'parcel';
}

function originComplete(o) {
  return !!(o && o.street && o.city && o.state && String(o.zip || '').length >= 5);
}

// Weight-based packaging for a parcel shipment: split the shipment into
// packages of up to 50 lb and use the largest case dimensions seen. Rating
// on weight (not a per-line case count) keeps this right whatever a line's
// unit is (case, dozen, pail), since those don't all mean one carton.
//
// Only trustworthy box dimensions are used. Soft goods (sheets, towels,
// linens) are stored with their flat PRODUCT size and no height, which is not
// a carton and would be rated as an oversize or absurdly heavy-by-volume box.
// A line's dimensions count only when length, width and height are all
// present and within UPS's limits (longest side 108 in, length + girth 165
// in); otherwise that line contributes nothing and the standard carton below
// is used with the real weight -- the heavy case weights on these goods
// dominate dimensional weight anyway.
const DEFAULT_BOX = { length: 14, width: 12, height: 10 };
const UPS_MAX_LONGEST = 108, UPS_MAX_LENGTH_GIRTH = 165;

function usableDims(l) {
  const d = [Number(l.length), Number(l.width), Number(l.height)];
  if (!d.every(x => Number.isFinite(x) && x > 0)) return null;
  const s = [...d].sort((a, b) => b - a);
  if (s[0] > UPS_MAX_LONGEST || s[0] + 2 * (s[1] + s[2]) > UPS_MAX_LENGTH_GIRTH) return null;
  return { length: d[0], width: d[1], height: d[2] };
}

function buildPackages(group) {
  const w = Math.max(group.weightLb, 1);
  const n = Math.min(Math.ceil(w / 50), 25);
  const good = group.lines.map(usableDims).filter(Boolean);
  const max = k => Math.max(...good.map(d => d[k]));
  const L = good.length ? max('length') : DEFAULT_BOX.length;
  const W = good.length ? max('width') : DEFAULT_BOX.width;
  const H = good.length ? max('height') : DEFAULT_BOX.height;
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
 * A shipment that can't be rated (carrier error, vendor with no address, no
 * freight API) comes back with amount null and method 'unrated'; `total`
 * sums only the rated ones.
 */
async function computeShipping({ lines, vendorsBySlug, destination, carrier }) {
  const groups = groupByDistributor(lines, vendorsBySlug);
  const shipments = [];

  for (const g of groups) {
    const mode = classifyShipment(g.weightLb);
    const origins = g.origins.filter(originComplete);
    let amount = null;
    let method = !origins.length ? 'unrated-no-origin' : 'unrated';
    let from = origins[0] ? `${origins[0].city} ${origins[0].state}` : null;

    const canRate = carrier && destination && destination.zip && origins.length > 0;
    if (canRate && mode === 'parcel' && carrier.rateParcel) {
      const best = await cheapestAcrossOrigins(origins, carrier.rateParcel, { dest: destination, packages: buildPackages(g) });
      if (best) { amount = best.amount; method = 'ups-parcel'; from = `${best.origin.city} ${best.origin.state}`; }
    } else if (canRate && mode === 'freight' && carrier.rateFreight) {
      const best = await cheapestAcrossOrigins(origins, carrier.rateFreight, { dest: destination, weightLb: g.weightLb, lines: g.lines });
      if (best) { amount = best.amount; method = 'freight'; from = `${best.origin.city} ${best.origin.state}`; }
    }

    shipments.push({ distributor: g.distributor, mode, weightLb: round2(g.weightLb), amount, method, from });
  }

  return { total: round2(shipments.reduce((s, x) => s + (x.amount || 0), 0)), shipments };
}

module.exports = {
  FREIGHT_MIN_LB, RRS_ORIGIN, classifyShipment, groupByDistributor, buildPackages, computeShipping,
};
