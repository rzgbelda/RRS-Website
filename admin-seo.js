/* ══════════════════════════════════════════════════════════════
   SEO HEALTH DASHBOARD — admin panel
   Depends on: escHtml() from admin.js
   ══════════════════════════════════════════════════════════════ */

const SEO_PAGES = [
  { path: "/",                label: "Homepage",           dynamic: false },
  { path: "/catalog",         label: "Catalog",            dynamic: false },
  { path: "/product",         label: "Product (template)", dynamic: true  },
  { path: "/shipping-policy", label: "Shipping Policy",    dynamic: false },
  { path: "/terms",           label: "Terms of Service",   dynamic: false },
  { path: "/privacy",         label: "Privacy Policy",     dynamic: false },
];

const SEO_LIMITS = { titleMin: 30, titleMax: 60, descMin: 70, descMax: 160 };

/* ── Audit a single page ───────────────────────────────────── */
async function auditSeoPage(page) {
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });

  let html;
  try {
    const res = await fetch(page.path, { cache: "no-store" });
    if (!res.ok) {
      add("error", "Page returned HTTP " + res.status);
      return Object.assign({}, page, { issues, score: 0, title: "", desc: "" });
    }
    html = await res.text();
  } catch (err) {
    add("error", "Could not load page: " + err.message);
    return Object.assign({}, page, { issues, score: 0, title: "", desc: "" });
  }

  const doc  = new DOMParser().parseFromString(html, "text/html");
  const attr = (sel, a) => (doc.querySelector(sel)?.getAttribute(a) || "").trim();

  const title = (doc.querySelector("title")?.textContent || "").trim();
  const desc  = attr('meta[name="description"]', "content");
  const canon = attr('link[rel="canonical"]', "href");
  const ogT   = attr('meta[property="og:title"]', "content");
  const ogD   = attr('meta[property="og:description"]', "content");
  const ogI   = attr('meta[property="og:image"]', "content");
  const h1s   = doc.querySelectorAll("h1");
  const ld    = doc.querySelectorAll('script[type="application/ld+json"]');

  // Title — dynamic pages overwrite it at runtime, so only check the static value loosely
  if (!title) add("error", "Missing &lt;title&gt; tag");
  else if (page.dynamic) add("info", "Title is replaced with the product name at runtime");
  else if (title.length < SEO_LIMITS.titleMin)
    add("warn", "Title is short (" + title.length + " chars, aim for " + SEO_LIMITS.titleMin + "–" + SEO_LIMITS.titleMax + ")");
  else if (title.length > SEO_LIMITS.titleMax)
    add("warn", "Title is long (" + title.length + " chars, may be truncated in search results)");

  // Meta description
  if (!desc && page.dynamic) add("info", "Meta description is injected by JavaScript at runtime");
  else if (!desc) add("error", "Missing meta description");
  else if (desc.length < SEO_LIMITS.descMin)
    add("warn", "Description is short (" + desc.length + " chars, aim for " + SEO_LIMITS.descMin + "–" + SEO_LIMITS.descMax + ")");
  else if (desc.length > SEO_LIMITS.descMax)
    add("warn", "Description is long (" + desc.length + " chars, will be truncated)");

  // Canonical
  if (!canon && !page.dynamic) add("error", "Missing canonical URL");

  // Open Graph
  if (!ogT && !page.dynamic) add("warn", "Missing og:title (affects social sharing previews)");
  if (!ogD && !page.dynamic) add("warn", "Missing og:description");
  if (!ogI && !page.dynamic) add("warn", "Missing og:image (no thumbnail when shared)");

  // Headings
  if (h1s.length === 0) add("warn", "No &lt;h1&gt; heading found");
  else if (h1s.length > 1) add("warn", h1s.length + " &lt;h1&gt; tags found — use exactly one per page");

  // Structured data
  if (ld.length === 0 && !page.dynamic) add("info", "No structured data (JSON-LD) on this page");
  ld.forEach((el, i) => {
    if (!el.textContent.trim()) return; // dynamic pages fill this in at runtime
    try { JSON.parse(el.textContent); }
    catch (e) { add("error", "Structured data block #" + (i + 1) + " is invalid JSON"); }
  });

  // Image alt text — alt="" is valid for decorative images, only flag a missing attribute
  const imgs  = Array.from(doc.querySelectorAll("img"));
  const noAlt = imgs.filter(im => im.getAttribute("alt") === null).length;
  const deco  = imgs.filter(im => im.getAttribute("alt") === "").length;
  if (noAlt > 0) add("warn", noAlt + " of " + imgs.length + " images have no alt attribute");
  if (deco > 0)  add("info", deco + " image" + (deco === 1 ? " is" : "s are") + ' marked decorative (alt="")');

  const errors = issues.filter(i => i.level === "error").length;
  const warns  = issues.filter(i => i.level === "warn").length;
  const score  = Math.max(0, 100 - errors * 25 - warns * 8);

  return Object.assign({}, page, { issues, score, title, desc });
}

