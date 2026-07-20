console.log("Script loaded!");

let allProducts = [];
let featuredProducts = [];
let currentFeaturedIndex = 0;
let isSliding = false;

/* =========================
   PAGE LOAD
========================= */

document.addEventListener("DOMContentLoaded", () => {
  setupMobileNav();
  updateCartBadge();
  updateQuoteBadge();
  setupReorderDropdowns();
  setupLogin();
  setupAccountDropdown();
  setupPasswordToggle();
  setupProductQuantity();
  loadCartPage();
  loadCheckoutProducts();
  loadPaymentSummary();
  setupCalendar();
  setupFeaturedSliderButtons();

  fetch("/products.csv")
    .then(response => response.text())
    .then(csvText => {
      allProducts = parseCSV(csvText);

      const prioritized = allProducts.slice().sort((a, b) => getProductPriority(a) - getProductPriority(b));
      renderProducts(prioritized);
      loadProductPage();
      loadFeaturedProducts();

      setupProductQuantity();
      setupAddToCartButtons();
    })
    .catch(error => {
      console.error("Error loading products.csv:", error);
    });
});

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
  const cartCount = document.getElementById("cart-count");
  if (!cartCount) return;

  const cart = getCart();

  const totalItems = cart.reduce((total, item) => {
    return total + (Number(item.quantity) || 1);
  }, 0);

  cartCount.textContent = totalItems;
  cartCount.style.display = totalItems > 0 ? "flex" : "none";
}

/* =========================
   CSV PARSER
========================= */

