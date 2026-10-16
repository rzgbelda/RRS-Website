/* ============================================================
   Room Ready Supply — Economy & Premium collection pages
   ------------------------------------------------------------
   One script for /economy and /premium. The page says which tier it is
   with <main class="tp" data-tier="economy|premium">; everything else
   (which SKUs belong, hero slides, estimator picks) lives in TIERS below.

   Products are read from the live catalog (fetchCatalogProducts), so
   prices, stock and volume tiers always match the admin and the cart.
   A SKU listed here that isn't live yet (e.g. comforters awaiting
   import) is simply skipped until it is.

   Depends on script.js globals: fetchCatalogProducts, getTierPrice,
   productMoq, tierMinQty, tierMinAttrs, moqUnitWord, cleanPrice, escAttr,
   cardImageUrl, setupAddToCartButtons, getCart, saveCart,
   updateCartBadge, showVpToast, trackEcommerce, gaItem.
   ============================================================ */
(function () {
  "use strict";

  const main = document.querySelector("main.tp");
  if (!main) return;
  const TIER = main.dataset.tier;

  /* ── Tier data ─────────────────────────────────────────────── */

  const TIERS = {
    economy: {
      name: "Economy",
      tileImg: { bedding: "economy/74009WH402", kitchen: "economy/25129WH400", comforter: "economy/1C54210" },
      helpImg: "economy/21071BG091",
      skus: [
        "11012WH400", "11023WH400", "11054WH400", "11079WH400", "11092WH400", "11130WH400",
        "74007WH402", "74014WH402", "74009WH402", "74015WH402", "74011WH402", "74016WH402", "74000WH402", "74002WH402",
        "74023WH402", "74034WH402", "74025WH402", "74035WH402", "74027WH402", "74036WH402", "74019WH402", "74020WH402",
        "38117WH121", "25129WH400", "38110ZA400", "21068YH091", "21068YB091", "21506YH400", "21067YW091",
        "21071HR091", "21071BG091", "24259WH121",
        "1C05554", "1C05552", "1C05551", "1C05553", "1C54211", "1C54210", "1C54208", "1C54209",
        "1C51859", "1C51858", "1C51856", "1C51857",
      ],
      slides: [
        { sku: "74009WH402", img: "economy/74009WH402", bg: "#F3C7A0", kicker: "Bedding · T180",
          title: "Queen T180 Flat Sheets", line: "Crisp, hotel-white percale that turns rooms fast and keeps cost per bed low." },
        { sku: "1C54210", img: "economy/1C54210", bg: "#E9D2B6", kicker: "Comforters · Martex",
          title: "Martex Ultra Touch Comforter", line: "Brushed microfiber over EcoPure fill. Soft enough for guests, priced for every bed." },
        { sku: "25129WH400", img: "economy/25129WH400", bg: "#F2A96B", kicker: "Kitchen · Bar mops",
          title: "Heavyweight Cotton Bar Mops", line: "30 oz, 100% cotton. Built for spills, sanitizer and the industrial wash." },
        { sku: "21071BG091", img: "economy/21071BG091", bg: "#EBC59A", kicker: "Kitchen · Pot holders",
          title: "Classic Cotton Pot Holders", line: "100% cotton in classic kitchen colors. Stock every unit and every line." },
        { sku: "74007WH402", img: "economy/74007WH402", bg: "#F6D7B8", kicker: "Bedding · Full XL",
          title: "Full XL T180 Flat Sheets", line: "Generous 81 × 108 in. coverage for full beds, sold by the dozen." },
      ],
      estimator: {
        grades: {
          T180: { label: "T180", sizes: {
            Full:  { flat: "74007WH402", fitted: "74014WH402", pc: "74000WH402" },
            Queen: { flat: "74009WH402", fitted: "74015WH402", pc: "74000WH402" },
            King:  { flat: "74011WH402", fitted: "74016WH402", pc: "74002WH402" } } },
          T200: { label: "T200", sizes: {
            Full:  { flat: "74023WH402", fitted: "74034WH402", pc: "74019WH402" },
            Queen: { flat: "74025WH402", fitted: "74035WH402", pc: "74019WH402" },
            King:  { flat: "74027WH402", fitted: "74036WH402", pc: "74020WH402" } } },
        },
        towels: {
          economy: { label: "Economy cotton", bath: "11079WH400", hand: "11023WH400", wash: "11012WH400", mat: "11130WH400" },
        },
      },
    },

    premium: {
      name: "Premium",
      tileImg: { bedding: "premium/71168WH287", bath: "premium/18205WH098" },
      helpImg: "premium/7136631",
      skus: [
        "19304WH098", "19303WH098", "19302WH098", "19301WH098", "19300WH098", "19305WH098",
        "18207WH098", "18206WH098", "18205WH098", "18209WH098", "18208WH098",
        "18305WH099", "18304WH099", "18303WH099", "18301WH099", "18300WH099", "18306WH099",
        "74102WH402", "74103WH402", "74104WH402", "74105WH402", "74106WH402", "74107WH402", "74108WH402", "74109WH402",
        "7136054", "7136631", "7136051", "7136052",
        "37207WH287", "37202WH287", "80230WH287", "80222WH287", "37203WH287", "37204WH287",
        "70010WH287", "73047WH287", "71168WH287", "71167WH287",
        "22168XX400", "20382xx091",
        "1C51545", "1C51543", "1C51544", "1C51553", "1C51551", "1C51552",
      ],
      slides: [
        { sku: "18205WH098", img: "premium/18205WH098", bg: "#0E2442", kicker: "Bath · Grand Luxury",
          title: "Grand Luxury Ring-Spun Bath Towels", line: "Generous 27 × 50 in. ring-spun cotton that feels like the hotel guests remember." },
        { sku: "71168WH287", img: "premium/71168WH287", bg: "#2A3550", kicker: "Bedding · T250",
          title: "T250 Stripe Duvet Cover", line: "A 1 cm hotel stripe in 60/40 cotton blend. The finishing touch of a five-star bed." },
        { sku: "7136631", img: "premium/7136631", bg: "#1D2B3F", kicker: "Bath · Simplicity",
          title: "Simplicity Luxury Bath Towels", line: "100% ring-spun cotton, 27 × 54 in. Plush in the hand, honest on price." },
        { sku: "74108WH402", img: "premium/74108WH402", bg: "#33302E", kicker: "Bedding · T250",
          title: "T250 Standard Pillowcases", line: "250-thread-count cotton blend with a smooth, cool hand guests notice." },
        { sku: "19302WH098", img: "premium/19302WH098", bg: "#16324F", kicker: "Bath · Premium",
          title: "Premium Cotton Blend Bath Towels", line: "Soft, quick-drying and tough enough for daily commercial laundering." },
      ],
      estimator: {
        grades: {
          T250: { label: "T250", sizes: {
            Full:  { flat: "74102WH402", fitted: "74103WH402", pc: "74108WH402" },
            Queen: { flat: "74104WH402", fitted: "74105WH402", pc: "74108WH402" },
            King:  { flat: "74106WH402", fitted: "74107WH402", pc: "74109WH402" } } },
          T300: { label: "T300 Millennium", sizes: {
            Queen: { flat: "80230WH287", fitted: "80222WH287", pc: "37203WH287" },
            King:  { flat: "37207WH287", fitted: "37202WH287", pc: "37204WH287" } } },
        },
        towels: {
          premium: { label: "Premium cotton blend", bath: "19301WH098", hand: "19303WH098", wash: "19304WH098", mat: "19305WH098" },
          grand:   { label: "Grand Luxury ring-spun", bath: "18205WH098", hand: "18206WH098", wash: "18207WH098", mat: "18208WH098" },
          optima:  { label: "Optima long-staple", bath: "18301WH099", hand: "18303WH099", wash: "18305WH099", mat: "18306WH099" },
        },
      },
    },
  };
  const T = TIERS[TIER];
  if (!T) return;
  const OTHER = TIER === "economy" ? TIERS.premium : TIERS.economy;

  // Shop departments, decided from the product name.
  const CATS = [
    { id: "bedding",   label: "Sheets & Bedding",     test: n => /sheet|pillowcase|duvet/i.test(n),
      blurb: "Flat and fitted sheets, pillowcases and duvet covers." },
    { id: "bath",      label: "Towels & Bath",        test: n => /washcloth|hand towel|bath towel|bath mat/i.test(n),
      blurb: "Washcloths, hand and bath towels, and bath mats." },
    { id: "comforter", label: "Comforters",           test: n => /comforter/i.test(n),
      blurb: "Down-alternative quilted comforters in every bed size." },
    { id: "kitchen",   label: "Kitchen & Restaurant", test: () => true,
      blurb: "Bar mops, kitchen towels, pot holders, aprons and napkins." },
  ];
  const catOf = name => CATS.find(c => c.test(name)).id;

  const SIZE_RE = /\b(Full XL|Full\/Queen|Twin|Full|Queen|King|Standard)\b/;
  const sizeRank = s => { const i = ["Standard", "Twin", "Full", "Full XL", "Full/Queen", "Queen", "King"].indexOf(s); return i < 0 ? 99 : i; };

  /* ── Helpers ───────────────────────────────────────────────── */

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const money = n => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceAt = (p, qty) => getTierPrice(Object.assign({}, p, { quantity: qty }), []);
  const unitOf = p => moqUnitWord(p);                                  // dozen | piece | case | set ...
  const unitPlural = (p, n) => { const u = unitOf(p); return u === "dozen" || n === 1 ? u : u + "s"; };
  const ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

  // Volume ladder exactly as the cart prices it: the minimum order, then
  // each tier start rounded up to a whole case.
  function ladder(p) {
    const moq = productMoq(p);
    const steps = [moq];
    [tierMinQty(p, "tier2_min_qty", "tier2MinQty"), tierMinQty(p, "tier3_min_qty", "tier3MinQty")].forEach(t => {
      if (t) steps.push(Math.max(moq, Math.ceil(t / moq) * moq));
    });
    const out = [];
    [...new Set(steps)].sort((a, b) => a - b).forEach(q => {
      const pr = priceAt(p, q);
      if (!out.length || pr < out[out.length - 1].price) out.push({ qty: q, price: pr });
    });
    return out.slice(0, 3);
  }
  const cases = (p, q) => { const m = productMoq(p), n = Math.round(q / m); return m > 1 ? `${n} case${n > 1 ? "s" : ""}` : `${q}+ ${unitPlural(p, q)}`; };
  const savePct = p => { const l = ladder(p); return l.length > 1 ? Math.round((1 - l[l.length - 1].price / l[0].price) * 100) : 0; };

  function badgeOf(name) {
    const tc = name.match(/\bT(\d{3})\b/);
    if (/comforter/i.test(name)) return /five star/i.test(name) ? "Five Star T233" : /basics/i.test(name) ? "Martex Basics" : "Martex Ultra Touch";
    if (tc) return "T" + tc[1];
    if (/long-staple/i.test(name)) return "Long-staple cotton";
    if (/ring-spun/i.test(name)) return "Ring-spun cotton";
    if (/100% cotton/i.test(name)) return "100% cotton";
    if (/cotton blend/i.test(name)) return "Cotton blend";
    if (/economy cotton/i.test(name)) return "Cotton";
    if (/polyester/i.test(name)) return "Spun polyester";
    return T.name;
  }

  /* ── Product lines (sizes and options grouped into one card) ─── */

  let LINES = [];
  const BY_SKU = {};
  const pick = {};
  const state = { cat: "all", q: "", sort: "featured" };

  function splitName(name) {
    const [title, ...rest] = String(name).split(" - ");
    const size = (title.match(SIZE_RE) || [])[1] || "";
    const base = title.replace(SIZE_RE, "").replace(/\s{2,}/g, " ").trim();
    const detail = rest.join(" - ").split(/,\s*/).map(s => s.trim()).filter(s => s && !/^(pack|case) of \d+$/i.test(s));
    return { base, size, detail };
  }

  function buildLines(products) {
    const want = new Set(T.skus);
    const order = new Map(T.skus.map((s, i) => [s, i]));
    const groups = new Map();
    products.filter(p => want.has(p.itemNumber)).forEach(p => {
      const key = (p.familyKey || p.itemNumber) + "|" + (p.productTier || "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    LINES = [...groups.entries()].map(([key, items]) => {
      const parts = items.map(p => ({ p, ...splitName(p.name) }));
      // Option labels: size first, then only the details that differ
      // between this line's options (so "White" isn't repeated on all).
      const common = parts.length > 1
        ? parts[0].detail.filter(d => parts.every(x => x.detail.includes(d)))
        : [];
      const variants = parts.map(x => ({
        p: x.p, size: x.size,
        label: [x.size, ...x.detail.filter(d => !common.includes(d))].filter(Boolean).join(" · ") || "One size",
      })).sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.label.localeCompare(b.label, undefined, { numeric: true }));
      variants.forEach(v => { BY_SKU[v.p.itemNumber] = v; });
      const def = variants.find(v => v.size === "Queen" && v.p.inStock !== false) || variants.find(v => v.p.inStock !== false) || variants[0];
      pick[key] = def.p.itemNumber;
      const first = parts[0];
      return {
        key, variants,
        title: first.base,
        cat: catOf(first.p.name),
        badge: badgeOf(first.p.name),
        minPrice: Math.min(...variants.map(v => priceAt(v.p, productMoq(v.p)))),
        order: Math.min(...items.map(p => order.get(p.itemNumber))),
        optionWord: variants.every(v => v.size || /in\./.test(v.label)) ? "Size" : "Option",
      };
    }).sort((a, b) => CATS.findIndex(c => c.id === a.cat) - CATS.findIndex(c => c.id === b.cat) || a.order - b.order);
  }

  /* ── Product card ──────────────────────────────────────────── */

  function addBtnHtml(p, label) {
    const out = p.inStock === false;
    const moq = productMoq(p);
    return `<button class="add-btn"
      data-item="${esc(p.itemNumber)}" data-name="${escAttr(p.name)}" data-description="${escAttr(p.description)}"
      data-price="${cleanPrice(p.price1) || cleanPrice(p.price)}" data-price1="${cleanPrice(p.price1)}"
      data-price2="${cleanPrice(p.price2)}" data-price3="${cleanPrice(p.price3)}" ${tierMinAttrs(p)}
      data-unit="${esc(p.priceBy || "")}" data-moq="${moq}" data-moq-group="${esc(p.moqGroup || "")}"
      data-moq-group-min="${p.moqGroupMin || ""}" data-weight="${p.weight || ""}"
      data-in-stock="${out ? "false" : "true"}" data-image="${esc(p.image)}" ${out ? "disabled" : ""}>${out ? "Out of stock" : (label || (moq > 1 ? "Add 1 case to order" : "Add to order"))}</button>`;
  }

  function cardHtml(line, i) {
    const v = BY_SKU[pick[line.key]], p = v.p;
    const lad = ladder(p);
    const moq = productMoq(p);
    const now = lad[0] ? lad[0].price : priceAt(p, moq);
    const save = savePct(p);
    const feat = p.feature1 || p.feature2 || "";
    const catLabel = CATS.find(c => c.id === line.cat).label;
    return `
    <article class="tp-card" data-line="${esc(line.key)}" style="animation-delay:${Math.min(i, 8) * 45}ms">
      <div class="tp-card-media" data-quick="${esc(line.key)}" role="button" tabindex="0" aria-label="Quick view ${esc(line.title)}">
        <span class="tp-badge">${esc(line.badge)}</span>
        ${save > 0 ? `<span class="tp-save">Save up to ${save}%</span>` : ""}
        <img src="${esc(cardImageUrl(p.image, 600) || "/assets/img/product-placeholder.svg")}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.src='/assets/img/product-placeholder.svg'">
        <span class="tp-quick-hint">Quick view</span>
      </div>
      <div class="tp-card-body">
        <div>
          <div class="tp-card-kicker">${esc(catLabel)}</div>
          <h3>${esc(line.title)}</h3>
        </div>
        ${feat ? `<p class="tp-card-feat">${esc(feat)}</p>` : ""}
        <div class="tp-field">
          <label for="opt-${i}">${line.optionWord}</label>
          ${line.variants.length > 1
            ? `<select class="tp-select" id="opt-${i}" data-opt="${esc(line.key)}">
                 ${line.variants.map(x => `<option value="${esc(x.p.itemNumber)}"${x === v ? " selected" : ""}${x.p.inStock === false ? " disabled" : ""}>${esc(x.label)}${x.p.inStock === false ? " (out of stock)" : ""}</option>`).join("")}
               </select>`
            : `<div class="tp-field-static">${esc(v.label)}</div>`}
        </div>
        <div class="tp-price-row">
          <span class="tp-price">${money(now)}</span><span class="tp-per">/ ${esc(unitOf(p))}</span>
          <span class="tp-case">${moq > 1 ? `1 case = ${moq} ${esc(unitPlural(p, moq))} · <b>${money(now * moq)}</b>` : "Sold individually"}</span>
        </div>
        ${lad.length > 1 ? `<div class="tp-ladder" aria-label="Volume pricing">
          ${lad.map((s, k) => `<div class="${k ? "is-save" : ""}"><small>${esc(cases(p, s.qty))}</small><b>${money(s.price)}</b></div>`).join("")}
        </div>` : ""}
        <div class="tp-card-actions">
          ${addBtnHtml(p)}
          <button type="button" class="tp-icon-btn" data-quick="${esc(line.key)}" aria-label="Quick view ${esc(line.title)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div class="tp-card-foot"><span>SKU ${esc(p.itemNumber)}</span><a href="/product?item=${encodeURIComponent(p.slug)}">Full details →</a></div>
      </div>
    </article>`;
  }

  function visibleLines() {
    const q = state.q.trim().toLowerCase();
    let list = LINES.filter(l => (state.cat === "all" || l.cat === state.cat) &&
      (!q || (l.title + " " + l.badge + " " + l.variants.map(v => v.label + " " + v.p.name + " " + v.p.itemNumber).join(" ")).toLowerCase().includes(q)));
    if (state.sort === "low") list = list.slice().sort((a, b) => a.minPrice - b.minPrice);
    if (state.sort === "high") list = list.slice().sort((a, b) => b.minPrice - a.minPrice);
    if (state.sort === "save") list = list.slice().sort((a, b) => savePct(BY_SKU[pick[b.key]].p) - savePct(BY_SKU[pick[a.key]].p));
    return list;
  }

  function render() {
    const list = visibleLines();
    const opts = list.reduce((n, l) => n + l.variants.length, 0);
    $("#tpResults").innerHTML = list.length ? `Showing <b>${list.length}</b> product${list.length > 1 ? "s" : ""} · <b>${opts}</b> sizes &amp; options` : "";
    // Closing card: fills the last row and gives a next step to anyone
    // who didn't find their exact item.
    const help = `<a class="tp-help-card" href="/quote">
        <span class="tp-eyebrow">Need something else?</span>
        <h3>Send us your list. We'll price it by the case.</h3>
        <p>Other sizes, colors or a whole property's worth of linens, priced in one quote.</p>
        <span class="tp-btn tp-btn--sm">Get a quote ${ARROW}</span>
        <img class="tp-help-img" src="assets/img/${T.helpImg}.webp" alt="" loading="lazy">
      </a>`;
    $("#tpGrid").innerHTML = list.length ? list.map(cardHtml).join("") + help
      : `<div class="tp-empty"><h3>Nothing matches that yet.</h3><p>Try another search, or <a href="#" data-reset>show everything</a>.</p></div>`;
    if (typeof setupAddToCartButtons === "function") setupAddToCartButtons();
    fitHelpCard();
  }

  // Stretch the closing card across whatever the last row leaves empty.
  function fitHelpCard() {
    const grid = $("#tpGrid"), help = grid && grid.querySelector(".tp-help-card");
    if (!help) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const cards = grid.querySelectorAll(".tp-card").length;
    const left = cols - (cards % cols);
    help.style.gridColumn = `span ${left}`;
    help.classList.toggle("is-wide", left > 1);
  }
  let fitT;
  window.addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(fitHelpCard, 120); });

  function rerenderCard(key) {
    const el = document.querySelector(`.tp-card[data-line="${CSS.escape(key)}"]`);
    if (!el) return;
    const i = visibleLines().findIndex(l => l.key === key);
    const tmp = document.createElement("div");
    tmp.innerHTML = cardHtml(LINES.find(l => l.key === key), i).trim();
    const card = tmp.firstElementChild;
    card.style.animation = "none";
    el.replaceWith(card);
    if (typeof setupAddToCartButtons === "function") setupAddToCartButtons();
    card.querySelector("[data-opt]")?.focus();
  }

  function renderTabs() {
    const counts = { all: LINES.length };
    LINES.forEach(l => { counts[l.cat] = (counts[l.cat] || 0) + 1; });
    $("#tpTabs").innerHTML = [{ id: "all", label: "All" }, ...CATS].filter(c => c.id === "all" || counts[c.id])
      .map(c => `<button class="tp-tab${state.cat === c.id ? " is-active" : ""}" role="tab" aria-selected="${state.cat === c.id}" data-cat="${c.id}">${esc(c.label)}<sup>${counts[c.id] || 0}</sup></button>`).join("");
  }

  function setCat(cat, scroll) {
    state.cat = cat;
    renderTabs(); render();
    if (scroll) $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── Category tiles ────────────────────────────────────────── */

  function renderCats() {
    const tiles = TIER === "economy"
      ? ["#FCE3CC", "#F6EBDD", "#FBEFE3", "#F9E1C9"]
      : ["#E7EAF0", "#EFE7DA", "#E9ECEF", "#F3EBDD"];
    $("#tpCats").innerHTML = CATS.map((c, i) => {
      const lines = LINES.filter(l => l.cat === c.id);
      if (!lines.length) return "";
      const from = Math.min(...lines.map(l => l.minPrice));
      const unit = unitOf(BY_SKU[pick[lines[0].key]].p);
      // Prefer the page's own cutout photos; fall back to a catalog image.
      const img = T.tileImg[c.id] ? `assets/img/${T.tileImg[c.id]}.webp` : cardImageUrl(BY_SKU[pick[lines[0].key]].p.image, 400);
      return `<button class="tp-cat tp-reveal" style="--tile:${tiles[i % tiles.length]}" data-cat-tile="${c.id}">
        <small>${lines.length} product${lines.length > 1 ? "s" : ""} · from ${money(from)}/${esc(unit)}</small>
        <h3>${esc(c.label)}</h3>
        <p>${esc(c.blurb)}</p>
        <span class="tp-cat-go">Shop ${esc(c.label.toLowerCase())} ${ARROW}</span>
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy"${T.tileImg[c.id] ? ' class="is-cut"' : ""}>` : ""}
      </button>`;
    }).join("");
  }

  /* ── Stats ─────────────────────────────────────────────────── */

  // "From" prices lead with the core room linens (bedding and bath), not a
  // kitchen or restaurant item, so the headline price is a fair one.
  function coreLines() {
    const core = LINES.filter(l => l.cat === "bedding" || l.cat === "bath");
    return core.length ? core : LINES;
  }

  function renderStats() {
    const ps = Object.values(BY_SKU).map(v => v.p);
    if (!ps.length) return;
    const cheapest = coreLines().flatMap(l => l.variants.map(v => v.p))
      .reduce((a, p) => (priceAt(p, productMoq(p)) < priceAt(a, productMoq(a)) ? p : a));
    const bestSave = Math.max(0, ...ps.map(savePct));
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set("tpStatFrom", `<span data-count="${priceAt(cheapest, productMoq(cheapest)).toFixed(2)}" data-prefix="$" data-dec="2">$0</span><small>/${esc(unitOf(cheapest))}</small>`);
    set("tpStatLines", `<span data-count="${LINES.length}">0</span>`);
    set("tpStatOpts", `<span data-count="${ps.length}">0</span>`);
    set("tpStatSave", `<span data-count="${bestSave}" data-suffix="%">0%</span>`);
    // If the strip already scrolled into view before the data arrived,
    // its reveal has fired; count up now instead of waiting for it.
    const strip = $("#tpStatFrom").closest(".tp-reveal");
    if (strip && strip.classList.contains("is-in")) strip.querySelectorAll("[data-count]").forEach(countUp);
  }

  function countUp(el) {
    const end = parseFloat(el.dataset.count), dec = Number(el.dataset.dec || 0);
    const pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    const t0 = performance.now(), dur = 1100;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + (end * e).toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── Hero ──────────────────────────────────────────────────── */

  const HOLD_MS = 5200;
  let cur = 0, timer = null, paused = false;

  function buildHero() {
    const stage = $("#tpStage");
    $("#tpShots").innerHTML = T.slides.map((s, i) =>
      `<div class="tp-shot" data-i="${i}"><img src="assets/img/${s.img}.webp" alt="${esc(s.title)}" width="1000" height="1000" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></div>`).join("");
    $("#tpInfos").innerHTML = T.slides.map((s, i) => {
      const v = BY_SKU[s.sku], p = v && v.p;
      const moq = p ? productMoq(p) : 0;
      const pr = p ? priceAt(p, moq) : 0;
      const save = p ? savePct(p) : 0;
      return `<div class="tp-info" data-i="${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${T.slides.length}: ${esc(s.title)}">
        <div class="tp-info-kicker">${esc(s.kicker)}</div>
        <h2>${esc(s.title)}</h2>
        ${p ? `
          <div class="tp-info-price"><b>${money(pr)}</b><span>/ ${esc(unitOf(p))}</span></div>
          <p class="tp-info-note">${moq > 1 ? `1 case = ${moq} ${esc(unitPlural(p, moq))} · <strong>${money(pr * moq)}</strong>` : "Sold individually"}</p>
          ${save > 0 ? `<span class="tp-info-save">↓ Up to ${save}% off at volume</span>` : ""}
          <div class="tp-info-actions">
            ${addBtnHtml(p)}
            <a class="tp-link" href="/product?item=${encodeURIComponent(p.slug)}">See sizes &amp; details ${ARROW}</a>
          </div>`
        : `
          <p class="tp-info-note">${esc(s.line)}</p>
          <span class="tp-info-save">Arriving in the catalog soon</span>
          <div class="tp-info-actions">
            <a class="tp-btn tp-btn--navy tp-btn--sm" href="/quote">Get early pricing ${ARROW}</a>
          </div>`}
      </div>`;
    }).join("");
    $("#tpDots").innerHTML = T.slides.map((s, i) => `<button type="button" role="tab" aria-label="Show ${esc(s.title)}" data-go="${i}"><i></i></button>`).join("");
    stage.style.setProperty("--hold", HOLD_MS + "ms");
    go(0, true);
  }

  function go(n, first) {
    const shots = $$(".tp-shot"), infos = $$(".tp-info"), dots = $$("#tpDots button");
    if (!shots.length) return;
    const next = (n + shots.length) % shots.length;
    if (!first && next === cur) return;
    shots.forEach((s, i) => {
      s.classList.toggle("is-leaving", !first && i === cur && i !== next);
      s.classList.toggle("is-active", i === next);
    });
    setTimeout(() => shots.forEach(s => s.classList.remove("is-leaving")), 900);
    infos.forEach((s, i) => { s.classList.toggle("is-active", i === next); s.setAttribute("aria-hidden", i === next ? "false" : "true"); });
    dots.forEach((d, i) => {
      d.classList.remove("is-active", "is-done");
      void d.offsetWidth;                    // restart the fill animation
      if (i < next) d.classList.add("is-done");
      if (i === next) d.classList.add("is-active");
      d.setAttribute("aria-selected", i === next);
    });
    const s = T.slides[next], nx = T.slides[(next + 1) % T.slides.length];
    $("#tpStage").style.setProperty("--slide-bg", s.bg);
    const nb = $("#tpNext");
    nb.querySelector("img").src = `assets/img/${nx.img}.webp`;
    nb.querySelector("span").textContent = nx.title;
    nb.style.setProperty("--next-bg", nx.bg);
    nb.setAttribute("aria-label", "Next: " + nx.title);
    $("#tpCounter").innerHTML = `<b>${String(next + 1).padStart(2, "0")}</b> / ${String(shots.length).padStart(2, "0")}`;
    cur = next;
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    // Auto-advances on every device, including ones set to reduce motion
    // (business decision); it still pauses on hover and focus.
    if (paused) return;
    timer = setTimeout(() => go(cur + 1), HOLD_MS);
  }

  /* ── Room estimator ────────────────────────────────────────── */

  const est = {
    rooms: 25, beds: 1, size: "Queen", pillows: 2, par: 3, towels: true,
    grade: Object.keys(T.estimator.grades)[0],
    towelSet: Object.keys(T.estimator.towels)[0],
  };
  let estLines = [];

  function renderEstControls() {
    const g = T.estimator.grades;
    const sizes = Object.keys(g[est.grade].sizes);
    if (!sizes.includes(est.size)) est.size = sizes.includes("Queen") ? "Queen" : sizes[0];
    const seg = (name, opts, curV) => `<div class="tp-seg" role="group" aria-label="${esc(name)}">${opts.map(([v, l]) =>
      `<button type="button" class="${String(v) === String(curV) ? "is-active" : ""}" data-est="${esc(name)}" data-val="${esc(v)}">${esc(l)}</button>`).join("")}</div>`;
    const towelSets = Object.entries(T.estimator.towels);
    $("#tpEstControls").innerHTML = `
      <div class="tp-ctl">
        <label for="tpRooms">Rooms to outfit <output id="tpRoomsOut">${est.rooms}</output></label>
        <input class="tp-range" type="range" id="tpRooms" min="1" max="300" step="1" value="${est.rooms}">
      </div>
      <div class="tp-ctl"><span>Beds per room</span>${seg("beds", [[1, "1 bed"], [2, "2 beds"]], est.beds)}</div>
      <div class="tp-ctl"><span>Bed size</span>${seg("size", sizes.map(s => [s, s]), est.size)}</div>
      ${Object.keys(g).length > 1 ? `<div class="tp-ctl"><span>Sheet grade</span>${seg("grade", Object.entries(g).map(([k, v]) => [k, v.label]), est.grade)}</div>` : ""}
      <div class="tp-ctl"><span>Pillows per bed</span>${seg("pillows", [[2, "2"], [3, "3"], [4, "4"]], est.pillows)}</div>
      <div class="tp-ctl"><span>Par level <small style="font-weight:500;opacity:.7">&nbsp;sets per bed</small></span>${seg("par", [[2, "2 par"], [3, "3 par"], [4, "4 par"]], est.par)}</div>
      <label class="tp-check"><input type="checkbox" id="tpTowels" ${est.towels ? "checked" : ""}> Include towels &amp; bath mats</label>
      ${est.towels && towelSets.length > 1 ? `<div class="tp-ctl"><span>Towel collection</span>${seg("towelSet", towelSets.map(([k, v]) => [k, v.label]), est.towelSet)}</div>` : ""}
      <p class="tp-est-note">3 par is the hotel standard: one set on the bed, one in the laundry, one on the shelf. Towels assume 2 guests per room: 2 bath, 2 hand and 2 washcloths, plus 1 bath mat, times par.</p>`;
  }

  function computeEstimate() {
    const g = T.estimator.grades[est.grade].sizes[est.size];
    const beds = est.rooms * est.beds;
    const want = [
      { role: "Flat sheets", sku: g.flat, pcs: beds * est.par },
      { role: "Fitted sheets", sku: g.fitted, pcs: beds * est.par },
      { role: "Pillowcases", sku: g.pc, pcs: beds * est.pillows * est.par },
    ];
    if (est.towels) {
      const t = T.estimator.towels[est.towelSet];
      want.push(
        { role: "Bath towels", sku: t.bath, pcs: est.rooms * 2 * est.par },
        { role: "Hand towels", sku: t.hand, pcs: est.rooms * 2 * est.par },
        { role: "Washcloths", sku: t.wash, pcs: est.rooms * 2 * est.par },
        { role: "Bath mats", sku: t.mat, pcs: est.rooms * est.par });
    }
    // Pieces -> the product's selling unit -> whole cases, priced at the
    // volume tier that quantity reaches (same as the cart will).
    estLines = want.map(w => {
      const v = BY_SKU[w.sku];
      if (!v) return null;
      const p = v.p, moq = productMoq(p);
      const perUnit = unitOf(p) === "dozen" ? 12 : 1;
      const units = Math.ceil(w.pcs / perUnit);
      const qty = Math.max(moq, Math.ceil(units / moq) * moq);
      const price = priceAt(p, qty);
      return { ...w, p, qty, price, total: qty * price, cases: Math.round(qty / moq), moq };
    }).filter(Boolean);
  }

  function renderEstimate() {
    computeEstimate();
    const total = estLines.reduce((s, l) => s + l.total, 0);
    const perRoom = est.rooms ? total / est.rooms : 0;
    $("#tpEstOut").innerHTML = estLines.length ? `
      <div class="tp-est-table-wrap">
      <table class="tp-est-table">
        <thead><tr><th>Item</th><th>Need</th><th>You order</th><th>Cost</th></tr></thead>
        <tbody>
          ${estLines.map(l => `<tr>
            <td><strong>${esc(l.role)}</strong><small>${esc(BY_SKU[l.sku].label)} · ${esc(badgeOf(l.p.name))}</small>
              <small class="tp-est-m">Order ${l.qty} ${esc(unitPlural(l.p, l.qty))}${l.moq > 1 ? ` (${l.cases} case${l.cases > 1 ? "s" : ""})` : ""}</small></td>
            <td>${l.pcs.toLocaleString()} pcs</td>
            <td>${l.qty} ${esc(unitPlural(l.p, l.qty))}<small>${l.moq > 1 ? `${l.cases} case${l.cases > 1 ? "s" : ""} · ` : ""}${money(l.price)}/${esc(unitOf(l.p))}</small></td>
            <td><strong>${money(l.total)}</strong></td>
          </tr>`).join("")}
        </tbody>
      </table>
      </div>
      <div class="tp-est-total">
        <div><span>Estimated total for ${est.rooms} room${est.rooms > 1 ? "s" : ""} · ${money(perRoom)} per room</span><b>${money(total)}</b></div>
        <div class="tp-est-actions">
          <button type="button" class="tp-btn" id="tpEstAdd">Add all to cart ${ARROW}</button>
          <a class="tp-btn tp-btn--navy" href="/quote">Get a custom quote</a>
        </div>
      </div>
      <p class="tp-est-note" style="color:var(--slate)">Rounded up to full cases. Volume pricing is already applied. Delivery and tax are calculated at checkout.</p>`
      : `<p style="margin:0;color:var(--slate)">Loading live prices…</p>`;
  }

  // Adds every estimator line at its computed quantity. Builds the same
  // cart line shape as script.js's add-to-cart handler, which only ever
  // adds one case from a button.
  function addEstimateToCart() {
    if (!estLines.length) return;
    const cart = getCart();
    estLines.forEach(l => {
      const p = l.p;
      if (p.inStock === false) return;
      const line = {
        itemNumber: p.itemNumber, name: p.name, description: p.description || "",
        price: cleanPrice(p.price1) || cleanPrice(p.price),
        price1: cleanPrice(p.price1) || cleanPrice(p.price),
        price2: cleanPrice(p.price2) || cleanPrice(p.price1) || cleanPrice(p.price),
        price3: cleanPrice(p.price3) || cleanPrice(p.price2) || cleanPrice(p.price1) || cleanPrice(p.price),
        tier1MinQty: tierMinQty(p, "tier1_min_qty", "tier1MinQty"),
        tier2MinQty: tierMinQty(p, "tier2_min_qty", "tier2MinQty"),
        tier3MinQty: tierMinQty(p, "tier3_min_qty", "tier3MinQty"),
        image: p.image || "", unit: p.priceBy || "", moq: l.moq,
        moqGroup: p.moqGroup || "", moqGroupMin: Number(p.moqGroupMin) || 0,
        weight: Number(p.weight) || 0, quantity: l.qty,
      };
      const existing = cart.find(x => x.itemNumber === line.itemNumber);
      if (existing) existing.quantity += line.quantity; else cart.push(line);
      if (typeof trackEcommerce === "function") trackEcommerce("add_to_cart", { currency: "USD", value: l.total, items: [gaItem(line, l.qty)] });
    });
    saveCart(cart);
    if (typeof updateCartBadge === "function") updateCartBadge();
    if (typeof showVpToast === "function") showVpToast(`Added ${estLines.length} items for ${est.rooms} rooms to your order.`);
    const b = $("#tpEstAdd");
    if (b) { b.innerHTML = "✓ Added. View cart " + ARROW; b.onclick = () => { location.href = "/cart"; }; }
  }

  /* ── Compare ───────────────────────────────────────────────── */

  function renderCompare(products) {
    const bySku = {}; products.forEach(p => { bySku[p.itemNumber] = p; });
    const fromOf = (tier, re) => {
      const ps = tier.skus.map(s => bySku[s]).filter(p => p && re.test(p.name));
      return ps.length ? ps.reduce((m, p) => Math.min(m, priceAt(p, productMoq(p))), Infinity) : 0;
    };
    $$("[data-cmp-from]").forEach(el => {
      const tier = TIERS[el.dataset.cmpFrom];
      const re = new RegExp(el.dataset.cmpRe, "i");
      const v = fromOf(tier, re);
      if (v) el.textContent = `From ${money(v)}/dozen`;
    });
  }

  /* ── Quick view ────────────────────────────────────────────── */

  function openQuick(key) {
    const line = LINES.find(l => l.key === key);
    if (!line) return;
    const v = BY_SKU[pick[key]], p = v.p, lad = ladder(p), moq = productMoq(p);
    $("#tpModalImg").src = cardImageUrl(p.image, 800) || "/assets/img/product-placeholder.svg";
    $("#tpModalImg").alt = p.name;
    $("#tpModalBody").innerHTML = `
      <span class="tp-eyebrow">${esc(line.badge)}</span>
      <h3 id="tpModalTitle">${esc(p.name)}</h3>
      <p>${esc(p.overview || p.description || "")}</p>
      <ul>${[p.feature1, p.feature2, p.feature3, p.feature4].filter(Boolean).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      <div class="tp-price-row"><span class="tp-price">${money(lad[0] ? lad[0].price : priceAt(p, moq))}</span><span class="tp-per">/ ${esc(unitOf(p))}</span>
        <span class="tp-case">${moq > 1 ? `1 case = ${moq} ${esc(unitPlural(p, moq))}` : "Sold individually"} · SKU ${esc(p.itemNumber)}</span></div>
      ${lad.length > 1 ? `<div class="tp-ladder">${lad.map((s, k) => `<div class="${k ? "is-save" : ""}"><small>${esc(cases(p, s.qty))}</small><b>${money(s.price)}</b></div>`).join("")}</div>` : ""}
      ${addBtnHtml(p)}
      <a class="tp-link" href="/product?item=${encodeURIComponent(p.slug)}" style="justify-content:center">Open the full product page ${ARROW}</a>`;
    $("#tpModal").classList.add("is-open");
    document.body.style.overflow = "hidden";
    if (typeof setupAddToCartButtons === "function") setupAddToCartButtons();
    $(".tp-modal-close").focus();
  }
  function closeQuick() { $("#tpModal").classList.remove("is-open"); document.body.style.overflow = ""; }

  /* ── Events ────────────────────────────────────────────────── */

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-cat],[data-cat-tile],[data-quick],[data-close],[data-go],[data-reset],[data-est],#tpEstAdd,#tpNext,[data-scroll]");
    if (!t) return;
    if (t.matches("[data-cat]")) setCat(t.dataset.cat, false);
    else if (t.matches("[data-cat-tile]")) setCat(t.dataset.catTile, true);
    else if (t.matches("[data-quick]")) openQuick(t.dataset.quick);
    else if (t.matches("[data-close]")) closeQuick();
    else if (t.matches("[data-go]")) go(Number(t.dataset.go));
    else if (t.id === "tpNext") go(cur + 1);
    else if (t.matches("[data-reset]")) { e.preventDefault(); state.q = ""; $("#tpSearch").value = ""; setCat("all"); }
    else if (t.matches("[data-scroll]")) { e.preventDefault(); document.querySelector(t.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (t.id === "tpEstAdd" && !t.onclick) addEstimateToCart();
    else if (t.matches("[data-est]")) {
      const k = t.dataset.est, val = t.dataset.val;
      est[k] = ["beds", "pillows", "par"].includes(k) ? Number(val) : val;
      renderEstControls(); renderEstimate();
    }
  });
  document.addEventListener("change", e => {
    const s = e.target.closest("[data-opt]");
    if (s) { pick[s.dataset.opt] = s.value; rerenderCard(s.dataset.opt); return; }
    if (e.target.id === "tpTowels") { est.towels = e.target.checked; renderEstControls(); renderEstimate(); }
  });
  document.addEventListener("input", e => {
    if (e.target.id !== "tpRooms") return;
    est.rooms = Number(e.target.value);
    $("#tpRoomsOut").textContent = est.rooms;
    renderEstimate();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeQuick();
    if (e.key === "Enter" && e.target.matches(".tp-card-media")) openQuick(e.target.dataset.quick);
  });
  let qt;
  $("#tpSearch")?.addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; render(); }, 160); });
  $("#tpSort")?.addEventListener("change", e => { state.sort = e.target.value; render(); });
  $("#tpPrev")?.addEventListener("click", () => go(cur - 1));
  $("#tpNextArrow")?.addEventListener("click", () => go(cur + 1));

  const stage = $("#tpStage");
  const pause = () => { paused = true; stage.classList.add("is-paused"); clearTimeout(timer); };
  const resume = () => { paused = false; stage.classList.remove("is-paused"); go(cur, true); };
  stage.addEventListener("mouseenter", pause);
  stage.addEventListener("mouseleave", resume);
  stage.addEventListener("focusin", pause);
  stage.addEventListener("focusout", e => { if (!stage.contains(e.relatedTarget)) resume(); });
  let sx = null;
  stage.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(timer); else if (!paused) schedule(); });

  /* ── Scroll effects: reveal, count-up, sticky CTA ──────────── */

  function watchReveals() {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      en.target.querySelectorAll("[data-count]").forEach(countUp);
      io.unobserve(en.target);
    }), { threshold: .14, rootMargin: "0px 0px -40px 0px" });
    $$(".tp-reveal").forEach(el => io.observe(el));
  }

  function watchSticky() {
    const bar = $("#tpSticky");
    if (!bar) return;
    const hero = $(".tp-hero"), final = $(".tp-final");
    let heroOut = false, finalIn = false;
    // The site's mini-cart docks in the same strip once the cart has items,
    // and carries its own checkout button, so the bar steps aside for it.
    const cartShown = () => { const mc = document.getElementById("miniCart"); return !!(mc && mc.offsetParent !== null && mc.getBoundingClientRect().height > 0); };
    const sync = () => {
      const on = heroOut && !finalIn && !cartShown() && !$("#tpModal").classList.contains("is-open");
      bar.classList.toggle("is-on", on);
      document.body.classList.toggle("tp-sticky-on", on);   // phones hide the Price Match button under it
    };
    window.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true });
    new MutationObserver(sync).observe(document.body, { childList: true });
    new IntersectionObserver(([en]) => { heroOut = !en.isIntersecting; sync(); }, { threshold: 0 }).observe(hero);
    if (final) new IntersectionObserver(([en]) => { finalIn = en.isIntersecting; sync(); }, { threshold: 0 }).observe(final);
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  (async function boot() {
    renderEstControls();
    renderEstimate();
    watchReveals();
    watchSticky();
    let products = [];
    try { products = await fetchCatalogProducts(); } catch (e) { console.warn("[" + TIER + "] catalog failed", e); }
    buildLines(products);
    buildHero();
    renderStats();
    renderCats();
    renderTabs();
    render();
    renderEstControls();
    renderEstimate();
    renderCompare(products);
    watchReveals();                          // tiles rendered after the first pass
    const from = $("#tpStickyFrom");
    if (from && LINES.length) {
      const m = coreLines().reduce((a, l) => (l.minPrice < a.minPrice ? l : a));
      from.textContent = `${LINES.length} products · linens from ${money(m.minPrice)}/${unitOf(BY_SKU[pick[m.key]].p)}`;
    }
    const cat = new URLSearchParams(location.search).get("cat");
    if (cat && CATS.some(c => c.id === cat)) setCat(cat, true);
  })();
})();
