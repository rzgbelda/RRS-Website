const fs = require('fs');
const path = require('path');

/**
 * Serves /product?item=... with its SEO tags already filled in.
 *
 * product.html ships with empty title/description/canonical/og tags that
 * script.js populates in the browser. That works for people but not for
 * crawlers on first fetch: every one of the 120 product pages reported
 * the same "Product | Room Ready Supply" title and a blank description.
 * Google does execute JavaScript eventually, but social scrapers
 * (Facebook, LinkedIn, WhatsApp, Slack) never do -- so every shared
 * product link rendered as a blank card.
 *
 * This fills the same tags server-side before the HTML goes out. The
 * client-side code still runs and sets the identical values afterwards,
 * so it stays the safety net: if anything here fails, the page is served
 * unmodified and behaves exactly as it did before.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://giprkvlyouwfzjlaibkq.supabase.co';
// Public anon key -- already shipped in the client bundle, and RLS limits
// it to is_active=true rows. Nothing here needs elevated access.
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN';

const SELECT = 'sku,name,description,overview,image_url,pack_size,price,price_tier1,category_name';

/* ── the HTML shell ──────────────────────────────────────────── */

let _shell = null;
function loadShell() {
  if (_shell) return _shell;
  // The shell is product-template.html, NOT product.html, and the name
  // matters: Vercel only applies a rewrite when the path does not already
  // match a static file, and cleanUrls maps /product straight onto a
  // root-level product.html. While that file existed the rewrite below
  // never fired and every product page kept serving the blank-tag shell.
  // Renaming it frees /product for this function. Do not rename it back.
  //
  // Several candidates because the working directory of a serverless
  // function is not guaranteed across build layouts; vercel.json's
  // includeFiles is what actually ships the file.
  const candidates = [
    path.join(process.cwd(), 'product-template.html'),
    path.join(__dirname, '..', 'product-template.html'),
    path.join(__dirname, 'product-template.html'),
  ];
  for (const p of candidates) {
    try { _shell = fs.readFileSync(p, 'utf8'); return _shell; } catch { /* try next */ }
  }
  throw new Error('product.html not found in: ' + candidates.join(' | '));
}

/* ── helpers mirrored from script.js ─────────────────────────── */

// Must match mapDbProductToLegacyShape()'s slug derivation exactly, since
// that is what generate-sitemap.js published as the canonical URL.
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Mirrors buildSeoTitle() in script.js -- including the trim helpers below
// it. Kept character-for-character equivalent so the server-rendered
// title and the one the browser sets a moment later are identical -- a
// mismatch would flicker and give Google two different titles for the
// same URL.
const SEO_TITLE_BASE_BUDGET = 40;

function stripTitleSpecClause(name) {
  return name.replace(/\s[-–—]\s[A-Z][^,]*,.*$/, '').trim();
}

function stripTitleOrphanSymbol(s) {
  return s.replace(/^[%×x&\-–—]\s+/, '').trim();
}

function trimTitleKeepingEnds(name, maxLen) {
  if (name.length <= maxLen) return name;
  const words = name.split(' ').filter(Boolean);

  let endWords = [];
  let used = 0;
  for (let i = words.length - 1; i >= 0; i--) {
    const add = words[i].length + (endWords.length ? 1 : 0);
    if (used + add > maxLen) break;
    endWords.unshift(words[i]);
    used += add;
  }

  let startWords = [];
  const availableStart = words.length - endWords.length;
  for (let i = 0; i < availableStart; i++) {
    const add = words[i].length + (startWords.length || used ? 1 : 0);
    if (used + add > maxLen) break;
    startWords.push(words[i]);
    used += add;
  }

  const combined = [...startWords, ...endWords];
  const result = combined.length ? combined.join(' ') : name.slice(0, maxLen).trim();
  return stripTitleOrphanSymbol(result);
}