function parseCSV(csvText) {
  const rows = csvText.trim().split(/\r?\n/);

  return rows.slice(1).map(row => {
    const values = splitCSVRow(row);

    return {
      name: values[0]?.trim() || "",
      itemNumber: values[1]?.trim() || "",
      image: values[2]?.trim() || "",
      description: values[3]?.trim() || "",
      overview: values[4]?.trim() || "",

      feature1: values[5]?.trim() || "",
      feature2: values[6]?.trim() || "",
      feature3: values[7]?.trim() || "",
      feature4: values[8]?.trim() || "",

      caseQty: values[9]?.trim() || "",
      size: values[10]?.trim() || "",
      price: values[11]?.trim() || "",

      price1: values[12]?.trim() || "",
      price2: values[13]?.trim() || "",
      price3: values[14]?.trim() || "",

      productFamily: values[15]?.trim() || "",
      variantLabel:  values[16]?.trim() || "",
      colorGroup:    values[23]?.trim() || "",
      colorLabel:    values[24]?.trim() || "",

      sellByEach: values[17]?.trim() || "",
      priceBy:    values[18]?.trim() || "",
      weight:     values[19]?.trim() || "",
      length:     values[20]?.trim() || "",
      width:      values[21]?.trim() || "",
      height:     values[22]?.trim() || "",

      get slug() {
        return (this.itemNumber || this.name)
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
    };
  });
}

function splitCSVRow(row) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function cleanPrice(price) {
  return Number(
    String(price || "")
      .replace("$", "")
      .replace(",", "")
      .trim()
  ) || 0;
}

function getTierPrice(item) {
  const qty = Number(item.quantity) || 1;

  const tier1 = cleanPrice(item.price1);
  const tier2 = cleanPrice(item.price2);
  const tier3 = cleanPrice(item.price3);
  const base = cleanPrice(item.price);

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
    /* ── Catalog card pills ── */
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

    /* ── Product page pills — larger, with a header label ── */
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
        <img src="${product.image}" alt="${product.name}" onerror="this.src='/blanket.png'">
      </div>
      <div class="product-content">
        <h3>${product.name}</h3>
        <p class="product-description">${product.description || ""}</p>
        <div class="product-details">
          <div class="detail-item">
            <img src="box.svg" alt="">
            <span>Case Qty: ${product.caseQty || ""}</span>
          </div>
          <div class="detail-item">
            <img src="pack.svg" alt="">
            <span>Pack Size: ${product.size || ""}</span>
          </div>
        </div>
        <div class="product-bottom">
          <div>
            <span class="price">$${price.toFixed(2)}</span>
            <span class="unit">/ ${product.priceBy || "Case"}</span>
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
  }));

  const escapedJson = JSON.stringify(variantsData)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  // Deduplicate by variantLabel — when color variants exist, show one pill per size
  // and append color label only when there are multiple colors per size
  const hasColors = variants.some(vv => vv.colorLabel);
  const seenLabels = new Map(); // variantLabel -> first index
  variants.forEach((vv, i) => {
    const label = vv.variantLabel || vv.size || "Option " + (i + 1);
    if (!seenLabels.has(label)) seenLabels.set(label, i);
  });
  const dedupedVariants = variants.filter((vv, i) => {
    const label = vv.variantLabel || vv.size || "Option " + (i + 1);
    return seenLabels.get(label) === i;
  });
  const pillsHtml = dedupedVariants.map((vv, i) => {
    const label = vv.variantLabel || vv.size || "Option " + (i + 1);
    const colorBadge = hasColors && vv.colorLabel ? ` <span style="font-size:10px;opacity:.7;">· ${vv.colorLabel}</span>` : "";
    return `<button class="variant-pill${i === 0 ? " active" : ""}" onclick="selectVariant(this,${variants.indexOf(vv)})">${label}${colorBadge}</button>`;
  }).join("");

  return `
    <div class="product-card"
         data-url="/product?item=${encodeURIComponent(v.slug)}"
         data-variants="${escapedJson}">
      <div class="product-image">
        <img src="${v.image}" alt="${v.productFamily || v.name}" onerror="this.src='/blanket.png'">
      </div>
      <div class="product-content">
        <h3>${v.productFamily || v.name}</h3>
        <div class="variant-selector">${pillsHtml}</div>
        <p class="product-description">${v.description || ""}</p>
        <div class="product-details">
          <div class="detail-item">
            <img src="box.svg" alt="">
            <span>Case Qty: ${v.caseQty || ""}</span>
          </div>
          <div class="detail-item">
            <img src="pack.svg" alt="">
            <span>Pack Size: ${v.size || ""}</span>
          </div>
        </div>
        <div class="product-bottom">
          <div>
            <span class="price">$${price.toFixed(2)}</span>
            <span class="unit">/ ${v.priceBy || "Case"}</span>
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

function selectVariant(pillEl, idx) {
  const card = pillEl.closest(".product-card");
  const variants = JSON.parse(card.dataset.variants);
  const v = variants[idx];

  card.querySelectorAll(".variant-pill").forEach((p, i) => {
    p.classList.toggle("active", i === idx);
  });

  const displayPrice = cleanPrice(v.price);
  const cartPrice = cleanPrice(v.price1) || cleanPrice(v.price);
  const price = displayPrice || cartPrice;

  const priceEl = card.querySelector(".price");
  if (priceEl) priceEl.textContent = "$" + price.toFixed(2);

  const unitEl = card.querySelector(".unit");
  if (unitEl) unitEl.textContent = "/ " + (v.priceBy || "Case");

  const img = card.querySelector(".product-image img");
  if (img) img.src = v.image;

  const descEl = card.querySelector(".product-description");
  if (descEl) descEl.textContent = v.description || "";

  const spans = card.querySelectorAll(".detail-item span");
  if (spans[0]) spans[0].textContent = "Case Qty: " + v.caseQty;
  if (spans[1]) spans[1].textContent = "Pack Size: " + v.size;

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
  }

  const qBtn = card.querySelector(".quote-add-btn");
  if (qBtn) {
    qBtn.dataset.item  = v.itemNumber;
    qBtn.dataset.name  = v.name;
    qBtn.dataset.image = v.image;
  }
}

function renderProducts(products) {
  const grid = document.getElementById("products-grid");
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

function setupProductCardClicks() {
  document.querySelectorAll(".product-card").forEach(card => {
    card.onclick = e => {
      if (e.target.closest(".add-btn")) return;
      if (e.target.closest(".variant-pill")) return;

      const url = card.dataset.url;
      if (url) {
        window.location.href = url;
      }
    };
  });
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

const CATEGORY_KEYWORDS = {
  'toilet-paper':        ['bath tissue', 'toilet paper', 'toilet tissue', 'bath roll', '2-ply bathroom', '2 ply bathroom', 'bathroom tissue'],
  'paper-towels':        ['paper towel', 'hardwound', 'roll towel', 'kitchen towel', 'hand towel roll', 'center pull', 'multifold', 'c-fold', 'facial tissue', 'tissue'],
  'trash-liners':        ['can liner', 'trash bag', 'trash liner', 'garbage bag', 'liner'],
  'cleaning-chemicals':  ['bleach', 'disinfectant', 'cleaner', 'pine-sol', 'lysol', 'sanitizer', 'germicidal', 'multi-surface'],
  'hand-soap':           ['hand soap', 'hand wash', 'foaming soap', 'soap dispenser'],
  'laundry-supplies':    ['laundry', 'detergent', 'fabric softener', 'dryer sheet', 'washing'],
  'dishwashing-supplies':['dish', 'dishwasher', 'powerball', 'dawn', 'pot & pan', 'pot and pan'],
  'guest-room-supplies': ['guest', 'amenity', 'shampoo', 'conditioner', 'lotion', 'room supply'],
  'towels-linens':       ['bath towel', 'hand towel', 'pool towel', 'gym towel', 'linen', 'sheet set', 'bed sheet', 'pillowcase', 'blanket', 'washcloth', 'terry', 'microfiber towel'],
  'food-service':        ['food service', 'food safe', 'glove', 'nitrile', 'food prep'],
  'facility-supplies':   ['facility', 'janitorial', 'mop', 'broom', 'floor', 'squeegee'],
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

    // Category match — product must match at least one checked category
    if (catFilters.length > 0) {
      const haystack = (product.name + ' ' + product.description + ' ' + product.overview).toLowerCase();
      const matches = catFilters.some(cat => {
        const kws = CATEGORY_KEYWORDS[cat] || [];
        return kws.some(kw => haystack.includes(kw));
      });
      if (!matches) return false;
    }

    return true;
  });

  if (sortAZ) {
    filtered = filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
  } else if (catFilters.length === 0 && !keyword) {
    // Default view: pin paper towels, kitchen towels, and facial tissues first
    filtered = filtered.slice().sort((a, b) => getProductPriority(a) - getProductPriority(b));
  }

  renderProducts(filtered);
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

function buildSeoTitle(p) {
  const desc = p.description || "";
  const sizeMatch = desc.match(/Size:\s*([^|]+)/);
  const matMatch  = desc.match(/Material:\s*([^|]+)/);
  const sizeStr   = sizeMatch ? sizeMatch[1].trim() : (p.size || "");
  const matStr    = matMatch  ? matMatch[1].trim()  : "";
  const suffix    = matStr  ? ` (${matStr})` : "";
  const cleanName = p.name.replace(/\s*[–—-]\s*Wholesale Pricing.*$/i, "").trim();
  // Only prepend size if the name doesn't already start with it
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameAlreadyHasSize = sizeStr && norm(cleanName).startsWith(norm(sizeStr));
  const prefix = (sizeStr && !nameAlreadyHasSize) ? `${sizeStr} ` : "";
  return `${prefix}${cleanName} – Wholesale Pricing for Hotels & Motels${suffix}`;
}

function populateProductPage(product) {
  const price = cleanPrice(product.price);

  const seoTitle = buildSeoTitle(product);
  const metaDesc = (product.overview || product.description || "")
    .replace(/\s+/g, " ").trim().slice(0, 155) + (
    (product.overview || "").length > 155 ? "…" : ""
  );
  const pageUrl = `https://www.roomreadysupply.com/product?item=${encodeURIComponent(product.slug)}`;

  document.title = `${seoTitle} | Room Ready Supply`;

  const setMeta = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  setMeta("metaDescription", "content", metaDesc);
  setMeta("canonicalUrl",    "href",    pageUrl);
  setMeta("ogTitle",         "content", seoTitle);
  setMeta("ogDescription",   "content", metaDesc);
  setMeta("ogImage",         "content", product.image);
  setMeta("ogUrl",           "content", pageUrl);

  const priceVal = price > 0 ? price.toFixed(2) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: seoTitle,
    description: metaDesc,
    image: product.image,
    sku: product.itemNumber || product.slug,
    brand: { "@type": "Brand", name: "Room Ready Supply" },
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: priceVal,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "Room Ready Supply" }
    }
  };
  const ldEl = document.getElementById("productJsonLd");
  if (ldEl) ldEl.textContent = JSON.stringify(jsonLd);

  setText("breadcrumbProductName", product.name);
  setText("productName", seoTitle);
  setText("productItemNumber", product.itemNumber);
  setText("productCaseQty", product.caseQty);
  setText("productSize", product.size);

  setText("productDescription", product.description);
  setText("overviewDescription", product.overview || product.description);

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

  setText("tier1Price", product.price1 ? `$${cleanPrice(product.price1).toFixed(2)}` : "$--.--");
  setText("tier2Price", product.price2 ? `$${cleanPrice(product.price2).toFixed(2)}` : "$--.--");
  setText("tier3Price", product.price3 ? `$${cleanPrice(product.price3).toFixed(2)}` : "$--.--");

  const t1 = cleanPrice(product.price1), t2 = cleanPrice(product.price2), t3 = cleanPrice(product.price3);
  const tierCardsEl = document.querySelector(".pricing-tier-cards");
  if (tierCardsEl) {
    const allSame = t1 && t2 && t3 && t1 === t2 && t2 === t3;
    const noPrices = !t1 && !t2 && !t3;
    tierCardsEl.style.display = (allSame || noPrices) ? "none" : "";
  }

  const altText = product.size ? `${product.name} – ${product.size}` : product.name;
  const mainImage = document.getElementById("mainProductImage");
  const thumbImage = document.getElementById("thumbImage");
  if (mainImage) { mainImage.src = product.image; mainImage.alt = altText; }
  if (thumbImage) { thumbImage.src = product.image; thumbImage.alt = altText; }

  const featuresList = document.getElementById("featuresList");
  if (featuresList) {
    featuresList.innerHTML = [product.feature1, product.feature2, product.feature3, product.feature4]
      .filter(f => f && f.trim())
      .map(f => `<li>${f}</li>`)
      .join("");
  }

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
  }
}

