console.log("Script loaded!");

let allProducts = [];
let featuredProducts = [];
let currentFeaturedIndex = 0;
let isSliding = false;

/* =========================
   AFFILIATE SUBDOMAIN ATTRIBUTION
========================= */
// Visiting an affiliate's own subdomain (trustmark.roomreadysupply.com)
// previously attributed NOTHING to that affiliate -- every existing path
// (checkout's referral field, registration) depended entirely on a
// customer manually typing a code into a field labelled "optional". A
// customer who landed on the subdomain and just checked out became an
// ordinary, unattributed order. This resolves the subdomain itself, which
// is a far more reliable signal than asking every visitor to type
// something in.
//
// Root domain and www both resolve to null -- only a real affiliate
// subdomain (anything.roomreadysupply.com other than www) counts.
function getAffiliateSubdomain() {
  const host = window.location.hostname;
  const suffix = ".roomreadysupply.com";
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  if (!sub || sub === "www") return null;
  return sub;
}

// Resolves the current subdomain to its affiliate's referral code exactly
// once per page load, memoized -- every call site (checkout, registration)
// awaits this instead of re-querying. Returns null on the main site, an
// unrecognized subdomain, or if the lookup fails; callers already treat a
// missing referral as "no attribution", the same as before this existed.
let _affiliateSubdomainLookup = null;
function resolveAffiliateSubdomain() {
  if (_affiliateSubdomainLookup) return _affiliateSubdomainLookup;
  const sub = getAffiliateSubdomain();
  if (!sub || !window.sb) {
    _affiliateSubdomainLookup = Promise.resolve(null);
    return _affiliateSubdomainLookup;
  }
  _affiliateSubdomainLookup = window.sb
    .rpc("lookup_affiliate_by_subdomain", { p_subdomain: sub })
    .then(function (res) {
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      return row || null;
    })
    .catch(function (err) {
      console.error("[affiliate-subdomain] lookup failed:", err.message || err);
      return null;
    });
  return _affiliateSubdomainLookup;
}

/* =========================
   PAGE LOAD
========================= */

// New SEO landing pages (regional/vertical/offer pages, not the 9
// existing category pages, which keep their inline copy-pasted chrome
// unchanged) use a shared header/nav partial instead of duplicating it
// per file. Only those new pages carry the slot div, so this is a
// no-op on every existing page. Must finish -- and be awaited -- BEFORE
// setupMobileNav()/updateCartBadge()/setupLogin()/setupAccountDropdown()
// run below, since all four query the DOM for elements (#navHamburger,
// #cart-count, #logout-btn, .account-dropdown) that only exist once
// this injected HTML has landed; each of those functions no-ops
// silently on a missing element rather than erroring, so a timing bug
// here would fail invisibly instead of loudly.
async function loadSiteHeader() {
  const slot = document.getElementById("site-header-slot");
  if (!slot) return;
  try {
    const res = await fetch("/partials/site-header");
    if (!res.ok) throw new Error("HTTP " + res.status);
    slot.outerHTML = await res.text();
  } catch (err) {
    console.error("[loadSiteHeader] could not load shared header:", err.message);
    // Leave the empty slot in place rather than throwing -- the rest of
    // the page (and the DOMContentLoaded handlers below) still run;
    // the page is just missing top nav chrome instead of being broken.
  }
}

/* ── Affiliate identification + liability disclaimer ──────────────
   Required by the CEO (2026-09-16): an affiliate's storefront runs on
   *.roomreadysupply.com carrying RRS branding, so a customer could
   reasonably believe the affiliate IS Room Ready Supply. Every affiliate
   subdomain must therefore state, across the whole site, that the
   affiliate is an affiliate/partner of RRS, that RRS is only their
   SUPPLIER, and that RRS is not responsible for the affiliate's actions.

   Injected from JS rather than added to the page markup because the site
   has two different chrome patterns -- 26 pages with the header copied
   inline, 9 newer ones using /partials/site-header -- so a markup edit
   would mean touching every file and would silently miss any page added
   later. A legal disclaimer that is missing from one page is worse than
   useless, so this runs from script.js, which every page already loads.

   Does nothing on roomreadysupply.com and www: getAffiliateSubdomain()
   returns null there, so the main site is untouched. Affiliates have no
   logo of their own, so their company NAME is the identifier -- which
   lookup_affiliate_by_subdomain() already returns (20260911), so no
   schema or RPC change is needed. */
const RRS_AFFILIATE_DISCLAIMER =
  "Room Ready Supply is the product supplier for this independent affiliate and is " +
  "not responsible for its business practices, services, or conduct. Orders placed " +
  "here form an agreement with the affiliate named above, not with Room Ready Supply.";