/* ── Run the full audit ────────────────────────────────────── */
async function runSeoAudit() {
  const host = document.getElementById("seoAuditBody");
  const btn  = document.getElementById("seoAuditBtn");
  if (!host) return;

  if (btn) { btn.disabled = true; btn.textContent = "Scanning…"; }
  host.innerHTML = '<tr><td colspan="4" class="a-empty">Scanning pages…</td></tr>';

  const results = await Promise.all(SEO_PAGES.map(auditSeoPage));
  window._seoResults = results;

  const totalErrors = results.reduce((s, r) => s + r.issues.filter(i => i.level === "error").length, 0);
  const totalWarns  = results.reduce((s, r) => s + r.issues.filter(i => i.level === "warn").length, 0);
  const avgScore    = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt("seoScoreAvg",   avgScore);
  setTxt("seoErrorCount", totalErrors);
  setTxt("seoWarnCount",  totalWarns);
  setTxt("seoPageCount",  results.length);

  host.innerHTML = results.map((r, idx) => {
    const errs = r.issues.filter(i => i.level === "error").length;
    const wrns = r.issues.filter(i => i.level === "warn").length;
    const status = errs ? { cls: "a-badge-danger",  txt: "Needs work" }
                 : wrns ? { cls: "a-badge-warning", txt: "Minor issues" }
                        : { cls: "a-badge-success", txt: "Healthy" };
    const color = r.score >= 90 ? "#16a34a" : r.score >= 70 ? "#f59e0b" : "#ef4444";

    const issueList = r.issues.length
      ? '<ul style="margin:10px 0 0;padding-left:18px;">' +
        r.issues.map(i => {
          const c    = i.level === "error" ? "#ef4444" : i.level === "warn" ? "#f59e0b" : "#64748b";
          const icon = i.level === "error" ? "&#10007;" : i.level === "warn" ? "&#9888;" : "&#8505;";
          return '<li style="color:' + c + ';font-size:12.5px;margin-bottom:5px;line-height:1.5;">' + icon + " " + i.msg + "</li>";
        }).join("") + "</ul>"
      : '<p style="color:#16a34a;font-size:12.5px;margin:10px 0 0;">&#10003; No issues found.</p>';

    return '' +
      '<tr style="cursor:pointer;" onclick="toggleSeoDetail(' + idx + ')">' +
        '<td><strong style="color:#0b2d52;">' + escHtml(r.label) + '</strong>' +
          '<div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">' + escHtml(r.path) + '</div></td>' +
        '<td><span style="font-weight:800;color:' + color + ';font-size:15px;">' + r.score + '</span></td>' +
        '<td><span class="a-badge ' + status.cls + '">' + status.txt + '</span></td>' +
        '<td style="text-align:right;color:#94a3b8;font-size:12px;">' +
          r.issues.length + " issue" + (r.issues.length === 1 ? "" : "s") + ' &#9662;</td>' +
      '</tr>' +
      '<tr id="seoDetail' + idx + '" style="display:none;">' +
        '<td colspan="4" style="background:#f8fafc;padding:16px 18px;">' +
          '<div style="font-size:12px;color:#64748b;margin-bottom:4px;"><strong>Title:</strong> ' + escHtml(r.title || "—") + '</div>' +
          '<div style="font-size:12px;color:#64748b;"><strong>Description:</strong> ' + escHtml(r.desc || "—") + '</div>' +
          issueList +
        '</td>' +
      '</tr>';
  }).join("");

  if (btn) { btn.disabled = false; btn.textContent = "Re-run Audit"; }
}

function toggleSeoDetail(idx) {
  const row = document.getElementById("seoDetail" + idx);
  if (row) row.style.display = row.style.display === "none" ? "table-row" : "none";
}