// Shared by buildSeoTitle() (the full name, used for og:title, JSON-LD
// Product.name, and everything except the <title> element -- none of
// which should ever be truncated, since that's crawler-facing product
// identity, not just a search-result snippet) and buildSeoTitleTag() (the
// <title> element specifically, which IS subject to Google's ~60-char
// display cut).
function computeTitleParts(p) {
  const desc = p.description || '';
  const sizeMatch = desc.match(/Size:\s*([^|]+)/);
  const sizeStr   = sizeMatch ? sizeMatch[1].trim() : (p.size || '');
  const cleanName = String(p.name || '').replace(/\s*[–—-]\s*Wholesale Pricing.*$/i, '').trim();
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameAlreadyHasSize = sizeStr && norm(cleanName).includes(norm(sizeStr));
  const prefix = (sizeStr && !nameAlreadyHasSize) ? `${sizeStr} ` : '';
  return { prefix, cleanName };
}

function buildSeoTitle(p) {
  const { prefix, cleanName } = computeTitleParts(p);
  return `Wholesale ${prefix}${cleanName}`;
}

function detectLeadingSizeToken(name) {
  const words = name.split(' ');
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const isNumericish = /\d/.test(w);
    const isDimSep = (w === '×' || w === 'x') && i > 0 && /\d/.test(words[i - 1] || '');
    if (isNumericish || isDimSep) { i++; continue; }
    break;
  }
  if (i === 0) return { reserved: '', rest: name };
  return { reserved: words.slice(0, i).join(' '), rest: words.slice(i).join(' ') };
}

function buildSeoTitleTag(p) {
  const { prefix, cleanName } = computeTitleParts(p);
  const lead = 'Wholesale ';

  let effectivePrefix = prefix;
  let effectiveName = cleanName;
  if (!effectivePrefix) {
    const { reserved, rest } = detectLeadingSizeToken(cleanName);
    if (reserved) { effectivePrefix = reserved + ' '; effectiveName = rest; }
  }

  const nameBudget = SEO_TITLE_BASE_BUDGET - lead.length - effectivePrefix.length;
  const trimmedName = trimTitleKeepingEnds(stripTitleSpecClause(effectiveName), nameBudget);
  return `${lead}${effectivePrefix}${trimmedName}`;
}

// Mirrors populateProductPage()'s metaDesc, including its quirk of
// testing overview's length even when description supplied the text.
function buildMetaDesc(p) {
  const base = (p.overview || p.description || '').replace(/\s+/g, ' ').trim().slice(0, 155);
  return base + ((p.overview || '').length > 155 ? '…' : '');
}

// Mirrors categorySlug() in script.js.
function categorySlug(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cleanPrice(price) {
  return Number(String(price || '').replace('$', '').replace(',', '').trim()) || 0;
}

/* ── HTML injection ──────────────────────────────────────────── */

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Every target tag in product.html carries its id before the attribute
// being filled, so this stays anchored on the id rather than tag order.
function setAttrById(html, id, attr, value) {
  const re = new RegExp('(<[^>]*\\bid="' + id + '"[^>]*\\b' + attr + '=")[^"]*(")', 'i');
  return html.replace(re, (m, before, after) => before + escAttr(value) + after);
}

// Every target tag in product.html carries its id on the <script>, so this
// stays anchored on the id rather than assuming any particular content.
function setScriptContentById(html, id, obj) {
  const re = new RegExp('(<script[^>]*\\bid="' + id + '"[^>]*>)[\\s\\S]*?(</script>)', 'i');
  return html.replace(re, (m, open, close) => open + JSON.stringify(obj) + close);
}

// Mirrors populateProductPage()'s Product JSON-LD block. Google's crawler
// does eventually run JavaScript, but that is a slower second-pass render,
// and rich-result eligibility (price, availability, review stars) is only
// picked up reliably from what is present on first fetch -- exactly the
// gap Day 6 closed for the plain meta tags. This closes it for structured
// data too, across all ~120 product pages.
function buildProductJsonLd(p, seoTitle, metaDesc, pageUrl) {
  const priceVal = cleanPrice(p.price || p.price_tier1);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: seoTitle,
    description: metaDesc,
    image: p.image_url || '',
    sku: p.sku || slugify(p.name),
    brand: { '@type': 'Brand', name: 'Room Ready Supply' },
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'USD',
      price: priceVal > 0 ? priceVal.toFixed(2) : null,
      priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'Room Ready Supply' },
    },
  };
}

