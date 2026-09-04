// Generates sitemap.xml, sitemap-categories.xml, sitemap-products.xml, and
// sitemap-index.xml. Products come from the Supabase `products` table (see
// tools/reseed-products.js); categories are discovered by scanning the
// category/ directory itself rather than a hand-maintained list -- that's
// what let category/laundry-cleaning-chemicals.html sit invisible to the
// sitemap and to tools/seo-audit.js for weeks despite being linked from
// every page on the site (SEO Day 10 fix). A new category page dropped
// into that folder now appears here automatically.
// Run: node tools/generate-sitemap.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://www.roomreadysupply.com';
const SUPABASE_URL = 'https://giprkvlyouwfzjlaibkq.supabase.co';
const SUPABASE_ANON = 'sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN';

// True static pages -- not derived from any data source, so hand-listing
// them here is fine; there's no "file on disk" signal for these the way
// there is for categories, and they change rarely enough that a missed
// addition would be caught by the audit tool's PUBLIC_PAGES list anyway.
const STATIC_PAGES = [
  { path: '/',                changefreq: 'weekly',  priority: '1.0' },
  { path: '/catalog',         changefreq: 'weekly',  priority: '0.9' },
  { path: '/blog',            changefreq: 'weekly',  priority: '0.7' },
  { path: '/shipping-policy', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms',           changefreq: 'yearly',  priority: '0.3' },
  { path: '/privacy',         changefreq: 'yearly',  priority: '0.3' },

  // SEO landing pages (regional/vertical/offer) -- same priority as the
  // 9 category pages since they're the same kind of curated entry point.
  { path: '/supplies-for-rv-parks',           changefreq: 'monthly', priority: '0.9' },
  { path: '/supplies-for-campgrounds',        changefreq: 'monthly', priority: '0.9' },
  { path: '/supplies-for-short-term-rentals', changefreq: 'monthly', priority: '0.9' },
  { path: '/supplies-for-cleaning-companies', changefreq: 'monthly', priority: '0.9' },
  { path: '/auto-reorder',                    changefreq: 'monthly', priority: '0.8' },
  { path: '/quote-match',                     changefreq: 'monthly', priority: '0.8' },
  { path: '/hotel-supplies-north-carolina',   changefreq: 'monthly', priority: '0.9' },
  { path: '/hotel-supplies-virginia',         changefreq: 'monthly', priority: '0.9' },
  { path: '/hotel-supplies-outer-banks',      changefreq: 'monthly', priority: '0.9' },
];

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function urlEntry(loc, today, changefreq, priority) {
  return `  <url>\n` +
    `    <loc>${loc}</loc>\n` +
    `    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n` +
    `  </url>`;
}

function writeUrlset(filename, urls) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') + '\n' +
    `</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, filename), xml);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // sitemap.xml -- static pages
  writeUrlset('sitemap.xml', STATIC_PAGES.map(p =>
    urlEntry(`${BASE}${p.path}`, today, p.changefreq, p.priority)
  ));
  console.log(`Generated sitemap.xml with ${STATIC_PAGES.length} static pages`);

  // sitemap-categories.xml -- every category/*.html file on disk, not a
  // hardcoded list, so an added-but-forgotten category can't happen again
  const categoryDir = path.join(ROOT, 'category');
  const categorySlugs = fs.readdirSync(categoryDir)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace(/\.html$/, ''))
    .sort();
  writeUrlset('sitemap-categories.xml', categorySlugs.map(slug =>
    urlEntry(`${BASE}/category/${slug}`, today, 'weekly', '0.9')
  ));
  console.log(`Generated sitemap-categories.xml with ${categorySlugs.length} category pages`);

  await generateProductSitemap(today);
  await generateBlogSitemap(today);

  const index =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <sitemap>\n    <loc>${BASE}/sitemap.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
    `  <sitemap>\n    <loc>${BASE}/sitemap-categories.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
    `  <sitemap>\n    <loc>${BASE}/sitemap-products.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
    `  <sitemap>\n    <loc>${BASE}/sitemap-blog.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>\n` +
    `</sitemapindex>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap-index.xml'), index);
  console.log(`Generated sitemap-index.xml`);
}

async function generateProductSitemap(today) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=sku,name,price,price_tier1,price_tier2,price_tier3&is_active=eq.true`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
  const products = await res.json();

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

  writeUrlset('sitemap-products.xml', urls);
  console.log(`Generated sitemap-products.xml with ${urls.length} product URLs`);
}

async function generateBlogSitemap(today) {
  // Published articles only -- a draft has no public route to begin with
  // (RLS on articles blocks anon reads of anything but status='published'),
  // so this query mirrors that same filter rather than relying on it.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?select=slug,updated_at&status=eq.published`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
  );
  if (!res.ok) throw new Error(`Failed to load articles (${res.status})`);
  const articles = await res.json();

  const urls = articles.map(a => {
    const lastmod = (a.updated_at || today).slice(0, 10);
    return `  <url>\n` +
      `    <loc>${BASE}/blog/post?slug=${encodeURIComponent(a.slug)}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>monthly</changefreq>\n` +
      `    <priority>0.6</priority>\n` +
      `  </url>`;
  });

  writeUrlset('sitemap-blog.xml', urls);
  console.log(`Generated sitemap-blog.xml with ${urls.length} article URLs`);
}

main().catch(err => { console.error(err); process.exit(1); });