async function renderAffiliateDisclaimer() {
  // Cheap synchronous check first -- on the main site this exits before
  // any network call, so the overwhelming majority of page loads pay
  // nothing for this feature.
  if (!getAffiliateSubdomain()) return;

  const affiliate = await resolveAffiliateSubdomain();
  // An unrecognized or inactive subdomain resolves to null. Deliberately
  // render nothing rather than a disclaimer naming nobody -- an unnamed
  // "this affiliate" notice would confuse a visitor on a stray subdomain
  // without protecting anyone.
  if (!affiliate || !affiliate.name) return;

  const name = affiliate.name;

  // 1. Identification, above the RRS logo -- "on top of the room ready
  //    supply logo" per the CEO. Inserted before the top bar (or the
  //    header, on pages that have no top bar) so it reads before any
  //    RRS branding does.
  if (!document.getElementById("affiliateIdBar")) {
    const bar = document.createElement("div");
    bar.id = "affiliateIdBar";
    bar.className = "affiliate-id-bar";
    bar.innerHTML =
      `<strong></strong><span> &mdash; an independent affiliate of Room Ready Supply</span>`;
    // textContent, not innerHTML, for the name: it is operator-entered
    // data from the admin panel, and an apostrophe or "&" in a company
    // name must render as itself, never as markup.
    bar.querySelector("strong").textContent = name;

    const anchor = document.querySelector(".top-bar") || document.querySelector("header.navbar");
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  // 2. Liability disclaimer, persistent at the end of every page. Site
  //    footers are inconsistent across this codebase (index.html has no
  //    site <footer> at all), so this appends its own element rather
  //    than trying to find one to attach to.
  if (!document.getElementById("affiliateDisclaimer")) {
    const note = document.createElement("div");
    note.id = "affiliateDisclaimer";
    note.className = "affiliate-disclaimer";
    note.setAttribute("role", "contentinfo");
    const strong = document.createElement("strong");
    strong.textContent = name + " is an independent affiliate of Room Ready Supply.";
    const text = document.createElement("span");
    text.textContent = " " + RRS_AFFILIATE_DISCLAIMER;
    note.appendChild(strong);
    note.appendChild(text);
    document.body.appendChild(note);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSiteHeader();
  renderAffiliateDisclaimer();
  setupMobileNav();
  updateCartBadge();
  updateQuoteBadge();
  setupReorderDropdowns();
  setupLogin();
  setupAccountDropdown();
  setupPasswordToggle();
  loadCartPage();
  loadCheckoutProducts();
  loadPaymentSummary();
  setupCalendar();
  setupFeaturedSliderButtons();

  fetchCatalogProducts()
    .then(products => {
      allProducts = products.filter(isSellable);

      const prioritized = sortCatalogDefault(allProducts);
      renderProducts(prioritized);
      loadProductPage();
      loadFeaturedProducts();
      renderHomeProducts();
      fillCategoryTiles();

      setupProductQuantity();
      setupAddToCartButtons();
      applyCatalogSearchParam();

      // Cart/checkout above were rendered from raw localStorage before the
      // catalog had loaded at all, from whatever price was stored the
      // moment each item was added -- possibly days ago, on a since-changed
      // price. Re-sync every cart item to the price the catalog shows RIGHT
      // NOW, persist the correction, then re-render everywhere a price is
      // shown. Without this, a customer could check out on a price that
      // matches nothing currently displayed on the site.
      syncCartPricesToCatalog();
      loadCartPage();
      loadCheckoutProducts();
      loadPaymentSummary();
    })
    .catch(error => {
      console.error("Error loading products:", error);
      // loadProductPage() never runs on a fetch failure, so the product
      // page's loading spinner (ppg-loading, product-template.html) would
      // otherwise spin forever with no explanation instead of the usual
      // "Product not found" message.
      const nameEl = document.getElementById("productName");
      if (nameEl) nameEl.textContent = "Couldn't load this product — please refresh the page.";
      document.querySelector(".product-page")?.classList.remove("ppg-loading");
    });
});

/**
 * Bring every stored cart item's price fields up to date with the live
 * catalog, matched by item number (falling back to name for older cart
 * entries added before itemNumber was carried, e.g. from the wishlist).
 * A cart item with no catalog match is left untouched rather than guessed
 * at -- it may be a custom quote line with no corresponding SKU.
 */
function syncCartPricesToCatalog() {
  if (!allProducts.length) return false;
  const cart = getCart();
  let changed = false;

  cart.forEach(item => {
    const match = allProducts.find(p =>
      (item.itemNumber && p.itemNumber && p.itemNumber === item.itemNumber) ||
      (!item.itemNumber && p.name === item.name)
    );
    if (!match) return;

    ["price", "price1", "price2", "price3", "image", "description"].forEach(field => {
      if (match[field] !== undefined && item[field] !== match[field]) {
        item[field] = match[field];
        changed = true;
      }
    });
  });

  if (changed) saveCart(cart);
  return changed;
}

/* =========================
   CATALOG DATA SOURCE
   Products used to be served from a static products.csv. They now come
   from the Supabase `products` table (populated by tools/reseed-products.js
   from products.csv + supplier cost files), so that editing a product's
   cost in the admin panel changes what customers actually pay.

   This function is the ONLY place that changed. It reproduces the exact
   object shape parseCSV() used to produce, so every downstream consumer
   (rendering, search, cart, product detail, the variant/color selector,
   account.html's addQuoteToCart, etc.) needs no changes at all -- they
   don't know or care where allProducts came from.
========================= */

const PRODUCTS_SUPABASE_URL = "https://giprkvlyouwfzjlaibkq.supabase.co";
const PRODUCTS_SUPABASE_ANON = "sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN";

// SEO Day 14: ~98% of live product photos are hosted on Cloudinary
// (res.cloudinary.com/ddx3g4yse/...), which supports serving a
// browser-optimal format/quality at request time via URL transformation
// flags -- no local conversion, no extra files, works for every product
// image without anyone re-uploading anything. Non-Cloudinary URLs (a
// product photo uploaded straight to Supabase Storage, or missing
// entirely) pass through unchanged.
function optimizeImageUrl(url) {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  if (/\/upload\/[^/]*(?:f_auto|q_auto|c_pad|w_800)/.test(url)) return url; // already transformed
  // c_pad,w_800,h_800,b_white: 46 product images are stored at 450x450,
  // under Google Merchant Center's 500px minimum ("Image too small for
  // upcoming enforcement"). Padding every image to a uniform 800x800 on
  // a white ground fixes those and normalizes the rest -- Cloudinary does
  // it on the fly, no re-uploads. f_auto/q_auto keep the byte size down.
  return url.replace("/upload/", "/upload/c_pad,w_800,h_800,b_white,f_auto,q_auto/");
}

function mapDbProductToLegacyShape(row) {
  const itemNumber = row.sku || "";
  const name = row.name || "";
  return {
    name,
    itemNumber,
    image: optimizeImageUrl(row.image_url) || "",
    // Extra gallery photos beyond the one cover image (RRS-13) -- always a
    // real array, never null/undefined, so callers can spread it safely.
    images: Array.isArray(row.images) ? row.images.map(optimizeImageUrl) : [],
    description: row.description || "",
    overview: row.overview || "",
    // Optional SEO overrides set from admin -- see populateProductPage(),
    // which mirrors api/product-meta.js's same fallback-when-blank logic
    // so the server-rendered tags and this client-side pass never disagree.
    metaTitle: row.meta_title || "",
    metaDescription: row.meta_description || "",

    feature1: row.feature1 || "",
    feature2: row.feature2 || "",
    feature3: row.feature3 || "",
    feature4: row.feature4 || "",

    caseQty: row.case_qty != null ? String(row.case_qty) : "",
    size: row.pack_size != null ? String(row.pack_size) : "",
    price: row.price != null ? String(row.price) : "",

    price1: row.price_tier1 != null ? String(row.price_tier1) : "",
    price2: row.price_tier2 != null ? String(row.price_tier2) : "",
    price3: row.price_tier3 != null ? String(row.price_tier3) : "",

    productFamily: row.product_family || "",
    variantLabel: row.variant_label || "",
    colorGroup: row.color_group || "",
    colorLabel: row.color_label || "",
    // Quality line (Economy / Premium / Luxury / ...). Optional and often
    // absent -- gloves, chemicals and paper have no tier -- so every
    // consumer must treat "" as "don't render a badge".
    productTier: row.product_tier || "",

    // Real supplier category (e.g. "Bed Sheets & Linens"). Categories used
    // to be guessed by keyword-matching product text, which badly
    // misfired -- see the CATEGORY_KEYWORDS note in applyFilters().
    category: row.category_name || "",

    sellByEach: row.sell_by_each || "",
    priceBy: row.unit || "",
    // Minimum order in whatever priceBy says. 1 for anything sold by the
    // case or each; dozen-sold products carry a real minimum (50 dz for
    // economy wash cloths, 2 dz for most linens) that the cart enforces.
    moq: Number(row.moq) || 1,
    // Mix & Match group: several otherwise-independent products (e.g. 19
    // 5-gallon chemical SKUs) can share a moqGroup tag and pool toward one
    // combined moqGroupMin instead of each carrying its own minimum. Empty
    // string (not null) so downstream `if (item.moqGroup)` checks and
    // JSON.stringify round-trips through cart storage behave the same way
    // every other optional string field on this object already does.
    moqGroup: row.moq_group || "",
    moqGroupMin: row.moq_group_min != null ? Number(row.moq_group_min) : 0,
    // Manually set by staff in Admin -> Products (RRS-31). Not inferred
    // from stock/category -- see the migration comment on
    // products.is_fast_ship for why this has to stay a human decision.
    isFastShip: !!row.is_fast_ship,
    weight: row.weight != null ? String(row.weight) : "",
    length: row.length != null ? String(row.length) : "",
    width: row.width != null ? String(row.width) : "",
    height: row.height != null ? String(row.height) : "",

    // Same algorithm as the old CSV-driven getter, computed once here
    // instead of as an accessor -- identical result, simpler to carry
    // through JSON.stringify (cart storage, data-variants attributes).
    slug: (itemNumber || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  };
}

// Cached so a page that needs the catalog for its own rendering (the
// category landing pages) shares this one request with script.js's own
// startup fetch instead of pulling all 120 products down twice.
let _catalogProductsPromise = null;

async function fetchCatalogProducts() {
  if (_catalogProductsPromise) return _catalogProductsPromise;

  _catalogProductsPromise = (async () => {
    // products_public (20260916f) is a view excluding cost_per_case,
    // landed_cost, truckload_qty and vendor_id -- this ran ?select=*
    // against the real products table, which meant anyone with dev
    // tools open could read RRS's cost and margin on every product.
    // Same columns the storefront actually uses, none of the internal
    // ones; is_active filtering already happens inside the view.
    const url = `${PRODUCTS_SUPABASE_URL}/rest/v1/products_public?select=*`;
    const res = await fetch(url, {
      headers: {
        apikey: PRODUCTS_SUPABASE_ANON,
        Authorization: `Bearer ${PRODUCTS_SUPABASE_ANON}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to load products (${res.status})`);
    const rows = await res.json();
    return rows.map(mapDbProductToLegacyShape);
  })();

  // Don't cache a rejection -- a transient network failure shouldn't
  // permanently break every later caller on the page.
  _catalogProductsPromise.catch(() => { _catalogProductsPromise = null; });

  return _catalogProductsPromise;
}

/* =========================
   ANALYTICS (GA4 ECOMMERCE)
========================= */

// GA4 was installed site-wide but only ever fired one custom event
// (generate_lead, on the volume-quote form), so there was no way to see
// what organic traffic actually did: no product views, no cart adds, no
// checkout starts. That made every SEO change unmeasurable in revenue
// terms. These helpers emit the standard GA4 ecommerce events so the
// existing property can report the funnel without any new dependency or
// tag-manager container.
//
// Deliberately sends only product/order fields (SKU, name, price, qty) --
// never customer names, emails, addresses, or payment details.
function trackEcommerce(eventName, params) {
  // gtag is loaded async per page; a missing tag must never break the cart.
  if (typeof gtag !== "function") return;
  try {
    gtag("event", eventName, params);
  } catch (err) {
    console.warn("[analytics]", eventName, "failed:", err && err.message);
  }
}

// Maps one cart/product line to GA4's `items` shape.
function gaItem(p, qty) {
  const price =
    typeof cleanPrice === "function"
      ? cleanPrice(p.price || p.price1 || 0)
      : Number(p.price || p.price1 || 0) || 0;
  const item = {
    item_id: p.itemNumber || p.sku || p.slug || "",
    item_name: p.name || "",
    price: price,
    quantity: Number(qty != null ? qty : p.quantity) || 1,
  };
  if (p.category || p.category_name) item.item_category = p.category || p.category_name;
  return item;
}

function cartValue(cart) {
  return cart.reduce((sum, i) => {
    const price =
      typeof cleanPrice === "function"
        ? cleanPrice(i.price || i.price1 || 0)
        : Number(i.price || i.price1 || 0) || 0;
    return sum + price * (Number(i.quantity) || 0);
  }, 0);
}

/* =========================
   CART HELPERS
========================= */

function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateCartBadge() {
  const cart = getCart();
  updateMoqGroupBar(cart);
  // Kept above the early return below: pages without a #cart-count badge
  // still need the panel to refresh.
  if (typeof updateMiniCart === "function") updateMiniCart();

  const cartCount = document.getElementById("cart-count");
  if (!cartCount) return;

  const totalItems = cart.reduce((total, item) => {
    return total + (Number(item.quantity) || 1);
  }, 0);

  cartCount.textContent = totalItems;
  cartCount.style.display = totalItems > 0 ? "flex" : "none";
}

// Floating bottom bar showing live progress toward any Mix & Match group's
// combined minimum -- only appears once the cart actually holds an item
// from a grouped product, and lists every such group at once (a cart can
// hold items from more than one Mix & Match group simultaneously). Built
// lazily so pages that never touch a grouped product (most of the site)
// never pay for it.
function updateMoqGroupBar(cart) {
  const groups = cartMoqGroupTotals(cart || getCart());
  let bar = document.getElementById("moqGroupBar");

  if (!groups.length) {
    if (bar) bar.style.display = "none";
    return;
  }

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "moqGroupBar";
    bar.className = "moq-group-bar";
    document.body.appendChild(bar);
  }

  bar.innerHTML = groups.map(g => {
    // metExactly, not "have >= min": the group must land on a whole
    // multiple (36, 72, 108...), so 40/36 is still short -- of 32, to
    // reach 72 -- not "met". Progress within the current multiple, so the
    // bar fills 0->100% between each target rather than jumping straight
    // to 100% and staying there for every quantity past the first 36.
    const met = g.metExactly;
    const prevTarget = g.nextTarget - g.min;
    const pct = g.min > 0
      ? Math.min(100, Math.round(((g.have - prevTarget) / g.min) * 100))
      : 100;
    const label = met
      ? `${g.have} units — multiple of ${g.min} met`
      : `${g.have} / ${g.nextTarget} units`;
    return `
      <div class="moq-group-bar-row${met ? " met" : ""}">
        <div class="moq-group-bar-label">
          <strong>${g.group}</strong> Mix &amp; Match
          <span>${label}</span>
        </div>
        <div class="moq-group-bar-track"><div class="moq-group-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join("");
  bar.style.display = "flex";
}

function cleanPrice(price) {
  return Number(
    String(price || "")
      .replace("$", "")
      .replace(",", "")
      .trim()
  ) || 0;
}

/**
 * A product is only shown if it carries a price we can actually charge.
 * Rows awaiting supplier cost (all four price columns blank) would otherwise
 * render as $0.00 and be addable to the cart, letting someone check out for
 * nothing. Filtering at the single point where the catalog is parsed keeps
 * them out of the grid, product pages, featured rail, and search at once.
 * The rows stay in products.csv -- they reappear automatically once priced.
 */
function isSellable(p) {
  return cleanPrice(p.price)  > 0 ||
         cleanPrice(p.price1) > 0 ||
         cleanPrice(p.price2) > 0 ||
         cleanPrice(p.price3) > 0;
}

// Is this product sold by the dozen (flat rate, minimum order) rather
// than by the case with volume tiers? Single definition, because the
// product page, the cart, the checkout summary and the admin quote
// composer all have to agree -- if any one of them disagreed, a customer
// would be shown one price and charged another.
function isSoldByDozen(p) {
  return String(p && (p.priceBy || p.unit) || "").trim().toLowerCase() === "dozen";
}

// Minimum order, in whatever unit the product is sold by. Anything sold
// by the case or each has no minimum beyond one.
function productMoq(p) {
  const m = Number(p && p.moq);
  return Number.isFinite(m) && m > 0 ? Math.round(m) : 1;
}

// Blocks checkout while any dozen-sold line sits below its minimum. The
// quantity control steps by the minimum, so this should not normally
// trigger -- but a cart persists in localStorage across visits, and a
// minimum can change after an item was added, so the check has to live
// where the order is actually placed rather than only where it is built.
function enforceCartMinimums(cart) {
  const btn = document.getElementById("cartCheckoutBtn");
  const warn = document.getElementById("cartMoqWarning");
  if (!btn && !warn) return [];

  // Below the case minimum, OR not a whole multiple of it -- a cart
  // persists in localStorage, so a partial-case quantity added before this
  // check existed (or a minimum that changed since) has to be caught here,
  // not just prevented at the +/- buttons.
  const below = (cart || []).filter(i => {
    if (!isSoldByDozen(i)) return false;
    const moq = productMoq(i);
    const qty = Number(i.quantity) || 0;
    return qty < moq || qty % moq !== 0;
  });

  const groupShortfalls = cartMoqGroupShortfalls(cart);

  if (warn) {
    const hasAny = below.length || groupShortfalls.length;
    warn.style.display = hasAny ? "" : "none";
    if (hasAny) {
      const lines = [];
      if (below.length) {
        const describe = i => {
          const moq = productMoq(i);
          const qty = Number(i.quantity) || 0;
          return qty < moq
            ? `${i.name} &mdash; must order at least ${moq} dozen`
            : `${i.name} &mdash; must be a whole multiple of ${moq} dozen (currently ${qty})`;
        };
        lines.push(below.length === 1
          ? `<strong>${below[0].name}</strong> ${describe(below[0]).split(' &mdash; ')[1]}. Please adjust the quantity to continue.`
          : `${below.length} items need adjusting:<br>` + below.map(i => `&bull; ${describe(i)}`).join("<br>"));
      }
      groupShortfalls.forEach(g => {
        const msg = g.have < g.min
          ? `<strong>${g.group}</strong> Mix &amp; Match minimum not met: need ${g.min} combined units, cart has ${g.have}. Add ${g.needed} more from this group to continue.`
          : `<strong>${g.group}</strong> Mix &amp; Match must be ordered in multiples of ${g.min}: cart has ${g.have} combined units. Add ${g.needed} more (to reach ${g.nextTarget}) or remove some to continue.`;
        lines.push(msg);
      });
      warn.innerHTML = lines.join("<br>");
    }
  }
  if (btn) {
    if (below.length || groupShortfalls.length) {
      btn.setAttribute("aria-disabled", "true");
      btn.style.pointerEvents = "none";
      btn.style.opacity = ".55";
    } else {
      btn.removeAttribute("aria-disabled");
      btn.style.pointerEvents = "";
      btn.style.opacity = "";
    }
  }
  return below;
}

// Combined quantity in the cart for every Mix & Match group represented
// there, regardless of how many distinct SKUs from that group are present --
// this is the whole point of the feature: 19 different 5-gallon chemical
// SKUs sharing one 36-unit minimum instead of each needing its own.
//
// The group must land on a whole MULTIPLE of its minimum, not just meet or
// exceed it once -- 36 units clears it, 40 does not (it is short 32 more
// to reach 72), same as a single dozen-sold product already has to be a
// whole multiple of its own case size (isSoldByDozen()/productMoq() below,
// checked in enforceCartMinimums()). A combined pool that stopped
// enforcing multiples the moment it crossed the minimum once would let a
// group satisfy 36 and then take any number after that with no rule at
// all, which is not what "fulfills 36, additional requires another 36"
// means.
function cartMoqGroupTotals(cart) {
  const totals = {};
  (cart || []).forEach(i => {
    if (!i.moqGroup) return;
    const key = i.moqGroup;
    if (!totals[key]) totals[key] = { group: key, min: Number(i.moqGroupMin) || 0, have: 0 };
    totals[key].have += Number(i.quantity) || 0;
    // Every row tagged into the same group is expected to carry the same
    // minimum (enforced at data-entry time in admin.js); if they somehow
    // disagree, use the largest so the requirement is never under-enforced.
    totals[key].min = Math.max(totals[key].min, Number(i.moqGroupMin) || 0);
  });
  return Object.values(totals).map(g => {
    if (g.min <= 0) return { ...g, nextTarget: 0, needed: 0, metExactly: true };
    // 0 have -> next target is the minimum itself, not 0.
    const nextTarget = g.have === 0 ? g.min : Math.ceil(g.have / g.min) * g.min;
    const metExactly = g.have > 0 && g.have % g.min === 0;
    return { ...g, nextTarget, needed: metExactly ? 0 : nextTarget - g.have, metExactly };
  });
}

function cartMoqGroupShortfalls(cart) {
  return cartMoqGroupTotals(cart).filter(g => g.min > 0 && !g.metExactly);
}

// The automatic tiers stop here. 1-5 / 6-29 / 30-49 cases are priced by
// the table below with no human involved; at 50+ the customer still gets
// the tier-3 price automatically, but there is a further discount that
// sales negotiates per account rather than the site applying it. So this
// is the point where the UI starts telling them to get in touch -- it is
// NOT another price band, and getTierPrice() deliberately does not branch
// on it. See bulkVolumeNote() for the message.
const BULK_VOLUME_MIN_CASES = 50;

// Reorder Program discount: 5% off the whole order when the customer sets
// up a recurring schedule. Stacks on top of the per-item volume tiers --
// tiers set the per-case rate, this comes off the resulting subtotal.
//
// Duplicated (not shared by import -- this file is a plain browser script)
// in api/_lib/price-cart.js, which is what actually charges the card. If
// the rate changes it MUST change in both, or the customer is shown one
// number and charged another.
const REORDER_DISCOUNT_RATE = 0.05;
const REORDER_DISCOUNT_LABEL = "5%";

// A cart line counts toward the reorder discount when it carries a real
// recurring schedule. "Once" (and an absent value) is a one-time buy.
function isReorderLine(item) {
  const r = String(item && item.reorder || "").trim().toLowerCase();
  return !!r && r !== "once";
}

// True when ANY line in the cart is on a reorder schedule. The discount is
// described to customers as "5% off your order", so it applies to the
// whole subtotal rather than only the recurring lines -- matching the copy
// on the product page and in the cart.
function cartHasReorder(cart) {
  return (cart || []).some(isReorderLine);
}

// The discount in dollars for a given subtotal, rounded to cents so every
// surface that displays it agrees to the penny.
function reorderDiscountAmount(subtotal, cart) {
  if (!cartHasReorder(cart)) return 0;
  return Math.round(Number(subtotal) * REORDER_DISCOUNT_RATE * 100) / 100;
}

// True when a line qualifies for the negotiated 50+ discount. Dozen-sold
// products are excluded for the same reason they skip the case tiers
// below: their quantity counts dozens, not cases, so 50 of them is not
// the 50-case order this threshold is about.
function qualifiesForBulkVolume(item) {
  if (!item || isSoldByDozen(item)) return false;
  return (Number(item.quantity) || 0) >= BULK_VOLUME_MIN_CASES;
}

function getTierPrice(item) {
  const qty = Number(item.quantity) || 1;

  const tier1 = cleanPrice(item.price1);
  const tier2 = cleanPrice(item.price2);
  const tier3 = cleanPrice(item.price3);
  const base = cleanPrice(item.price);

  // Dozen-sold products charge one flat rate at every quantity. The
  // case-quantity thresholds below must not apply to them: a customer
  // ordering 50 dozen would otherwise cross the "30+ cases" line and be
  // charged a volume price that no longer exists. The reseed writes the
  // same figure into all three tier fields, so this is belt and braces --
  // but the two must never disagree.
  if (isSoldByDozen(item)) {
    return tier1 || base || 0;
  }

  // Tier 3 is "30-49 cases" in the copy, but there is deliberately no
  // upper bound here: a 50+ order still pays this price automatically.
  // The difference at 50+ is an additional negotiated discount applied by
  // sales, not a different rate the cart can compute on its own.
  if (qty >= 30) {
    return tier3 || tier2 || tier1 || base || 0;
  }

  if (qty >= 6) {
    return tier2 || tier1 || base || 0;
  }

  return tier1 || base || 0;
}

/* =========================
   CATALOG PRODUCTS
========================= */

function injectVariantCSS() {
  if (document.getElementById('variant-css')) return;
  const style = document.createElement('style');
  style.id = 'variant-css';
  style.textContent = `
    /* -- Catalog card pills -- */
    .variant-selector {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin: 10px 0 12px;
    }
    .variant-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      border: 1.5px solid #d8dce3;
      border-radius: 6px;
      background: #f2f3f5;
      font-size: 11.5px;
      font-weight: 500;
      color: #505a68;
      cursor: pointer;
      white-space: nowrap;
      line-height: 1.3;
      letter-spacing: 0.01em;
      user-select: none;
      transition: border-color 0.18s cubic-bezier(0.2,0,0.2,1),
                  background  0.18s cubic-bezier(0.2,0,0.2,1),
                  color       0.18s cubic-bezier(0.2,0,0.2,1),
                  box-shadow  0.18s cubic-bezier(0.2,0,0.2,1);
    }
    .variant-pill:hover {
      border-color: #1a6b4a;
      background: #eaf3ee;
      color: #1a6b4a;
    }
    .variant-pill:focus-visible {
      outline: 2px solid #1a6b4a;
      outline-offset: 2px;
    }
    .variant-pill.active {
      border-color: #1a6b4a;
      background: #1a6b4a;
      color: #fff;
      font-weight: 600;
      box-shadow: 0 2px 6px rgba(10, 50, 30, 0.22);
    }

    /* -- Product page pills – larger, with a header label -- */
    #product-variant-selector {
      margin: 16px 0 20px;
    }
    .variant-option-label {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #8a95a3;
      margin-bottom: 9px;
    }
    #product-variant-selector .variant-selector {
      gap: 8px;
      margin: 0;
    }
    #product-variant-selector .variant-pill {
      padding: 8px 16px;
      font-size: 13px;
      border-radius: 7px;
      border-width: 1.5px;
    }
    #product-variant-selector .variant-pill.active {
      box-shadow: 0 3px 10px rgba(10, 50, 30, 0.22);
    }

    @media (max-width: 600px) {
      #product-variant-selector .variant-pill {
        padding: 7px 13px;
        font-size: 12px;
      }
      .variant-pill {
        font-size: 11px;
        padding: 4px 9px;
      }
      .variant-selector {
        gap: 5px;
      }
    }
  `;
  document.head.appendChild(style);
}

function renderSingleCard(product) {
  const displayPrice = cleanPrice(product.price);
  const cartPrice = cleanPrice(product.price1) || cleanPrice(product.price);
  const price = displayPrice || cartPrice;
  return `
    <div class="product-card" data-url="/product?item=${encodeURIComponent(product.slug)}">
      <div class="product-image">
        ${product.moqGroup ? `<span class="moq-group-badge">MIX &amp; MATCH MOQ: ${product.moqGroupMin}</span>` : ""}
        ${product.isFastShip ? `<span class="fast-ship-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>Fast Delivery</span>` : ""}
        <img src="${product.image}" alt="${product.name}" onerror="this.src='/assets/img/product-placeholder.svg'">
      </div>
      <div class="product-content">
        ${product.productTier ? `<span class="tier-badge">${product.productTier}</span>` : ""}
        <h3>${product.name}</h3>
        <p class="product-description">${product.description || ""}</p>
        <div class="product-details">
          <div class="detail-item">
            <img src="assets/icons/box.svg" alt="">
            <span data-field="caseQty">Case Qty: ${product.caseQty || ""}</span>
          </div>
          <div class="detail-item">
            <img src="assets/icons/pack.svg" alt="">
            <span data-field="packSize">Pack Size: ${product.size || ""}</span>
          </div>
        </div>
        <div class="product-bottom">
          <div class="price-block">
            <div class="price-row">
              <span class="price">$${price.toFixed(2)}</span>
              <span class="unit">/ ${product.priceBy || "Case"}</span>
            </div>
          </div>
          <button
            class="add-btn"
            data-item="${product.itemNumber}"
            data-name="${product.name}"
            data-description="${(product.description || "").replace(/"/g, "&quot;")}"
            data-price="${cartPrice}"
            data-price1="${cleanPrice(product.price1)}"
            data-price2="${cleanPrice(product.price2)}"
            data-price3="${cleanPrice(product.price3)}"
            data-unit="${product.priceBy || ''}"
            data-moq="${productMoq(product)}"
            data-moq-group="${product.moqGroup || ''}"
            data-moq-group-min="${product.moqGroupMin || ''}"
            data-image="${product.image}"
          >
            Add to Order
          </button>
          <button
            class="quote-add-btn"
            data-item="${product.itemNumber}"
            data-name="${product.name}"
            data-image="${product.image}"
            title="Request volume pricing for this product"
          >
            Get Volume Price
          </button>
        </div>
      </div>
    </div>`;
}

// Cheapest and dearest across a family, using the same price resolution the
// cards use (display price, falling back to tier 1).
function variantPriceRange(variants) {
  const prices = variants
    .map(v => cleanPrice(v.price) || cleanPrice(v.price1) || 0)
    .filter(n => n > 0);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function renderVariantCard(variants) {
  const v = variants[0];
  const displayPrice = cleanPrice(v.price);
  const cartPrice = cleanPrice(v.price1) || cleanPrice(v.price);
  const price = displayPrice || cartPrice;

  const variantsData = variants.map(vv => ({
    itemNumber: vv.itemNumber,
    name: vv.name,
    description: vv.description || "",
    image: vv.image,
    caseQty: vv.caseQty || "",
    size: vv.size || "",
    price: vv.price,
    price1: vv.price1,
    price2: vv.price2,
    price3: vv.price3,
    priceBy: vv.priceBy || "",
    slug: vv.slug,
    variantLabel: vv.variantLabel || vv.size || "",
    colorGroup:   vv.colorGroup  || "",
    colorLabel:   vv.colorLabel  || "",
    // Carried so a variant switch can update the Mix & Match badge and the
    // add-to-cart minimums. Their absence was a real bug: applyVariantToCard
    // rewrote data-moq/data-moq-group from fields that were never in here,
    // so switching size silently kept the previous variant's minimum.
    productFamily: vv.productFamily || "",
    productTier:   vv.productTier   || "",
    moq:           productMoq(vv),
    moqGroup:      vv.moqGroup    || "",
    moqGroupMin:   vv.moqGroupMin || "",
    // RRS-31: carried per-variant, same as everything else here -- a
    // family can mix flagged and unflagged SKUs (e.g. one size confirmed
    // fast-ship, another not yet), so this must follow the selected
    // variant rather than be read once from variants[0].
    isFastShip:    !!vv.isFastShip,
  }));

  const escapedJson = JSON.stringify(variantsData)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  // Size pills: deduplicate by variantLabel, keep only the first (default/Tan) per size
  const hasColors = variants.some(vv => vv.colorLabel);
  const seenLabels = new Map();
  variants.forEach((vv, i) => {
    const label = vv.variantLabel || vv.size || "Option " + (i + 1);
    if (!seenLabels.has(label)) seenLabels.set(label, i);
  });
  const dedupedVariants = variants.filter((vv, i) => {
    const label = vv.variantLabel || vv.size || "Option " + (i + 1);
    return seenLabels.get(label) === i;
  });
  // One way to choose, not two. A native <select> and an "N options" button
  // sitting on the same card do the same job, and the select can only show a
  // bare label -- no thumbnail, case quantity or per-option price. The modal
  // shows all of that, so it is the single path for every family regardless
  // of how many options it has.
  //
  // Price span across the family. Shown only when the ends actually differ:
  // "$10.08 - $14.30" is information, "$10.08 - $10.08" is noise.
  const range = variantPriceRange(variants);
  const rangeHtml = range.min !== range.max
    ? `<span class="price-range">$${range.min.toFixed(2)} &ndash; $${range.max.toFixed(2)}</span>`
    : "";

  // With the dropdown gone this button is the only place the chosen option
  // is named, so it shows the current selection rather than just a count --
  // otherwise the card displays a price with nothing saying which size it
  // belongs to. The count moves to the right as a quiet hint that there is
  // more to choose from.
  const optionCount = dedupedVariants.length;
  const currentLabel = v.variantLabel || v.size || "Select option";
  const triggerHtml = optionCount > 1 ? `
    <button type="button" class="variant-trigger" aria-haspopup="dialog">
      <span class="vt-label" data-field="variantLabel">${currentLabel}</span>
      <span class="vt-count">${optionCount} options</span>
    </button>` : "";

  // Tier badge, only when the whole family shares one tier. A mixed family
  // (Bath Towel spans Economy/Premium/Ringspun) would be misrepresented by
  // any single badge, so it shows none and the modal groups by tier instead.
  const famTiers = [...new Set(variants.map(vv => vv.productTier).filter(Boolean))];
  const tierHtml = famTiers.length === 1
    ? `<span class="tier-badge">${famTiers[0]}</span>` : "";

  // Color pills: show unique colors (using first size's color variants as reference)
  let colorPillsHtml = "";
  if (hasColors) {
    const firstSize = dedupedVariants[0];
    const colorOptions = variants.filter(vv => vv.variantLabel === firstSize.variantLabel);
    colorPillsHtml = colorOptions.map((vv, i) =>
      `<button class="variant-pill color-pill${i === 0 ? " active" : ""}" data-vidx="${variants.indexOf(vv)}" onclick="selectVariantColor(this)">${vv.colorLabel}</button>`
    ).join("");
  }

  return `
    <div class="product-card"
         data-url="/product?item=${encodeURIComponent(v.slug)}"
         data-variants="${escapedJson}">
      <div class="product-image">
        ${v.isFastShip ? `<span class="fast-ship-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>Fast Delivery</span>` : ""}
        <img src="${v.image}" alt="${v.productFamily || v.name}" onerror="this.src='/assets/img/product-placeholder.svg'">
      </div>
      <div class="product-content">
        ${tierHtml}
        <h3>${v.productFamily || v.name}</h3>
        ${colorPillsHtml ? `<div class="variant-selector">${colorPillsHtml}</div>` : ""}
        <p class="product-description">${v.description || ""}</p>
        <div class="product-details">
          <div class="detail-item">
            <img src="assets/icons/box.svg" alt="">
            <span data-field="caseQty">Case Qty: ${v.caseQty || ""}</span>
          </div>
          <div class="detail-item">
            <img src="assets/icons/pack.svg" alt="">
            <span data-field="packSize">Pack Size: ${v.size || ""}</span>
          </div>
        </div>
        <div class="product-bottom">
          ${triggerHtml}
          <div class="price-block">
            ${rangeHtml}
            <div class="price-row">
              <span class="price">$${price.toFixed(2)}</span>
              <span class="unit">/ ${v.priceBy || "Case"}</span>
            </div>
          </div>
          <button
            class="add-btn"
            data-item="${v.itemNumber}"
            data-name="${v.name}"
            data-description="${(v.description || "").replace(/"/g, "&quot;")}"
            data-price="${cartPrice}"
            data-price1="${cleanPrice(v.price1)}"
            data-price2="${cleanPrice(v.price2)}"
            data-price3="${cleanPrice(v.price3)}"
            data-unit="${v.priceBy || ''}"
            data-moq="${productMoq(v)}"
            data-moq-group="${v.moqGroup || ''}"
            data-moq-group-min="${v.moqGroupMin || ''}"
            data-image="${v.image}"
          >
            Add to Order
          </button>
          <button
            class="quote-add-btn"
            data-item="${v.itemNumber}"
            data-name="${v.name}"
            data-image="${v.image}"
            title="Request volume pricing for this product"
          >
            Get Volume Price
          </button>
        </div>
      </div>
    </div>`;
}

// Shared by both the size dropdown and (indirectly, via selectVariantColor)
// the color pills -- one place that updates everything on the card for
// whichever variant is now current, so the two controls can never drift
// out of sync with each other.
function applyVariantToCard(card, v) {
  const displayPrice = cleanPrice(v.price);
  const cartPrice = cleanPrice(v.price1) || cleanPrice(v.price);
  const price = displayPrice || cartPrice;

  const priceEl = card.querySelector(".price");
  if (priceEl) priceEl.textContent = "$" + price.toFixed(2);

  const unitEl = card.querySelector(".unit");
  if (unitEl) unitEl.textContent = "/ " + (v.priceBy || "Case");

  const img = card.querySelector(".product-image img");
  if (img) img.src = v.image;

  // RRS-31: follows the selected variant, since a family can mix flagged
  // and unflagged SKUs. Toggled rather than left from initial render, or
  // switching to/from a flagged variant would show a stale badge state.
  const imageWrap = card.querySelector(".product-image");
  if (imageWrap) {
    let badge = imageWrap.querySelector(".fast-ship-badge");
    if (v.isFastShip && !badge) {
      imageWrap.insertAdjacentHTML("afterbegin",
        `<span class="fast-ship-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>Fast Delivery</span>`);
    } else if (!v.isFastShip && badge) {
      badge.remove();
    }
  }

  const descEl = card.querySelector(".product-description");
  if (descEl) descEl.textContent = v.description || "";

  // Addressed by data-field rather than by position. These used to be
  // querySelectorAll(".detail-item span")[0] and [1], which silently wrote
  // the wrong values the moment anything was added to or reordered within
  // .product-details -- and breaks outright once the row moves elsewhere.
  const caseEl = card.querySelector('[data-field="caseQty"]');
  if (caseEl) caseEl.textContent = "Case Qty: " + (v.caseQty || "");

  const packEl = card.querySelector('[data-field="packSize"]');
  if (packEl) packEl.textContent = "Pack Size: " + (v.size || "");

  // The options button names the current selection, so it has to follow it.
  const labelEl = card.querySelector('[data-field="variantLabel"]');
  if (labelEl) labelEl.textContent = v.variantLabel || v.size || "Select option";

  card.dataset.url = "/product?item=" + encodeURIComponent(v.slug);

  const btn = card.querySelector(".add-btn");
  if (btn) {
    btn.dataset.item        = v.itemNumber;
    btn.dataset.name        = v.name;
    btn.dataset.description = v.description;
    btn.dataset.price       = cartPrice;
    btn.dataset.price1      = cleanPrice(v.price1);
    btn.dataset.price2      = cleanPrice(v.price2);
    btn.dataset.price3      = cleanPrice(v.price3);
    btn.dataset.image       = v.image;
    // Minimums travel with the variant. Previously these were left at the
    // first variant's values, so switching size could let a customer order
    // below the selected SKU's real minimum.
    if (v.moq != null)        btn.dataset.moq         = v.moq;
    btn.dataset.moqGroup    = v.moqGroup    || "";
    btn.dataset.moqGroupMin = v.moqGroupMin || "";
  }

  const qBtn = card.querySelector(".quote-add-btn");
  if (qBtn) {
    qBtn.dataset.item  = v.itemNumber;
    qBtn.dataset.name  = v.name;
    qBtn.dataset.image = v.image;
  }
}

// Switches color while keeping the current selected size
function selectVariantColor(pillEl) {
  const card = pillEl.closest(".product-card");
  const variants = JSON.parse(card.dataset.variants);
  const colorVariant = variants[parseInt(pillEl.dataset.vidx)];
  if (!colorVariant) return;

  // Update color pills active state
  card.querySelectorAll(".color-pill").forEach(p => {
    p.classList.toggle("active", p === pillEl);
  });

  // Resolve the variant matching the currently selected size in this new
  // color. The card's data-url always points at whichever variant is
  // showing -- applyVariantToCard keeps it current -- so it survives the
  // size dropdown's removal and works whether the size was picked from the
  // modal or is simply the default.
  const currentSlug = decodeURIComponent((card.dataset.url || "").split("item=")[1] || "");
  const activeSize = variants.find(vv => vv.slug === currentSlug) || variants[0];
  const target = variants.find(vv =>
    vv.variantLabel === activeSize?.variantLabel && vv.colorLabel === colorVariant.colorLabel
  ) || colorVariant;

  // Route through the single mutation point instead of hand-patching a few
  // datasets. The old version updated only the image, URL and two buttons,
  // so picking a different color left the PREVIOUS color's price,
  // description and case quantity on the card -- visibly wrong whenever
  // colors were not priced identically.
  applyVariantToCard(card, target);
}