/* ── Sitemap + robots viewer ───────────────────────────────── */
async function loadSeoSitemap() {
  const host = document.getElementById("seoSitemapBody");
  if (!host) return;
  host.innerHTML = '<p style="color:#94a3b8;font-size:13px;">Loading sitemaps…</p>';

  const files = ["/sitemap.xml", "/sitemap-products.xml"];
  const parts = [];

  for (const f of files) {
    try {
      const res = await fetch(f, { cache: "no-store" });
      if (!res.ok) {
        parts.push('<p style="color:#ef4444;font-size:13px;">' + f + " — HTTP " + res.status + "</p>");
        continue;
      }
      const xml     = new DOMParser().parseFromString(await res.text(), "application/xml");
      const locs    = xml.querySelectorAll("url > loc");
      const mods    = xml.querySelectorAll("url > lastmod");
      const lastmod = mods.length ? mods[0].textContent : "not set";
      parts.push('' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f1f5f9;">' +
          '<div><a href="' + f + '" target="_blank" style="color:#0b2d52;font-weight:700;font-size:13.5px;text-decoration:none;">' + f + '</a>' +
          '<div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">Last modified: ' + escHtml(lastmod) + '</div></div>' +
          '<strong style="color:#0b2d52;font-size:15px;">' + locs.length +
          ' <span style="font-weight:500;font-size:11.5px;color:#94a3b8;">URLs</span></strong>' +
        '</div>');
    } catch (err) {
      parts.push('<p style="color:#ef4444;font-size:13px;">' + f + " — " + escHtml(err.message) + "</p>");
    }
  }

  try {
    const r = await fetch("/robots.txt", { cache: "no-store" });
    parts.push('' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;">' +
        '<a href="/robots.txt" target="_blank" style="color:#0b2d52;font-weight:700;font-size:13.5px;text-decoration:none;">/robots.txt</a>' +
        '<span class="a-badge ' + (r.ok ? "a-badge-success" : "a-badge-danger") + '">' + (r.ok ? "Present" : "Missing") + '</span>' +
      '</div>');
  } catch (e) { /* ignore */ }

  host.innerHTML = parts.join("");
}

/* ── Google PageSpeed Insights ─────────────────────────────── */
async function runPageSpeed(target) {
  const host = document.getElementById("seoPagespeedBody");
  const btn  = document.getElementById("seoPsBtn");
  if (!host) return;

  if (btn) { btn.disabled = true; btn.textContent = "Analyzing…"; }
  host.innerHTML = '<p style="color:#94a3b8;font-size:13px;padding:8px 0;">Running Google PageSpeed Insights — this takes 20–40 seconds…</p>';

  const url = "https://www.roomreadysupply.com" + (target || "/");
  const key = (localStorage.getItem("rrs_pagespeed_key") || "").trim();
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
              "?url=" + encodeURIComponent(url) + "&strategy=mobile" +
              "&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES" +
              (key ? "&key=" + encodeURIComponent(key) : "");

  try {
    const res  = await fetch(api);

    if (res.status === 429) {
      throw new Error("RATE_LIMIT");
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "PageSpeed API error");

    const cats = (data.lighthouseResult && data.lighthouseResult.categories) || {};
    const card = (key, label) => {
      const c = cats[key];
      if (!c) return "";
      const pct = Math.round((c.score || 0) * 100);
      const col = pct >= 90 ? "#16a34a" : pct >= 50 ? "#f59e0b" : "#ef4444";
      return '<div style="flex:1;min-width:110px;text-align:center;padding:16px 10px;background:#f8fafc;border-radius:10px;border:1.5px solid #e2e8f0;">' +
        '<div style="font-size:26px;font-weight:800;color:' + col + ';line-height:1;">' + pct + '</div>' +
        '<div style="font-size:11px;color:#64748b;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">' + label + '</div>' +
      '</div>';
    };

    host.innerHTML =
      '<p style="font-size:12px;color:#94a3b8;margin:0 0 14px;">Mobile results for <strong>' + escHtml(url) + '</strong></p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        card("performance", "Performance") +
        card("seo", "SEO") +
        card("accessibility", "Accessibility") +
        card("best-practices", "Best Practices") +
      '</div>' +
      '<p style="font-size:11.5px;color:#94a3b8;margin:14px 0 0;">Scores from Google Lighthouse. 90+ is good, 50–89 needs improvement, under 50 is poor.</p>';
  } catch (err) {
    const rateLimited = err.message === "RATE_LIMIT";
    host.innerHTML =
      '<div style="padding:14px 16px;background:' + (rateLimited ? "#fffbeb" : "#fef2f2") +
        ';border:1.5px solid ' + (rateLimited ? "#fde68a" : "#fecaca") + ';border-radius:10px;">' +
        '<p style="color:' + (rateLimited ? "#b45309" : "#b91c1c") + ';font-size:13px;margin:0 0 6px;font-weight:600;">' +
          (rateLimited ? "Google rate limit reached" : "Could not run PageSpeed") + '</p>' +
        '<p style="color:' + (rateLimited ? "#78350f" : "#7f1d1d") + ';font-size:12px;margin:0;line-height:1.6;">' +
          (rateLimited
            ? "Google limits the free PageSpeed API to a few requests per minute. Wait a minute and try again, or add a free API key below to raise the limit."
            : escHtml(err.message) + "<br>The site must be publicly reachable for Google to scan it.") +
        '</p>' +
      '</div>' + seoApiKeyFieldHtml();
  }

  if (btn) { btn.disabled = false; btn.textContent = "Run PageSpeed Test"; }
}

