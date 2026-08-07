/**
 * Generates the category landing pages under /category/.
 *
 * Why static files rather than one dynamic page: these exist to rank for
 * how buyers actually search ("wholesale hotel towels", "bulk can liners"),
 * which needs a real indexable URL with its own title, description and
 * hand-written copy. A single ?category= page would be one URL competing
 * for every term at once.
 *
 * The product grid is rendered client-side from the same live catalog the
 * rest of the site uses, so these pages never go stale as products change.
 * Only the copy below is authored; counts, names, prices and images all
 * come from the database at page load.
 *
 * Run: node tools/generate-category-pages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'category');
const BASE = 'https://www.roomreadysupply.com';

// Hand-written per category. `intro` is the indexable copy that gives each
// page a reason to exist; `terms` are the buyer phrases it should read
// naturally for -- worked into the prose, never listed as keyword stuffing.
const CATEGORIES = [
  {
    slug: 'bed-sheets-linens',
    name: 'Bed Sheets & Linens',
    h1: 'Wholesale Hotel Sheets & Bed Linens',
    title: 'Wholesale Hotel Sheets & Bed Linens | Bulk Case Pricing',
    description: 'Bulk hotel bed sheets and linens by the case — T-180, T-200, T-250 percale and microfiber in Full XL, Queen and King. Volume pricing with fast North Carolina delivery.',
    intro: [
      'Bed linens are the single biggest driver of how a guest rates their stay, and the fastest-wearing item in any housekeeping program. We supply flat sheets, fitted sheets, pillowcases and blankets by the case, in the sizes and thread counts hotels and motels actually reorder.',
      'Choose microfiber for wrinkle resistance and quick turnover, T-180 percale for dependable everyday value, or T-250 sateen where the room rate justifies a softer hand. Every option is built for commercial laundering, not household washing machines.',
      'Pricing drops at 6 cases and again at 30. If you are outfitting a full property or standardizing across several, send us your room count and we will quote the whole program.',
    ],
  },
  {
    slug: 'towels',
    name: 'Towels',
    h1: 'Wholesale Hotel Towels — Bath, Hand & Wash Cloths',
    title: 'Wholesale Hotel Towels in Bulk | Bath, Hand & Wash Cloths',
    description: 'Commercial hotel towels by the case — bath towels, hand towels, wash cloths and bath mats in economy, premium and luxury cotton. Bulk case pricing, fast NC delivery.',
    intro: [
      'Guest room towels take more abuse than any other linen you buy. We stock three tiers so you can match quality to room rate: economy cotton terry for high-turnover properties, premium 86/14 cotton-poly for a noticeably softer hand, and luxury ringspun cotton where guests expect a spa feel.',
      'Bath towels, hand towels, wash cloths and bath mats are all sold by the case in standard commercial sizes, from 12×12 wash cloths through 27×54 bath sheets.',
      'Not sure which tier fits your property? Tell us your average daily rate and how often you replace linen, and we will recommend the grade that lasts without overspending.',
    ],
  },
  {
    slug: 'paper-products',
    name: 'Paper Products',
    h1: 'Wholesale Bath Tissue, Paper Towels & Facial Tissue',
    title: 'Wholesale Paper Products for Hotels | Bath Tissue & Towels',
    description: 'Bulk bath tissue, kitchen roll towels, multifold towels, hardwound roll towels and facial tissue for hotels and facilities. Case pricing with volume discounts.',
    intro: [
      'Paper is the line item every property underestimates and every guest notices when it runs out. We carry SFI-certified 2-ply bath tissue, kitchen roll towels, multifold and hardwound roll towels for dispensers, and cube and flat box facial tissue.',
      'Everything ships in full commercial case packs sized for a supply closet, not a retail shelf — so your housekeeping team restocks less often and your cost per roll drops.',
      'Bulk pricing starts at 6 cases. Most properties order paper on a standing reorder schedule; ask us about setting one up so you stop placing the same order every month.',
    ],
  },
  {
    slug: 'cleaning-chemicals',
    name: 'Cleaning Chemicals',
    h1: 'Wholesale Commercial Cleaning Chemicals & Disinfectants',
    title: 'Commercial Cleaning Chemicals Wholesale | Disinfectants & Bleach',
    description: 'EPA-registered disinfectants, germicidal bleach, glass cleaner, laundry detergent and dish soap in bulk for hotels and commercial facilities. Case pricing.',
    intro: [
      'Housekeeping chemicals are where compliance and cost meet. We supply EPA-registered disinfectants and germicidal cleaners with documented kill claims, alongside the everyday glass cleaner, laundry detergent and pot-and-pan soap that keep a property running.',
      'Brands your staff already know — Clorox, Lysol, Pine-Sol, Purex, Dawn and Windex — in commercial case packs and concentrates that cost far less per use than retail sizes.',
      'If your property has specific disinfection requirements or a health-department standard to meet, send us the spec and we will confirm which products carry the right registrations before you order.',
    ],
  },
  {
    slug: 'pillows-mattress-protectors',
    name: 'Pillows & Mattress Protectors',
    h1: 'Wholesale Hotel Pillows & Mattress Protectors',
    title: 'Wholesale Hotel Pillows & Mattress Protectors | Bulk Pricing',
    description: 'Bulk hotel pillows, waterproof mattress protectors and pillow protectors in Standard, Queen and King. Protect mattress investment with case pricing.',
    intro: [
      'A waterproof protector costs a fraction of the mattress it saves, which makes this the highest-return category most properties under-buy. We stock 100% waterproof mattress protectors and pillow protectors in Full XL, Queen and King, plus poly-fill pillows in Standard, Queen and King.',
      'Protectors use a breathable membrane, so they block spills and moisture without the crinkle that generates guest complaints. All are machine washable and rated for commercial laundry cycles.',
      'Replacing protectors across a whole property at once? Volume pricing at 30 cases makes a full-property refresh considerably cheaper than replacing piecemeal.',
    ],
  },
  {
    slug: 'trash-liners-can-liners',
    name: 'Trash Liners & Can Liners',
    h1: 'Wholesale Can Liners & Trash Bags in Bulk',
    title: 'Wholesale Can Liners & Trash Bags | Bulk Case Pricing',
    description: 'Commercial can liners and trash bags in bulk — low density, high density and recycled resin in 24×33, 38×58, 40×46 and 43×47. Case pricing for hotels and facilities.',
    intro: [
      'Can liners are bought on gauge and size, and the wrong choice on either shows up as torn bags and a housekeeping complaint. We carry low-density liners where puncture resistance matters, high-density for paper and light waste, and heavy-gauge recycled resin for municipal-grade duty.',
      'Standard commercial sizes cover guest room baskets through outdoor containers: 24×33, 38×58, 40×46 and 43×47, in coreless interleaved rolls that dispense cleanly off a housekeeping cart.',
      'Not sure which gauge fits your containers? Tell us the can size and what goes in it, and we will match the liner so you are not paying for thickness you do not need.',
    ],
  },
  {
    slug: 'gloves-ppe',
    name: 'Gloves & PPE',
    h1: 'Wholesale Nitrile Gloves & PPE',
    title: 'Wholesale Nitrile Gloves in Bulk | Powder-Free & Exam Grade',
    description: 'Bulk powder-free nitrile gloves in Small, Medium, Large and XL. Exam grade and standard, food-handling safe. Case pricing with fast NC delivery.',
    intro: [
      'Powder-free blue nitrile gloves in the sizes housekeeping and food service actually go through, sold by the case rather than the box. Suitable for cleaning, food handling and general facility use.',
      'Exam-grade options meet stringent medical standards with additional chemical and puncture resistance, for properties with healthcare-adjacent requirements or heavier chemical handling.',
      'Glove usage is predictable and constant, which makes it a natural fit for a standing reorder. Ask us about scheduling delivery so your team never opens the last case.',
    ],
  },
  {
    slug: 'guest-amenities',
    name: 'Guest Amenities',
    h1: 'Wholesale Hotel Amenities — Soap, Shampoo & Lotion',
    title: 'Wholesale Hotel Amenities | Bulk Soap, Shampoo & Lotion',
    description: 'Bulk hotel guest amenities — 15g soap bars, 30mL shampoo, conditioner, body wash and lotion. Individually wrapped, case pricing for hotels and motels.',
    intro: [
      'Guest amenities are the least expensive way to signal the quality of a room. We supply a coordinated single-stay set — 15 gram soap bars and 30 mL shampoo, conditioner, body wash and lotion — so every bathroom in the property presents consistently.',
      'Individually wrapped and sized for a single stay, which keeps housekeeping restocking simple and amenity cost per occupied room predictable.',
      'Buying the full set together is the cheapest way to standardize a property. Send us your room count and average occupancy and we will work out how many cases a quarter actually costs you.',
    ],
  },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Nav is lifted verbatim from catalog.html so these pages can never drift
// out of sync with the rest of the site's header.
function extractNav() {
  const catalog = fs.readFileSync(path.join(ROOT, 'catalog.html'), 'utf8');
  const start = catalog.indexOf('  <div class="top-bar">');
  const end = catalog.indexOf('</nav>', catalog.indexOf('class="mobile-nav"'));
  if (start === -1 || end === -1) throw new Error('Could not locate nav block in catalog.html');
  return catalog.slice(start, end + '</nav>'.length);
}

const NAV = extractNav();
const GTAG = `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-69R8R75Q3Y"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-69R8R75Q3Y');
  </script>`;

function buildPage(cat) {
  const url = `${BASE}/category/${cat.slug}`;
  const others = CATEGORIES.filter(c => c.slug !== cat.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: cat.h1,
    description: cat.description,
    url: url,
    isPartOf: { '@type': 'WebSite', name: 'Room Ready Supply', url: BASE + '/' },
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Catalog', item: BASE + '/catalog' },
      { '@type': 'ListItem', position: 3, name: cat.name, item: url },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${GTAG}

  <meta charset="UTF-8" />
  <link rel="icon" type="image/png" href="/Favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(cat.title)} | Room Ready Supply</title>
  <meta name="description" content="${esc(cat.description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Room Ready Supply" />
  <meta property="og:title" content="${esc(cat.title)}" />
  <meta property="og:description" content="${esc(cat.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${BASE}/assets/img/banner1.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(cat.title)}" />
  <meta name="twitter:description" content="${esc(cat.description)}" />
  <meta name="twitter:image" content="${BASE}/assets/img/banner1.jpg" />
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(breadcrumb, null, 2)}
  </script>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .cat-wrap { max-width:1180px; margin:0 auto; padding:0 24px; }
    .cat-head { background:#0B1F38; color:#fff; padding:46px 0 40px; }
    .cat-crumb { font-size:12.5px; color:#93b4d8; margin-bottom:12px; }
    .cat-crumb a { color:#93b4d8; text-decoration:none; }
    .cat-crumb a:hover { color:#fff; text-decoration:underline; }
    .cat-head h1 { font-size:clamp(24px,4vw,34px); font-weight:800; letter-spacing:-.02em; margin:0 0 10px; }
    .cat-count { font-size:13.5px; color:#ED7226; font-weight:700; }
    .cat-intro { padding:34px 0 8px; }
    .cat-intro p { font-size:15px; line-height:1.75; color:#334155; max-width:76ch; margin:0 0 16px; }
    .cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:18px; padding:22px 0 40px; }
    .cat-card { border:1.5px solid #e2e8f0; border-radius:14px; background:#fff; padding:16px; text-decoration:none; color:inherit; display:flex; flex-direction:column; transition:border-color .15s, box-shadow .15s, transform .15s; }
    .cat-card:hover { border-color:#ED7226; box-shadow:0 8px 24px rgba(11,31,56,.09); transform:translateY(-2px); }
    .cat-card img { width:100%; height:140px; object-fit:contain; margin-bottom:12px; }
    .cat-card h3 { font-size:13.5px; font-weight:700; color:#0B1F38; line-height:1.4; margin:0 0 8px; }
    .cat-card .meta { font-size:11.5px; color:#94a3b8; margin-bottom:10px; }
    .cat-card .price { font-size:17px; font-weight:800; color:#ED7226; margin-top:auto; }
    .cat-card .price span { font-size:11px; font-weight:600; color:#94a3b8; }
    .cat-cta { background:#f6f9fc; border:1.5px solid #e2e8f0; border-radius:16px; padding:26px 28px; margin:8px 0 44px; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
    .cat-cta h2 { font-size:18px; font-weight:800; color:#0B1F38; margin:0 0 6px; }
    .cat-cta p { font-size:14px; color:#5B6C7E; margin:0; }
    .cat-cta a { background:#ED7226; color:#fff; text-decoration:none; font-weight:800; font-size:14px; padding:13px 26px; border-radius:10px; white-space:nowrap; }
    .cat-cta a:hover { background:#d4611a; }
    .cat-others { border-top:1px solid #e8eef5; padding:30px 0 60px; }
    .cat-others h2 { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:#94a3b8; margin:0 0 16px; }
    .cat-others-list { display:flex; flex-wrap:wrap; gap:10px; }
    .cat-others-list a { border:1.5px solid #e2e8f0; border-radius:30px; padding:9px 18px; font-size:13.5px; font-weight:600; color:#0B1F38; text-decoration:none; }
    .cat-others-list a:hover { border-color:#ED7226; color:#ED7226; }
    .cat-loading { padding:40px 0; text-align:center; color:#94a3b8; font-size:14px; }
  </style>
</head>
<body>

${NAV}

  <header class="cat-head">
    <div class="cat-wrap">
      <nav class="cat-crumb" aria-label="Breadcrumb">
        <a href="/">Home</a> &rsaquo; <a href="/catalog">Catalog</a> &rsaquo; ${esc(cat.name)}
      </nav>
      <h1>${esc(cat.h1)}</h1>
      <div class="cat-count" id="catCount"></div>
    </div>
  </header>

  <main class="cat-wrap">
    <section class="cat-intro">
${cat.intro.map(p => `      <p>${esc(p)}</p>`).join('\n')}
    </section>

    <section class="cat-grid" id="catGrid">
      <div class="cat-loading">Loading products&hellip;</div>
    </section>

    <section class="cat-cta">
      <div>
        <h2>Need pricing for a whole property?</h2>
        <p>Send us your list and we will quote it at your case volume, usually the same day.</p>
      </div>
      <a href="/#business-pricing">Request Volume Pricing</a>
    </section>

    <section class="cat-others">
      <h2>Browse other categories</h2>
      <div class="cat-others-list">
${others.map(o => `        <a href="/category/${o.slug}">${esc(o.name)}</a>`).join('\n')}
        <a href="/catalog">View full catalog</a>
      </div>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="/supabase.js"></script>
  <script src="/script.js"></script>
  <script>
    // Products come from the same live catalog the rest of the site uses,
    // so this page reflects stock and pricing changes with no regeneration.
    (function () {
      var SLUG = ${JSON.stringify(cat.slug)};
      var grid = document.getElementById('catGrid');
      var countEl = document.getElementById('catCount');

      function money(v) {
        var n = typeof cleanPrice === 'function' ? cleanPrice(v) : parseFloat(v) || 0;
        return '$' + n.toFixed(2);
      }

      fetchCatalogProducts().then(function (products) {
        var items = products.filter(function (p) {
          return typeof categorySlug === 'function' && categorySlug(p.category) === SLUG;
        });

        if (!items.length) {
          grid.innerHTML = '<div class="cat-loading">No products in this category right now. <a href="/catalog">Browse the full catalog</a>.</div>';
          return;
        }

        countEl.textContent = items.length + (items.length === 1 ? ' product' : ' products') + ' available';

        grid.innerHTML = items.map(function (p) {
          var slug = p.slug || p.itemNumber;
          var price = p.price1 || p.price;
          return '<a class="cat-card" href="/product?item=' + encodeURIComponent(slug) + '">'
            + '<img src="' + (p.image || '/assets/img/product-placeholder.svg') + '" alt="' + (p.name || '').replace(/"/g, '&quot;') + '" loading="lazy" onerror="this.src=\\'/assets/img/product-placeholder.svg\\'">'
            + '<h3>' + (p.name || 'Product') + '</h3>'
            + (p.caseQty ? '<div class="meta">Case qty: ' + p.caseQty + '</div>' : '')
            + (price ? '<div class="price">' + money(price) + ' <span>/ ' + (p.priceBy || 'case') + '</span></div>' : '')
            + '</a>';
        }).join('');
      }).catch(function () {
        grid.innerHTML = '<div class="cat-loading">Could not load products. <a href="/catalog">Browse the full catalog</a>.</div>';
      });
    })();
  </script>

</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  CATEGORIES.forEach(cat => {
    const file = path.join(OUT_DIR, cat.slug + '.html');
    fs.writeFileSync(file, buildPage(cat));
    console.log('  wrote category/' + cat.slug + '.html');
  });
  console.log('\n' + CATEGORIES.length + ' category pages generated.');
}

main();

module.exports = { CATEGORIES };