function injectProductVariantSelector(variants, activeProduct) {
  const existing = document.getElementById("product-variant-selector");
  if (existing) existing.remove();

  injectVariantCSS();

  // Size pills — only show unique sizes (exclude color duplicates from same size)
  const sizeVariants = variants.filter(v => !v.colorGroup || v.colorLabel === (activeProduct.colorLabel || "Tan") || !activeProduct.colorLabel);
  const pillsHtml = sizeVariants.map(v =>
    `<button class="variant-pill${v.itemNumber === activeProduct.itemNumber ? " active" : ""}"
             data-slug="${v.slug}"
             onclick="switchProductVariant('${v.slug}')"
     >${v.variantLabel || v.size || v.name}</button>`
  ).join("");

  // Color pills — find siblings with same colorGroup
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
    // User clicked a size pill — find the same color in the target size's colorGroup
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

  const params = new URLSearchParams(window.location.search);
  const itemParam = params.get("item");

  if (!itemParam) {
    productNameEl.textContent = "Product not found";
    return;
  }

  const product = allProducts.find(p =>
    String(p.itemNumber).trim() === String(itemParam).trim() || p.slug === itemParam
  );

  if (!product) {
    productNameEl.textContent = "Product not found";
    return;
  }

  if (product.productFamily) {
    const siblings = allProducts.filter(p => p.productFamily === product.productFamily);
    if (siblings.length > 1) {
      injectProductVariantSelector(siblings, product);
    }
  }

  populateProductPage(product);
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

      if (qtyValue && button.id === "productAddToCart") {
        quantity = Math.max(1, parseInt(qtyValue.value || qtyValue.textContent) || 1);
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
        quantity: quantity
      };

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
      } else {
        cart.push(product);
      }

      saveCart(cart);
      updateCartBadge();
      flyToCart(button);
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
      <button class="vp-basket-remove" data-idx="${idx}" title="Remove">×</button>
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
  // Find by iterating — avoids CSS.escape edge cases with special chars in item numbers
  const newLi = Array.from(listEl.querySelectorAll("[data-item-key]"))
    .find(el => el.dataset.itemKey === itemNumber);
  if (!newLi) return;
  // Scroll only the internal list container — not the page
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
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToNewVpItem(item.itemNumber)));
        return;
      }
      basket.push(item);
      saveQuoteBasket(basket);
      updateQuoteBadge();
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

  function getQty() { return Math.max(1, parseInt(qtyValue.value) || 1); }

  function updateProductPagePrice() {
    const qty = getQty();
    const item = {
      quantity: qty,
      price: addBtn.dataset.price,
      price1: addBtn.dataset.price1,
      price2: addBtn.dataset.price2,
      price3: addBtn.dataset.price3
    };
    productPriceEl.textContent = `$${getTierPrice(item).toFixed(2)}`;
  }

  plusQty.onclick = () => {
    qtyValue.value = getQty() + 1;
    updateProductPagePrice();
  };

  minusQty.onclick = () => {
    const q = getQty();
    if (q > 1) { qtyValue.value = q - 1; updateProductPagePrice(); }
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
            <small class="in-stock">⊙ In Stock</small>
          </div>
        </div>

        <span class="product-price">$${price.toFixed(2)}</span>

        <div class="qty-box">
          <button class="qty-minus" data-index="${index}">−</button>
          <span class="qty-value">${qty}</span>
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
    <img src="calendar.svg" alt="Calendar">
  </button>

</div>

<span class="item-total">$${itemTotal.toFixed(2)}</span>

<button class="trash-btn" data-index="${index}">
  <img src="trash.svg" alt="Delete">
</button>
      </div>
    `;
  });

  const summaryLabel = document.querySelector(".summary-row span");
  if (summaryLabel) summaryLabel.textContent = `Subtotal (${totalItems} items)`;

  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  estimatedTotalEl.textContent = `$${subtotal.toFixed(2)}`;

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

      cart[index].quantity = (Number(cart[index].quantity) || 1) + 1;

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

      if ((Number(cart[index].quantity) || 1) > 1) {
        cart[index].quantity -= 1;
      }

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    };
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
          <small>⊙ In Stock</small>
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

  const tax = subtotal * 0.07;
  const taxEl = document.getElementById('summary-tax');
  if (taxEl) taxEl.textContent = `$${tax.toFixed(2)}`;

  if (countEl) countEl.textContent = `${itemCount} Items`;
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${(subtotal + tax).toFixed(2)}`;
  if (orderSubtotalEl) orderSubtotalEl.textContent = `$${subtotal.toFixed(2)}`;
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
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedIn");
      updateLoginUI();
      updateCartBadge();
      window.location.href = "/login";
    });
  }
}

