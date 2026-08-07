// Generates sitemap-products.xml from the Supabase `products` table.
// Products used to live in products.csv; they now come from the database
// (see tools/reseed-products.js), so this queries the same public REST
// endpoint the storefront reads from, rather than parsing the CSV file.
// Run: node tools/generate-sitemap.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.roomreadysupply.com';
const SUPABASE_URL = 'https://giprkvlyouwfzjlaibkq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY';

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=sku,name,price,price_tier1,price_tier2,price_tier3&is_active=eq.true`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
  const products = await res.json();

  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const urls = [];

  for (const p of products) {
    const name = (p.name || '').trim();
    const itemNumber = (p.sku || '').trim();
    if (!name && !itemNumber) continue;

    // Same gate as the storefront's isSellable(): a product with no price
    // anywhere shouldn't be advertised to Google as a buyable page.
    const priced = [p.price, p.price_tier1, p.price_tier2, p.price_tier3].some(v => Number(v) > 0);
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
    `  <sitemap>\n    <loc>${BASE}/sitemap-categories.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
    `  <sitemap>\n    <loc>${BASE}/sitemap-products.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
    `</sitemapindex>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap-index.xml'), index);

  console.log(`Generated sitemap-products.xml with ${urls.length} product URLs`);
  console.log(`Generated sitemap-index.xml`);
}

main().catch(err => { console.error(err); process.exit(1); });