// Renders grouped, variant-aware cards into any grid element. Extracted from
// renderProducts so the 9 category pages can share it: each used to carry its
// own ~40-line renderer emitting a plain link card with no grouping, so the
// same product appeared once per size there -- the redundancy was worse on
// those pages than on the catalog.
function renderProductGrid(products, grid) {
  if (!grid) return;

  grid.innerHTML = "";
  injectVariantCSS();

  const priced = products.filter(p =>
    cleanPrice(p.price1) > 0 || cleanPrice(p.price2) > 0 ||
    cleanPrice(p.price3) > 0 || cleanPrice(p.price) > 0
  );

  const familyGroups = new Map();
  const order = [];
  let soloIdx = 0;

  priced.forEach(p => {
    if (p.productFamily) {
      if (!familyGroups.has(p.productFamily)) {
        familyGroups.set(p.productFamily, []);
        order.push(p.productFamily);
      }
      familyGroups.get(p.productFamily).push(p);
    } else {
      const key = "__solo_" + soloIdx++;
      familyGroups.set(key, [p]);
      order.push(key);
    }
  });

  const html = order.map(key => {
    const variants = familyGroups.get(key);
    return variants.length === 1
      ? renderSingleCard(variants[0])
      : renderVariantCard(variants);
  }).join("");
  grid.innerHTML = html;

  setupProductCardClicks();
  setupAddToCartButtons();
  setupQuoteButtons();
}

function renderProducts(products) {
  renderProductGrid(products, document.getElementById("products-grid"));
}

function setupProductCardClicks() {
  document.querySelectorAll(".product-card").forEach(card => {
    card.onclick = e => {
      if (e.target.closest(".add-btn")) return;
      if (e.target.closest(".variant-pill")) return;
      // Opens the options modal instead of navigating. Must come before the
      // navigation below, or the card swallows the click and leaves the page.
      if (e.target.closest(".variant-trigger")) { openVariantModal(card); return; }

      const url = card.dataset.url;
      if (url) {
        window.location.href = url;
      }
    };
  });
}

/* =========================
   MODAL STACK
========================= */

// Escape used to be handled by a single document listener that closed the
// contact modal unconditionally, whether or not it was open. With more than
// one modal that means every open dialog closes at once, and whichever
// closes last wins the body-scroll reset. The stack makes Escape close only
// the topmost dialog, and only unlocks scrolling once nothing is left open.
const _modalStack = [];

function pushModal(closeFn) {
  _modalStack.push(closeFn);
  document.body.style.overflow = "hidden";
}

function popModal(closeFn) {
  const i = _modalStack.lastIndexOf(closeFn);
  if (i !== -1) _modalStack.splice(i, 1);
  if (!_modalStack.length) document.body.style.overflow = "";
}

document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !_modalStack.length) return;
  _modalStack[_modalStack.length - 1]();
});

/* =========================
   VARIANT OPTIONS MODAL
========================= */

let _vmLastFocus = null;

function vmEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Built once and reused, rather than one shell per card.
function ensureVariantModal() {
  let el = document.getElementById("variantModal");
  if (el) return el;

  el = document.createElement("div");
  el.id = "variantModal";
  el.className = "vm-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "vmTitle");
  el.hidden = true;
  el.innerHTML = `
    <div class="vm-modal">
      <div class="vm-header">
        <div>
          <p class="vm-eyebrow">Choose an option</p>
          <h2 class="vm-title" id="vmTitle"></h2>
        </div>
        <button type="button" class="vm-close" aria-label="Close">&times;</button>
      </div>
      <div class="vm-body"></div>
    </div>`;
  document.body.appendChild(el);

  el.querySelector(".vm-close").addEventListener("click", closeVariantModal);
  el.addEventListener("click", e => { if (e.target === el) closeVariantModal(); });

  // Focus trap. The site's other modals have none, so Tab walks out of the
  // dialog and into the page behind it.
  el.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const f = el.querySelectorAll('button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  return el;
}

function openVariantModal(card) {
  let variants;
  try { variants = JSON.parse(card.dataset.variants || "[]"); } catch { return; }
  if (!variants.length) return;

  const el = ensureVariantModal();
  const titleEl = card.querySelector("h3");
  el.querySelector(".vm-title").textContent = titleEl ? titleEl.textContent : "Options";

  // Group by tier only when the family actually spans more than one, so a
  // single-tier product doesn't get a pointless section heading.
  const tiers = [...new Set(variants.map(v => v.productTier).filter(Boolean))];
  const grouped = tiers.length > 1;

  const rowFor = v => {
    const price = cleanPrice(v.price) || cleanPrice(v.price1) || 0;
    const bits = [];
    if (v.caseQty) bits.push(`Case qty ${vmEsc(v.caseQty)}`);
    if (v.size)    bits.push(`Pack ${vmEsc(v.size)}`);
    return `
      <button type="button" class="vm-row" data-slug="${vmEsc(v.slug)}">
        <img class="vm-row-img" src="${vmEsc(v.image)}" alt=""
             onerror="this.src='/assets/img/product-placeholder.svg'">
        <span class="vm-row-main">
          <span class="vm-row-label">${vmEsc(v.variantLabel || v.name)}</span>
          ${bits.length ? `<span class="vm-row-meta">${bits.join(" &middot; ")}</span>` : ""}
        </span>
        <span class="vm-row-price">$${price.toFixed(2)}<small>/ ${vmEsc(v.priceBy || "Case")}</small></span>
      </button>`;
  };

  let body;
  if (grouped) {
    const order = ["Economy", "Premium", "Suites", "Ringspun", "Luxury", "Hospitality", "Wrinkle-Free"];
    const sorted = [...tiers].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    body = sorted.map(t => `
      <div class="vm-group">
        <p class="vm-group-label">${vmEsc(t)}</p>
        ${variants.filter(v => v.productTier === t).map(rowFor).join("")}
      </div>`).join("");
    const untiered = variants.filter(v => !v.productTier);
    if (untiered.length) body += `<div class="vm-group">${untiered.map(rowFor).join("")}</div>`;
  } else {
    body = variants.map(rowFor).join("");
  }
  el.querySelector(".vm-body").innerHTML = body;

  // Selecting an option applies it to the card, exactly as the dropdown
  // does, and keeps the dropdown in sync so the two never disagree.
  el.querySelectorAll(".vm-row").forEach(row => {
    row.addEventListener("click", () => {
      const idx = variants.findIndex(v => v.slug === row.dataset.slug);
      if (idx === -1) return;
      applyVariantToCard(card, variants[idx]);
      closeVariantModal();
    });
  });

  _vmLastFocus = document.activeElement;
  el.hidden = false;
  pushModal(closeVariantModal);
  el.querySelector(".vm-close").focus();
}

function closeVariantModal() {
  const el = document.getElementById("variantModal");
  if (!el || el.hidden) return;
  el.hidden = true;
  popModal(closeVariantModal);
  if (_vmLastFocus && document.contains(_vmLastFocus)) _vmLastFocus.focus();
  _vmLastFocus = null;
}

/* search is now handled by applyFilters() in the CATEGORY FILTERS section */

/* =========================
   CATEGORY FILTERS
========================= */

// Keywords matched against product name + description for each category
// Products matching these keywords are pinned to the top of the default catalog view
const PRIORITY_KEYWORDS = [
  'paper towel', 'kitchen towel', 'hardwound', 'roll towel',
  'center pull', 'multifold', 'facial tissue',
  'bath tissue', 'bathroom tissue', 'toilet tissue', 'toilet paper', 'bath roll',
];

function getProductPriority(p) {
  const hay = (p.name + ' ' + (p.description || '')).toLowerCase();
  return PRIORITY_KEYWORDS.some(kw => hay.includes(kw)) ? 0 : 1;
}

/* Default (unfiltered, unsearched) catalog order. Previously just
   getProductPriority -- pin paper towels/tissue first, everything else
   left in whatever order the database happened to return, which was
   never a real sort (no ORDER BY on the fetch) and put unrelated
   products between the sizes of the same sheet, e.g. a Bleach Cleaner
   card between two 600 Wrinkle-Free Flat Sheet cards. Same problem
   renderProductGrid's family-grouping already solves WITHIN a family --
   this solves it BETWEEN families, so related families sit next to each
   other instead of the grid falling back to database order at that level.

   category -> family -> tier -> name, all columns the products table
   already carries (mapDbProductToLegacyShape) -- no schema change, and
   it stays correct automatically as products are added, unlike a
   hand-maintained display_order a human has to remember to set.
   A product with no family falls back to its own name as the family
   key, so a solo product still sorts predictably instead of every
   family-less product colliding at the same "" key. */
// Family -> tier -> name, the part of the hierarchy shared by both the
// unfiltered default view (which also sorts by category first) and a
// single-category filtered view (where every product already shares one
// category, so there's nothing left to sort by at that level).
function compareCatalogFamily(a, b) {
  const famA = a.productFamily || a.name || '';
  const famB = b.productFamily || b.name || '';
  const fam = famA.localeCompare(famB);
  if (fam !== 0) return fam;

  const tier = (a.productTier || '').localeCompare(b.productTier || '');
  if (tier !== 0) return tier;

  return (a.name || '').localeCompare(b.name || '');
}

function sortCatalogDefault(products) {
  return products.slice().sort((a, b) => {
    const pri = getProductPriority(a) - getProductPriority(b);
    if (pri !== 0) return pri;

    const cat = (a.category || '').localeCompare(b.category || '');
    if (cat !== 0) return cat;

    return compareCatalogFamily(a, b);
  });
}

/**
 * Turn a supplier category name into the URL/filter slug used by the
 * catalog checkboxes and the category landing pages.
 * "Bed Sheets & Linens" -> "bed-sheets-linens"
 */
function categorySlug(name) {
  return String(name || "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// SEO Roadmap Day 19: internal linking pass. A category's buying guide,
// keyed by category slug -- hand-maintained rather than a live query
// (only 3 articles exist as of Day 18; a live "does an article mention
// this category" lookup would be overkill for a handful of entries).
// Extend this map each time a new cornerstone article ships (Day 21+).
// Used by both product-template.html (product -> guide) and the 9
// category pages (category -> guide) so the link only ever appears
// where a real, relevant article exists -- never a placeholder link.
const CATEGORY_ARTICLE_MAP = {
  "paper-products": { slug: "how-much-toilet-paper-should-a-hotel-stock", title: "How Much Toilet Paper & Paper Towels Should a Hotel Stock Per Room?" },
  "towels": { slug: "bath-towel-buying-guide-vacation-rentals-boutique-hotels", title: "Bath Towel Buying Guide for Vacation Rentals & Boutique Hotels" },
  "trash-liners-can-liners": { slug: "trash-liner-sizing-guide-right-can-liner-every-bin", title: "Trash Liner Sizing Guide: Picking the Right Can Liner for Every Bin" },
  // Day 21 additions
  "bed-sheets-linens": { slug: "hotel-bed-sheet-thread-count-guide", title: "Hotel Bed Sheet Guide: Thread Count, T-180 vs. Microfiber, and Sizing by the Case" },
  "guest-amenities": { slug: "guest-amenities-bulk-vs-individually-wrapped", title: "Guest Amenities: Bulk Dispensers vs. Individually Wrapped, and How to Order Either by the Case" },
  "gloves-ppe": { slug: "nitrile-gloves-housekeeping-teams-sizing-guide", title: "Nitrile Gloves for Housekeeping Teams: Powder-Free vs. Exam Grade, and Getting Sizing Right" },
  "cleaning-chemicals": { slug: "epa-registered-disinfectants-what-hotels-need", title: "EPA-Registered Disinfectants: What Hotels Actually Need to Stock" },
};

function getActiveCategories() {
  return Array.from(document.querySelectorAll('.category-filter:checked')).map(cb => cb.value);
}

function applyFilters() {
  const keyword   = (document.getElementById('search-input')?.value || '').toLowerCase();
  const categories = getActiveCategories();
  const sortAZ     = categories.includes('a-z');
  const catFilters = categories.filter(c => c !== 'a-z');

  let filtered = allProducts.filter(product => {
    // Search keyword match
    if (keyword) {
      const haystack = [
        product.name, product.description, product.overview,
        product.feature1, product.feature2, product.feature3, product.feature4, product.itemNumber
      ].join(' ').toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    // Category match -- product must be in at least one checked category.
    //
    // This used to keyword-match against the product's name + description +
    // overview text, which produced badly wrong results: "guest-room-supplies"
    // listed only the keyword "guest", and every product's marketing copy
    // mentions guests, so it matched 114 of 120 products (bleach, laundry
    // detergent and trash liners all appeared under it). "laundry-supplies"
    // matched bed sheets, because linen care text says "washing"/"laundering".
    // The products table now carries the real supplier category, so match on
    // that instead of guessing from prose.
    if (catFilters.length > 0) {
      if (!catFilters.includes(categorySlug(product.category))) return false;
    }

    return true;
  });

  if (sortAZ) {
    filtered = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
  } else if (catFilters.length === 0 && !keyword) {
    // Default view: pin paper towels/tissues first, then category ->
    // family -> tier -> name so related products (e.g. every 600
    // Wrinkle-Free sheet family) sit together instead of database order.
    filtered = sortCatalogDefault(filtered);
  } else if (catFilters.length > 0) {
    // One or more categories checked (these are checkboxes -- more than
    // one can be active at once). Still worth grouping by family/tier
    // within each category, and by category first when more than one is
    // checked, so this has the same "no unrelated product between two
    // sizes of the same sheet" fix as the default view, at whatever
    // scope the customer is currently browsing.
    filtered = filtered.slice().sort((a, b) => {
      const cat = (a.category || '').localeCompare(b.category || '');
      if (cat !== 0) return cat;
      return compareCatalogFamily(a, b);
    });
  }

  renderProducts(filtered);
}

// Pre-fill catalog search from ?search= URL param (powers schema.org SearchAction)
function applyCatalogSearchParam() {
  const input = document.getElementById('search-input');
  if (!input) return;
  const params = new URLSearchParams(window.location.search);
  const term = params.get('search');
  let changed = false;

  if (term) { input.value = term; changed = true; }

  // ?category=<slug> lets the category landing pages deep-link straight
  // into a pre-filtered catalog view.
  const cat = params.get('category');
  if (cat) {
    const box = document.querySelector(`.category-filter[value="${CSS.escape(cat)}"]`);
    if (box) { box.checked = true; changed = true; }
  }

  if (changed) applyFilters();
}

// Replace old search listener with unified filter handler
document.addEventListener('input', e => {
  if (e.target.id === 'search-input') applyFilters();
});

document.addEventListener('change', e => {
  if (e.target.classList.contains('category-filter')) applyFilters();
});

/* =========================
   PRODUCT PAGE
========================= */

// SEO Day 9: the previous "Wholesale <size> <name>" format (below) already
// cut titles from 140-160 chars down to ~60-85 -- an improvement, but a
// site-wide audit (tools/seo-audit.js) still found 94 of 120 product
// titles running over Google's ~60-char display limit, since many product
// names are themselves 50+ chars once brand + descriptor + type are all
// included. " | Room Ready Supply" (appended where this is used) is 20 of
// those 60 chars, leaving a 40-char budget for this function's own output.
//
// api/product-meta.js renders this same title server-side and MUST be
// kept identical -- a mismatch hands Google two titles for one URL. Every
// helper below is mirrored there too.
const SEO_TITLE_BASE_BUDGET = 40;

// Drops a trailing packaging/material spec clause introduced by " - "
// when it's followed by a comma-separated list (color, case count,
// material) -- e.g. "Wash Cloths - White, 50 Dozen Case - Made from 100%
// Durable Cotton" becomes "Wash Cloths". A single-word variant like
// "Mattress - King" is left alone (no comma after it), since that's the
// actual distinguishing size, not droppable packaging text.
function stripTitleSpecClause(name) {
  return name.replace(/\s[-–—]\s[A-Z][^,]*,.*$/, "").trim();
}

// A lone symbol (%, ×, x, &, a dash) can survive at the edge of a trim if
// its paired word got cut -- e.g. "100 % Waterproof" trimmed to just "%
// Waterproof". Strip it rather than open (or close) a title on a bare
// symbol.
function stripTitleOrphanSymbol(s) {
  return s.replace(/^[%×x&\-–—]\s+/, "").trim();
}

// Keeps both ends of the name -- the brand/first word(s) AND the trailing
// head-noun phrase (almost always the actual product type people search
// for: "...Laundry Detergent", "...Dishwashing Tabs", "...Dish Soap") --
// dropping only the descriptive middle. A pure left-to-right or
// right-to-left cut loses one or the other; this campaign of dropping the
// middle instead keeps what a buyer actually scans a title for.
function trimTitleKeepingEnds(name, maxLen) {
  if (name.length <= maxLen) return name;
  const words = name.split(" ").filter(Boolean);

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
  const result = combined.length ? combined.join(" ") : name.slice(0, maxLen).trim();
  return stripTitleOrphanSymbol(result);
}

// Shared by buildSeoTitle() (the full name, used for og:title, JSON-LD
// Product.name, and the visible on-page product heading -- none of which
// should ever be truncated, since that's customer- and crawler-facing
// product identity, not just a search-result snippet) and
// buildSeoTitleTag() (the <title> element specifically, which IS subject
// to Google's ~60-char display cut).
function computeTitleParts(p) {
  const desc = p.description || "";
  const sizeMatch = desc.match(/Size:\s*([^|]+)/);
  const sizeStr   = sizeMatch ? sizeMatch[1].trim() : (p.size || "");
  // Strip any dash variant (en dash, em dash, or plain hyphen) that
  // precedes "Wholesale Pricing" in the raw supplier name.
  const cleanName = p.name.replace(/\s*[–—-]\s*Wholesale Pricing.*$/i, "").trim();
  // Only prepend the size if the name doesn't already contain it
  // anywhere -- startsWith() missed names like "Economy 22x44 Bath
  // Towels", producing "22x44 Economy 22x44 Bath Towels".
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameAlreadyHasSize = sizeStr && norm(cleanName).includes(norm(sizeStr));
  const prefix = (sizeStr && !nameAlreadyHasSize) ? `${sizeStr} ` : "";
  return { prefix, cleanName };
}

// "Wholesale" leads because that is how B2B buyers search. Full,
// untruncated -- this is what actually identifies the product, so it's
// used everywhere except the <title> element itself (see
// buildSeoTitleTag below).
function buildSeoTitle(p) {
  const { prefix, cleanName } = computeTitleParts(p);
  return `Wholesale ${prefix}${cleanName}`;
}

// The <title> element specifically. Google displays only ~60 chars of it
// in search results; "Wholesale" survives the cut because it leads, and
// the size prefix (a dimension like `12" × 12"`, a weight like "40lb.",
// or a word like "Small"/"Standard") is reserved outside the trim budget
// and never dropped -- it's short and it's exactly the detail a B2B buyer
// uses to tell SKUs apart. Dropped terms still appear in the page's H1
// (buildSeoTitle above, untruncated), meta description and body copy, so
// nothing is lost for ranking; only the search-result display is.
// Many product names lead with their own size/weight/dimension as plain
// text -- e.g. p.name = '40lb. Performance Plus™ Low Suds Powder Laundry
// Detergent' -- rather than it living only in description/p.size. When
// that's the case, computeTitleParts' `prefix` comes back empty (correctly
// -- nameAlreadyHasSize is true, so nothing gets duplicated), which meant
// that leading size token was just another word competing for trim
// budget, and lost more often than not (confirmed against the live
// catalog: 31 of 120 products). Detect and reserve it the same way an
// explicit prefix is reserved, so it survives trimming here too.
function detectLeadingSizeToken(name) {
  const words = name.split(" ");
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const isNumericish = /\d/.test(w);
    const isDimSep = (w === "×" || w === "x") && i > 0 && /\d/.test(words[i - 1] || "");
    if (isNumericish || isDimSep) { i++; continue; }
    break;
  }
  if (i === 0) return { reserved: "", rest: name };
  return { reserved: words.slice(0, i).join(" "), rest: words.slice(i).join(" ") };
}

function buildSeoTitleTag(p) {
  const { prefix, cleanName } = computeTitleParts(p);
  const lead = "Wholesale ";

  let effectivePrefix = prefix;
  let effectiveName = cleanName;
  if (!effectivePrefix) {
    const { reserved, rest } = detectLeadingSizeToken(cleanName);
    if (reserved) { effectivePrefix = reserved + " "; effectiveName = rest; }
  }

  const nameBudget = SEO_TITLE_BASE_BUDGET - lead.length - effectivePrefix.length;
  const trimmedName = trimTitleKeepingEnds(stripTitleSpecClause(effectiveName), nameBudget);
  return `${lead}${effectivePrefix}${trimmedName}`;
}

function selectProductImage(thumbEl, src) {
  const mainImage = document.getElementById("mainProductImage");
  if (mainImage) mainImage.src = src;
  document.querySelectorAll(".thumb-row .thumb").forEach(t => t.classList.remove("active"));
  thumbEl.classList.add("active");
}

function populateProductPage(product) {
  const price = cleanPrice(product.price);

  const seoTitle = buildSeoTitle(product);
  // Mirrors api/product-meta.js's injectMeta(): an admin-set SEO Title IS
  // the full tag, no auto brand-suffix; JSON-LD's Product.name below still
  // uses the real, untruncated seoTitle regardless, so an override never
  // makes the structured data disagree with what the product actually is.
  const titleOverride = (product.metaTitle || "").trim();
  const titleTag = titleOverride || `${buildSeoTitleTag(product)} | Room Ready Supply`;
  const autoMetaDesc = (product.overview || product.description || "")
    .replace(/\s+/g, " ").trim().slice(0, 155) + (
    (product.overview || "").length > 155 ? "…" : ""
  );
  const metaDesc = (product.metaDescription || "").trim() || autoMetaDesc;
  const pageUrl = `https://www.roomreadysupply.com/product?item=${encodeURIComponent(product.slug)}`;

  document.title = titleTag;

  const setMeta = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  setMeta("metaDescription", "content", metaDesc);
  setMeta("canonicalUrl",    "href",    pageUrl);
  setMeta("ogTitle",         "content", titleOverride || seoTitle);
  setMeta("ogDescription",   "content", metaDesc);
  setMeta("ogImage",         "content", product.image);
  setMeta("ogUrl",           "content", pageUrl);

  const priceVal = price > 0 ? price.toFixed(2) : null;
  const offer = {
    "@type": "Offer",
    url: pageUrl,
    priceCurrency: "USD",
    price: priceVal,
    // Google recommends this even for prices with no planned end date --
    // an unset value is otherwise treated as "unknown" freshness. Rolling
    // 90-day window; regenerated on every page load either way.
    priceValidUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: "Room Ready Supply" }
  };

  // shipping_weight for Google Merchant Center -- kept in sync with
  // api/product-meta.js's buildProductJsonLd(). product.weight is the
  // per-case pounds value shown to shoppers as "N lbs" just below.
  // Missing it here is what disapproved every product in Shopping in
  // late Aug 2026.
  const weightLbs = Number(product.weight);
  if (weightLbs > 0) {
    offer.shippingDetails = {
      "@type": "OfferShippingDetails",
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      weight: { "@type": "QuantitativeValue", value: weightLbs, unitCode: "LBR" }
    };
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: seoTitle,
    // Deliberately autoMetaDesc, not metaDesc -- same reasoning as
    // api/product-meta.js: structured data describes the real product,
    // an SEO-copy override for search snippets shouldn't also rewrite
    // what the rich-result entry says the product literally is.
    description: autoMetaDesc,
    image: product.image,
    sku: product.itemNumber || product.slug,
    brand: { "@type": "Brand", name: "Room Ready Supply" },
    offers: offer
  };
  const ldEl = document.getElementById("productJsonLd");
  if (ldEl) ldEl.textContent = JSON.stringify(jsonLd);

  // Breadcrumb structured data, so search results can show the
  // Home > Catalog > Category > Product trail instead of a bare URL.
  const bcEl = document.getElementById("breadcrumbJsonLd");
  if (bcEl) {
    const SITE = "https://www.roomreadysupply.com";
    const trail = [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Catalog", item: SITE + "/catalog" },
    ];
    if (product.category) {
      trail.push({
        "@type": "ListItem", position: 3, name: product.category,
        item: `${SITE}/category/${categorySlug(product.category)}`,
      });
    }
    trail.push({ "@type": "ListItem", position: trail.length + 1, name: product.name, item: pageUrl });
    bcEl.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: trail,
    });
  }

  setText("breadcrumbProductName", product.name);

  // Link the breadcrumb's category segment to its landing page, but only
  // for categories that actually have one -- the thinner categories
  // (Housekeeping, Furniture) are filterable in the catalog without
  // warranting a page of their own.
  const CATEGORY_PAGES = [
    "bed-sheets-linens", "towels", "paper-products", "cleaning-chemicals",
    "pillows-mattress-protectors", "trash-liners-can-liners", "gloves-ppe", "guest-amenities",
  ];
  const catWrap = document.getElementById("breadcrumbCategoryWrap");
  const catLink = document.getElementById("breadcrumbCategory");
  if (catWrap && catLink && product.category) {
    const slug = categorySlug(product.category);
    catLink.textContent = product.category;
    catLink.href = CATEGORY_PAGES.includes(slug)
      ? `/category/${slug}`
      : `/catalog?category=${encodeURIComponent(slug)}`;
    catWrap.style.display = "";
  }

  setText("productName", seoTitle);
  setText("productItemNumber", product.itemNumber);

  // Case Qty and Size are rendered by the Specifications table below; the
  // meta line no longer repeats them.
  const tierBadge = document.getElementById("productTierBadge");
  if (tierBadge) {
    tierBadge.textContent = product.productTier || "";
    tierBadge.style.display = product.productTier ? "" : "none";
  }

  setText("productDescription", product.description);
  setText("overviewDescription", product.overview || product.description);

  // Day 19 internal link: a "Read our buying guide" callout under the
  // description, only when this product's category actually has one.
  const guideWrap = document.getElementById("productGuideLink");
  if (guideWrap) {
    const guide = CATEGORY_ARTICLE_MAP[categorySlug(product.category)];
    if (guide) {
      guideWrap.href = `/blog/post?slug=${encodeURIComponent(guide.slug)}`;
      guideWrap.querySelector(".product-guide-title").textContent = guide.title;
      guideWrap.style.display = "";
    } else {
      guideWrap.style.display = "none";
    }
  }

  setText("productPrice", `$${price.toFixed(2)}`);

  // Update "Per Case" unit label dynamically
  const pricingBoxP = document.querySelector(".pricing-box p");
  if (pricingBoxP) pricingBoxP.textContent = `Per ${product.priceBy || "Case"}`;

  setText("specName", product.name);
  setText("specItemNumber", product.itemNumber);
  setText("specCaseQty", product.caseQty);
  setText("specSize", product.size);
  setText("specPrice", `$${price.toFixed(2)}`);

  // Inject weight/dimension rows into specs table if available
  const specsTable = document.querySelector(".specs-card table");
  document.getElementById("specWeightRow")?.remove();
  document.getElementById("specDimRow")?.remove();
  if (specsTable) {
    const tbody = specsTable.querySelector("tbody") || specsTable;
    if (product.weight) {
      const wRow = document.createElement("tr");
      wRow.id = "specWeightRow";
      wRow.innerHTML = `<td>Weight</td><td>${product.weight} lbs</td>`;
      tbody.appendChild(wRow);
    }
    if (product.length || product.width || product.height) {
      const dims = [product.length, product.width, product.height].filter(Boolean).join('" × ') + '"';
      const dRow = document.createElement("tr");
      dRow.id = "specDimRow";
      dRow.innerHTML = `<td>Dimensions (in)</td><td>${dims}</td>`;
      tbody.appendChild(dRow);
    }
  }

  const t1 = cleanPrice(product.price1), t2 = cleanPrice(product.price2), t3 = cleanPrice(product.price3);
  const tierCardsEl = document.querySelector(".pricing-tier-cards");

  // The badge is hardcoded "Sold by the case" in the markup, but a good
  // number of the linens are sold by the dozen -- those pages contradicted
  // their own tier cards, which correctly said "12 Dozen". Reported as
  // "some linens say cases when it should say dozens".
  setText("productSoldByBadge", isSoldByDozen(product) ? "Sold by the dozen" : "Sold by the case");

  if (isSoldByDozen(product)) {
    // Sold by the dozen: one flat rate, no volume discount. The three
    // cards show order sizes stepping up from the minimum, not price
    // breaks -- so they deliberately avoid "VOLUME"/"BEST VALUE" wording,
    // which would promise a saving that does not exist.
    const moq  = productMoq(product);
    const rate = t1 || cleanPrice(product.price) || 0;
    [1, 2, 3].forEach(step => {
      const qty = moq * step;
      setText(`tier${step}Price`, rate ? `$${(rate * qty).toFixed(2)}` : "$--.--");
      setText(`tier${step}Label`, `${qty} Dozen`);
      setText(`tier${step}Sub`, rate ? `$${rate.toFixed(2)} per dozen` : "");
      setText(`tier${step}Badge`, step === 1 ? "MINIMUM ORDER" : `${step}× MINIMUM`);
    });
    document.getElementById("tier3Badge")?.classList.remove("best-value");
    if (tierCardsEl) tierCardsEl.style.display = rate ? "" : "none";
  } else {
    setText("tier1Price", product.price1 ? `$${cleanPrice(product.price1).toFixed(2)}` : "$--.--");
    setText("tier2Price", product.price2 ? `$${cleanPrice(product.price2).toFixed(2)}` : "$--.--");
    setText("tier3Price", product.price3 ? `$${cleanPrice(product.price3).toFixed(2)}` : "$--.--");

    if (tierCardsEl) {
      const allSame = t1 && t2 && t3 && t1 === t2 && t2 === t3;
      const noPrices = !t1 && !t2 && !t3;
      tierCardsEl.style.display = (allSame || noPrices) ? "none" : "";
    }
  }

  const altText = product.size ? `${product.name} – ${product.size}` : product.name;
  const mainImage = document.getElementById("mainProductImage");
  if (mainImage) { mainImage.src = product.image; mainImage.alt = altText; }

  // RRS-13: products can now carry extra gallery photos beyond the one
  // cover image -- .thumb-row already existed in the markup (built for
  // this) but only ever rendered one hardcoded thumbnail since no product
  // had more than one photo before. Cover image first, de-duped in case
  // it was also added to the gallery by mistake; hidden entirely when
  // there's nothing extra to show, same as before this existed.
  const thumbRow = document.querySelector(".thumb-row");
  if (thumbRow) {
    const allImages = [...new Set([product.image, ...(product.images || [])].filter(Boolean))];
    if (allImages.length > 1) {
      thumbRow.innerHTML = allImages.map((src, i) => `
        <img src="${src}" alt="${altText} – view ${i + 1}" class="thumb${i === 0 ? " active" : ""}"
          loading="lazy" onerror="this.src='/assets/img/product-placeholder.svg'"
          onclick="selectProductImage(this, '${String(src).replace(/'/g, "\\'")}')">
      `).join("");
      thumbRow.style.display = "";
    } else {
      thumbRow.innerHTML = "";
      thumbRow.style.display = "none";
    }
  }

  const featuresList = document.getElementById("featuresList");
  if (featuresList) {
    featuresList.innerHTML = [product.feature1, product.feature2, product.feature3, product.feature4]
      .filter(f => f && f.trim())
      .map(f => `<li>${f}</li>`)
      .join("");
  }

  renderProductFaq(product);

  const addBtn = document.getElementById("productAddToCart");
  if (addBtn) {
    addBtn.dataset.item        = product.itemNumber;
    addBtn.dataset.name        = product.name;
    addBtn.dataset.description = product.description || "";
    addBtn.dataset.price       = cleanPrice(product.price1) || price;
    addBtn.dataset.image       = product.image;
    addBtn.dataset.price1      = cleanPrice(product.price1);
    addBtn.dataset.price2      = cleanPrice(product.price2);
    addBtn.dataset.price3      = cleanPrice(product.price3);
    // Carried through so the quantity control and the cart can enforce the
    // minimum, and so getTierPrice() knows not to apply case volume tiers.
    addBtn.dataset.unit        = product.priceBy || "";
    addBtn.dataset.moq         = productMoq(product);
    addBtn.dataset.moqGroup    = product.moqGroup || "";
    addBtn.dataset.moqGroupMin = product.moqGroupMin || "";
  }

  // Dozen-sold products cannot be bought below their minimum, so the
  // quantity box starts there and steps by it rather than by 1.
  const qtyBox = document.getElementById("qtyValue");
  if (qtyBox) {
    const moq = isSoldByDozen(product) ? productMoq(product) : 1;
    qtyBox.min = String(moq);
    qtyBox.step = String(moq);
    qtyBox.value = String(moq);
  }
  const moqNote = document.getElementById("moqNote");
  if (moqNote) {
    const moq = productMoq(product);
    const show = isSoldByDozen(product) && moq > 1;
    moqNote.style.display = show ? "" : "none";
    if (show) moqNote.textContent = `Minimum order: ${moq} dozen`;
  }

  trackEcommerce("view_item", {
    currency: "USD",
    value: cleanPrice(product.price || product.price1) || 0,
    items: [gaItem(product, 1)],
  });
}

