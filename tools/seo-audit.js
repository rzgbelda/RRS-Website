#!/usr/bin/env node
/**
 * Live SEO audit against the deployed site.
 *
 * Fetches each URL exactly as a crawler would -- raw HTML, no JavaScript
 * executed -- and checks what a search engine or social platform actually
 * receives on first request. This distinction matters here: product pages
 * inject their title/description/canonical client-side, so a browser-based
 * check would show them as fine while a crawler sees empty tags.
 *
 * Usage:  node tools/seo-audit.js [--products N] [--quiet]
 */

const BASE = 'https://www.roomreadysupply.com';

const LIMITS = { titleMin: 30, titleMax: 60, descMin: 70, descMax: 160 };

// Pages that should be indexed and fully tagged.
const PUBLIC_PAGES = [
  '/', '/catalog', '/privacy', '/terms', '/shipping-policy', '/login',
];

const CATEGORY_SLUGS = [
  'bed-sheets-linens', 'cleaning-chemicals', 'gloves-ppe', 'guest-amenities',
  'paper-products', 'pillows-mattress-protectors', 'towels', 'trash-liners-can-liners',
];

// Pages that must NOT be indexed -- private, transactional, or per-customer.
// Each needs either a robots.txt Disallow or a noindex meta tag.
const PRIVATE_PAGES = [
  '/account', '/cart', '/checkout', '/payment', '/wishlist',
  '/order-confirmation', '/quote-view', '/terms-agreement', '/reset-password',
];

/* ── tiny HTML helpers (attribute order independent) ──────────── */

