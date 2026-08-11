/**
 * One-time reseed of the Supabase `products` table from products.csv
 * (source of truth for what's live) joined against the two supplier cost
 * files (source of truth for cost + category).
 *
 * Run locally only -- never deployed. Requires the service role key,
 * because RLS correctly blocks anonymous writes to `products` (confirmed
 * live: an unauthenticated write attempt returns 42501).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node tools/reseed-products.js \
 *     --rdu "C:/path/to/products - RDU Products (1).csv" \
 *     --rj  "C:/path/to/products - RJ Schinner Products (1).csv"
 *
 * Defaults to a DRY RUN (prints what it would do, writes nothing).
 * Add --apply to actually write to the database.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://giprkvlyouwfzjlaibkq.supabase.co';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const APPLY = args.includes('--apply');
const RDU_PATH = flag('rdu', path.join(__dirname, '..', 'data', 'rdu-products.csv'));
const RJ_PATH  = flag('rj',  path.join(__dirname, '..', 'data', 'rj-schinner-products.csv'));
const CSV_PATH = path.join(__dirname, '..', 'products.csv');

/**
 * Category markup rates -- must stay identical to CATEGORY_MARKUPS in
 * admin.js. Verified against every supplier-priced product in the catalog:
 * cost x (1 + markup) reproduced all 117 published prices exactly.
 */
const CATEGORY_MARKUPS = {
  "Paper Products":                [0.35, 0.28, 0.22],
  "Towels":                        [0.50, 0.40, 0.33],
  "Bed Sheets & Linens":           [0.50, 0.40, 0.33],
  "Pillows & Mattress Protectors": [0.60, 0.50, 0.40],
  "Furniture":                     [0.45, 0.35, 0.30],
  "Trash Liners & Can Liners":     [0.45, 0.35, 0.28],
  "Cleaning Chemicals":            [0.40, 0.32, 0.25],
  "Housekeeping Supplies":         [0.55, 0.45, 0.35],
  "Guest Amenities":               [0.70, 0.55, 0.40],
  "Gloves & PPE":                  [0.35, 0.28, 0.22],
};

function splitCSVRow(row) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') { if (inQ && row[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const num = v => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; };
const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(r => r.trim().replace(/,/g, ''));
}