/* ── Optional PageSpeed API key (raises Google's rate limit) ── */
function seoApiKeyFieldHtml() {
  const saved = (localStorage.getItem("rrs_pagespeed_key") || "").trim();
  return '' +
    '<div style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0;">' +
      '<label style="display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">' +
        'PageSpeed API Key (optional)</label>' +
      '<div style="display:flex;gap:8px;">' +
        '<input id="seoApiKeyInput" type="text" placeholder="Paste a Google API key to avoid rate limits" ' +
          'value="' + escHtml(saved) + '" ' +
          'style="flex:1;padding:9px 11px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12.5px;">' +
        '<button class="a-btn-sm" onclick="saveSeoApiKey()">Save</button>' +
      '</div>' +
      '<p style="font-size:11px;color:#94a3b8;margin:6px 0 0;">' +
        'Free from Google Cloud Console &rarr; enable &ldquo;PageSpeed Insights API&rdquo; &rarr; create an API key. Stored in this browser only.</p>' +
    '</div>';
}

function saveSeoApiKey() {
  const el = document.getElementById("seoApiKeyInput");
  if (!el) return;
  const val = el.value.trim();
  if (val) localStorage.setItem("rrs_pagespeed_key", val);
  else     localStorage.removeItem("rrs_pagespeed_key");
  if (typeof showToast === "function") showToast(val ? "API key saved." : "API key cleared.");
}

/* ── Render the SEO tab ────────────────────────────────────── */
function renderSeoTab() {
  const panel = document.getElementById("tab-seo");
  if (!panel) return;

  panel.innerHTML =
    '<div class="a-page-header" style="margin-bottom:24px;">' +
      '<div>' +
        '<h1 class="a-page-title">SEO Health</h1>' +
        '<p class="a-page-sub">Live check of titles, descriptions, social tags, and structured data across the site.</p>' +
      '</div>' +
      '<button id="seoAuditBtn" class="a-btn a-btn-primary" onclick="runSeoAudit()">Run Audit</button>' +
    '</div>' +

    '<div class="a-stats-grid" style="margin-bottom:28px;">' +
      '<div class="a-stat-card"><div><p class="a-stat-label">Average Score</p><p class="a-stat-value" id="seoScoreAvg">—</p></div></div>' +
      '<div class="a-stat-card"><div><p class="a-stat-label">Pages Checked</p><p class="a-stat-value" id="seoPageCount">—</p></div></div>' +
      '<div class="a-stat-card"><div><p class="a-stat-label">Errors</p><p class="a-stat-value" id="seoErrorCount" style="color:#ef4444;">—</p></div></div>' +
      '<div class="a-stat-card"><div><p class="a-stat-label">Warnings</p><p class="a-stat-value" id="seoWarnCount" style="color:#f59e0b;">—</p></div></div>' +
    '</div>' +

    '<div class="a-card" style="margin-bottom:24px;">' +
      '<div class="a-card-header"><h3>Page Audit</h3></div>' +
      '<table class="a-table">' +
        '<thead><tr><th>Page</th><th>Score</th><th>Status</th><th style="text-align:right;">Issues</th></tr></thead>' +
        '<tbody id="seoAuditBody"><tr><td colspan="4" class="a-empty">Scanning…</td></tr></tbody>' +
      '</table>' +
    '</div>' +

    '<div class="a-reports-grid">' +
      '<div class="a-card">' +
        '<div class="a-card-header"><h3>Sitemaps &amp; Robots</h3></div>' +
        '<div style="padding:6px 18px 16px;" id="seoSitemapBody"><p style="color:#94a3b8;font-size:13px;">Loading…</p></div>' +
      '</div>' +
      '<div class="a-card">' +
        '<div class="a-card-header"><h3>Google PageSpeed</h3>' +
          '<button id="seoPsBtn" class="a-btn-sm" onclick="runPageSpeed(\'/\')">Run PageSpeed Test</button>' +
        '</div>' +
        '<div style="padding:16px 18px;" id="seoPagespeedBody">' +
          '<p style="color:#94a3b8;font-size:13px;margin:0;">Runs Google Lighthouse against the live homepage. Takes 20–40 seconds.</p>' +
          seoApiKeyFieldHtml() +
        '</div>' +
      '</div>' +
    '</div>';

  runSeoAudit();
  loadSeoSitemap();
}