function firstMatch(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : '';
}
// Length checks must run on what a searcher sees, not the source bytes.
// "&" is written &amp; in HTML -- 5 characters instead of 1 -- so measuring
// raw markup over-counts every ampersand by 4 and reports titles as
// truncated when they display fine.
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ');
}
function getTitle(html) {
  return decodeEntities(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
}
function getAttrOf(html, tagRe, attr) {
  const tag = firstMatch(html, tagRe);
  if (!tag) return '';
  const m = tag.match(new RegExp(attr + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
  return m ? m[1].trim() : '';
}
function getMeta(html, name) {
  return decodeEntities(getAttrOf(html, new RegExp('(<meta[^>]*name\\s*=\\s*["\']' + name + '["\'][^>]*>)', 'i'), 'content'));
}
function getProperty(html, prop) {
  return getAttrOf(html, new RegExp('(<meta[^>]*property\\s*=\\s*["\']' + prop + '["\'][^>]*>)', 'i'), 'content');
}
function getCanonical(html) {
  return getAttrOf(html, /(<link[^>]*rel\s*=\s*["']canonical["'][^>]*>)/i, 'href');
}
function countH1(html) {
  return (html.match(/<h1[\s>]/gi) || []).length;
}
function countJsonLd(html) {
  return (html.match(/application\/ld\+json/gi) || []).length;
}
function hasNoindex(html) {
  const robots = getMeta(html, 'robots').toLowerCase();
  return robots.includes('noindex');
}

/* ── fetching ─────────────────────────────────────────────────── */

async function fetchPage(path) {
  const url = BASE + path;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, url };
  } catch (err) {
    return { ok: false, status: 0, html: '', url, error: err.message };
  }
}

async function fetchRobots() {
  try {
    const res = await fetch(BASE + '/robots.txt');
    return await res.text();
  } catch {
    return '';
  }
}

/* ── checks ───────────────────────────────────────────────────── */

function auditPublic(path, page) {
  const issues = [];
  const err  = m => issues.push({ level: 'ERROR', msg: m });
  const warn = m => issues.push({ level: 'WARN',  msg: m });

  if (!page.ok) { err('Page did not load (HTTP ' + page.status + ')'); return issues; }

  const html = page.html;
  const title = getTitle(html);
  const desc  = getMeta(html, 'description');
  const canon = getCanonical(html);

  if (!title) err('Missing <title>');
  else if (/^Product \| /.test(title) || title.length < LIMITS.titleMin)
    warn('Title is generic or short (' + title.length + ' chars): "' + title + '"');
  else if (title.length > LIMITS.titleMax)
    warn('Title may be truncated in results (' + title.length + ' chars)');

  if (!desc) err('Missing meta description (empty in raw HTML)');
  else if (desc.length < LIMITS.descMin) warn('Description short (' + desc.length + ' chars)');
  else if (desc.length > LIMITS.descMax) warn('Description long (' + desc.length + ' chars)');

  if (!canon) err('Missing canonical URL');

  if (!getProperty(html, 'og:title'))       warn('Missing og:title (breaks link previews)');
  if (!getProperty(html, 'og:description')) warn('Missing og:description');
  if (!getProperty(html, 'og:image'))       warn('Missing og:image');

  const h1 = countH1(html);
  if (h1 === 0) warn('No <h1> heading');
  else if (h1 > 1) warn('Multiple <h1> headings (' + h1 + ')');

  if (hasNoindex(html)) err('Page is marked noindex but is meant to be public');

  return issues;
}

function auditPrivate(path, page, robotsTxt) {
  const issues = [];
  if (!page.ok && page.status !== 404) {
    return [{ level: 'WARN', msg: 'Page did not load (HTTP ' + page.status + ')' }];
  }
  const disallowed = robotsTxt
    .split(/\r?\n/)
    .filter(l => /^\s*Disallow:/i.test(l))
    .some(l => {
      const rule = l.split(':')[1].trim();
      return rule && path.startsWith(rule);
    });

  const noindex = hasNoindex(page.html);

  if (!disallowed && !noindex) {
    issues.push({
      level: 'ERROR',
      msg: 'Private page is crawlable: no robots.txt Disallow and no noindex meta tag',
    });
  }
  return issues;
}

/* ── main ─────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const nProducts = (() => {
    const i = args.indexOf('--products');
    return i >= 0 ? parseInt(args[i + 1], 10) || 5 : 5;
  })();

  console.log('SEO audit — ' + BASE);
  console.log('Fetching raw HTML (no JavaScript executed), as a crawler would.\n');

  const robotsTxt = await fetchRobots();
  const results = [];

  // Public pages
  for (const path of PUBLIC_PAGES) {
    const page = await fetchPage(path);
    results.push({ path, group: 'Public', issues: auditPublic(path, page) });
  }

  // Category landing pages
  for (const slug of CATEGORY_SLUGS) {
    const path = '/category/' + slug;
    const page = await fetchPage(path);
    results.push({ path, group: 'Category', issues: auditPublic(path, page) });
  }

  // Product pages (sampled from the live sitemap)
  let productPaths = [];
  try {
    const res = await fetch(BASE + '/sitemap-products.xml');
    const xml = await res.text();
    productPaths = [...xml.matchAll(/<loc>[^<]*?(\/product\?[^<]*)<\/loc>/g)]
      .map(m => m[1])
      .slice(0, nProducts);
  } catch { /* sitemap checked separately below */ }

  for (const path of productPaths) {
    const page = await fetchPage(path);
    results.push({ path, group: 'Product', issues: auditPublic(path, page) });
  }

  // Private pages
  for (const path of PRIVATE_PAGES) {
    const page = await fetchPage(path);
    results.push({ path, group: 'Private', issues: auditPrivate(path, page, robotsTxt) });
  }

  // Report
  let errors = 0, warns = 0, clean = 0;
  let lastGroup = '';

  for (const r of results) {
    if (r.group !== lastGroup) {
      console.log('\n' + '─'.repeat(64));
      console.log(r.group.toUpperCase() + ' PAGES');
      console.log('─'.repeat(64));
      lastGroup = r.group;
    }
    const e = r.issues.filter(i => i.level === 'ERROR').length;
    const w = r.issues.filter(i => i.level === 'WARN').length;
    errors += e; warns += w;
    if (!r.issues.length) { clean++; console.log('  OK    ' + r.path); continue; }
    console.log('  ' + (e ? 'ERROR' : 'WARN ') + ' ' + r.path);
    for (const i of r.issues) console.log('          [' + i.level + '] ' + i.msg);
  }

  console.log('\n' + '='.repeat(64));
  console.log('SUMMARY: ' + results.length + ' pages checked — ' +
    clean + ' clean, ' + errors + ' errors, ' + warns + ' warnings');
  console.log('='.repeat(64));

  process.exitCode = errors > 0 ? 1 : 0;
}

main();