function main() {
  console.log(APPLY ? '=== APPLYING to the live database ===' : '=== DRY RUN (pass --apply to write) ===');
  console.log('');

  // --- 1. Supplier cost + category, keyed by item number ---
  const supplierRows = [];
  for (const [label, p] of [['RDU', RDU_PATH], ['RJ Schinner', RJ_PATH]]) {
    const rows = loadCSV(p);
    if (!rows) { console.error(`Cannot find ${label} file at: ${p}\nPass --rdu / --rj with the correct path.`); process.exit(1); }
    rows.slice(1).forEach(r => {
      const v = splitCSVRow(r);
      const item = (v[1] || '').trim();
      if (!item) return;
      supplierRows.push({
        item, category: (v[0] || '').trim(), cost: num(v[12]),
        // Selling Price is PER UNIT (per dozen, per each). The Price N Cases
        // columns are the real per-CASE prices customers are charged.
        sellPrice: num(v[13]),
        p1: num(v[14]), p2: num(v[15]), p3: num(v[16]),
        // PRICE BY decides the whole selling model, so it is read directly
        // rather than inferred: DOZEN products are sold by the dozen at a
        // flat rate with a minimum order, everything else by the case with
        // volume tiers. MOQ is that minimum (in dozens) and is exact --
        // verified across all 41 dozen products that MOQ x Selling Price
        // equals the supplier's own Price 1-5 Cases figure.
        moq: num(v[17]),
        priceBy: (v[18] || '').trim().toUpperCase(),
      });
    });
  }
  const supplierByItem = new Map(supplierRows.map(r => [r.item, r]));
  console.log(`Loaded ${supplierByItem.size} supplier cost/category rows (RDU + RJ Schinner).`);

  // --- 2. products.csv -- source of truth for what's actually live ---
  const csvRows = loadCSV(CSV_PATH);
  if (!csvRows) { console.error(`Cannot find products.csv at ${CSV_PATH}`); process.exit(1); }

  const toUpsert = [];
  const noSupplierMatch = [];
  csvRows.slice(1).forEach(r => {
    const v = splitCSVRow(r);
    const name = (v[0] || '').trim();
    const item = (v[1] || '').trim();
    if (!name || !item) return;

    const sup = supplierByItem.get(item);
    const markup = sup && CATEGORY_MARKUPS[sup.category];

    let price1, price2, price3, cost = null, category = null, unitsPerCase = 1;
    let moq = 1, soldByDozen = false;

    if (sup && sup.priceBy === 'DOZEN' && sup.sellPrice != null) {
      // Sold BY THE DOZEN at a single flat rate, with a minimum order.
      //
      // These 41 products used to be listed per case with 1-5 / 6-29 / 30+
      // case tiers. That is gone: the customer now buys dozens directly,
      // every dozen costs the same, and the only constraint is the minimum
      // (e.g. wash cloths start at 50 dozen). All three tier columns are
      // set to the same per-dozen figure so that any code still reading
      // price_tier2/3 -- the quote composer, the cart -- cannot accidentally
      // apply a discount that no longer exists.
      soldByDozen = true;
      moq = Math.max(1, Math.round(sup.moq || 1));
      price1 = price2 = price3 = sup.sellPrice;
      category = sup.category;
      // sup.cost is already per dozen here, so it is NOT scaled by the case
      // multiplier the way the per-case branch below does.
      cost = sup.cost != null ? +sup.cost.toFixed(2) : null;
    } else if (sup && sup.p1 != null) {
      // Take the per-CASE tier prices straight from the supplier file.
      //
      // These were previously recomputed as cost x (1 + markup), which is
      // WRONG for any product sold by the dozen: that formula yields the
      // supplier's per-UNIT "Selling Price" column, not the per-case price
      // the customer actually pays. It underpriced 57 products by their
      // units-per-case factor -- a 600-count case of wash cloths listed at
      // $3.03 instead of $151.74. Verified: these four columns reproduce
      // all 117 audited live prices exactly, with zero mismatches.
      price1 = sup.p1;
      price2 = sup.p2 != null ? sup.p2 : sup.p1;
      price3 = sup.p3 != null ? sup.p3 : price2;
      category = sup.category;

      // Scale the per-unit supplier cost up to a true per-case cost, so the
      // admin panel's margin figure compares like with like (and so its
      // cost x markup calculator produces a case price, not a unit price).
      unitsPerCase = (sup.sellPrice && sup.p1)
        ? Math.max(1, Math.round(sup.p1 / sup.sellPrice))
        : 1;
      cost = sup.cost != null ? +(sup.cost * unitsPerCase).toFixed(2) : null;
    } else {
      // No supplier record (e.g. the Sky Blue fleece blankets, hand-added
      // to the catalog outside the supplier files). Fall back to whatever
      // is already published in products.csv rather than silently
      // unpublishing a product that is sellable today. No cost/category
      // is available for these until a supplier record exists, so tier
      // pricing here is NOT auto-updating -- flagged below for review.
      price1 = num(v[12]); price2 = num(v[13]); price3 = num(v[14]);
      if (price1 == null && price2 == null && price3 == null) {
        let reason = 'no supplier record, and no price in products.csv either';
        if (sup && sup.cost == null) reason = 'supplier record has no cost, and no price in products.csv either';
        else if (sup && !markup) reason = `unknown category "${sup.category}", and no price in products.csv either`;
        noSupplierMatch.push({ item, name, reason });
        return;
      }
      noSupplierMatch.push({ item, name, reason: 'no supplier cost -- kept live using its current products.csv price (won’t auto-update)', kept: true });
    }

    toUpsert.push({
      sku: item,
      slug: slugify(item || name),
      name,
      description: (v[3] || '').trim() || null,
      overview: (v[4] || '').trim() || null,
      feature1: (v[5] || '').trim() || null,
      feature2: (v[6] || '').trim() || null,
      feature3: (v[7] || '').trim() || null,
      feature4: (v[8] || '').trim() || null,
      case_qty: (v[9] || '').trim() || null,
      pack_size: (v[10] || '').trim() || null,
      price: price1,
      price_tier1: price1,
      price_tier2: price2,
      price_tier3: price3,
      cost_per_case: cost,
      category_name: category,
      image_url: (v[2] || '').trim() || null,
      product_family: (v[15] || '').trim() || null,
      variant_label: (v[16] || '').trim() || null,
      sell_by_each: (v[17] || '').trim() || null,
      // This drives the "/ X" label next to the price everywhere on the
      // site. The supplier's PRICE BY column describes the basis of their
      // per-unit Selling Price ("DOZEN"), but what we list and charge is
      // the per-case price -- so a 50-dozen case read "$151.74 / DOZEN",
      // implying a customer got twelve wash cloths for that. Whenever a
      // case holds more than one sales unit, the price is per case and the
      // label must say so; case_qty still conveys how the case is made up.
      // Title-cased so the site doesn't mix "/ CASE" and "/ Case".
      // Only the dozen branch above may label a product 'Dozen'. A product
      // with no supplier record has no per-dozen rate and no MOQ, so its
      // price is still per case -- inheriting "DOZEN" from products.csv
      // would advertise a case price as a per-dozen one, which is the same
      // class of error that once listed a 600-count case at $3.03.
      unit: soldByDozen
        ? 'Dozen'
        : (unitsPerCase > 1 ? 'Case' : (titleCase((v[18] || '').trim()) === 'Dozen' ? 'Case' : titleCase((v[18] || '').trim() || 'Case'))),
      // Minimum order, in whatever `unit` says. 1 for everything sold by
      // the case or each, so existing behaviour is unchanged for them.
      moq,
      weight: num(v[19]),
      length: num(v[20]),
      width:  num(v[21]),
      height: num(v[22]),
      color_group: (v[23] || '').trim() || null,
      color_label: (v[24] || '').trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  });

  // Colour variants (SKU = base SKU + a suffix, e.g. ...-FLC-SB for Sky
  // Blue) aren't listed separately in the supplier files, so they came
  // through with no cost and no category -- the admin list showed them
  // with a blank margin. Inherit both from the base product, but ONLY when
  // all three tier prices match exactly. That guard is the point: identical
  // pricing is what proves it's the same product economically, so if a
  // variant is ever priced differently this quietly stops applying rather
  // than assuming a cost that isn't true.
  const bySku = new Map(toUpsert.map(p => [p.sku, p]));
  const inherited = [];
  toUpsert.forEach(p => {
    if (p.cost_per_case != null || !p.sku) return;
    const base = [...bySku.keys()]
      .filter(k => k !== p.sku && p.sku.startsWith(k + '-'))
      .sort((a, b) => b.length - a.length)   // longest = closest ancestor
      .map(k => bySku.get(k))
      .find(b => b.cost_per_case != null &&
                 b.price_tier1 === p.price_tier1 &&
                 b.price_tier2 === p.price_tier2 &&
                 b.price_tier3 === p.price_tier3);
    if (!base) return;
    p.cost_per_case = base.cost_per_case;
    p.category_name = p.category_name || base.category_name;
    inherited.push({ sku: p.sku, from: base.sku, cost: base.cost_per_case, category: base.category_name });
  });

  if (inherited.length) {
    console.log(`\n${inherited.length} colour variant(s) inherited cost + category from their base product (identical tier pricing):`);
    inherited.forEach(i => console.log(`  - ${i.sku}  <- ${i.from}   cost $${i.cost}, ${i.category}`));
  }

  const kept = noSupplierMatch.filter(n => n.kept);
  const excluded = noSupplierMatch.filter(n => !n.kept);

  console.log(`products.csv: ${toUpsert.length} products ready to upsert.`);
  if (kept.length) {
    console.log(`\n${kept.length} have no supplier cost record -- kept live using their current products.csv price (no cost_per_case, so they won't auto-update on the next supplier price change until someone enters a cost for them in admin):`);
    kept.forEach(n => console.log(`  - [${n.item}] ${n.name.slice(0, 60)}`));
  }
  if (excluded.length) {
    console.log(`\n${excluded.length} excluded (no supplier cost AND no usable price in products.csv -- same as isSellable hides today):`);
    excluded.forEach(n => console.log(`  - [${n.item}] ${n.name.slice(0, 60)}  (${n.reason})`));
  }

  // Sold-by-the-dozen products are the ones whose whole pricing model
  // changed, so they get their own summary rather than being buried in a
  // generic sample. Flat rate and minimum order are what to eyeball here.
  const dozenRows = toUpsert.filter(p => p.unit === 'Dozen');
  console.log(`\n${dozenRows.length} products sold BY THE DOZEN (flat rate, no volume tiers):`);
  const byMoq = {};
  dozenRows.forEach(p => { (byMoq[p.moq] = byMoq[p.moq] || []).push(p); });
  Object.keys(byMoq).map(Number).sort((a, b) => a - b).forEach(m => {
    const g = byMoq[m];
    console.log(`  min ${String(m).padStart(2)} dz  (${String(g.length).padStart(2)} products)  e.g. ${g[0].sku.padEnd(22)} $${g[0].price_tier1}/dz  -> ${m} dz = $${(g[0].price_tier1 * m).toFixed(2)}`);
  });
  const badTiers = dozenRows.filter(p => p.price_tier1 !== p.price_tier2 || p.price_tier2 !== p.price_tier3);
  console.log(badTiers.length
    ? `  WARNING: ${badTiers.length} dozen products still carry unequal tiers`
    : '  all dozen products have a single flat rate across all three tier fields');

  if (!APPLY) {
    console.log('\n--- sample of cost-derived rows (first 3) ---');
    toUpsert.filter(p => p.cost_per_case != null).slice(0, 3).forEach(p => console.log(`  ${p.sku.padEnd(14)} ${p.name.slice(0, 40).padEnd(42)} cost $${p.cost_per_case}  ->  $${p.price_tier1} / $${p.price_tier2} / $${p.price_tier3}  [${p.category_name}]`));
    console.log('\nDry run only -- nothing was written. Re-run with --apply once this looks right.');
    return;
  }

  // --- 3. Apply, using the service role key (bypasses RLS) ---
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) { console.error('\nSUPABASE_SERVICE_ROLE_KEY is not set. Refusing to run --apply without it.'); process.exit(1); }
  const supabase = createClient(SUPABASE_URL, serviceKey);

  (async () => {
    // process.exitCode (not process.exit()) after an await -- forcing an
    // immediate exit while supabase-js's underlying network handles are
    // still closing crashes Node on Windows (confirmed: "Assertion failed
    // !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c"). Setting
    // exitCode and returning lets the event loop drain and exit cleanly.
    console.log('\nUpserting products (on conflict: sku)...');
    const { data: upserted, error: upErr } = await supabase
      .from('products')
      .upsert(toUpsert, { onConflict: 'sku' })
      .select('id');
    if (upErr) { console.error('Upsert failed:', upErr.message); process.exitCode = 1; return; }
    console.log(`  ${upserted.length} rows upserted.`);

    console.log('\nDeactivating legacy rows...');
    // Two queries, not one -- SQL's `NOT IN` silently excludes NULLs (a row
    // where sku IS NULL never matches `sku NOT IN (...)`, it evaluates to
    // unknown, not true), so a single "not in" filter would leave every
    // no-sku legacy row untouched. Handle the NULL case explicitly.
    const liveSkus = toUpsert.map(p => p.sku);
    const stamp = new Date().toISOString();

    const { data: deactivatedNull, error: nullErr } = await supabase
      .from('products')
      .update({ is_active: false, updated_at: stamp })
      .is('sku', null)
      .select('id');
    if (nullErr) { console.error('Deactivation (null-sku rows) failed:', nullErr.message); process.exitCode = 1; return; }

    // .not(column, 'in', value) is a raw passthrough -- unlike .in(), it
    // does NOT serialize a JS array for you (confirmed live: passing the
    // array produced "not.in.11008635042,74828,..." with no parentheses
    // at all, which Postgrest rejected as unparseable). Build the
    // Postgrest list syntax ourselves: "(a,b,c)" with each element
    // double-quoted, since several SKUs contain spaces (e.g. "FT 30852").
    const liveSkuList = `(${liveSkus.map(s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
    const { data: deactivatedStale, error: staleErr } = await supabase
      .from('products')
      .update({ is_active: false, updated_at: stamp })
      .not('sku', 'is', null)
      .not('sku', 'in', liveSkuList)
      .select('id');
    if (staleErr) { console.error('Deactivation (stale-sku rows) failed:', staleErr.message); process.exitCode = 1; return; }

    const deactivatedCount = deactivatedNull.length + deactivatedStale.length;
    console.log(`  ${deactivatedCount} legacy rows deactivated (is_active = false, not deleted): ${deactivatedNull.length} with no sku, ${deactivatedStale.length} with a sku no longer in the live catalog.`);

    console.log('\nDone.');
  })();
}

main();
