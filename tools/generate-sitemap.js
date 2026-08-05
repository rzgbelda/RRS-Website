// Generates sitemap-products.xml from products.csv
// Run: node tools/generate-sitemap.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.roomreadysupply.com';

function splitCSVRow(row) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQ && row[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const csv = fs.readFileSync(path.join(ROOT, 'products.csv'), 'utf8');
const rows = csv.split(/\r?\n/).filter(r => r.trim());
const today = new Date().toISOString().slice(0, 10);

const seen = new Set();
const urls = [];

for (let i = 1; i < rows.length; i++) {
  const v = splitCSVRow(rows[i]);
  const name = (v[0] || '').trim();
  const itemNumber = (v[1] || '').trim();
  if (!name && !itemNumber) continue;

  // Skip unpriced rows. The storefront hides these (see isSellable in
  // script.js), so submitting them to Google would advertise pages that
  // show nothing buyable. They return to the sitemap once priced.
  const priced = [11, 12, 13, 14].some(function (c) {
    return parseFloat(String(v[c] || '').replace(/[^0-9.]/g, '')) > 0;
  });
  if (!priced) continue;

  const slug = slugify(itemNumber || name);
  if (!slug || seen.has(slug)) continue;
  seen.add(slug);

  urls.push(
    `  <url>\n` +
    `    <loc>${BASE}/product?item=${encodeURIComponent(slug)}</loc>\n` +
    `    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>weekly</changefreq>\n` +
    `    <priority>0.8</priority>\n` +
    `  </url>`
  );
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.join('\n') + '\n' +
  `</urlset>\n`;

fs.writeFileSync(path.join(ROOT, 'sitemap-products.xml'), xml);

const index =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `  <sitemap>\n    <loc>${BASE}/sitemap.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
  `  <sitemap>\n    <loc>${BASE}/sitemap-products.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
  `</sitemapindex>\n`;

fs.writeFileSync(path.join(ROOT, 'sitemap-index.xml'), index);

console.log(`Generated sitemap-products.xml with ${urls.length} product URLs`);
console.log(`Generated sitemap-index.xml`);
