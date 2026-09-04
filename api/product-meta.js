const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

const SELECT = 'sku,name,description,overview,image_url,pack_size,price,price_tier1,category_name,meta_title,meta_description';

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

// SEO Roadmap Day 17 (blog): same server-render-before-crawler-fetch
// treatment as products, added to this file rather than a new one --
// Vercel Hobby's 12-function cap is already exhausted (confirmed at time
// of writing). /blog/post routes here (vercel.json), distinguished from
// the product path by a `slug` query param instead of `item`.
let _articleShell = null;
function loadArticleShell() {
  if (_articleShell) return _articleShell;
  const candidates = [
    path.join(process.cwd(), 'article-template.html'),
    path.join(__dirname, '..', 'article-template.html'),
    path.join(__dirname, 'article-template.html'),
  ];
  for (const p of candidates) {
    try { _articleShell = fs.readFileSync(p, 'utf8'); return _articleShell; } catch { /* try next */ }
  }
  throw new Error('article-template.html not found in: ' + candidates.join(' | '));
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
  // Dimensions get written two ways across the catalog -- a size field of
  // `27" × 54"` versus a name containing `27x54` -- so the separator has to
  // normalize away too, not just punctuation. Stripping only non-alphanumerics
  // left `2754` vs `27x54...`, which never matched, and the size was then
  // prepended to a name that already carried it ("27\" × 54\" 27x54 Bath
  // Towels"). Collapse the x/× separator only when it actually sits between
  // two digits, so product words keep their letters (Luxury stays Luxury).
  const norm = s => s.toLowerCase()
    .replace(/(\d)\s*[×x]\s*(\d)/g, '$1$2')
    .replace(/[^a-z0-9]/g, '');
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

// A hard slice(0, 155) cut mid-word on effectively every product
// ("...SFI® Certif…"), and the ellipsis was decided by overview's length
// even when description had supplied the text -- so some descriptions were
// truncated with no ellipsis and others got one without being cut. Trim to
// the last whole word instead, and base the ellipsis on the text actually
// used. Kept under 160 so Google doesn't truncate it a second time.
const META_DESC_MAX = 155;
function truncateAtWord(s, max) {
  if (s.length <= max) return { text: s, truncated: false };
  const cut = s.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const text = (lastSpace > 0 ? cut.slice(0, lastSpace) : s.slice(0, max))
    .replace(/[\s,;:.\-–—]+$/, '');
  return { text, truncated: true };
}

function buildMetaDesc(p) {
  const source = (p.overview || p.description || '').replace(/\s+/g, ' ').trim();
  const { text, truncated } = truncateAtWord(source, META_DESC_MAX);
  return text + (truncated ? '…' : '');
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

// Fills an element's visible text, anchored on its id the same way the
// helpers above are. Used for the <h1>, which otherwise ships to crawlers
// as the literal placeholder "Product Name" -- the real name only arrived
// once client-side JS ran, wasting the strongest on-page signal on the
// first-pass render (and on any crawler that never runs JS at all).
function setTextById(html, id, value) {
  const re = new RegExp('(<([a-z0-9]+)[^>]*\\bid="' + id + '"[^>]*>)[\\s\\S]*?(</\\2>)', 'i');
  return html.replace(re, (m, open, _tag, close) => open + escText(value) + close);
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
  // Admin's SEO Title override, when set, IS the full <title>/og:title --
  // no " | Room Ready Supply" auto-suffix, since a manually-written title
  // may already include the brand (or deliberately not). The auto-generated
  // path keeps appending it as before. JSON-LD's Product.name deliberately
  // still uses the real, untruncated seoTitle either way -- that is
  // structured data describing the actual product, not search-snippet
  // copy, so a marketing-crafted override shouldn't make a product's own
  // rich-result entry disagree with what it actually is.
  const titleTag = (p.meta_title || '').trim() || (buildSeoTitleTag(p) + ' | Room Ready Supply');
  const metaDesc = (p.meta_description || '').trim() || buildMetaDesc(p);
  const slug = slugify(p.sku || p.name);
  const pageUrl = 'https://www.roomreadysupply.com/product?item=' + encodeURIComponent(slug);
  const image = p.image_url || '';

  let out = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    '<title>' + escText(titleTag) + '</title>'
  );
  out = setAttrById(out, 'metaDescription', 'content', metaDesc);
  out = setAttrById(out, 'canonicalUrl',    'href',    pageUrl);
  out = setAttrById(out, 'ogTitle',         'content', p.meta_title ? titleTag : seoTitle);
  out = setAttrById(out, 'ogDescription',   'content', metaDesc);
  out = setAttrById(out, 'ogImage',         'content', image);
  out = setAttrById(out, 'ogUrl',           'content', pageUrl);
  // Must match what populateProductPage() writes client-side -- it uses
  // seoTitle (script.js: setText("productName", seoTitle)), so using the
  // bare name here would make the heading visibly change once JS ran.
  out = setTextById(out, 'productName', seoTitle);
  out = setScriptContentById(out, 'productJsonLd',   buildProductJsonLd(p, seoTitle, buildMetaDesc(p), pageUrl));
  out = setScriptContentById(out, 'breadcrumbJsonLd', buildBreadcrumbJsonLd(p, pageUrl));
  return out;
}

/* ── article (blog) meta injection ───────────────────────────── */

function stripHtmlToText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildArticleMetaDesc(a) {
  const source = a.excerpt || stripHtmlToText(a.body_html);
  const { text, truncated } = truncateAtWord(source, META_DESC_MAX);
  return text + (truncated ? '…' : '');
}

function buildArticleJsonLd(a, title, metaDesc, pageUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: metaDesc,
    image: a.cover_image_url || undefined,
    datePublished: a.published_at || a.created_at,
    dateModified: a.updated_at || a.published_at || a.created_at,
    author: { '@type': 'Organization', name: 'Room Ready Supply' },
    publisher: {
      '@type': 'Organization', name: 'Room Ready Supply',
      logo: { '@type': 'ImageObject', url: 'https://www.roomreadysupply.com/assets/img/RR%20logo.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };
}

function buildArticleBreadcrumbJsonLd(a, pageUrl) {
  const SITE = 'https://www.roomreadysupply.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog' },
      { '@type': 'ListItem', position: 3, name: a.title, item: pageUrl },
    ],
  };
}