/**
 * Two FAQs per product, generated from that product's own real catalog
 * data (case/dozen quantity, MOQ, weight, dimensions) rather than
 * written by hand per SKU or filled with invented specifics -- this
 * runs across 110+ products, and a hand-authored FAQ set that size
 * would either be copy-pasted boilerplate or too much to keep accurate
 * as products change.
 *
 * The two questions themselves were chosen from what commercial/
 * wholesale buyers in this exact industry actually ask most, checked
 * against real buying guides (case-quantity/minimum-order sizing shows
 * up as the first question in every wholesale gloves/paper-towel guide
 * reviewed -- gloves.com, buygloves.com, Schneider Direct; shipping
 * weight/dimensions is what a facilities buyer needs before ordering to
 * plan freight, loading dock access, and storage, which is also why
 * shipping-policy.html on this site treats weight as what decides
 * parcel vs. LTL freight). A third common one for the Cleaning Chemicals
 * categories -- dilution ratios -- was deliberately left out: there is
 * no per-SKU dilution-ratio field in this data, and printing a specific
 * ratio for a specific chemical without a real source would be
 * inventing a safety-relevant number, not a reasonable default.
 */
function renderProductFaq(product) {
  const card = document.getElementById("ppFaqCard");
  const list = document.getElementById("ppFaqList");
  if (!card || !list) return;

  const dozen = isSoldByDozen(product);
  // priceBy holds the real unit string (Case/Each/Pail/Pack/Box/Pallet),
  // lowercased for a natural sentence. "Each" gets its own branch below
  // rather than being treated as a generic countable noun -- "a each" /
  // "Each each weighs" read as broken English, which the first version
  // of this function actually shipped with (caught by testing all real
  // unit values in the catalog before this went live).
  const unitRaw = dozen ? "dozen" : String(product.priceBy || product.unit || "case").trim().toLowerCase();
  const isEach = unitRaw === "each";
  // "a case" / "a pail" / "an each"(never happens, but correct if it did) --
  // real a/an, not a hardcoded "a".
  const article = /^[aeiou]/.test(unitRaw) ? "an" : "a";
  const caseQty = String(product.caseQty || "").trim();
  const moq = productMoq(product);
  const hasGroup = !!product.moqGroup;

  // Q1: case/order quantity + minimum. Mix & Match products (moqGroup
  // set) are checked FIRST and separately: their caseQty field holds the
  // GROUP's combined minimum, not a per-unit pack count (confirmed
  // against live catalog data -- several 5-gallon Pail products carry
  // moq=1, case_qty="36", moq_group_min=36, meaning "36 combined across
  // the whole tagged group," not "36 pails in this one case"). Reading
  // caseQty at face value for these would have printed a false claim
  // ("each pail contains 36").
  let q1Answer;
  if (hasGroup && product.moqGroupMin > 0) {
    q1Answer = `This item is sold by the ${unitRaw} and is part of a Mix &amp; Match group -- `
      + `combine it with other products in the same group to reach the group's combined minimum of `
      + `${product.moqGroupMin} units. Volume pricing applies automatically as the group's total grows.`;
  } else if (dozen && moq > 1) {
    q1Answer = `This item is sold by the dozen, with a minimum order of ${moq} dozen.`;
  } else if (isEach) {
    q1Answer = `This item is sold individually (each) rather than by the case. There's no minimum order beyond 1, `
      + `and volume pricing applies automatically as you order more of this item.`;
  } else if (caseQty && caseQty !== "1") {
    q1Answer = `Each ${unitRaw} contains ${caseQty}${product.size && product.size !== caseQty ? ` (${product.size})` : ""}. `
      + `There's no minimum beyond 1 ${unitRaw}, and volume pricing applies automatically as you order more of this item.`;
  } else {
    q1Answer = `This item ships as a single unit per ${unitRaw}. There's no minimum order beyond 1, and volume pricing applies automatically as you order more of this item.`;
  }
  const q1 = {
    q: isEach
      ? `Is this sold individually, and is there a minimum order?`
      : `How many come in ${article} ${unitRaw}, and is there a minimum order?`,
    a: q1Answer,
  };

  // Q2: shipping weight/dimensions -- what a facilities buyer needs to
  // plan freight, a loading dock, or storage space before ordering.
  // Always answerable -- weight/length/width/height are populated on
  // every product in this catalog (confirmed: 110/110 as of 2026-09-22).
  // "This" rather than "Each <unit>" -- isEach made "Each each weighs"
  // read as broken English; "This" is correct for every unit including
  // that one.
  const dims = [product.length, product.width, product.height].filter(Boolean);
  let q2Answer;
  if (product.weight && dims.length === 3) {
    q2Answer = `This ${unitRaw} weighs approximately ${product.weight} lbs and ships in a carton measuring `
      + `${dims.join('" × ')}". Orders are processed within 3&ndash;5 business days, then shipped as standard `
      + `parcel or palletized freight depending on order size &mdash; see our `
      + `<a href="/shipping-policy">Shipping Policy</a> for details.`;
  } else if (product.weight) {
    q2Answer = `This ${unitRaw} weighs approximately ${product.weight} lbs. Orders are processed within `
      + `3&ndash;5 business days, then shipped as standard parcel or palletized freight depending on order size `
      + `&mdash; see our <a href="/shipping-policy">Shipping Policy</a> for details.`;
  } else {
    q2Answer = `Orders are processed within 3&ndash;5 business days, then shipped as standard parcel or `
      + `palletized freight depending on order size &mdash; see our <a href="/shipping-policy">Shipping Policy</a> for details.`;
  }
  const q2 = {
    q: `How much does this weigh, and how is it shipped?`,
    a: q2Answer,
  };

  const faqs = [q1, q2];

  list.innerHTML = faqs.map(f => `
    <div class="pp-faq-item">
      <h4>${f.q}</h4>
      <p>${f.a}</p>
    </div>`).join("");
  card.style.display = "";

  // FAQPage structured data, same pattern as the category landing pages
  // (hotel-supplies-north-carolina.html etc.) -- lets a real FAQ rich
  // result show for this specific product in search, not just the
  // category page.
  let faqLd = document.getElementById("productFaqJsonLd");
  if (!faqLd) {
    faqLd = document.createElement("script");
    faqLd.type = "application/ld+json";
    faqLd.id = "productFaqJsonLd";
    document.head.appendChild(faqLd);
  }
  // Strip HTML tags for the schema's plain-text answer field -- the
  // visible answer can carry a real <a> link, but structured data should
  // hold text, not markup.
  const plainText = html => html
    .replace(/<[^>]+>/g, "")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&");
  faqLd.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": plainText(f.a) },
    })),
  });
}

function injectProductVariantSelector(variants, activeProduct) {
  const existing = document.getElementById("product-variant-selector");
  if (existing) existing.remove();

  injectVariantCSS();

  // Size pills – only show unique sizes (exclude color duplicates from same size)
  const sizeVariants = variants.filter(v => !v.colorGroup || v.colorLabel === (activeProduct.colorLabel || "Tan") || !activeProduct.colorLabel);
  const pillsHtml = sizeVariants.map(v =>
    `<button class="variant-pill${v.itemNumber === activeProduct.itemNumber ? " active" : ""}"
             data-slug="${v.slug}"
             onclick="switchProductVariant('${v.slug}')"
     >${v.variantLabel || v.size || v.name}</button>`
  ).join("");

  // Color pills – find siblings with same colorGroup
  let colorHtml = "";
  if (activeProduct.colorGroup) {
    const colorSiblings = allProducts.filter(p => p.colorGroup === activeProduct.colorGroup);
    if (colorSiblings.length > 1) {
      const colorPills = colorSiblings.map(p =>
        `<button class="variant-pill color-pill${p.itemNumber === activeProduct.itemNumber ? " active" : ""}"
                 data-slug="${p.slug}"
                 onclick="switchProductVariant('${p.slug}')"
                 title="${p.colorLabel}"
         >${p.colorLabel}</button>`
      ).join("");
      colorHtml = `
        <div class="variant-option-label" style="margin-top:12px;">Select Color</div>
        <div class="variant-selector">${colorPills}</div>
      `;
    }
  }

  const selector = document.createElement("div");
  selector.id = "product-variant-selector";
  selector.innerHTML = `
    <div class="variant-option-label">Select Option</div>
    <div class="variant-selector">${pillsHtml}</div>
    ${colorHtml}
  `;

  const descEl = document.getElementById("productDescription");
  if (descEl) descEl.parentNode.insertBefore(selector, descEl);
}

function switchProductVariant(slug) {
  let product = allProducts.find(p => p.slug === slug || p.itemNumber === slug);
  if (!product) return;

  // When switching size, preserve the current color if possible
  const currentActive = allProducts.find(p =>
    document.querySelector(`#product-variant-selector .variant-pill.active[data-slug="${p.slug}"]`)
  );
  if (currentActive && currentActive.colorLabel && product.colorGroup !== currentActive.colorGroup) {
    // User clicked a size pill – find the same color in the target size's colorGroup
    const sameColorMatch = allProducts.find(p =>
      p.productFamily === product.productFamily &&
      p.variantLabel === product.variantLabel &&
      p.colorLabel === currentActive.colorLabel
    );
    if (sameColorMatch) product = sameColorMatch;
  }

  history.pushState(null, "", "/product?item=" + encodeURIComponent(product.slug || product.itemNumber));

  document.querySelectorAll("#product-variant-selector .variant-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.slug === (product.slug || product.itemNumber));
  });

  populateProductPage(product);
}

function loadProductPage() {
  const productNameEl = document.getElementById("productName");
  if (!productNameEl) return;

  // The real content (and the "Product not found" message alike) stays
  // hidden behind a loading spinner (product-template.html's ppg-loading
  // class) until this function has actually decided what to show --
  // otherwise a slow catalog fetch briefly shows the template's raw
  // placeholder markup as if it were real data. Every return path below
  // must reveal it, success or not.
  const reveal = () => document.querySelector(".product-page")?.classList.remove("ppg-loading");

  const params = new URLSearchParams(window.location.search);
  const itemParam = params.get("item");

  if (!itemParam) {
    productNameEl.textContent = "Product not found";
    reveal();
    return;
  }

  const product = allProducts.find(p =>
    String(p.itemNumber).trim() === String(itemParam).trim() || p.slug === itemParam
  );

  if (!product) {
    productNameEl.textContent = "Product not found";
    reveal();
    return;
  }

  if (product.productFamily) {
    const siblings = allProducts.filter(p => p.productFamily === product.productFamily);
    if (siblings.length > 1) {
      injectProductVariantSelector(siblings, product);
    }
  }

  populateProductPage(product);
  reveal();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}
/* =========================
   ADD TO CART
========================= */

function setupAddToCartButtons() {
  document.querySelectorAll(".add-btn").forEach(button => {
    button.onclick = e => {
      e.preventDefault();
      e.stopPropagation();

      const qtyValue = document.getElementById("qtyValue");

      let quantity = 1;

      const itemMoq = Math.max(1, parseInt(button.dataset.moq) || 1);
      if (qtyValue && button.id === "productAddToCart") {
        quantity = Math.max(itemMoq, parseInt(qtyValue.value || qtyValue.textContent) || itemMoq);
      } else {
        // Adding straight from a catalog tile skips the quantity box, so
        // start at the minimum rather than at 1 -- otherwise a dozen-sold
        // product would land in the cart already below what we can sell.
        quantity = Math.max(quantity, itemMoq);
      }

      const product = {
        itemNumber: button.dataset.item || "",
        name: button.dataset.name || "",
        description: button.dataset.description || "",
        price: cleanPrice(button.dataset.price),
        price1: cleanPrice(button.dataset.price1) || cleanPrice(button.dataset.price),
        price2: cleanPrice(button.dataset.price2) || cleanPrice(button.dataset.price1) || cleanPrice(button.dataset.price),
        price3: cleanPrice(button.dataset.price3) || cleanPrice(button.dataset.price2) || cleanPrice(button.dataset.price1) || cleanPrice(button.dataset.price),
        image: button.dataset.image || "",
        // Stored on the line so the cart can price and validate it without
        // having to look the product up again.
        unit: button.dataset.unit || "",
        moq: itemMoq,
        moqGroup: button.dataset.moqGroup || "",
        moqGroupMin: Number(button.dataset.moqGroupMin) || 0,
        quantity: quantity
      };

      // Reorder schedule, when the product page's Reorder mode is chosen.
      // Only the product page offers it (a catalog tile has no frequency
      // picker), so anywhere else this is absent and the line is one-time.
      if (button.dataset.purchaseMode === "reorder") {
        product.reorder = document.getElementById("ppFreqSelect")?.value || "Monthly";
      }

      if (!product.name) return;

      let cart = getCart();

      const existingProduct = cart.find(item => {
        return item.itemNumber === product.itemNumber;
      });

      if (existingProduct) {
        existingProduct.quantity += quantity;
        existingProduct.price = product.price;
        existingProduct.price1 = product.price1;
        existingProduct.price2 = product.price2;
        existingProduct.price3 = product.price3;
        // Choosing Reorder on a product already in the cart upgrades that
        // line rather than silently leaving it one-time.
        if (product.reorder) existingProduct.reorder = product.reorder;
      } else {
        cart.push(product);
      }

      saveCart(cart);
      updateCartBadge();
      trackEcommerce("add_to_cart", {
        currency: "USD",
        value: (cleanPrice(product.price) || 0) * quantity,
        items: [gaItem(product, quantity)],
      });
      flyToCart(button);

      // Explicit confirmation. flyToCart's animation plus a small badge
      // was the only feedback, which buyers missed entirely -- reported
      // as "add a real add-to-cart confirmation (not just the small
      // badge)". Reuses the existing toast (role="status"/aria-live, so
      // screen readers announce it too) rather than inventing a second
      // notification style, and names the quantity and unit so the buyer
      // can see the case/each distinction actually landed as intended.
      // product.unit (from data-unit), NOT priceBy -- the object built above
      // carries `unit`; priceBy only exists on the catalog-shaped object.
      const unitWord = (product.unit || "Case") + (quantity === 1 ? "" : "s");
      showVpToast(`Added ${quantity} ${unitWord} of "${product.name}" to your order.`);

      // Momentary state on the button itself, mirroring the Volume Price
      // button's confirmation, for anyone whose eyes are on the button
      // rather than the corner of the screen.
      const originalText = button.textContent;
      const originalBg = button.style.background;
      button.textContent = "✓ Added to Order";
      button.style.background = "#16a34a";
      setTimeout(() => {
        button.textContent = originalText;
        button.style.background = originalBg;
      }, 1800);
    };
  });
}