// Redirect guests to login, saving their intended destination
function requireAuth(dest) {
  if (localStorage.getItem("loggedIn") === "true") return true; // logged in — follow link normally
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
    togglePassword.src = isPassword ? "eye-line.svg" : "eye-off-line.svg";
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
          <img src="${product.image}" alt="${product.name}" onerror="this.src='/blanket.png'">
        </div>

        <h3>${product.name}</h3>

        <p class="product-description">${product.description || ""}</p>

        <div class="product-meta">
          <div class="meta-item">
            <img src="box.svg" alt="">
            <span>Case Qty: ${product.caseQty || ""}</span>
          </div>

          <div class="meta-item">
            <img src="pack.svg" alt="">
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
          data-image="${product.image}"
        >
          <img src="Cart.png" alt="">
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

  // Load saved freight quote
  let shippingCost = 0;
  try {
    const savedQuote = JSON.parse(localStorage.getItem('rrs_freight_quote') || 'null');
    const shippingCostEl = document.getElementById('payment-shipping-cost');
    const shippingLabelEl = document.getElementById('payment-shipping-label');
    if (savedQuote && shippingCostEl) {
      shippingCost = parseFloat(savedQuote.total_charge || savedQuote.price || 0);
      const carrier = savedQuote.carrier_name || savedQuote.carrier || 'Freight';
      const transit = savedQuote.transit_days ? ` · ${savedQuote.transit_days} days` : '';
      shippingCostEl.textContent = `$${shippingCost.toFixed(2)}`;
      if (shippingLabelEl) shippingLabelEl.textContent = `Shipping (${carrier}${transit})`;
    }
  } catch(e) {}

  const tax = subtotal * 0.07;
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
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (sbOrders && sbOrders.length > 0) {
          orderHistoryList.innerHTML = sbOrders.map(o => {
            const date = new Date(o.created_at).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
            const total = o.total ? `$${parseFloat(o.total).toFixed(2)}` : (o.subtotal ? `$${parseFloat(o.subtotal).toFixed(2)}` : "—");
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
    logoutProfileBtn.addEventListener("click", () => {
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


/* ═══════════════════════════════════════════════════════
   CONTACT INQUIRY MODAL
═══════════════════════════════════════════════════════ */

function openContactModal() {
  const m = document.getElementById("contactModal");
  if (!m) return;
  m.style.display = "flex";
  document.body.style.overflow = "hidden";
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
  document.body.style.overflow = "";
}

// Close on overlay click
document.addEventListener("click", function(e) {
  const m = document.getElementById("contactModal");
  if (m && e.target === m) closeContactModal();
});

// Close on Escape
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") closeContactModal();
});

function updateFileName(input) {
  const label = document.getElementById("ciqFileName");
  if (label) label.textContent = input.files[0]?.name || "Choose file…";
}

// Throttle — prevent resubmission within 30s
let _ciqLastSubmit = 0;

async function submitContactForm(e) {
  e.preventDefault();
  if (!window.sb) return;

  // Honeypot check — bots fill this field, humans leave it blank
  if (document.getElementById("ciqHoneypot")?.value) return;

  const now = Date.now();
  if (now - _ciqLastSubmit < 30000) {
    showCiqError("Please wait before submitting again.");
    return;
  }

  // ── Gather values ──
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

  // ── Validate ──
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

  // ── Set loading state ──
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

// ── Consent gate ─────────────────────────────────────────────
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

function openRegisterModal() {
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
  document.getElementById('regSubDistNo').checked = true;
  toggleSubDistFields(false);
  const err = document.getElementById('regError');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  document.getElementById('reg-step-1').style.display = 'block';
  document.getElementById('reg-step-success').style.display = 'none';
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

  // Check sub-distributor codes first
  const { data: sd } = await window.sb
    .from('sub_distributors')
    .select('id,name,commission_pct')
    .eq('referral_code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (sd) {
    _regValidatedDistributor = { id: sd.id, name: sd.name, commission_pct: sd.commission_pct, employee_id: null };
    statusEl.style.color = '#22c55e';
    statusEl.textContent = '✓ Valid code — ' + sd.name;
    if (nameEl) nameEl.value = sd.name;
    if (nameRow) nameRow.style.display = 'block';
    return;
  }

  // Check employee codes
  const { data: emp } = await window.sb
    .from('sub_distributor_employees')
    .select('id,name,sub_distributor_id,sub_distributors(name,commission_pct)')
    .eq('referral_code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (emp) {
    const sdName = emp.sub_distributors?.name || 'Sub-Distributor';
    _regValidatedDistributor = {
      id: emp.sub_distributor_id,
      name: sdName,
      commission_pct: emp.sub_distributors?.commission_pct || 0,
      employee_id: emp.id,
    };
    statusEl.style.color = '#22c55e';
    statusEl.textContent = '✓ Valid code — ' + emp.name + ' (' + sdName + ')';
    if (nameEl) nameEl.value = sdName;
    if (nameRow) nameRow.style.display = 'block';
    return;
  }

  statusEl.style.color = '#ef4444';
  statusEl.textContent = '✗ Invalid or inactive referral code.';
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
  // All fields valid — show consent modal
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
   REFERRAL CODE — CHECKOUT
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

  const { data: sd } = await window.sb
    .from('sub_distributors')
    .select('id,name,commission_pct')
    .eq('referral_code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (sd) {
    _checkoutReferral = { sub_distributor_id: sd.id, employee_id: null, commission_pct: sd.commission_pct, name: sd.name };
    if (statusEl) { statusEl.style.color = '#22c55e'; statusEl.textContent = '✓ Applied — ' + sd.name; }
    return;
  }

  const { data: emp } = await window.sb
    .from('sub_distributor_employees')
    .select('id,name,sub_distributor_id,sub_distributors(name,commission_pct)')
    .eq('referral_code', code)
    .eq('status', 'active')
    .maybeSingle();

  if (emp) {
    _checkoutReferral = {
      sub_distributor_id: emp.sub_distributor_id,
      employee_id: emp.id,
      commission_pct: emp.sub_distributors ? emp.sub_distributors.commission_pct : 0,
      name: emp.name + ' (' + (emp.sub_distributors ? emp.sub_distributors.name : '') + ')',
    };
    if (statusEl) { statusEl.style.color = '#22c55e'; statusEl.textContent = '✓ Applied — ' + _checkoutReferral.name; }
    return;
  }

  if (statusEl) { statusEl.style.color = '#ef4444'; statusEl.textContent = '✗ Invalid or inactive referral code.'; }
}

async function autoFillReferralCode() {
  const codeInput = document.getElementById('checkout-referral-code');
  if (!codeInput || !window.sb) return;
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


// ── Stat counter animation ──────────────────────────────────
(function () {
  const counters = document.querySelectorAll('.stat-count');
  if (!counters.length) return;

  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
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
    }

    requestAnimationFrame(step);
  }

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

// ── Schedule pill interaction ────────────────────────────────
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