function injectArticleMeta(html, a) {
  const titleTag = (a.meta_title || '').trim() || (a.title + ' | Room Ready Supply');
  const metaDesc = (a.meta_description || '').trim() || buildArticleMetaDesc(a);
  const pageUrl = 'https://www.roomreadysupply.com/blog/post?slug=' + encodeURIComponent(a.slug);
  const image = a.cover_image_url || '';

  let out = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    '<title>' + escText(titleTag) + '</title>'
  );
  out = setAttrById(out, 'metaDescription', 'content', metaDesc);
  out = setAttrById(out, 'canonicalUrl',    'href',    pageUrl);
  out = setAttrById(out, 'ogTitle',         'content', a.meta_title ? titleTag : a.title);
  out = setAttrById(out, 'ogDescription',   'content', metaDesc);
  out = setAttrById(out, 'ogImage',         'content', image);
  out = setAttrById(out, 'ogUrl',           'content', pageUrl);
  // Same placeholder problem as the product <h1>: this shipped as the
  // literal word "Article" until client-side JS replaced it. article.js
  // sets textContent to article.title, so use exactly that.
  out = setTextById(out, 'articleTitle', a.title || '');
  out = setScriptContentById(out, 'articleJsonLd',    buildArticleJsonLd(a, titleTag, metaDesc, pageUrl));
  out = setScriptContentById(out, 'breadcrumbJsonLd', buildArticleBreadcrumbJsonLd(a, pageUrl));
  return out;
}

const SUPABASE_ANON_KEY_FOR_ARTICLES = SUPABASE_ANON_KEY; // same public key; RLS limits reads to status='published'
const _articleCache = new Map();