/* =========================
   QUOTE BASKET
========================= */

function getQuoteBasket() {
  try { return JSON.parse(localStorage.getItem("quoteBasket") || "[]"); } catch { return []; }
}
function saveQuoteBasket(b) { localStorage.setItem("quoteBasket", JSON.stringify(b)); }

function updateQuoteBadge() {
  const basket = getQuoteBasket();
  const badge = document.getElementById("quoteBadge");
  if (badge) {
    badge.textContent = basket.length;
    badge.style.display = basket.length > 0 ? "flex" : "none";
  }
  renderVpBasketPanel(basket);
}

function renderVpBasketPanel(basket) {
  const panel = document.getElementById("vpBasketPanel");
  const countEl = document.getElementById("vpBasketCount");
  const listEl = document.getElementById("vpBasketItems");
  if (!panel || !listEl) return;

  panel.style.display = basket.length > 0 ? "block" : "none";
  if (countEl) countEl.textContent = basket.length;

  listEl.innerHTML = basket.map((item, idx) => `
    <li class="vp-basket-item" data-item-key="${item.itemNumber}">
      <img src="${item.image || ''}" alt="${item.name}" onerror="this.style.display='none'">
      <span class="vp-basket-item-name">${item.name}</span>
      <button class="vp-basket-remove" data-idx="${idx}" title="Remove">✕</button>
    </li>
  `).join('');

  listEl.querySelectorAll('.vp-basket-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = getQuoteBasket();
      b.splice(parseInt(btn.dataset.idx), 1);
      saveQuoteBasket(b);
      updateQuoteBadge();
    });
  });
}

function scrollToNewVpItem(itemNumber) {
  const listEl = document.getElementById("vpBasketItems");
  if (!listEl) return;
  // Find by iterating – avoids CSS.escape edge cases with special chars in item numbers
  const newLi = Array.from(listEl.querySelectorAll("[data-item-key]"))
    .find(el => el.dataset.itemKey === itemNumber);
  if (!newLi) return;
  // Scroll only the internal list container – not the page
  newLi.scrollIntoView({ behavior: "smooth", block: "nearest" });
  newLi.classList.add("vp-basket-item--new");
  newLi.addEventListener("animationend", () => newLi.classList.remove("vp-basket-item--new"), { once: true });
}

function showVpToast(msg, type) {
  let toast = document.getElementById("vpToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "vpToast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.className = "vp-toast" + (type === "warn" ? " vp-toast--warn" : "");
  toast.textContent = msg;
  toast.classList.add("vp-toast--visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("vp-toast--visible"), 2800);
}

// On mobile the filter sidebar (and the VP basket panel living inside it)
// is an off-canvas drawer, closed by default -- opened only via the
// "Filters" button's own click handler in catalog.html. "Get Volume Price"
// never triggered that open, so the basket panel became display:block
// while its parent stayed off-screen at left:-100%: nothing visible, and
// scrollIntoView on that off-screen fixed ancestor produced a disorienting
// jump that read as "navigated away with no way back." Opening the same
// drawer here (mirroring catalog.html's openFilter()) makes it visible
// AND closable through the existing close button / backdrop.
function openMobileFilterDrawerIfNeeded() {
  if (!window.matchMedia("(max-width: 768px)").matches) return;
  const sidebar  = document.getElementById("catalogSidebarCol");
  const backdrop = document.getElementById("filterBackdrop");
  if (!sidebar) return;
  sidebar.classList.add("filter-open");
  if (backdrop) backdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function setupQuoteButtons() {
  renderVpBasketPanel(getQuoteBasket());
  document.querySelectorAll(".quote-add-btn").forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      const item = {
        itemNumber: btn.dataset.item || "",
        name:       btn.dataset.name || "",
        image:      btn.dataset.image || "",
        quantity:   1,
      };
      if (!item.name) return;
      const basket = getQuoteBasket();
      const alreadyIn = basket.find(i => i.itemNumber === item.itemNumber);
      if (alreadyIn) {
        showVpToast(`"${item.name}" is already in your Volume Pricing List.`, "warn");
        openMobileFilterDrawerIfNeeded();
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToNewVpItem(item.itemNumber)));
        return;
      }
      basket.push(item);
      saveQuoteBasket(basket);
      updateQuoteBadge();
      openMobileFilterDrawerIfNeeded();
      // Wait for browser to paint the updated panel before scrolling
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToNewVpItem(item.itemNumber)));
      showVpToast(`"${item.name}" added to your Volume Pricing List.`);
      btn.textContent = "✓ Added";
      btn.style.background = "#16a34a";
      setTimeout(() => { btn.textContent = "Get Volume Price"; btn.style.background = ""; }, 1800);
    };
  });
}

/* =========================
   FLY TO CART
========================= */

function flyToCart(button) {
  const cartIcon = document.querySelector(".cart-container");
  if (!cartIcon) return;

  const productCard = button.closest(".product-card");

  const productImage = productCard
    ? productCard.querySelector(".product-image img")
    : document.getElementById("mainProductImage");

  if (!productImage) return;

  const imageClone = productImage.cloneNode(true);

  const imageRect = productImage.getBoundingClientRect();
  const cartRect = cartIcon.getBoundingClientRect();

  imageClone.classList.add("fly-image");

  imageClone.style.position = "fixed";
  imageClone.style.left = imageRect.left + "px";
  imageClone.style.top = imageRect.top + "px";
  imageClone.style.width = imageRect.width + "px";
  imageClone.style.height = imageRect.height + "px";
  imageClone.style.zIndex = "9999";
  imageClone.style.pointerEvents = "none";
  imageClone.style.transition = "all 0.8s ease";
  imageClone.style.borderRadius = "12px";

  document.body.appendChild(imageClone);

  setTimeout(() => {
    imageClone.style.left = cartRect.left + "px";
    imageClone.style.top = cartRect.top + "px";
    imageClone.style.width = "30px";
    imageClone.style.height = "30px";
    imageClone.style.opacity = "0";
  }, 50);

  setTimeout(() => {
    imageClone.remove();
  }, 900);
}

/* =========================
   PRODUCT QUANTITY
========================= */

function setupProductQuantity() {
  const qtyValue = document.getElementById("qtyValue");
  const plusQty = document.getElementById("plusQty");
  const minusQty = document.getElementById("minusQty");
  const productPriceEl = document.getElementById("productPrice");
  const addBtn = document.getElementById("productAddToCart");

  if (!qtyValue || !plusQty || !minusQty || !productPriceEl || !addBtn) return;

  // Guards against double-binding if this ever gets called more than once
  // for the same page: qtyValue's "input"/"blur" listeners use
  // addEventListener, which stacks rather than overwrites, so a second
  // call previously registered a second pair that fired alongside the
  // first -- one of them still holding the pre-catalog-load MOQ/step
  // values -- and made the quantity box fight itself on every keystroke.
  if (qtyValue.dataset.wired === "1") return;
  qtyValue.dataset.wired = "1";

  // The separate "Add to Reorder Program" button is gone -- reorder is now
  // a mode chosen above the single Add button (see setPurchaseMode), so
  // the saving is visible before the click instead of hidden behind a
  // second button that gave no hint it was cheaper. This listener stays
  // only to catch any cached markup still rendering the old button.
  const legacyReorderBtn = document.querySelector(".reorder-program-btn");
  if (legacyReorderBtn) {
    legacyReorderBtn.onclick = e => {
      e.preventDefault();
      setPurchaseMode("reorder");
      addBtn.click();
    };
  }

  // Step size is the minimum order: a product that starts at 50 dozen
  // should move 50 at a time, not 1, so every reachable quantity is one
  // the customer can actually buy.
  const stepSize = () => Math.max(1, parseInt(addBtn.dataset.moq) || 1);
  function getQty() { return Math.max(stepSize(), parseInt(qtyValue.value) || stepSize()); }

  function updateProductPagePrice() {
    const qty = getQty();
    const item = {
      quantity: qty,
      price: addBtn.dataset.price,
      price1: addBtn.dataset.price1,
      price2: addBtn.dataset.price2,
      price3: addBtn.dataset.price3,
      unit:   addBtn.dataset.unit,
      moq:    addBtn.dataset.moq,
    };
    // Stays a per-unit rate: the figure is labelled "Per Case" / "Per
    // Dozen" beneath it, so multiplying by quantity here would contradict
    // its own caption.
    const rate = getTierPrice(item);
    productPriceEl.textContent = `$${rate.toFixed(2)}`;

    // Line total for the chosen quantity, plus both purchase-mode prices.
    // The tier cards show the rate at each break; these show what this
    // specific order costs, which is what the buyer is deciding on.
    const lineTotal = rate * qty;
    const unitLabel = (addBtn.dataset.unit || "Case");
    const ltWrap  = document.getElementById("ppLineTotal");
    const ltRate  = document.getElementById("ppLineRate");
    const ltValue = document.getElementById("ppLineTotalValue");
    if (ltWrap && ltValue) {
      if (rate > 0) {
        if (ltRate) ltRate.textContent = `${qty} × $${rate.toFixed(2)}/${unitLabel.toLowerCase()}`;
        ltValue.textContent = `$${lineTotal.toFixed(2)}`;
        ltWrap.style.display = "";
      } else {
        ltWrap.style.display = "none";
      }
    }

    const oncePriceEl    = document.getElementById("ppModeOncePrice");
    const reorderPriceEl = document.getElementById("ppModeReorderPrice");
    if (oncePriceEl)    oncePriceEl.textContent = rate > 0 ? `$${lineTotal.toFixed(2)}` : "—";
    if (reorderPriceEl) {
      reorderPriceEl.textContent = rate > 0
        ? `$${(lineTotal * (1 - REORDER_DISCOUNT_RATE)).toFixed(2)}`
        : "—";
    }
  }

  // Purchase mode: one-time vs reorder. Kept on the button element itself
  // so the add-to-cart handler below reads it without another global.
  const modeOnce    = document.getElementById("ppModeOnce");
  const modeReorder = document.getElementById("ppModeReorder");
  const freqWrap    = document.getElementById("ppFreq");
  const addLabel    = document.getElementById("ppAddLabel");

  function setPurchaseMode(mode) {
    const reorder = mode === "reorder";
    addBtn.dataset.purchaseMode = reorder ? "reorder" : "once";
    [modeOnce, modeReorder].forEach(b => {
      if (!b) return;
      const active = b.dataset.mode === mode;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-checked", active ? "true" : "false");
    });
    if (freqWrap) freqWrap.style.display = reorder ? "" : "none";
    if (addLabel) addLabel.textContent = reorder ? "START REORDER — SAVE 5%" : "ADD TO CART";
  }

  if (modeOnce)    modeOnce.onclick    = () => setPurchaseMode("once");
  if (modeReorder) modeReorder.onclick = () => setPurchaseMode("reorder");
  setPurchaseMode("once");

  plusQty.onclick = () => {
    qtyValue.value = getQty() + stepSize();
    updateProductPagePrice();
  };

  minusQty.onclick = () => {
    const step = stepSize();
    const q = getQty();
    if (q - step >= step) { qtyValue.value = q - step; updateProductPagePrice(); }
  };

  qtyValue.addEventListener("input", () => {
    let v = parseInt(qtyValue.value) || 1;
    if (v < 1) v = 1;
    qtyValue.value = v;
    updateProductPagePrice();
  });

  qtyValue.addEventListener("blur", () => {
    qtyValue.value = getQty();
    updateProductPagePrice();
  });

  updateProductPagePrice();
}

/* =========================
   CART PAGE
========================= */

function loadCartPage() {
  const cartItemsContainer = document.getElementById("cart-items");
  const subtotalEl = document.getElementById("subtotal");
  const estimatedTotalEl = document.getElementById("estimated-total");

  if (!cartItemsContainer || !subtotalEl || !estimatedTotalEl) return;

  const cart = getCart();
  cartItemsContainer.innerHTML = "";

  let subtotal = 0;
  let totalItems = 0;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `<p class="empty-cart">Your cart is empty.</p>`;
    subtotalEl.textContent = "$0.00";
    estimatedTotalEl.textContent = "$0.00";

    const summaryLabel = document.querySelector(".summary-row span");
    if (summaryLabel) summaryLabel.textContent = "Subtotal (0 items)";
    return;
  }

  cart.forEach((item, index) => {
    const qty = Number(item.quantity) || 1;
    const price = getTierPrice(item);
    const itemTotal = price * qty;
    const reorderValue = item.reorder || "Once";

    subtotal += itemTotal;
    totalItems += qty;

    cartItemsContainer.innerHTML += `
      <div class="cart-row">
        <div class="cart-product">
          <img src="${item.image}" alt="${item.name}">
          <div>
            <h3>${item.name}</h3>
            <p>${item.description || ""}</p>
            <small class="in-stock">✓ In Stock</small>
          </div>
        </div>

        <span class="product-price">$${price.toFixed(2)}</span>

        <div class="qty-box">
          <button class="qty-minus" data-index="${index}">-</button>
          <input type="number" class="qty-value qty-input" data-index="${index}" value="${qty}" min="1" inputmode="numeric">
          <button class="qty-plus" data-index="${index}">+</button>
        </div>

        <div class="reorder-wrapper">

  <select class="reorder-dropdown" data-index="${index}">
    <option value="Once" ${reorderValue === "Once" ? "selected" : ""}>Once</option>
    <option value="Weekly" ${reorderValue === "Weekly" ? "selected" : ""}>Weekly</option>
    <option value="Every 2 Weeks" ${reorderValue === "Every 2 Weeks" ? "selected" : ""}>Every 2 Weeks</option>
    <option value="Monthly" ${reorderValue === "Monthly" ? "selected" : ""}>Monthly</option>
    <option value="Every 45 Days" ${reorderValue === "Every 45 Days" ? "selected" : ""}>Every 45 Days</option>
    <option value="Every 60 Days" ${reorderValue === "Every 60 Days" ? "selected" : ""}>Every 60 Days</option>
    <option value="Custom Schedule" ${reorderValue === "Custom Schedule" ? "selected" : ""}>Custom Schedule</option>
  </select>

  <button
    class="cart-calendar-btn ${reorderValue === "Custom Schedule" ? "show" : ""}"
    data-index="${index}"
    type="button"
    title="Select custom dates"
  >
    <img src="assets/icons/calendar.svg" alt="Calendar">
  </button>

</div>

<span class="item-total">$${itemTotal.toFixed(2)}</span>

<button class="trash-btn" data-index="${index}">
  <img src="assets/icons/trash.svg" alt="Delete">
</button>
      </div>
    `;
  });

  const summaryLabel = document.querySelector(".summary-row span");
  if (summaryLabel) summaryLabel.textContent = `Subtotal (${totalItems} items)`;

  enforceCartMinimums(cart);

  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

  // Reorder Program discount. Shown as its own row so the saving is
  // visible rather than buried in a total that silently differs from the
  // subtotal. Injected next to the existing summary rows rather than
  // hardcoded into cart.html, because it only exists for some carts.
  const discount = reorderDiscountAmount(subtotal, cart);
  let discountRow = document.getElementById("cartReorderDiscountRow");
  if (discount > 0) {
    if (!discountRow) {
      discountRow = document.createElement("div");
      discountRow.id = "cartReorderDiscountRow";
      discountRow.className = "summary-row cart-discount-row";
      estimatedTotalEl.closest(".summary-row, .summary-total")?.before(discountRow);
    }
    discountRow.innerHTML =
      `<span>Reorder Program (&minus;${REORDER_DISCOUNT_LABEL})</span>` +
      `<strong>&minus;$${discount.toFixed(2)}</strong>`;
    discountRow.style.display = "";
  } else if (discountRow) {
    discountRow.style.display = "none";
  }

  estimatedTotalEl.textContent = `$${(subtotal - discount).toFixed(2)}`;

  setupCartButtons();
  setupReorderDropdowns();
  setupCartCalendarButtons();
}

function setupCartButtons() {
  document.querySelectorAll(".qty-plus").forEach(btn => {
    btn.onclick = () => {
      const cart = getCart();
      const index = Number(btn.dataset.index);

      if (!cart[index]) return;

      const step = isSoldByDozen(cart[index]) ? productMoq(cart[index]) : 1;
      cart[index].quantity = (Number(cart[index].quantity) || step) + step;

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    };
  });

  document.querySelectorAll(".qty-minus").forEach(btn => {
    btn.onclick = () => {
      const cart = getCart();
      const index = Number(btn.dataset.index);

      if (!cart[index]) return;

      // Dozen-sold items step (and floor) by their case minimum -- e.g. a
      // 50-dozen-minimum wash cloth can't sit at 49, only 0/50/100/...
      const step = isSoldByDozen(cart[index]) ? productMoq(cart[index]) : 1;
      const floor = step;
      if ((Number(cart[index].quantity) || step) > floor) {
        cart[index].quantity -= step;
      }

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    };
  });

  // Typing a quantity directly. Bulk buyers order in dozens of cases, and
  // clicking "+" forty times is not a reasonable ask -- the quantity was
  // previously a plain <span> with no way to enter a number.
  document.querySelectorAll(".qty-input").forEach(input => {
    // Commit on blur/Enter rather than on every keystroke: re-rendering the
    // cart mid-typing would tear the field out from under the cursor.
    const commit = () => {
      const cart = getCart();
      const index = Number(input.dataset.index);
      if (!cart[index]) return;

      const typed = parseInt(input.value, 10);
      let qty = Number.isFinite(typed) && typed > 0 ? typed : 1;

      // Dozen-sold items must land on a whole multiple of their case
      // minimum (e.g. 50, 100, 150 dozen -- never 51) so a typed number
      // can't slip in a partial case. Round up to the nearest valid one.
      if (isSoldByDozen(cart[index])) {
        const step = productMoq(cart[index]);
        if (step > 1) qty = Math.max(step, Math.ceil(qty / step) * step);
      }

      if (qty === Number(cart[index].quantity)) {
        input.value = qty;   // unchanged, but normalise what's displayed
        return;
      }

      cart[index].quantity = qty;
      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    });
  });

  document.querySelectorAll(".trash-btn").forEach(btn => {
    btn.onclick = () => {
      const cart = getCart();
      const index = Number(btn.dataset.index);

      if (!cart[index]) return;

      cart.splice(index, 1);

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    };
  });
}

function setupReorderDropdowns() {
  document.querySelectorAll(".reorder-dropdown").forEach(dropdown => {
    dropdown.onchange = () => {
      const cart = getCart();
      const index = Number(dropdown.dataset.index);

      if (!cart[index]) return;

      cart[index].reorder = dropdown.value;

      if (dropdown.value !== "Custom Schedule") {
        cart[index].customDates = [];
      }

      saveCart(cart);
      loadCartPage();
    };
  });
}

function setupCartCalendarButtons() {
  document.querySelectorAll(".cart-calendar-btn").forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();

      if (typeof flatpickr === "undefined") {
        alert("Calendar library is not loaded. Add the Flatpickr script to cart.html.");
        return;
      }

      const cart = getCart();
      const index = Number(btn.dataset.index);

      if (!cart[index]) return;

      const pickerInput = document.createElement("input");
      pickerInput.type = "text";
      pickerInput.className = "cart-calendar-hidden-input";
      document.body.appendChild(pickerInput);

      const picker = flatpickr(pickerInput, {
        mode: "multiple",
        dateFormat: "m/d/Y",
        defaultDate: cart[index].customDates || [],
        appendTo: document.body,
        positionElement: btn,
        onClose: function(selectedDates, dateStr) {
          cart[index].customDates = dateStr ? dateStr.split(", ") : [];
          saveCart(cart);

          picker.destroy();
          pickerInput.remove();
        }
      });

      picker.open();
    };
  });
}


/* =========================
   CHECKOUT PAGE
========================= */

let checkoutOrderType = "reorder";