function buildBreadcrumbJsonLd(p, pageUrl) {
  const SITE = 'https://www.roomreadysupply.com';
  const trail = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Catalog', item: SITE + '/catalog' },
  ];
  if (p.category_name) {
    trail.push({
      '@type': 'ListItem', position: 3, name: p.category_name,
      item: SITE + '/category/' + categorySlug(p.category_name),
    });
  }
  trail.push({ '@type': 'ListItem', position: trail.length + 1, name: p.name, item: pageUrl });
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail };
}

function injectMeta(html, p) {
  const seoTitle = buildSeoTitle(p);
  const titleTag = buildSeoTitleTag(p);
  const metaDesc = buildMetaDesc(p);
  const slug = slugify(p.sku || p.name);
  const pageUrl = 'https://www.roomreadysupply.com/product?item=' + encodeURIComponent(slug);
  const image = p.image_url || '';

  let out = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    '<title>' + escText(titleTag + ' | Room Ready Supply') + '</title>'
  );
  out = setAttrById(out, 'metaDescription', 'content', metaDesc);
  out = setAttrById(out, 'canonicalUrl',    'href',    pageUrl);
  out = setAttrById(out, 'ogTitle',         'content', seoTitle);
  out = setAttrById(out, 'ogDescription',   'content', metaDesc);
  out = setAttrById(out, 'ogImage',         'content', image);
  out = setAttrById(out, 'ogUrl',           'content', pageUrl);
  out = setScriptContentById(out, 'productJsonLd',   buildProductJsonLd(p, seoTitle, metaDesc, pageUrl));
  out = setScriptContentById(out, 'breadcrumbJsonLd', buildBreadcrumbJsonLd(p, pageUrl));
  return out;
}

/* ── product lookup ──────────────────────────────────────────── */

// Warm-lambda cache. Only name/description/overview/image are used here
// and none of them carry pricing, so a few minutes of staleness cannot
// show a customer a wrong price -- that was the reason /product is served
// no-cache in the first place.
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function sbGet(query) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/products?' + query, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

async function lookupProduct(item) {
  const cached = _cache.get(item);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.p;

  let product = null;

  // The catalog links products by slug, which is slugify(sku); for the
  // overwhelming majority that is just the lowercased SKU, so try the
  // indexed column first.
  const direct = await sbGet(
    'select=' + SELECT + '&is_active=eq.true&sku=ilike.' + encodeURIComponent(item) + '&limit=1'
  );
  if (direct.length) product = direct[0];

  // SKUs containing characters that slugify rewrites (spaces, dots) will
  // not match above, so fall back to comparing computed slugs.
  if (!product) {
    const all = await sbGet('select=' + SELECT + '&is_active=eq.true');
    product = all.find(r => slugify(r.sku || r.name) === item) || null;
  }

  _cache.set(item, { p: product, at: Date.now() });
  return product;
}

/* ── handler ─────────────────────────────────────────────────── */

module.exports = async (req, res) => {
  let shell;
  try {
    shell = loadShell();
  } catch (err) {
    // Nothing can be served without the shell. Loud, because it means the
    // includeFiles config is wrong and every product page is affected.
    console.error('[product-meta] FATAL, cannot read shell:', err.message);
    res.status(500).send('Product page temporarily unavailable.');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  try {
    const url = new URL(req.url, 'https://www.roomreadysupply.com');
    const item = (url.searchParams.get('item') || '').trim();
    if (!item) { res.status(200).send(shell); return; }

    const product = await lookupProduct(item);
    if (!product) { res.status(200).send(shell); return; }

    res.status(200).send(injectMeta(shell, product));
  } catch (err) {
    // Any failure here degrades to exactly the previous behaviour: the
    // unmodified shell, with the browser filling the tags in as before.
    console.error('[product-meta] falling back to plain shell:', err.message);
    res.status(200).send(shell);
  }
};

// Exported for tools/test-product-meta.js -- lets the tag-building logic
// be checked against real catalog rows without deploying.
module.exports.injectMeta          = injectMeta;
module.exports.buildSeoTitle       = buildSeoTitle;
module.exports.buildSeoTitleTag    = buildSeoTitleTag;
module.exports.buildMetaDesc       = buildMetaDesc;
module.exports.buildProductJsonLd  = buildProductJsonLd;
module.exports.buildBreadcrumbJsonLd = buildBreadcrumbJsonLd;
module.exports.slugify             = slugify;
module.exports.lookupProduct       = lookupProduct;