async function lookupArticle(slug) {
  const cached = _articleCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.a;

  const res = await fetch(
    SUPABASE_URL + '/rest/v1/articles?select=slug,title,excerpt,body_html,cover_image_url,meta_title,meta_description,published_at,updated_at,created_at&status=eq.published&slug=eq.' + encodeURIComponent(slug) + '&limit=1',
    { headers: { apikey: SUPABASE_ANON_KEY_FOR_ARTICLES, Authorization: 'Bearer ' + SUPABASE_ANON_KEY_FOR_ARTICLES } }
  );
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const rows = await res.json();
  const article = rows[0] || null;

  _articleCache.set(slug, { a: article, at: Date.now() });
  return article;
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

/* ── unsubscribe ─────────────────────────────────────────────────
 * Gmail/Yahoo's Feb 2024 bulk-sender rules require a one-click
 * List-Unsubscribe link on marketing mail, and the click target needs
 * to work with no login (the recipient is often not a site account at
 * all -- just a quote_requests row). Dispatched from this file rather
 * than a new one for the same Vercel Hobby 12-function-cap reason as
 * every other multi-route file in api/ -- this is already the file
 * handling public, unauthenticated GET requests by query-param.
 *
 * The token is an HMAC of the email, keyed by the service-role key
 * (already a server-only secret, no new env var needed), so a link
 * can't be forged to unsubscribe an address that never received one.
 */
function unsubscribeToken(email) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return crypto.createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

function buildUnsubscribeUrl(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return 'https://www.roomreadysupply.com/unsubscribe';
  const token = unsubscribeToken(e);
  return 'https://www.roomreadysupply.com/unsubscribe?email=' + encodeURIComponent(e) + '&token=' + token;
}

function unsubscribePage(message) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Unsubscribe | Room Ready Supply</title>' +
    '<meta name="robots" content="noindex">' +
    '<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:80px auto;padding:0 24px;color:#0B1F38;text-align:center;}' +
    'h1{font-size:22px;margin-bottom:12px;}p{color:#5B6C7E;line-height:1.6;}a{color:#ED7226;}</style></head>' +
    '<body><h1>Room Ready Supply</h1><p>' + message + '</p><p><a href="/">Return to the site</a></p></body></html>';
}

async function handleUnsubscribe(req, res, url) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  const token = (url.searchParams.get('token') || '').trim();

  if (!email || !token) {
    res.status(400).send(unsubscribePage('This unsubscribe link is missing information and could not be processed.'));
    return;
  }

  let expected;
  try { expected = unsubscribeToken(email); } catch { expected = null; }
  const tokenBuf = Buffer.from(token, 'hex');
  const expectedBuf = Buffer.from(expected || '', 'hex');
  const valid = expected && tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf);
  if (!valid) {
    res.status(403).send(unsubscribePage('This unsubscribe link is invalid or has expired.'));
    return;
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('quote_requests')
      .update({ consent_marketing: false, consent_recorded_at: new Date().toISOString() })
      .ilike('email', email);
  } catch (err) {
    console.error('[product-meta] unsubscribe update failed:', err.message);
    res.status(500).send(unsubscribePage('Something went wrong processing your request. Please email sales@roomreadysupply.com and we will remove you manually.'));
    return;
  }

  res.status(200).send(unsubscribePage(
    'You (' + email.replace(/[<>&"]/g, '') + ') have been unsubscribed from Room Ready Supply marketing emails. ' +
    'You may still receive transactional emails about orders you place.'
  ));
}

/* ── handler ─────────────────────────────────────────────────── */

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://www.roomreadysupply.com');

  if (url.pathname === '/unsubscribe') {
    await handleUnsubscribe(req, res, url);
    return;
  }

  const isArticleRoute = url.pathname === '/blog/post' || url.searchParams.has('slug');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (isArticleRoute) {
    let articleShell;
    try {
      articleShell = loadArticleShell();
    } catch (err) {
      console.error('[product-meta] FATAL, cannot read article shell:', err.message);
      res.status(500).send('Article temporarily unavailable.');
      return;
    }
    try {
      const slug = (url.searchParams.get('slug') || '').trim();
      if (!slug) { res.status(200).send(articleShell); return; }

      const article = await lookupArticle(slug);
      if (!article) { res.status(200).send(articleShell); return; }

      res.status(200).send(injectArticleMeta(articleShell, article));
    } catch (err) {
      console.error('[product-meta] falling back to plain article shell:', err.message);
      res.status(200).send(articleShell);
    }
    return;
  }

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

  try {
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
module.exports.injectArticleMeta   = injectArticleMeta;
module.exports.buildArticleJsonLd  = buildArticleJsonLd;
module.exports.buildArticleMetaDesc = buildArticleMetaDesc;
module.exports.lookupArticle       = lookupArticle;
module.exports.buildUnsubscribeUrl = buildUnsubscribeUrl;