function loadCheckoutProducts() {
  const checkoutProducts = document.getElementById("checkout-products");
  const summaryItems = document.getElementById("summary-items");
  const subtotalEl = document.getElementById("summary-subtotal");
  const totalEl = document.getElementById("summary-total");
  const countEl = document.getElementById("summary-count");
  const orderSubtotalEl = document.getElementById("order-subtotal");

  if (!checkoutProducts) return;

  const cart = getCart();

  if (cart.length === 0) {
    checkoutProducts.innerHTML = `<p>Your cart is empty.</p>`;

    if (summaryItems) summaryItems.innerHTML = "";
    if (countEl) countEl.textContent = "0 Items";
    if (subtotalEl) subtotalEl.textContent = "$0.00";
    if (totalEl) totalEl.textContent = "$0.00";
    if (orderSubtotalEl) orderSubtotalEl.textContent = "$0.00";

    return;
  }

  let subtotal = 0;
  let itemCount = 0;

  checkoutProducts.innerHTML = cart.map(item => {
    const qty = Number(item.quantity) || 1;
    const price = getTierPrice(item);
    const total = price * qty;

    const reorderValue =
      checkoutOrderType === "one-time"
        ? "Once"
        : item.reorder || "Once";

    const customDatesText =
      reorderValue === "Custom Schedule" && item.customDates?.length
        ? ` (${item.customDates.join(", ")})`
        : "";

    subtotal += total;
    itemCount += qty;

    return `
      <div class="checkout-product">
        <img src="${item.image}" alt="${item.name}">

        <div>
          <h4>${item.name}</h4>
          <p>${item.description || ""}</p>
          <small>✓ In Stock</small>
          <p class="checkout-reorder">
            Reorder: <strong>${reorderValue}${customDatesText}</strong>
          </p>
        </div>

        <strong class="product-price">$${price.toFixed(2)}</strong>

        <div class="qty-box">
          <span class="qty-value">${qty}</span>
        </div>

        <strong class="product-total">$${total.toFixed(2)}</strong>
      </div>
    `;
  }).join("");

  if (summaryItems) {
    summaryItems.innerHTML = cart.map(item => {
      const qty = Number(item.quantity) || 1;
      const price = getTierPrice(item);
      const total = price * qty;

      const reorderValue =
        checkoutOrderType === "one-time"
          ? "Once"
          : item.reorder || "Once";

      const customDatesText =
        reorderValue === "Custom Schedule" && item.customDates?.length
          ? ` (${item.customDates.join(", ")})`
          : "";

      return `
        <div class="summary-item-row">
          <div>
            <h4>${item.name}</h4>
            <p>Qty: ${qty} × $${price.toFixed(2)}</p>
            <p>Reorder: <strong>${reorderValue}${customDatesText}</strong></p>
          </div>

          <strong>$${total.toFixed(2)}</strong>
        </div>
      `;
    }).join("");
  }

  // Reorder Program discount. Honours the page-level "One-time purchase"
  // toggle: picking that forces every line to Once, so the discount has
  // to disappear with it rather than reading stale per-line schedules.
  const effectiveCart = checkoutOrderType === "one-time"
    ? cart.map(i => ({ ...i, reorder: "Once" }))
    : cart;
  const discount = reorderDiscountAmount(subtotal, effectiveCart);
  const discountedSubtotal = Math.round((subtotal - discount) * 100) / 100;

  // Tax follows the discounted subtotal, matching api/_lib/price-cart.js --
  // taxing the pre-discount figure would charge tax on money never paid.
  const checkoutState = document.getElementById('checkout-state')?.value || '';
  const taxRate = checkoutState ? (window.getTaxRate?.(checkoutState) || 0) : 0;
  const tax = discountedSubtotal * taxRate;
  const taxEl = document.getElementById('summary-tax');
  if (taxEl) taxEl.textContent = `$${tax.toFixed(2)}`;
  const taxRateEl = document.getElementById('summary-tax-rate');
  if (taxRateEl) taxRateEl.textContent = checkoutState ? ` (${checkoutState} · ${(taxRate * 100).toFixed(2)}%)` : '';

  // Injected next to the existing subtotal row rather than hardcoded in
  // checkout.html, since it only exists for reorder carts.
  let coDiscountRow = document.getElementById("checkoutReorderDiscountRow");
  if (discount > 0) {
    if (!coDiscountRow && subtotalEl) {
      coDiscountRow = document.createElement("div");
      coDiscountRow.id = "checkoutReorderDiscountRow";
      coDiscountRow.className = "summary-row cart-discount-row";
      subtotalEl.closest(".summary-row, div")?.after(coDiscountRow);
    }
    if (coDiscountRow) {
      coDiscountRow.innerHTML =
        `<span>Reorder Program (&minus;${REORDER_DISCOUNT_LABEL})</span>` +
        `<strong>&minus;$${discount.toFixed(2)}</strong>`;
      coDiscountRow.style.display = "";
    }
  } else if (coDiscountRow) {
    coDiscountRow.style.display = "none";
  }

  if (countEl) countEl.textContent = `${itemCount} Items`;
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${(discountedSubtotal + tax).toFixed(2)}`;
  if (orderSubtotalEl) orderSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;

  // Recalculate tax live as the customer picks/changes their state. Bound
  // once (not on every loadCheckoutProducts() call, which would stack a
  // new listener each time and re-fire it that many times per change).
  const stateEl = document.getElementById('checkout-state');
  if (stateEl && !stateEl.dataset.taxListenerBound) {
    stateEl.dataset.taxListenerBound = '1';
    stateEl.addEventListener('change', loadCheckoutProducts);
  }
}

function setupCheckoutOrderTypeToggle() {
  const reorderOption = document.getElementById("reorderOption");
  const oneTimeOption = document.getElementById("oneTimeOption");
  const reorderSection = document.getElementById("reorderFrequencySection");

  if (!reorderOption || !oneTimeOption) return;

  function updateCheckoutOrderType() {
    if (oneTimeOption.checked) {
      checkoutOrderType = "one-time";
      if (reorderSection) reorderSection.style.display = "none";
    } else {
      checkoutOrderType = "reorder";
      if (reorderSection) reorderSection.style.display = "block";
    }

    // Persisted because payment.html re-prices the cart server-side from
    // localStorage and has no other way to know this toggle was set.
    // Without it, choosing "One-time purchase" here (no discount shown)
    // would still get the 5% applied on the next page -- the displayed
    // and charged totals would disagree across a page boundary.
    try { localStorage.setItem("rrs_order_type", checkoutOrderType); } catch {}

    loadCheckoutProducts();
  }

  reorderOption.addEventListener("change", updateCheckoutOrderType);
  oneTimeOption.addEventListener("change", updateCheckoutOrderType);

  updateCheckoutOrderType();
}

document.addEventListener("DOMContentLoaded", () => {
  setupCheckoutOrderTypeToggle();
});


/* =========================
   MOBILE NAV
========================= */

function setupMobileNav() {
  const btn = document.getElementById("navHamburger");
  const nav = document.getElementById("mobileNav");
  if (!btn || !nav) return;

  btn.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
  });

  // Close when a link is tapped
  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      btn.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove("open");
      btn.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

/* =========================
   LOGIN
========================= */

function setupLogin() {
  updateLoginUI();

  // Capture ?redirect= param so we can bounce back after login
  const urlParams = new URLSearchParams(window.location.search);
  const redirectParam = urlParams.get("redirect");
  if (redirectParam) sessionStorage.setItem("authRedirect", redirectParam);

  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();

      const email    = document.getElementById("emailInput")?.value.trim();
      const password = document.getElementById("passwordInput")?.value.trim();
      const errEl    = document.getElementById("loginError");

      if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }

      // Try Supabase auth if available, otherwise fallback
      if (window.sb) {
        const submitBtn = loginForm.querySelector("button[type=submit], .signin-btn");
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Signing in…"; }

        const { data, error } = await window.sb.auth.signInWithPassword({ email, password });

        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Sign In"; }

        if (error) {
          if (errEl) {
            errEl.textContent = "Incorrect email or password. Please try again.";
            errEl.style.display = "block";
          } else {
            alert("Incorrect email or password. Please try again.");
          }
        } else {
          localStorage.setItem("loggedIn", "true");
          updateLoginUI();
          updateCartBadge();
          // Check if user is admin and redirect accordingly
          const { data: profile } = await window.sb
            .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
          if (profile?.role === "admin") {
            window.location.href = "/admin";
          } else {
            const redirect = sessionStorage.getItem("authRedirect") || "/";
            sessionStorage.removeItem("authRedirect");
            window.location.href = redirect;
          }
        }
      } else {
        // Fallback (no Supabase loaded)
        if (email === "test@test.com" && password === "test") {
          localStorage.setItem("loggedIn", "true");
          updateLoginUI();
          updateCartBadge();
          const redirect = sessionStorage.getItem("authRedirect") || "/";
          sessionStorage.removeItem("authRedirect");
          window.location.href = redirect;
        } else {
          alert("Invalid email or password");
        }
      }
    });
  }

  const logoutBtn = document.getElementById("logout-btn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (window.sb) await window.sb.auth.signOut();
      localStorage.removeItem("loggedIn");
      updateLoginUI();
      updateCartBadge();
      window.location.href = "/login";
    });
  }
}

// Redirect guests to login, saving their intended destination
function requireAuth(dest) {
  if (localStorage.getItem("loggedIn") === "true") return true; // logged in – follow link normally
  sessionStorage.setItem("authRedirect", dest || window.location.href);
  window.location.href = "/login";
  return false; // prevent default link navigation
}


function updateLoginUI() {
  const isLoggedIn = localStorage.getItem("loggedIn") === "true";

  document.querySelectorAll(".guest-only").forEach(el => {
    el.style.display = isLoggedIn ? "none" : "inline-flex";
  });

  document.querySelectorAll(".logged-in-only").forEach(el => {
    el.style.display = isLoggedIn ? "inline-flex" : "none";
  });
}

/* =========================
   ACCOUNT DROPDOWN
========================= */

function setupAccountDropdown() {
  const accountDropdown = document.querySelector(".account-dropdown");
  const accountBtn      = document.querySelector(".account-btn");
  const dropdownMenu    = document.querySelector(".dropdown-menu");

  if (!accountDropdown || !accountBtn || !dropdownMenu) return;

  function positionDropdown() {
    const rect   = accountBtn.getBoundingClientRect();
    const menuW  = dropdownMenu.offsetWidth || 220;
    const gap    = 8;
    let top      = rect.bottom + gap;
    // Align right edge of menu with right edge of button, but clamp to viewport
    let right    = window.innerWidth - rect.right;
    // Prevent menu from going off left side
    const leftEdge = rect.right - menuW;
    if (leftEdge < 8) right = window.innerWidth - menuW - 8;
    dropdownMenu.style.top   = top + "px";
    dropdownMenu.style.right = right + "px";
  }

  accountBtn.addEventListener("click", e => {
    e.stopPropagation();
    const isActive = accountDropdown.classList.toggle("active");
    if (isActive) positionDropdown();
  });

  // Reposition on scroll/resize so it stays anchored to the button
  window.addEventListener("scroll", () => {
    if (accountDropdown.classList.contains("active")) positionDropdown();
  }, { passive: true });
  window.addEventListener("resize", () => {
    if (accountDropdown.classList.contains("active")) positionDropdown();
  });

  document.addEventListener("click", () => {
    accountDropdown.classList.remove("active");
  });
}

/* =========================
   PASSWORD TOGGLE
========================= */

function setupPasswordToggle() {
  const passwordInput = document.getElementById("passwordInput");
  const togglePassword = document.getElementById("togglePassword");

  if (!passwordInput || !togglePassword) return;

  togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.src = isPassword ? "assets/icons/eye-line.svg" : "assets/icons/eye-off-line.svg";
  });
}

/* =========================
   CUSTOM CALENDAR
========================= */

function setupCalendar() {
  const frequencyCards = document.querySelectorAll(".frequency-card");
  const standardFrequencyRow = document.getElementById("standard-frequency-row");
  const customCalendarBox = document.getElementById("custom-calendar-box");
  const customDatesInput = document.getElementById("custom-reorder-dates");

  if (!frequencyCards.length || !standardFrequencyRow || !customCalendarBox || !customDatesInput) return;

  let customCalendar;

  frequencyCards.forEach(card => {
    card.addEventListener("click", () => {
      frequencyCards.forEach(c => c.classList.remove("active"));
      card.classList.add("active");

      const isCustom = card.classList.contains("custom-card");

      if (isCustom) {
        standardFrequencyRow.classList.add("hide");
        customCalendarBox.classList.add("show");

        if (typeof flatpickr !== "undefined" && !customCalendar) {
          customCalendar = flatpickr(customDatesInput, {
            mode: "multiple",
            dateFormat: "m/d/Y",
            inline: true
          });
        }

        if (customCalendar) customCalendar.open();
      } else {
        standardFrequencyRow.classList.remove("hide");
        customCalendarBox.classList.remove("show");

        if (customCalendar) customCalendar.clear();
      }
    });
  });
}

// Order Details Setup
  function setupOrderTypeToggle() {
    const reorderOption = document.getElementById("reorderOption");
    const oneTimeOption = document.getElementById("oneTimeOption");
    const reorderSection = document.getElementById("reorderFrequencySection");

    if (!reorderOption || !oneTimeOption || !reorderSection) return;

    function updateVisibility() {
      reorderSection.style.display = oneTimeOption.checked ? "none" : "block";
    }

    reorderOption.addEventListener("change", updateVisibility);
    oneTimeOption.addEventListener("change", updateVisibility);

    updateVisibility();
  }

  document.addEventListener("DOMContentLoaded", setupOrderTypeToggle);


/* =========================
   FEATURED PRODUCTS SLIDER
========================= */

function loadFeaturedProducts() {
  const container = document.getElementById("featured-products");
  if (!container) return;

  featuredProducts = allProducts
    .filter(product => product.name && product.image && cleanPrice(product.price) > 0)
    .sort(() => Math.random() - 0.5);

  showFeaturedProducts();
}

function showFeaturedProducts() {
  const container = document.getElementById("featured-products");
  if (!container || featuredProducts.length === 0) return;

  const visibleProducts = getVisibleFeaturedProducts();

  container.innerHTML = visibleProducts.map(product => {
    const price = cleanPrice(product.price);

    return `
      <div class="product-card" data-url="/product?item=${encodeURIComponent(product.slug)}">

        <div class="product-image">
          ${product.moqGroup ? `<span class="moq-group-badge">MIX &amp; MATCH MOQ: ${product.moqGroupMin}</span>` : ""}
          <img src="${product.image}" alt="${product.name}" onerror="this.src='/assets/img/product-placeholder.svg'">
        </div>

        <h3>${product.name}</h3>

        <p class="product-description">${product.description || ""}</p>

        <div class="product-meta">
          <div class="meta-item">
            <img src="assets/icons/box.svg" alt="">
            <span>Case Qty: ${product.caseQty || ""}</span>
          </div>

          <div class="meta-item">
            <img src="assets/icons/pack.svg" alt="">
            <span>Pack Size: ${product.size || ""}</span>
          </div>
        </div>

        <div class="stock-status">
          <span class="dot"></span>
          In Stock
        </div>

        <div class="price">
          $${price.toFixed(2)} <span>/${product.priceBy || "Case"}</span>
        </div>

        <button
          class="add-btn"
          data-item="${product.itemNumber}"
          data-name="${product.name}"
          data-description="${product.description || ""}"
          data-price="${cleanPrice(product.price1) || price}"
          data-price1="${cleanPrice(product.price1)}"
          data-price2="${cleanPrice(product.price2)}"
          data-price3="${cleanPrice(product.price3)}"
          data-unit="${product.priceBy || ''}"
          data-moq="${productMoq(product)}"
          data-moq-group="${product.moqGroup || ''}"
          data-moq-group-min="${product.moqGroupMin || ''}"
          data-image="${product.image}"
        >
          <img src="assets/img/Cart.png" alt="">
          ADD TO CART
        </button>

      </div>
    `;
  }).join("");

  setupProductCardClicks();
  setupAddToCartButtons();
  setupQuoteButtons();
}

function getFeaturedPageSize() {
  const w = window.innerWidth;
  if (w <= 480) return 1;
  if (w <= 900) return 2;
  return 4;
}

function getVisibleFeaturedProducts() {
  const visible = [];
  const count = getFeaturedPageSize();

  for (let i = 0; i < count; i++) {
    const index = (currentFeaturedIndex + i) % featuredProducts.length;
    visible.push(featuredProducts[index]);
  }

  return visible;
}

function animateFeaturedSlide(direction) {
  const container = document.getElementById("featured-products");
  if (!container || isSliding || featuredProducts.length === 0) return;

  isSliding = true;

  container.classList.remove("slide-in");

  container.classList.add(
    direction === "right" ? "slide-out-left" : "slide-out-right"
  );

  setTimeout(() => {
    const count = getFeaturedPageSize();
    if (direction === "right") {
      currentFeaturedIndex = (currentFeaturedIndex + count) % featuredProducts.length;
    } else {
      currentFeaturedIndex =
        (currentFeaturedIndex - count + featuredProducts.length) % featuredProducts.length;
    }

    showFeaturedProducts();

    container.classList.remove("slide-out-left", "slide-out-right");

    requestAnimationFrame(() => {
      container.classList.add("slide-in");
      isSliding = false;
    });
  }, 350);
}

function setupFeaturedSliderButtons() {
  document.querySelector(".slider-arrow.right")?.addEventListener("click", () => {
    animateFeaturedSlide("right");
  });

  document.querySelector(".slider-arrow.left")?.addEventListener("click", () => {
    animateFeaturedSlide("left");
  });
}

/* =========================
   PAYMENT PAGE SUMMARY
========================= */

function loadPaymentSummary() {
  const summaryItems = document.getElementById("payment-summary-items");
  const subtotalEl = document.getElementById("payment-subtotal");
  const totalEl = document.getElementById("payment-total");
  const subtotalLabel = document.getElementById("payment-subtotal-label");

  if (!summaryItems || !subtotalEl || !totalEl) return;

  const cart = getCart();

  if (cart.length === 0) {
    summaryItems.innerHTML = `<p>Your cart is empty.</p>`;
    subtotalEl.textContent = "$0.00";
    totalEl.textContent = "$0.00";
    if (subtotalLabel) subtotalLabel.textContent = "Subtotal";
    return;
  }

  let subtotal = 0;
  let totalItems = 0;

  summaryItems.innerHTML = cart.map(item => {
    const qty = Number(item.quantity) || 1;
    const price = getTierPrice(item);
    const total = price * qty;

    subtotal += total;
    totalItems += qty;

    return `
      <div class="payment-summary-item">
        <img src="${item.image}" alt="${item.name}">

        <div>
          <h4>${item.name}</h4>
          <p>Qty: ${qty} × $${price.toFixed(2)}</p>
        </div>

        <strong>$${total.toFixed(2)}</strong>
      </div>
    `;
  }).join("");

  if (subtotalLabel) {
    subtotalLabel.textContent = `Subtotal (${totalItems} items)`;
  }

  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

  // Freight is no longer billed to the customer as a separate line: it is
  // built into product pricing and shows up only in P&L. The freight quote
  // is still fetched and stored for the admin side (it drives Warp
  // booking), it just no longer adds to what is charged here.
  //
  // Stated explicitly rather than relying on the shipping element having
  // been removed -- that would leave the total correct only by accident,
  // and silently re-charge freight if the element ever came back.
  const shippingCost = 0;

  // This function's own output is superseded by payment.html's inline
  // loadSummary() (which also sets window._orderTax etc., the values that
  // actually get charged) -- fixed here anyway so nothing ever flashes a
  // stale/wrong tax figure between the two running, and so this stays
  // correct if it's ever relied on directly for another page.
  let checkoutState = '';
  try { checkoutState = (JSON.parse(localStorage.getItem('rrs_checkout_data') || '{}').state) || ''; } catch {}
  const taxRate = checkoutState ? (window.getTaxRate?.(checkoutState) || 0) : 0;
  const tax = subtotal * taxRate;
  const taxEl = document.getElementById('payment-tax');
  if (taxEl) taxEl.textContent = `$${tax.toFixed(2)}`;

  totalEl.textContent = `$${(subtotal + shippingCost + tax).toFixed(2)}`;
}


/* =========================
   PAYMENT METHOD SELECTOR
========================= */

function setupPaymentMethods() {
  const options = document.querySelectorAll(".payment-option");

  if (!options.length) return;

  function updateSelected() {
    options.forEach(option => {
      const radio = option.querySelector('input[type="radio"]');

      if (radio.checked) {
        option.classList.add("selected");
      } else {
        option.classList.remove("selected");
      }
    });
  }

  options.forEach(option => {
    const radio = option.querySelector('input[type="radio"]');

    option.addEventListener("click", () => {
      radio.checked = true;
      updateSelected();
    });

    radio.addEventListener("change", updateSelected);
  });

  updateSelected();
}

document.addEventListener("DOMContentLoaded", () => {
  setupPaymentMethods();
});


// Profile page functionality
async function setupProfilePage() {
  const profileTabs = document.querySelectorAll(".profile-sidebar .profile-tab");
  const profilePanels = document.querySelectorAll(".profile-panel");

  if (!profileTabs.length || !profilePanels.length) return;

  function openProfileTab(tabName) {
    const targetButton = document.querySelector(
      `.profile-sidebar .profile-tab[data-tab="${tabName}"]`
    );

    const targetPanel = document.getElementById(tabName);

    if (!targetButton || !targetPanel) return;

    profileTabs.forEach(btn => btn.classList.remove("active"));
    profilePanels.forEach(panel => panel.classList.remove("active"));

    targetButton.classList.add("active");
    targetPanel.classList.add("active");
  }

  const params = new URLSearchParams(window.location.search);
  const activeTab = params.get("tab") || "account";

  openProfileTab(activeTab);

  profileTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      openProfileTab(tab.dataset.tab);

      const newUrl =
        tab.dataset.tab === "account"
          ? "profile.html"
          : `profile.html?tab=${tab.dataset.tab}`;

      window.history.pushState({}, "", newUrl);
    });
  });

  const setText = (id, value, fallback = "Not added yet") => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || fallback;
  };

  // Load real profile from Supabase
  let userEmail = "", userName = "", userBusiness = "";
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    if (session?.user) {
      userEmail = session.user.email || "";
      const { data: profile } = await window.sb
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (profile) {
        userName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
        userBusiness = profile.business_name || "";
        // Populate avatar initials
        const initials = (profile.first_name?.[0] || "") + (profile.last_name?.[0] || "");
        const avatarEl = document.getElementById("profile-avatar");
        if (avatarEl && initials) avatarEl.textContent = initials.toUpperCase();
      }
    }
  } catch(e) {}

  setText("profile-business", userBusiness || userName || userEmail, "");
  setText("profile-email", userEmail, "");
  setText("businessName", userBusiness, "Not added yet");
  setText("contactName", userName);
  setText("emailAddress", userEmail, "");

  // Also populate the editable input values in the form
  const setInput = (id, value) => { const el = document.querySelector(`#${id} ~ input, input[data-field="${id}"]`); if (el) el.value = value || ""; };
  const bizInput  = document.querySelector('#accountGrid .info-box:nth-child(1) input');
  const nameInput = document.querySelector('#accountGrid .info-box:nth-child(2) input');
  const emailInput= document.querySelector('#accountGrid .info-box:nth-child(3) input');
  if (bizInput)   bizInput.value   = userBusiness || "";
  if (nameInput)  nameInput.value  = userName     || "";
  if (emailInput) emailInput.value = userEmail    || "";

  const orderHistoryList = document.getElementById("orderHistoryList");

  if (orderHistoryList) {
    orderHistoryList.innerHTML = `<p style="color:#888;font-size:14px;">Loading orders…</p>`;
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      if (session?.user?.id) {
        const { data: sbOrders, error } = await window.sb
          .from("orders")
          .select("id, order_number, created_at, total, status, subtotal")
          .or(`user_id.eq.${session.user.id},customer_email.eq.${session.user.email}`)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (sbOrders && sbOrders.length > 0) {
          orderHistoryList.innerHTML = sbOrders.map(o => {
            const date = new Date(o.created_at).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
            const total = o.total ? `$${parseFloat(o.total).toFixed(2)}` : (o.subtotal ? `$${parseFloat(o.subtotal).toFixed(2)}` : "…");
            const status = (o.status || "pending").charAt(0).toUpperCase() + (o.status || "pending").slice(1);
            return `
              <div class="order-card">
                <h4>${o.order_number || "Order"}</h4>
                <p><strong>Date:</strong> ${date}</p>
                <p><strong>Total:</strong> ${total}</p>
                <p><strong>Status:</strong> ${status}</p>
              </div>`;
          }).join("");
        } else {
          orderHistoryList.innerHTML = `<p style="color:#888;">No previous orders yet.</p>`;
        }
      } else {
        orderHistoryList.innerHTML = `<p style="color:#888;">Please <a href="/login">log in</a> to view your order history.</p>`;
      }
    } catch (e) {
      orderHistoryList.innerHTML = `<p style="color:#888;">No previous orders yet.</p>`;
    }
  }

  const logoutProfileBtn = document.getElementById("logoutProfileBtn");

  if (logoutProfileBtn) {
    logoutProfileBtn.addEventListener("click", async () => {
      if (window.sb) await window.sb.auth.signOut();
      localStorage.removeItem("loggedIn");
      window.location.href = "/login";
    });
  }
}

document.addEventListener("DOMContentLoaded", setupProfilePage);

function setupEditableProfile() {
  document.querySelectorAll(".edit-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.edit;
      const grid = document.getElementById(`${section}Grid`);
      const saveRow = document.getElementById(`${section}SaveRow`);

      grid.classList.add("editing");
      saveRow.classList.add("show");
      btn.style.display = "none";
    });
  });

  document.querySelectorAll(".cancel-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.cancel;
      const grid = document.getElementById(`${section}Grid`);
      const saveRow = document.getElementById(`${section}SaveRow`);
      const editBtn = document.querySelector(`[data-edit="${section}"]`);

      grid.classList.remove("editing");
      saveRow.classList.remove("show");
      editBtn.style.display = "inline-block";
    });
  });

  document.querySelectorAll(".save-profile-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.save;
      const grid = document.getElementById(`${section}Grid`);
      const saveRow = document.getElementById(`${section}SaveRow`);
      const editBtn = document.querySelector(`[data-edit="${section}"]`);

      grid.querySelectorAll(".info-box").forEach(box => {
        const strong = box.querySelector("strong");
        const input = box.querySelector("input");

        if (strong && input) {
          strong.textContent = input.value.trim() || "Not added yet";
        }
      });

      grid.classList.remove("editing");
      saveRow.classList.remove("show");
      editBtn.style.display = "inline-block";
    });
  });
}

document.addEventListener("DOMContentLoaded", setupEditableProfile);


/* -------------------------------------------------------
   CONTACT INQUIRY MODAL
------------------------------------------------------- */

function openContactModal() {
  const m = document.getElementById("contactModal");
  if (!m) return;
  m.style.display = "flex";
  pushModal(closeContactModal);
  // reset form state
  const form = document.getElementById("ciqForm");
  if (form) form.reset();
  document.getElementById("ciqSuccess").style.display = "none";
  document.getElementById("ciqForm").style.display = "";
  document.getElementById("ciqError").style.display = "none";
  document.getElementById("ciqFileName").textContent = "Choose file…";
  document.querySelectorAll(".ciq-error-field").forEach(el => el.classList.remove("ciq-error-field"));
}

function closeContactModal() {
  const m = document.getElementById("contactModal");
  if (m) m.style.display = "none";
  popModal(closeContactModal);
}

// Close on overlay click
document.addEventListener("click", function(e) {
  const m = document.getElementById("contactModal");
  if (m && e.target === m) closeContactModal();
});

function updateFileName(input) {
  const label = document.getElementById("ciqFileName");
  if (label) label.textContent = input.files[0]?.name || "Choose file…";
}

// Throttle – prevent resubmission within 30s
let _ciqLastSubmit = 0;

async function submitContactForm(e) {
  e.preventDefault();
  if (!window.sb) return;

  // Honeypot check – bots fill this field, humans leave it blank
  if (document.getElementById("ciqHoneypot")?.value) return;

  const now = Date.now();
  if (now - _ciqLastSubmit < 30000) {
    showCiqError("Please wait before submitting again.");
    return;
  }

  // -- Gather values --
  const firstName  = val("ciqFirstName");
  const lastName   = val("ciqLastName");
  const company    = val("ciqCompany");
  const bizType    = val("ciqBizType");
  const locations  = val("ciqLocations");
  const email      = val("ciqEmail");
  const phone      = val("ciqPhone");
  const city       = val("ciqCity");
  const state      = val("ciqState");
  const zip        = val("ciqZip");
  const volume     = val("ciqVolume");
  const contact    = val("ciqContactMethod");
  const message    = val("ciqMessage");

  const products = Array.from(
    document.querySelectorAll("#ciqForm input[type='checkbox']:checked")
  ).map(cb => cb.value);

  // -- Validate --
  const errors = [];
  clearCiqErrors();

  if (!firstName) { markErr("ciqFirstName"); errors.push("First name"); }
  if (!lastName)  { markErr("ciqLastName");  errors.push("Last name"); }
  if (!company)   { markErr("ciqCompany");   errors.push("Company name"); }
  if (!bizType)   { markErr("ciqBizType");   errors.push("Business type"); }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    markErr("ciqEmail"); errors.push("Valid email address");
  }
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    markErr("ciqPhone"); errors.push("Valid phone number (10+ digits)");
  }
  if (!city)  { markErr("ciqCity");  errors.push("City"); }
  if (!state) { markErr("ciqState"); errors.push("State"); }

  if (errors.length) {
    showCiqError("Please fill in the required fields: " + errors.join(", ") + ".");
    return;
  }

  // -- Set loading state --
  const btn = document.getElementById("ciqSubmitBtn");
  document.getElementById("ciqBtnText").textContent = "Sending…";
  document.getElementById("ciqSpinner").style.display = "inline-block";
  btn.disabled = true;
  document.getElementById("ciqError").style.display = "none";

  try {
    // Optional file upload
    let attachmentUrl = null;
    const fileInput = document.getElementById("ciqFile");
    if (fileInput?.files[0]) {
      const file = fileInput.files[0];
      const path = `inquiries/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
      const { error: uploadErr } = await window.sb.storage
        .from("contact-attachments")
        .upload(path, file, { upsert: false });
      if (!uploadErr) {
        const { data: urlData } = window.sb.storage
          .from("contact-attachments")
          .getPublicUrl(path);
        attachmentUrl = urlData?.publicUrl || null;
      }
    }

    const { error } = await window.sb.from("contact_inquiries").insert({
      first_name:              firstName,
      last_name:               lastName,
      company_name:            company,
      business_type:           bizType,
      number_of_locations:     locations || null,
      email,
      phone,
      city,
      state,
      zip_code:                zip || null,
      products_interested:     products.length ? products : null,
      monthly_purchase_volume: volume || null,
      preferred_contact:       contact || null,
      message:                 message || null,
      attachment_url:          attachmentUrl,
      status:                  "new",
    });

    if (error) throw error;

    _ciqLastSubmit = Date.now();
    document.getElementById("ciqForm").style.display = "none";
    document.getElementById("ciqSuccess").style.display = "flex";

  } catch (err) {
    showCiqError("Submission failed: " + (err.message || "Please try again."));
  } finally {
    document.getElementById("ciqBtnText").textContent = "Send Inquiry";
    document.getElementById("ciqSpinner").style.display = "none";
    btn.disabled = false;
  }
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
function markErr(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("ciq-error-field");
}
function clearCiqErrors() {
  document.querySelectorAll(".ciq-error-field").forEach(el => el.classList.remove("ciq-error-field"));
}
function showCiqError(msg) {
  const el = document.getElementById("ciqError");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* =========================
   REGISTRATION MODAL
========================= */

// -- Consent gate ---------------------------------------------
// submitRegistration() now shows the consent modal first.
// _proceedWithRegistration() does the actual signUp after consent.

function showConsentModal() {
  const m = document.getElementById('consentModal');
  if (!m) return;
  const cb = document.getElementById('consentCheckbox');
  if (cb) { cb.checked = false; cb.disabled = true; }
  const lbl = document.getElementById('consentCheckLabel');
  if (lbl) { lbl.style.opacity = '0.5'; lbl.style.cursor = 'not-allowed'; lbl.style.borderColor = '#e4e9f0'; lbl.style.background = '#f8fafd'; }
  const err = document.getElementById('consentError');
  if (err) err.style.display = 'none';
  const hint = document.getElementById('consentScrollHint');
  if (hint) hint.style.display = 'flex';
  switchConsentTab('tos');
  const box = document.getElementById('consentScrollBox');
  if (box) box.scrollTop = 0;
  m.style.display = 'flex';
}

function switchConsentTab(tab) {
  const tosPanel = document.getElementById('consentPanelTos');
  const privPanel = document.getElementById('consentPanelPriv');
  const tosBtn = document.getElementById('consentTabTos');
  const privBtn = document.getElementById('consentTabPriv');
  const box = document.getElementById('consentScrollBox');
  if (!tosPanel || !privPanel) return;
  if (tab === 'tos') {
    tosPanel.style.display = 'block'; privPanel.style.display = 'none';
    tosBtn.style.color = '#ed7226'; tosBtn.style.borderBottomColor = '#ed7226'; tosBtn.style.fontWeight = '800';
    privBtn.style.color = '#6b7280'; privBtn.style.borderBottomColor = 'transparent'; privBtn.style.fontWeight = '700';
  } else {
    tosPanel.style.display = 'none'; privPanel.style.display = 'block';
    privBtn.style.color = '#ed7226'; privBtn.style.borderBottomColor = '#ed7226'; privBtn.style.fontWeight = '800';
    tosBtn.style.color = '#6b7280'; tosBtn.style.borderBottomColor = 'transparent'; tosBtn.style.fontWeight = '700';
  }
  if (box) box.scrollTop = 0;
}

function checkConsentScroll() {
  const box = document.getElementById('consentScrollBox');
  if (!box) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  if (!atBottom) return;
  const cb = document.getElementById('consentCheckbox');
  const lbl = document.getElementById('consentCheckLabel');
  const hint = document.getElementById('consentScrollHint');
  if (cb) { cb.disabled = false; }
  if (lbl) { lbl.style.opacity = '1'; lbl.style.cursor = 'pointer'; lbl.style.borderColor = '#fed7aa'; lbl.style.background = '#fff8f3'; }
  if (hint) hint.style.display = 'none';
}

function cancelConsent() {
  const m = document.getElementById('consentModal');
  if (m) m.style.display = 'none';
}

function acceptConsentAndRegister() {
  const cb = document.getElementById('consentCheckbox');
  const err = document.getElementById('consentError');
  if (!cb || !cb.checked) {
    if (err) err.style.display = 'block';
    return;
  }
  if (err) err.style.display = 'none';
  const m = document.getElementById('consentModal');
  if (m) m.style.display = 'none';
  _proceedWithRegistration();
}

// Shared by the optional "create an account" prompt on the order-success
// screens (payment.html's invoice/PO modal, order-confirmation.html's card
// flow). Stashes what the guest already typed at checkout so the signup
// form on /login doesn't make them retype it, then hands off to login.html,
// which reads this and opens the registration modal pre-filled.
function promptCreateAccountFromCheckout(checkout) {
  checkout = checkout || {};
  const nameParts = (checkout.contact || '').trim().split(/\s+/);
  localStorage.setItem('rrs_signup_prefill', JSON.stringify({
    firstName: nameParts[0] || '',
    lastName:  nameParts.slice(1).join(' ') || '',
    business:  checkout.business || '',
    email:     checkout.email || '',
    phone:     checkout.phone || '',
  }));
  window.location.href = '/login?open=register';
}

function openRegisterModal(prefill) {
  const modal = document.getElementById('registerModal');
  if (!modal) return;
  document.body.appendChild(modal); // move to body to escape stacking context
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Reset form
  ['regFirstName','regLastName','regBusiness','regEmail','regPhone','regPassword','regConfirm','regSubDistCode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Pre-fill from an optional create-account prompt (e.g. after guest
  // checkout) so the customer doesn't have to retype what they already gave us.
  if (prefill) {
    if (prefill.firstName) document.getElementById('regFirstName').value = prefill.firstName;
    if (prefill.lastName)  document.getElementById('regLastName').value  = prefill.lastName;
    if (prefill.business)  document.getElementById('regBusiness').value  = prefill.business;
    if (prefill.email)     document.getElementById('regEmail').value     = prefill.email;
    if (prefill.phone)     document.getElementById('regPhone').value     = prefill.phone;
  }
  document.getElementById('regSubDistNo').checked = true;
  toggleSubDistFields(false);
  const err = document.getElementById('regError');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  document.getElementById('reg-step-1').style.display = 'block';
  document.getElementById('reg-step-success').style.display = 'none';

  // On an affiliate's own subdomain, registering here should attribute to
  // them without the customer having to know a code exists at all -- same
  // reasoning as autoFillReferralCode() at checkout. Locked so it can't be
  // cleared/overwritten while on that subdomain.
  resolveAffiliateSubdomain().then(function (affiliate) {
    if (!affiliate || !affiliate.referral_code) return;
    const yesRadio = document.getElementById('regSubDistYes');
    const codeInput = document.getElementById('regSubDistCode');
    if (!yesRadio || !codeInput) return;
    yesRadio.checked = true;
    toggleSubDistFields(true);
    codeInput.value = affiliate.referral_code;
    codeInput.readOnly = true;
    codeInput.style.background = '#f8fafc';
    codeInput.style.cursor = 'not-allowed';
    document.querySelectorAll('input[name="regSubDist"]').forEach(function (r) { r.disabled = true; });
    validateRegCode();
  });
}

function closeRegisterModal() {
  const modal = document.getElementById('registerModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function toggleSubDistFields(show) {
  const fields = document.getElementById('regSubDistFields');
  if (fields) fields.style.display = show ? 'block' : 'none';
  if (!show) {
    const status = document.getElementById('regCodeStatus');
    if (status) status.textContent = '';
    const nameRow = document.getElementById('regSubDistNameRow');
    if (nameRow) nameRow.style.display = 'none';
  }
}

let _regValidatedDistributor = null; // { id, name, employee_id, commission_pct }

async function validateRegCode() {
  const code = (document.getElementById('regSubDistCode')?.value || '').trim().toUpperCase();
  const statusEl = document.getElementById('regCodeStatus');
  const nameRow  = document.getElementById('regSubDistNameRow');
  const nameEl   = document.getElementById('regSubDistName');
  _regValidatedDistributor = null;

  if (!code || !statusEl) return;
  if (!window.sb) { statusEl.style.color = '#888'; statusEl.textContent = 'Validation unavailable.'; return; }

  statusEl.style.color = '#888'; statusEl.textContent = 'Checking code…';

  // Check sub-distributor codes first.
  // Goes through lookup_referral_code() rather than selecting the table:
  // sub_distributors holds affiliate email, phone and internal notes, so it
  // is staff-only under RLS. The function returns just id/name/commission
  // for an exact active code -- enough to validate a referral, useless for
  // harvesting affiliate contact details.
  const { data: sdRows } = await window.sb
    .rpc('lookup_referral_code', { p_code: code });
  const sd = Array.isArray(sdRows) ? sdRows[0] : sdRows;

  if (sd) {
    _regValidatedDistributor = { id: sd.id, name: sd.name, commission_pct: sd.commission_pct, employee_id: null };
    statusEl.style.color = '#22c55e';
    statusEl.textContent = '✓ Valid code – ' + sd.name;
    if (nameEl) nameEl.value = sd.name;
    if (nameRow) nameRow.style.display = 'block';
    return;
  }

  // Check employee codes (same reasoning as above)
  const { data: empRows } = await window.sb
    .rpc('lookup_employee_referral_code', { p_code: code });
  const emp = Array.isArray(empRows) ? empRows[0] : empRows;

  if (emp) {
    const sdName = emp.sub_distributor_name || 'Sub-Distributor';
    _regValidatedDistributor = {
      id: emp.sub_distributor_id,
      name: sdName,
      commission_pct: emp.commission_pct || 0,
      employee_id: emp.employee_id,
    };
    statusEl.style.color = '#22c55e';
    statusEl.textContent = '✓ Valid code – ' + emp.name + ' (' + sdName + ')';
    if (nameEl) nameEl.value = sdName;
    if (nameRow) nameRow.style.display = 'block';
    return;
  }

  statusEl.style.color = '#ef4444';
  statusEl.textContent = '✕ Invalid or inactive referral code.';
  if (nameRow) nameRow.style.display = 'none';
}

// Debounced code check on input
let _regCodeTimer = null;
document.addEventListener('input', e => {
  if (e.target.id === 'regSubDistCode') {
    clearTimeout(_regCodeTimer);
    _regCodeTimer = setTimeout(validateRegCode, 700);
  }
});

function submitRegistration() {
  // Validate fields first, then show consent modal before creating account
  const firstName = document.getElementById('regFirstName')?.value.trim() || '';
  const lastName  = document.getElementById('regLastName')?.value.trim()  || '';
  const business  = document.getElementById('regBusiness')?.value.trim()  || '';
  const email     = document.getElementById('regEmail')?.value.trim()     || '';
  const password  = document.getElementById('regPassword')?.value         || '';
  const confirm   = document.getElementById('regConfirm')?.value          || '';
  const showErr   = m => { const e = document.getElementById('regError'); if (e) { e.textContent = m; e.style.display = 'block'; } };
  const clearErr  = () => { const e = document.getElementById('regError'); if (e) e.style.display = 'none'; };
  clearErr();
  if (!firstName || !lastName) return showErr('Please enter your first and last name.');
  if (!business)  return showErr('Please enter your business name.');
  if (!email)     return showErr('Please enter your email address.');
  if (!password)  return showErr('Please enter a password.');
  if (password.length < 6) return showErr('Password must be at least 6 characters.');
  if (password !== confirm) return showErr('Passwords do not match.');
  // All fields valid – show consent modal
  showConsentModal();
}

async function _proceedWithRegistration() {
  const firstName = document.getElementById('regFirstName')?.value.trim();
  const lastName  = document.getElementById('regLastName')?.value.trim();
  const business  = document.getElementById('regBusiness')?.value.trim();
  const email     = document.getElementById('regEmail')?.value.trim();
  const phone     = document.getElementById('regPhone')?.value.trim();
  const password  = document.getElementById('regPassword')?.value;
  const confirm   = document.getElementById('regConfirm')?.value;
  const hasSubDist = document.getElementById('regSubDistYes')?.checked;
  const code      = document.getElementById('regSubDistCode')?.value.trim().toUpperCase();
  const errEl     = document.getElementById('regError');

  function showErr(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  if (!firstName || !lastName) return showErr('Please enter your first and last name.');
  if (!business)  return showErr('Please enter your business name.');
  if (!email)     return showErr('Please enter your email address.');
  if (password.length < 6) return showErr('Password must be at least 6 characters.');
  if (password !== confirm) return showErr('Passwords do not match.');

  if (hasSubDist) {
    if (!code) return showErr('Please enter a sub-distributor referral code.');
    if (!_regValidatedDistributor) {
      await validateRegCode();
      if (!_regValidatedDistributor) return showErr('Invalid referral code. Please check and try again.');
    }
  }

  if (!window.sb) return showErr('Registration service unavailable. Please try again.');

  const btn = document.querySelector('#reg-step-1 button[onclick="submitRegistration()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }

  const { data: authData, error: authErr } = await window.sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name:  lastName,
        business_name: business,
        phone,
      }
    }
  });

  if (authErr) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    return showErr(authErr.message);
  }

  const userId = authData?.user?.id;

  // Upsert profile
  if (userId && window.sb) {
    const marketingOptIn = document.getElementById('regMarketingOptIn')?.checked ?? true;
    await window.sb.from('profiles').upsert({
      id: userId,
      email,
      contact_name: firstName + ' ' + lastName,
      business_name: business,
      phone,
      role: 'customer',
      accepted_terms: true,
      accepted_terms_at: new Date().toISOString(),
      marketing_opt_in: marketingOptIn,
      marketing_opt_in_at: marketingOptIn ? new Date().toISOString() : null,
    }, { onConflict: 'id' });

    // Link to sub-distributor if applicable
    if (hasSubDist && _regValidatedDistributor) {
      await window.sb.from('customer_sub_distributor_links').insert({
        user_id:           userId,
        sub_distributor_id: _regValidatedDistributor.id,
        employee_id:        _regValidatedDistributor.employee_id,
        referral_code_used: code,
      });
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
  document.getElementById('reg-step-1').style.display = 'none';
  document.getElementById('reg-step-success').style.display = 'block';
}

/* =========================
   REFERRAL CODE – CHECKOUT
========================= */

let _checkoutReferral = null; // { sub_distributor_id, employee_id, commission_pct, name }

function clearReferralStatus() {
  const el = document.getElementById('referral-code-status');
  if (el) { el.textContent = ''; el.style.color = '#888'; }
  _checkoutReferral = null;
}

async function validateReferralCode(code) {
  code = (code || '').trim().toUpperCase();
  const statusEl = document.getElementById('referral-code-status');
  _checkoutReferral = null;

  if (!code) { if (statusEl) statusEl.textContent = ''; return; }
  if (!window.sb) { if (statusEl) { statusEl.style.color = '#888'; statusEl.textContent = 'Validation unavailable.'; } return; }

  if (statusEl) { statusEl.style.color = '#888'; statusEl.textContent = 'Checking…'; }

  // Via lookup_referral_code() -- the base table is staff-only under RLS
  // because it holds affiliate email/phone/notes. See the migration
  // 20260909_secure_sub_distributors_lookup.sql.
  const { data: sdRows } = await window.sb
    .rpc('lookup_referral_code', { p_code: code });
  const sd = Array.isArray(sdRows) ? sdRows[0] : sdRows;

  if (sd) {
    _checkoutReferral = { sub_distributor_id: sd.id, employee_id: null, commission_pct: sd.commission_pct, name: sd.name };
    if (statusEl) { statusEl.style.color = '#22c55e'; statusEl.textContent = '✓ Applied – ' + sd.name; }
    return;
  }

  const { data: empRows } = await window.sb
    .rpc('lookup_employee_referral_code', { p_code: code });
  const emp = Array.isArray(empRows) ? empRows[0] : empRows;

  if (emp) {
    _checkoutReferral = {
      sub_distributor_id: emp.sub_distributor_id,
      employee_id: emp.employee_id,
      commission_pct: emp.commission_pct || 0,
      name: emp.employee_name + ' (' + (emp.sub_distributor_name || '') + ')',
    };
    if (statusEl) { statusEl.style.color = '#22c55e'; statusEl.textContent = '✓ Applied – ' + _checkoutReferral.name; }
    return;
  }

  if (statusEl) { statusEl.style.color = '#ef4444'; statusEl.textContent = '✕ Invalid or inactive referral code.'; }
}

async function autoFillReferralCode() {
  const codeInput = document.getElementById('checkout-referral-code');
  if (!codeInput || !window.sb) return;

  // The subdomain the customer is actually shopping on takes priority
  // over everything else -- it's what makes an affiliate's storefront
  // actually attribute sales to them. Locked (not just pre-filled) so a
  // customer on trustmark.roomreadysupply.com can't accidentally blank it
  // or type over it with an unrelated code; the field still shows what
  // was applied and why, it's just not editable while on that subdomain.
  const affiliate = await resolveAffiliateSubdomain();
  if (affiliate && affiliate.referral_code) {
    codeInput.value = affiliate.referral_code;
    codeInput.readOnly = true;
    codeInput.style.background = '#f8fafc';
    codeInput.style.cursor = 'not-allowed';
    const applyBtn = document.getElementById('checkout-referral-apply-btn');
    if (applyBtn) applyBtn.style.display = 'none';
    // validateReferralCode is async and writes its own status text on
    // completion -- await it first so this subdomain-specific message
    // (more informative than its generic "✓ Applied – <name>") is the one
    // left standing, not overwritten by a race.
    await validateReferralCode(affiliate.referral_code);
    const statusEl = document.getElementById('referral-code-status');
    if (statusEl) {
      statusEl.style.color = '#22c55e';
      statusEl.textContent = '✓ Shopping via ' + affiliate.name + '’s storefront';
    }
    return;
  }

  // Not on an affiliate subdomain -- fall back to the existing behavior:
  // a signed-in returning customer who previously used a code gets it
  // pre-filled (editable) so they don't have to remember/retype it.
  const { data: { user } } = await window.sb.auth.getUser().catch(function() { return { data: { user: null } }; });
  if (!user) return;
  const { data: link } = await window.sb
    .from('customer_sub_distributor_links')
    .select('referral_code_used')
    .eq('user_id', user.id)
    .maybeSingle();
  if (link && link.referral_code_used) {
    codeInput.value = link.referral_code_used;
    validateReferralCode(link.referral_code_used);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('checkout-referral-code')) autoFillReferralCode();
});


// -- Stat counter animation ----------------------------------
// The real value is now the element's actual starting textContent (set
// directly in the HTML, e.g. "500+") -- this animation is purely a
// count-up visual flourish layered on top of content that is already
// correct. Previously the HTML started at a literal "0" and relied
// entirely on this script (an IntersectionObserver-gated animation,
// threshold 0.5) to ever show the real number -- a bounced visitor, a
// short viewport, a JS error earlier on the page, or any crawler/tool
// that doesn't scroll or doesn't run JS at all would see a permanent
// "0 Businesses Served" instead. If anything here fails now, the
// number was already right before this ran.
(function () {
  const counters = document.querySelectorAll('.stat-count');
  if (!counters.length) return;

  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    if (!Number.isFinite(target)) return; // malformed data-target -- leave the real starting text alone
    const suffix = el.dataset.suffix || '';
    const duration = parseInt(el.dataset.duration, 10) || 1600;
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);
      el.textContent = current + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix; // land exactly on the real value, no float/round drift
    }

    requestAnimationFrame(step);
  }

  if (!('IntersectionObserver' in window)) return; // no observer support -- real value is already showing, nothing to enhance

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(function (el) { observer.observe(el); });
})();

// -- Schedule pill interaction --------------------------------
(function () {
  const pills = document.querySelectorAll('.schedule-pill');
  const deliveryText = document.getElementById('nextDeliveryText');
  if (!pills.length || !deliveryText) return;

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      const days = parseInt(pill.dataset.days, 10);
      if (days === 0) {
        deliveryText.textContent = 'a custom date';
      } else if (days === 1) {
        deliveryText.textContent = '1 day';
      } else {
        deliveryText.textContent = days + ' days';
      }
    });
  });
})();


/* =========================
   HOMEPAGE PRODUCT SHOWCASE
   Fills the two homepage grids (#hcDealsGrid, #hcBestsellersGrid) that
   replaced the old single random #featured-products slider. Cards read
   their price from the catalog at render time, so a supplier price
   change flows through with no edit here.
========================= */

/**
 * Normalise a product image to a square crop.
 *
 * The catalog draws from two CDNs with different native shapes -- padded
 * squares from Cloudinary, portrait or landscape photos from the supplier's
 * Shopify CDN -- which made products render at visibly different sizes in a
 * grid. Both CDNs can crop server-side, so ask each for a square and let the
 * card display it as-is.
 */
function hcSquareImage(url, size) {
  if (!url) return url;
  const px = size || 480;

  // Cloudinary: swap the stored white-pad transform for a filled crop.
  if (/res\.cloudinary\.com/.test(url)) {
    return url.replace(/c_pad,w_\d+,h_\d+,b_white/, `c_fill,g_auto,w_${px},h_${px}`);
  }

  // Shopify CDN (innstyle): the _WxH token in the filename sets the render
  // size; _crop_center squares off a non-square original.
  if (/cdn\/shop\//.test(url)) {
    return url.replace(/_(\d+)x(\d+)(?=\.[a-z]+)/i, `_${px}x${px}_crop_center`);
  }

  return url;
}

function hcProductCard(product, badge) {
  // price1 is the per-case price the cart actually charges (getTierPrice),
  // so it is what the card must show -- the base `price` column is a
  // per-DOZEN figure on linen products and would understate them badly.
  const price = cleanPrice(product.price1) || cleanPrice(product.price);
  const unit  = product.priceBy || "Case";
  const url   = `/product?item=${encodeURIComponent(product.slug)}`;

  const badgeHtml = badge
    ? `<span class="hc-badge${badge === "FREE SHIPPING" ? " hc-badge--ship" : ""}">${badge}</span>`
    : "";

  // Only say something that adds information. "Case of 1" next to a "/ Each"
  // price is noise, and pack size is often just "1", which produced meta
  // lines reading "Case of 1 &middot; 1" on every individually-sold item.
  const caseQty = parseInt(product.caseQty, 10);
  const size    = String(product.size || "").trim();
  const meta = [
    caseQty > 1 ? `Case of ${caseQty}` : "",
    size && size !== "1" ? size : "",
  ].filter(Boolean).join(" &middot; ");

  return `
    <div class="hc-card" data-url="${url}">
      <div class="hc-card-img">
        ${badgeHtml}
        <img src="${hcSquareImage(product.image)}" alt="${product.name}" loading="lazy"
             onerror="this.onerror=null;this.src='${product.image}'">
      </div>
      <div class="hc-card-body">
        <h3>${product.name}</h3>
        ${meta ? `<p class="hc-card-meta">${meta}</p>` : ""}

        <div class="hc-price-row">
          <span class="hc-price">$${price.toFixed(2)}</span>
          <span class="hc-price-unit">/ ${unit}</span>
        </div>

        <button class="add-btn hc-add"
          data-item="${product.itemNumber}"
          data-name="${product.name}"
          data-description="${product.description || ""}"
          data-price="${cleanPrice(product.price1) || price}"
          data-price1="${cleanPrice(product.price1)}"
          data-price2="${cleanPrice(product.price2)}"
          data-price3="${cleanPrice(product.price3)}"
          data-unit="${product.priceBy || ''}"
          data-moq="${productMoq(product)}"
          data-moq-group="${product.moqGroup || ''}"
          data-moq-group-min="${product.moqGroupMin || ''}"
          data-image="${product.image}">
          <img src="assets/img/Cart.png" alt="">
          ADD TO CART
        </button>
      </div>
    </div>
  `;
}

function renderHomeProducts() {
  const dealsEl = document.getElementById("hcDealsGrid");
  const bestEl  = document.getElementById("hcBestsellersGrid");
  if (!dealsEl && !bestEl) return;

  const sellable = allProducts.filter(p =>
    p.name && p.image && (cleanPrice(p.price1) || cleanPrice(p.price)) > 0
  );
  if (!sellable.length) return;

  const priceOf = p => cleanPrice(p.price1) || cleanPrice(p.price);

  if (dealsEl) {
    // "Best value" = genuinely the lowest per-case entry points, so the
    // section's claim is checkable rather than decorative.
    const deals = sellable.slice().sort((a, b) => priceOf(a) - priceOf(b)).slice(0, 8);
    dealsEl.innerHTML = deals.map(p => hcProductCard(p, "BEST VALUE")).join("");
    dealsEl.setAttribute("aria-busy", "false");
  }

  if (bestEl) {
    // Spread across categories so the grid reads as a range of what RRS
    // stocks, not eight variants of the same towel. Falls back to simple
    // order if category data is missing.
    const byCat = new Map();
    sortCatalogDefault(sellable).forEach(p => {
      const key = p.category || "other";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(p);
    });

    const picks = [];
    let round = 0;
    while (picks.length < 8 && round < 8) {
      for (const list of byCat.values()) {
        if (list[round]) picks.push(list[round]);
        if (picks.length >= 8) break;
      }
      round++;
    }
    const chosen = picks.length ? picks.slice(0, 8) : sellable.slice(0, 8);

    bestEl.innerHTML = chosen.map(p => hcProductCard(p, "")).join("");
    bestEl.setAttribute("aria-busy", "false");
  }

  // Reuse the catalog's own handlers so these cards add to cart and
  // navigate exactly like every other product card on the site.
  setupProductCardClicks();
  setupAddToCartButtons();
}


/**
 * Give each homepage category tile a real product photo and a live item
 * count, taken from the catalog rather than hardcoded, so the tiles keep
 * matching what the category pages actually contain.
 */
function fillCategoryTiles() {
  const tiles = document.querySelectorAll('.hc-cat[data-cat]');
  if (!tiles.length || !allProducts.length) return;

  // Group once: slug -> products that the matching /category page shows.
  const bySlug = new Map();
  allProducts.forEach(p => {
    if (!p.category) return;
    const slug = categorySlug(p.category);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(p);
  });

  tiles.forEach(tile => {
    const slug = tile.dataset.cat;
    const list = bySlug.get(slug);

    // Hide the tile outright when its category currently has zero
    // products, instead of leaving an empty/placeholder card. This was
    // previously misdiagnosed as a missing-photo problem (a prior fix
    // here made the tile fall back to a placeholder icon), but checking
    // the live catalog directly shows these four categories have NO
    // products at all right now -- 0 rows for "Bed Sheets & Linens",
    // "Guest Amenities", "Gloves & PPE", and "Pillows & Mattress
    // Protectors" as of 2026-09-21. That's a real, if hopefully
    // temporary, inventory gap (see the RDU vendor removal a few days
    // earlier), not a photo gap or a slug-matching bug -- categorySlug()
    // and these tiles' data-cat values already agree, there's just
    // nothing to show. Re-add the tile automatically once products exist
    // in that category again; nothing else needs to change for that.
    if (!list || !list.length) {
      tile.style.display = 'none';
      return;
    }
    tile.style.display = '';

    // Prefer a product whose image is a Cloudinary asset: those are
    // padded onto a white square, so they sit in the tile frame cleanly.
    // Anything else (e.g. a supplier's own crop) is a fallback.
    const withImg = list.filter(p => p.image);
    const img = tile.querySelector('.hc-cat-img img');
    if (img) {
      if (withImg.length) {
        const preferred = withImg.find(p => /res\.cloudinary\.com/.test(p.image)) || withImg[0];
        // Same square-crop normalisation the product cards use, at tile size.
        img.src = hcSquareImage(preferred.image, 240);
        img.alt = (preferred.category || slug) + ' products';
      } else {
        // Category is real and has stock, just no photo uploaded yet for
        // any product in it -- show the same placeholder used everywhere
        // else a product has no photo, rather than a blank tile.
        img.src = '/assets/img/product-placeholder.svg';
        img.alt = (list[0].category || slug) + ' products';
      }
      img.onerror = function () { this.src = '/assets/img/product-placeholder.svg'; };
    }

    const h3 = tile.querySelector('h3');
    if (h3 && !tile.querySelector('.hc-cat-count')) {
      const count = document.createElement('span');
      count.className = 'hc-cat-count';
      // Total products in the category, not just the ones with a photo --
      // counting only photographed products would understate real
      // inventory for any category missing photos.
      count.textContent = list.length + (list.length === 1 ? ' product' : ' products');
      h3.insertAdjacentElement('afterend', count);
    }
  });
}

/* =========================
   PERSISTENT MINI-CART
   A docked panel that shows what's in the cart while the customer is
   still shopping, so the order stays visible as they build it instead of
   living behind the header icon. Built lazily on first use and rendered
   from the same localStorage cart every other surface reads, so it cannot
   drift out of sync with the badge or the cart page.

   Deliberately hidden on /cart, /checkout and /payment: those pages ARE
   the cart, and a floating duplicate of it would just cover their own
   controls.
========================= */

const MINICART_COLLAPSE_KEY = "rrs_minicart_collapsed";

function miniCartSuppressed() {
  const p = (location.pathname || "").toLowerCase().replace(/\.html$/, "");
  return p.endsWith("/cart") || p.endsWith("/checkout") || p.endsWith("/payment");
}

// Collapsed unless the customer has explicitly opened it. Expanded by
// default, the panel is tall enough to sit on top of the product page's
// buy box (measured overlapping Add to Cart at 1440px), which would put a
// convenience feature in front of the button the page exists for. The
// collapsed header still shows item count and running total, so the order
// stays visible while they shop -- one click opens the full list, and that
// choice is remembered across pages.
function miniCartCollapsed() {
  try {
    const v = localStorage.getItem(MINICART_COLLAPSE_KEY);
    return v === null ? true : v === "1";
  } catch { return true; }
}

function toggleMiniCart() {
  const panel = document.getElementById("miniCart");
  if (!panel) return;
  const collapsed = !panel.classList.contains("mc-collapsed");
  panel.classList.toggle("mc-collapsed", collapsed);
  try { localStorage.setItem(MINICART_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch {}
}

// Quantity stepper inside the panel. Removing the last unit removes the
// line, matching how the cart page behaves.
function miniCartSetQty(itemNumber, delta) {
  const cart = getCart();
  const item = cart.find(i => String(i.itemNumber) === String(itemNumber));
  if (!item) return;

  const step = isSoldByDozen(item) ? (productMoq(item) || 1) : 1;
  const next = (Number(item.quantity) || 0) + (delta * step);

  const remaining = next > 0
    ? cart.map(i => (String(i.itemNumber) === String(itemNumber) ? { ...i, quantity: next } : i))
    : cart.filter(i => String(i.itemNumber) !== String(itemNumber));

  saveCart(remaining);
  updateCartBadge();
  // The cart page renders its own list from the same storage, so keep it
  // in step when the panel is open on top of it (it is suppressed there,
  // but a future page may render both).
  if (typeof renderCartPage === "function") renderCartPage();
}

/**
 * Typed quantity, for ordering 36 of something without clicking + thirty-six
 * times. Validated on commit (blur/Enter) rather than per keystroke: a
 * dozen-sold product with a 50-dozen minimum would otherwise snap to 50 the
 * instant "5" was typed, fighting someone on their way to 500.
 *
 * A line whose product is sold in whole cases/dozens still has to land on a
 * multiple of that -- same rule enforceCartMinimums() blocks checkout over,
 * applied here so the cart never holds a quantity checkout would reject.
 * Typing 0 (or clearing the box) removes the line, matching what stepping
 * down past 1 already does.
 */
function miniCartTypeQty(itemNumber, rawValue, commit) {
  if (!commit) return; // oninput does nothing; the commit happens on change/Enter

  const cart = getCart();
  const item = cart.find(i => String(i.itemNumber) === String(itemNumber));
  if (!item) return;

  const typed = parseInt(String(rawValue).replace(/[^0-9]/g, ""), 10);

  // Cleared or zero: treat as "remove this line", same as stepping to 0.
  if (!Number.isFinite(typed) || typed <= 0) {
    saveCart(cart.filter(i => String(i.itemNumber) !== String(itemNumber)));
    updateCartBadge();
    if (typeof renderCartPage === "function") renderCartPage();
    return;
  }

  // Dozen-sold lines must be a whole multiple of their minimum; everything
  // else (case- and each-sold) steps by 1 and needs no rounding.
  const step = isSoldByDozen(item) ? (productMoq(item) || 1) : 1;
  const snapped = step > 1 ? Math.max(step, Math.round(typed / step) * step) : typed;

  saveCart(cart.map(i =>
    String(i.itemNumber) === String(itemNumber) ? { ...i, quantity: snapped } : i
  ));
  updateCartBadge();
  if (typeof renderCartPage === "function") renderCartPage();

  // Only say something when the number actually changed under them --
  // silently rewriting what someone typed reads as the box being broken.
  if (snapped !== typed && typeof showVpToast === "function") {
    showVpToast(`Sold in multiples of ${step} — quantity set to ${snapped}.`, "warn");
  }
}

function updateMiniCart() {
  if (miniCartSuppressed()) {
    const existing = document.getElementById("miniCart");
    if (existing) existing.style.display = "none";
    return;
  }

  const cart = getCart();
  let panel = document.getElementById("miniCart");

  // Nothing in the cart: no panel at all, rather than an empty box
  // following the customer around the site.
  if (!cart.length) {
    if (panel) panel.style.display = "none";
    return;
  }

  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "miniCart";
    panel.className = "mini-cart";
    panel.setAttribute("aria-label", "Your order so far");
    if (miniCartCollapsed()) panel.classList.add("mc-collapsed");
    document.body.appendChild(panel);
  }

  const units = cart.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const subtotal = cart.reduce((s, i) => s + getTierPrice(i) * (Number(i.quantity) || 0), 0);

  // Volume tiers are PER ITEM, so the messaging below has to be about the
  // single biggest line, never the cart total. It previously summed every
  // case in the cart and then said "Add 4 more cases to reach 30+ case
  // pricing" -- which was simply false: adding 4 cases of a different
  // product moves no line into tier 3, and the promised price never
  // arrived. Dozen-sold lines are excluded because their quantity counts
  // dozens and they don't use the case tiers at all.
  const caseLines = cart.filter(i => !isSoldByDozen(i));
  const topLine = caseLines.reduce(
    (best, i) => ((Number(i.quantity) || 0) > (Number(best && best.quantity) || 0) ? i : best), null);
  const topLineQty = Number(topLine && topLine.quantity) || 0;

  // Free shipping is off site-wide (2026-09-22). Must stay in step with
  // FREE_SHIPPING_ENABLED in warp-freight.js, which is what actually
  // gates the freight quote; the two files do not both load on every
  // page, so the flag cannot be shared by reference. While false the
  // mini-cart says nothing about shipping at all -- a progress bar
  // toward an offer that no longer exists is worse than silence.
  const FREE_SHIPPING_ENABLED = false;
  const FREE_SHIPPING_MIN = 3000;
  const freeShipNote = !FREE_SHIPPING_ENABLED ? "" : (subtotal >= FREE_SHIPPING_MIN
    ? `<p class="mc-tier mc-tier-ship">
         <strong>Free shipping unlocked</strong>
       </p>`
    : `<p class="mc-tier">
         Add <strong>$${(FREE_SHIPPING_MIN - subtotal).toFixed(2)}</strong> more for free shipping.
       </p>`);

  // Named after the specific product it's talking about, so "add 4 more"
  // is an instruction the customer can actually act on and that actually
  // produces the promised price.
  let tierNote = "";
  if (topLineQty >= BULK_VOLUME_MIN_CASES) {
    tierNote = `<a class="mc-tier mc-tier-bulk" href="/quote">
        <strong>${topLineQty} cases of one item &mdash; you qualify for extra pricing</strong>
        <span>Send us your list for even better pricing &rsaquo;</span>
      </a>`;
  } else if (topLineQty > 0) {
    const toNext = topLineQty < 6 ? 6 - topLineQty
                 : (topLineQty < 30 ? 30 - topLineQty : BULK_VOLUME_MIN_CASES - topLineQty);
    const nextLabel = topLineQty < 6 ? "6+ case pricing"
                    : (topLineQty < 30 ? "30+ case pricing" : "extra 50+ case pricing");
    const shortName = escapeMiniCart((topLine.name || "this item").split(",")[0]).slice(0, 38);
    tierNote = `<p class="mc-tier">
        Add <strong>${toNext} more case${toNext === 1 ? "" : "s"}</strong> of
        <strong>${shortName}</strong> to reach ${nextLabel}.
      </p>`;
  }

  // Reorder saving, when any line is on a schedule -- the mini-cart shows
  // a running total, so it must reflect the same discount the cart and
  // checkout apply or the number changes on the next page for no visible
  // reason.
  const mcDiscount = reorderDiscountAmount(subtotal, cart);
  const reorderNote = mcDiscount > 0
    ? `<p class="mc-tier mc-tier-ship">
         <strong>Reorder Program &minus;${REORDER_DISCOUNT_LABEL}</strong>
         <span>&minus;$${mcDiscount.toFixed(2)} applied at checkout</span>
       </p>`
    : "";

  const rows = cart.map(i => {
    const qty = Number(i.quantity) || 0;
    const unit = isSoldByDozen(i) ? "dz" : "cs";
    return `
      <li class="mc-row">
        <img src="${i.image || "/assets/img/product-placeholder.svg"}" alt=""
             onerror="this.onerror=null;this.src='/assets/img/product-placeholder.svg'">
        <div class="mc-row-main">
          <p class="mc-row-name">${escapeMiniCart(i.name || "Product")}</p>
          <p class="mc-row-price">$${getTierPrice(i).toFixed(2)} <span>/ ${unit}</span></p>
        </div>
        <div class="mc-qty">
          <button type="button" aria-label="Decrease quantity"
            onclick="miniCartSetQty('${String(i.itemNumber).replace(/'/g, "\\'")}', -1)">&minus;</button>
          <!-- Typed directly so ordering 36 doesn't mean clicking + 36
               times. inputmode=numeric brings up the number pad on a
               phone without type=number's spinner arrows, which would
               crowd a 44px-wide box. Committed on change (blur) and on
               Enter; see miniCartTypeQty() for why not on every keystroke.
               Re-rendering on commit replaces this input, so the value
               shown always comes back from the cart, never from what was
               typed. -->
          <input type="text" inputmode="numeric" pattern="[0-9]*"
            class="mc-qty-input" value="${qty}" aria-label="Quantity"
            onchange="miniCartTypeQty('${String(i.itemNumber).replace(/'/g, "\\'")}', this.value, true)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
            onclick="this.select()">
          <button type="button" aria-label="Increase quantity"
            onclick="miniCartSetQty('${String(i.itemNumber).replace(/'/g, "\\'")}', 1)">+</button>
        </div>
      </li>`;
  }).join("");

  panel.innerHTML = `
    <button type="button" class="mc-head" onclick="toggleMiniCart()"
            aria-expanded="${panel.classList.contains("mc-collapsed") ? "false" : "true"}">
      <span class="mc-head-title">Your order
        <span class="mc-head-count">${units}</span>
      </span>
      <span class="mc-head-total">$${(subtotal - mcDiscount).toFixed(2)}</span>
      <svg class="mc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="mc-body">
      <ul class="mc-list">${rows}</ul>
      ${reorderNote}
      ${freeShipNote}
      ${tierNote}
      <div class="mc-actions">
        <a class="mc-view" href="/cart">View cart</a>
        <a class="mc-checkout" href="/checkout">Checkout</a>
      </div>
    </div>`;

  panel.style.display = "";
}

// Local escaper: script.js has no shared one, and product names carry
// quotes and ampersands that would otherwise break out of the markup.
function escapeMiniCart(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
