/* ============================================================
   Room Ready Supply — Main Script
   Auth: Supabase Auth   |   Cart: localStorage
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  updateCartBadge();
  setupReorderDropdowns();
  setupAddToCartButtons();
  setupProductCardClicks();
  setupAccountDropdown();
  setupPasswordToggle();
  setupProductQuantity();
  setupProductGallery();      // static fallback — skips when ?id= present
  loadProductDetail();        // dynamic product page
  loadFeaturedProducts();     // homepage featured grid
  loadCategoryGrid();         // homepage category grid
  loadCartPage();
  setupCheckoutPage();
  setupLoginPage();
  setupResetPasswordPage();
  setupHamburger();
});

/* ============================================================
   HAMBURGER MENU — Mobile navigation toggle (≤600px)
   ============================================================ */

function setupHamburger() {
  const btn = document.getElementById("hamburgerBtn");
  const nav = document.querySelector(".nav-links");
  if (!btn || !nav) return;

  btn.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("mobile-open");
    btn.classList.toggle("is-open", isOpen);
    btn.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  /* Close menu when a nav link is clicked */
  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("mobile-open");
      btn.classList.remove("is-open");
      document.body.style.overflow = "";
    });
  });

  /* Close menu on outside click */
  document.addEventListener("click", (e) => {
    if (nav.classList.contains("mobile-open") && !btn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove("mobile-open");
      btn.classList.remove("is-open");
      document.body.style.overflow = "";
    }
  });
}

/* ============================================================
   AUTH — Supabase
   ============================================================ */

async function initAuth() {
  if (typeof window.sb === "undefined") return;

  /* Listen for auth changes globally */
  window.sb.auth.onAuthStateChange((_event, session) => {
    updateLoginUI(!!session);
    if (_event === "PASSWORD_RECOVERY") {
      if (!window.location.pathname.includes("reset-password")) {
        window.location.href = "reset-password.html";
      }
    }
  });

  const { data: { session } } = await window.sb.auth.getSession();
  updateLoginUI(!!session);

  /* Wire logout button */
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await window.sb.auth.signOut();
    localStorage.removeItem("cart");
    window.location.href = "index.html";
  });
}

function updateLoginUI(loggedIn) {
  document.querySelectorAll(".guest-only").forEach(el => {
    el.style.display = loggedIn ? "none" : "inline-flex";
  });
  document.querySelectorAll(".logged-in-only").forEach(el => {
    el.style.display = loggedIn ? "inline-flex" : "none";
  });
}

/* ============================================================
   LOGIN PAGE
   ============================================================ */

function setupLoginPage() {
  setupAuthTabs();
  setupSignIn();
  setupRegister();
  setupForgotPassword();
}

function setupAuthTabs() {
  const tabSignIn   = document.getElementById("tabSignIn");
  const tabRegister = document.getElementById("tabRegister");
  const signInPanel   = document.getElementById("signInPanel");
  const registerPanel = document.getElementById("registerPanel");
  if (!tabSignIn || !tabRegister) return;

  const showSignIn = () => {
    signInPanel.style.display   = "";
    registerPanel.style.display = "none";
    tabSignIn.classList.add("active");
    tabRegister.classList.remove("active");
  };
  const showRegister = () => {
    signInPanel.style.display   = "none";
    registerPanel.style.display = "";
    tabRegister.classList.add("active");
    tabSignIn.classList.remove("active");
  };

  tabSignIn.addEventListener("click", showSignIn);
  tabRegister.addEventListener("click", showRegister);
  document.getElementById("switchToRegister")?.addEventListener("click", e => { e.preventDefault(); showRegister(); });
  document.getElementById("switchToSignIn")?.addEventListener("click",   e => { e.preventDefault(); showSignIn(); });
  document.getElementById("goToSignIn")?.addEventListener("click",       e => { e.preventDefault(); showSignIn(); });
}

function setupSignIn() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const email    = document.getElementById("emailInput")?.value.trim() || "";
    const password = document.getElementById("passwordInput")?.value || "";
    const errEl    = document.getElementById("loginError");
    const btn      = loginForm.querySelector("button[type=submit]");

    errEl.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Signing in…";

    if (typeof window.sb === "undefined") {
      errEl.textContent = "Backend not connected. Please configure Supabase credentials.";
      errEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Sign In";
      return;
    }

    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });

    if (error) {
      errEl.textContent = error.message === "Invalid login credentials"
        ? "Incorrect email or password. Please try again."
        : error.message;
      errEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Sign In";
      return;
    }

    /* Redirect admin to admin dashboard */
    const { data: profile } = await window.sb.from("profiles").select("role").eq("id", data.user.id).single();
    if (profile?.role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "index.html";
    }
  });
}

function setupRegister() {
  const registerForm = document.getElementById("registerForm");
  if (!registerForm) return;

  registerForm.addEventListener("submit", async e => {
    e.preventDefault();

    const businessName = document.getElementById("regBusiness")?.value.trim() || "";
    const businessType = document.getElementById("regBusinessType")?.value || "";
    const contactName  = document.getElementById("regName")?.value.trim() || "";
    const email        = (document.getElementById("regEmail")?.value || "").trim().toLowerCase();
    const phone        = document.getElementById("regPhone")?.value.trim() || "";
    const password     = document.getElementById("regPassword")?.value || "";
    const confirm      = document.getElementById("regConfirm")?.value || "";
    const errEl        = document.getElementById("registerError");
    const successEl    = document.getElementById("registerSuccess");
    const btn          = registerForm.querySelector("button[type=submit]");

    errEl.style.display = "none";

    if (!businessName) return showErr(errEl, "Business name is required.");
    if (!businessType) return showErr(errEl, "Please select a business type.");
    if (!contactName)  return showErr(errEl, "Contact name is required.");
    if (!email || !/\S+@\S+\.\S+/.test(email)) return showErr(errEl, "Please enter a valid email address.");
    if (password.length < 8) return showErr(errEl, "Password must be at least 8 characters.");
    if (password !== confirm) return showErr(errEl, "Passwords do not match.");

    if (typeof window.sb === "undefined") {
      return showErr(errEl, "Backend not connected. Please configure Supabase credentials.");
    }

    btn.disabled = true;
    btn.textContent = "Creating account…";

    const { data: signUpData, error } = await window.sb.auth.signUp({
      email,
      password,
      options: {
        data: { business_name: businessName, business_type: businessType, contact_name: contactName, phone }
      }
    });

    btn.disabled = false;
    btn.textContent = "Create Account";

    if (error) return showErr(errEl, error.message || error.msg || "Signup failed. Please try again.");

    /* Supabase returns user=null when email already exists but confirmation is pending */
    if (!signUpData?.user) return showErr(errEl, "An account with this email may already exist. Check your inbox for a confirmation email.");

    errEl.style.display = "none";
    registerForm.reset();
    successEl.style.display = "block";
    successEl.textContent = "Account created! Check your email to verify, then sign in.";
  });
}

function setupForgotPassword() {
  const forgotLink = document.getElementById("forgotPasswordLink");
  if (!forgotLink) return;

  forgotLink.addEventListener("click", async e => {
    e.preventDefault();
    const email = document.getElementById("emailInput")?.value.trim();
    if (!email) {
      const errEl = document.getElementById("loginError");
      errEl.textContent = "Enter your email above, then click 'Forgot password'.";
      errEl.style.display = "block";
      return;
    }
    if (typeof window.sb === "undefined") return;
    await window.sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password.html"
    });
    const errEl = document.getElementById("loginError");
    errEl.style.display = "none";
    const successEl = document.createElement("div");
    successEl.className = "auth-success";
    successEl.textContent = "Password reset email sent! Check your inbox.";
    forgotLink.closest("form")?.prepend(successEl);
    setTimeout(() => successEl.remove(), 6000);
  });
}

/* ============================================================
   RESET PASSWORD PAGE
   ============================================================ */

function setupResetPasswordPage() {
  const form = document.getElementById("resetPasswordForm");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const password = document.getElementById("newPassword")?.value || "";
    const confirm  = document.getElementById("confirmNewPassword")?.value || "";
    const errEl    = document.getElementById("resetError");
    const successEl = document.getElementById("resetSuccess");

    errEl.style.display = "none";
    if (password.length < 8) return showErr(errEl, "Password must be at least 8 characters.");
    if (password !== confirm) return showErr(errEl, "Passwords do not match.");

    const { error } = await window.sb.auth.updateUser({ password });
    if (error) return showErr(errEl, error.message);

    successEl.style.display = "block";
    form.reset();
    setTimeout(() => { window.location.href = "login.html"; }, 2500);
  });
}

/* ============================================================
   CART — localStorage
   ============================================================ */

function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge) return;
  const total = getCart().reduce((s, i) => s + i.quantity, 0);
  badge.textContent = total;
  badge.style.display = total > 0 ? "flex" : "none";
}

/* ============================================================
   ADD TO CART
   ============================================================ */

function setupAddToCartButtons() {
  document.querySelectorAll(".add-btn").forEach(button => {
    button.addEventListener("click", e => {
      e.stopPropagation();
      const card = button.closest(".product-card");
      const product = card ? {
        id    : card.dataset.productId || null,
        name  : card.querySelector("h3")?.textContent.trim() || button.dataset.name,
        description: card.querySelector(".product-description")?.textContent.trim() || "",
        price : parseFloat(card.querySelector(".price")?.textContent.replace("$","")) || Number(button.dataset.price) || 0,
        image : card.querySelector(".product-image img")?.getAttribute("src") || button.dataset.image || "",
        quantity: Number(document.getElementById("qtyValue")?.textContent) || 1
      } : {
        name : button.dataset.name,
        price: Number(button.dataset.price) || 0,
        image: button.dataset.image || "",
        quantity: 1
      };

      let cart = getCart();
      const existing = cart.find(i => i.name === product.name);
      if (existing) { existing.quantity += product.quantity; }
      else { cart.push(product); }
      saveCart(cart);
      updateCartBadge();
      flyToCart(button);
    });
  });
}

function flyToCart(button) {
  const cartIcon = document.querySelector(".cart-container");
  if (!cartIcon) return;
  const bRect = button.getBoundingClientRect();
  const cRect = cartIcon.getBoundingClientRect();
  const el = document.createElement("div");
  el.className = "flying-cart-item";
  el.innerHTML = `<img src="Cart.png" alt="">`;
  document.body.appendChild(el);
  el.style.left = bRect.left + bRect.width  / 2 + "px";
  el.style.top  = bRect.top  + bRect.height / 2 + "px";
  setTimeout(() => {
    el.style.left = cRect.left + cRect.width  / 2 + "px";
    el.style.top  = cRect.top  + cRect.height / 2 + "px";
    el.style.transform = "scale(0.2)";
    el.style.opacity   = "0";
  }, 10);
  setTimeout(() => el.remove(), 800);
}

/* ============================================================
   PRODUCT CARD CLICK
   ============================================================ */

function setupProductCardClicks() {
  document.querySelectorAll(".product-card[data-url]").forEach(card => {
    card.addEventListener("click", () => { window.location.href = card.dataset.url; });
  });
}

/* ============================================================
   REORDER DROPDOWN
   ============================================================ */

function setupReorderDropdowns() {
  document.querySelectorAll(".reorder-dropdown").forEach(dd => {
    const update = () => dd.classList.toggle("selected", dd.value !== "Once");
    update();
    dd.addEventListener("change", update);
  });
}

/* ============================================================
   ACCOUNT DROPDOWN
   ============================================================ */

function setupAccountDropdown() {
  const dropdown = document.querySelector(".account-dropdown");
  const btn = document.querySelector(".account-btn");
  if (!dropdown || !btn) return;
  btn.addEventListener("click", e => { e.stopPropagation(); dropdown.classList.toggle("active"); });
  document.addEventListener("click", () => dropdown.classList.remove("active"));
}

/* ============================================================
   PASSWORD EYE TOGGLE
   ============================================================ */

function setupPasswordToggle() {
  const input  = document.getElementById("passwordInput");
  const toggle = document.getElementById("togglePassword");
  if (!input || !toggle) return;
  toggle.addEventListener("click", () => {
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    toggle.src = isPass ? "eye-line.svg" : "eye-off-line.svg";
  });
}

/* ============================================================
   PRODUCT QUANTITY (product detail page)
   ============================================================ */

function setupProductQuantity() {
  const val   = document.getElementById("qtyValue");
  const plus  = document.getElementById("plusQty");
  const minus = document.getElementById("minusQty");
  if (!val || !plus || !minus) return;
  plus.addEventListener("click",  () => { val.textContent = Number(val.textContent) + 1; });
  minus.addEventListener("click", () => { if (Number(val.textContent) > 1) val.textContent = Number(val.textContent) - 1; });
}

/* ============================================================
   PRODUCT GALLERY (product detail page)
   ============================================================ */

function setupProductGallery() {
  /* Skip when product detail loads dynamically via ?id= */
  if (new URLSearchParams(window.location.search).get("id")) return;
  const images = ["75902.jpg","Hotel.png","Facilities.png","pricetag.png"];
  let cur = 0;
  const mainImage    = document.getElementById("mainProductImage");
  const thumbContainer = document.querySelector(".thumb-row");
  const nextBtn      = document.getElementById("nextBtn");
  const prevBtn      = document.getElementById("prevBtn");
  if (!mainImage || !thumbContainer || !nextBtn || !prevBtn) return;

  const renderThumbs = () => {
    thumbContainer.innerHTML = "";
    images.forEach((img, i) => {
      const t = document.createElement("img");
      t.src = img; t.className = "thumb";
      if (i === cur) t.classList.add("active");
      t.addEventListener("click", () => { cur = i; update(); });
      thumbContainer.appendChild(t);
    });
  };
  const update = () => {
    mainImage.src = images[cur];
    document.querySelectorAll(".thumb").forEach((t,i) => t.classList.toggle("active", i === cur));
  };
  nextBtn.addEventListener("click", () => { cur = (cur + 1) % images.length; update(); });
  prevBtn.addEventListener("click", () => { cur = (cur - 1 + images.length) % images.length; update(); });
  renderThumbs(); update();
}

/* ============================================================
   PRODUCT DETAIL — Dynamic loading from Supabase
   ============================================================ */

async function loadProductDetail() {
  if (!document.getElementById("product-content")) return;

  const params    = new URLSearchParams(window.location.search);
  const productId = params.get("id");

  if (!productId) {
    showProductError(`No product specified. <a href="catalog.html">Browse our catalog →</a>`);
    return;
  }
  if (typeof window.sb === "undefined") {
    showProductError(`Backend not connected. <a href="catalog.html">Browse our catalog →</a>`);
    return;
  }

  const { data: product, error } = await window.sb
    .from("products")
    .select("*, inventory(stock_qty, status)")
    .eq("id", productId)
    .eq("is_active", true)
    .single();

  if (error || !product) {
    showProductError(`Product not found. <a href="catalog.html">Browse our catalog →</a>`);
    return;
  }

  /* Fetch gallery images; fall back to image_url */
  const { data: imgRows } = await window.sb
    .from("product_images")
    .select("url")
    .eq("product_id", productId)
    .order("sort_order");

  const galleryImgs = imgRows?.length
    ? imgRows.map(r => r.url)
    : [product.image_url || "blanket.png"];

  /* ── Page title ── */
  document.title = `${product.name} — Room Ready Supply`;

  /* ── Breadcrumb ── */
  const bc = document.getElementById("product-breadcrumb");
  if (bc) {
    const catLink = product.category_name
      ? `<a href="catalog.html?category=${encodeURIComponent(product.category_name)}">${escHtml(product.category_name)}</a> ›`
      : "";
    bc.innerHTML = `<a href="index.html">Home</a> › <a href="catalog.html">Catalog</a> › ${catLink} <strong>${escHtml(product.name)}</strong>`;
  }

  /* ── Gallery ── */
  renderProductGallery(galleryImgs);

  /* ── Badge ── */
  const badgeEl = document.getElementById("product-badge");
  if (badgeEl) {
    if (product.is_featured)     { badgeEl.textContent = "Featured"; badgeEl.style.display = ""; }
    else if (product.is_on_sale) { badgeEl.textContent = "Sale";     badgeEl.style.display = ""; }
    else                          badgeEl.style.display = "none";
  }

  /* ── Text fields ── */
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? ""; };
  setText("product-name",        product.name);
  setText("product-brand",       product.sku || "");
  setText("product-description", product.description || "");
  setText("product-desc-full",   product.description || "");

  const metaEl = document.getElementById("product-meta-line");
  if (metaEl) {
    const parts = [
      product.sku           && `SKU: ${escHtml(product.sku)}`,
      product.category_name && `Category: ${escHtml(product.category_name)}`,
    ].filter(Boolean);
    metaEl.innerHTML = parts.map(p => `<span>${p}</span>`).join("");
  }

  /* ── Price ── */
  const sp      = product.is_on_sale && product.sale_price ? product.sale_price : null;
  const dp      = sp || product.price;
  const priceEl = document.getElementById("product-price");
  if (priceEl) {
    priceEl.innerHTML = sp
      ? `<span class="price-original">$${Number(product.price).toFixed(2)}</span>
         <span class="price sale">$${Number(sp).toFixed(2)}</span>
         <span class="price-unit">/ ${product.unit || "Case"}</span>`
      : `<span class="price">$${Number(product.price).toFixed(2)}</span>
         <span class="price-unit">/ ${product.unit || "Case"}</span>`;
  }

  setText("product-unit-label", product.unit || "EA");

  /* ── Stock ── */
  const inv         = product.inventory?.[0];
  const stockStatus = inv?.status || "in_stock";
  const stockEl     = document.getElementById("product-stock");
  if (stockEl) {
    const labels = { in_stock: "● In Stock", low_stock: "⚠ Low Stock", out_of_stock: "✕ Out of Stock" };
    stockEl.textContent  = labels[stockStatus] || "● In Stock";
    stockEl.className    = `stock-badge stock-${stockStatus}`;
  }

  /* ── Add to Cart ── */
  const addBtn = document.getElementById("product-add-btn");
  if (addBtn) {
    if (stockStatus === "out_of_stock") {
      addBtn.disabled     = true;
      addBtn.textContent  = "Out of Stock";
    } else {
      addBtn.dataset.name      = product.name;
      addBtn.dataset.price     = dp;
      addBtn.dataset.image     = product.image_url || "blanket.png";
      addBtn.dataset.productId = product.id;
    }
    setupAddToCartButtons();
  }

  /* ── Specifications table ── */
  const specsEl = document.getElementById("product-specs-table");
  if (specsEl) {
    const rows = [
      ["Category",  product.category_name],
      ["SKU",       product.sku],
      ["Case Qty",  product.case_qty],
      ["Pack Size", product.pack_size],
      ["Unit",      product.unit],
    ].filter(([, v]) => v != null && v !== "");
    specsEl.innerHTML = rows.map(([k, v]) =>
      `<tr><td>${k}</td><td>${escHtml(String(v))}</td></tr>`
    ).join("");
  }

  /* ── Show content, hide loading ── */
  const loadingEl = document.getElementById("product-loading");
  const contentEl = document.getElementById("product-content");
  if (loadingEl) loadingEl.style.display = "none";
  if (contentEl) contentEl.style.display = "";

  /* ── Related products ── */
  loadRelatedProducts(product.category_name, product.id);
}

function renderProductGallery(images) {
  const mainImg = document.getElementById("mainProductImage");
  const thumbRow = document.getElementById("thumb-row");
  if (!mainImg || !images.length) return;

  let cur = 0;
  mainImg.src     = images[0];
  mainImg.onerror = () => { mainImg.src = "blanket.png"; };

  if (thumbRow) {
    thumbRow.innerHTML = images.map((src, i) =>
      `<img src="${escHtml(src)}" class="thumb${i === 0 ? " active" : ""}"
            alt="Product image ${i + 1}" onerror="this.src='blanket.png'">`
    ).join("");
    thumbRow.querySelectorAll(".thumb").forEach((t, i) =>
      t.addEventListener("click", () => {
        cur = i;
        mainImg.src = images[i];
        thumbRow.querySelectorAll(".thumb").forEach((tt, j) => tt.classList.toggle("active", j === i));
      })
    );
  }

  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");
  if (prev) prev.addEventListener("click", () => {
    cur = (cur - 1 + images.length) % images.length;
    mainImg.src = images[cur];
    thumbRow?.querySelectorAll(".thumb").forEach((t, i) => t.classList.toggle("active", i === cur));
  });
  if (next) next.addEventListener("click", () => {
    cur = (cur + 1) % images.length;
    mainImg.src = images[cur];
    thumbRow?.querySelectorAll(".thumb").forEach((t, i) => t.classList.toggle("active", i === cur));
  });
}

async function loadRelatedProducts(categoryName, excludeId) {
  const grid    = document.getElementById("also-need-grid");
  const section = document.getElementById("also-need-section");
  if (!grid) return;

  if (!categoryName) { if (section) section.style.display = "none"; return; }

  const { data: products } = await window.sb
    .from("products")
    .select("id, name, price, sale_price, is_on_sale, image_url, unit, category_name")
    .eq("is_active", true)
    .eq("category_name", categoryName)
    .neq("id", excludeId)
    .limit(4);

  if (!products?.length) { if (section) section.style.display = "none"; return; }

  grid.innerHTML = products.map(p => {
    const dp = (p.is_on_sale && p.sale_price) ? p.sale_price : p.price;
    return `
      <div class="mini-card" style="cursor:pointer" onclick="location.href='product.html?id=${p.id}'">
        <img src="${escHtml(p.image_url || "blanket.png")}" alt="${escHtml(p.name)}" onerror="this.src='blanket.png'">
        <div>
          <small>${escHtml(p.category_name || "")}</small>
          <h4>${escHtml(p.name)}</h4>
          <strong>$${Number(dp).toFixed(2)} <span>/${p.unit || "Case"}</span></strong>
          <button class="add-btn"
            data-name="${escHtml(p.name)}" data-price="${dp}"
            data-image="${escHtml(p.image_url || "blanket.png")}"
            data-product-id="${p.id}">Add To Order</button>
        </div>
      </div>`;
  }).join("");
  setupAddToCartButtons();
}

function showProductError(html) {
  const loadingEl = document.getElementById("product-loading");
  const errEl     = document.getElementById("product-error");
  if (loadingEl) loadingEl.style.display = "none";
  if (errEl)     { errEl.innerHTML = html; errEl.style.display = ""; }
}

/* ============================================================
   FEATURED PRODUCTS — Homepage (is_featured = true from DB)
   ============================================================ */

async function loadFeaturedProducts() {
  const grid = document.getElementById("featured-product-grid");
  if (!grid) return;
  if (typeof window.sb === "undefined") return;

  grid.innerHTML = `<div class="catalog-loading" style="grid-column:1/-1">Loading products…</div>`;

  let { data: products } = await window.sb
    .from("products")
    .select("*, inventory(stock_qty, status)")
    .eq("is_active", true)
    .eq("is_featured", true)
    .limit(8);

  /* Fallback: show newest active products if none are featured */
  if (!products?.length) {
    const { data: fb } = await window.sb
      .from("products")
      .select("*, inventory(stock_qty, status)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(8);
    products = fb || [];
  }

  if (!products.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#888;padding:40px 0">No products available.</p>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const inv    = p.inventory?.[0];
    const stock  = inv?.status || "in_stock";
    const imgSrc = p.image_url || "blanket.png";
    const sp     = p.is_on_sale && p.sale_price ? p.sale_price : null;
    const dp     = sp || p.price;
    return `
      <div class="product-card" data-url="product.html?id=${p.id}" data-product-id="${p.id}">
        ${p.is_on_sale  ? `<div class="badge-sale">SALE</div>` : ""}
        ${p.is_featured ? `<div class="badge-featured">FEATURED</div>` : ""}
        <img src="${escHtml(imgSrc)}" alt="${escHtml(p.name)}" onerror="this.src='blanket.png'">
        <h3>${escHtml(p.name)}</h3>
        <p class="description">${escHtml(p.description || "")}</p>
        <div class="product-meta">
          <div class="meta-item"><img src="box.svg" alt=""><span>Case Qty: ${p.case_qty || 1}</span></div>
          <div class="meta-item"><img src="pack.svg" alt=""><span>Pack: ${p.pack_size || 1}</span></div>
        </div>
        <div class="stock-status"><span class="dot"></span> ${stock === "out_of_stock" ? "Out of Stock" : "In Stock"}</div>
        <div class="price">
          ${sp ? `<s style="font-size:12px;color:#999">$${Number(p.price).toFixed(2)}</s> ` : ""}
          $${Number(dp).toFixed(2)} <span>/${p.unit || "Case"}</span>
        </div>
        ${stock === "out_of_stock"
          ? `<button class="add-btn" disabled>Out of Stock</button>`
          : `<button class="add-btn"
               data-name="${escHtml(p.name)}" data-price="${dp}"
               data-image="${escHtml(imgSrc)}" data-product-id="${p.id}">
               <img src="Cart.png" alt=""> ADD TO CART
             </button>`}
      </div>`;
  }).join("");

  setupAddToCartButtons();
  setupProductCardClicks();
}

/* ============================================================
   CATEGORY GRID — Homepage (from Supabase categories table)
   ============================================================ */

const CATEGORY_ICONS = {
  "Toilet Paper":         "🧻",
  "Paper Towels":         "🗒️",
  "Trash Liners":         "🗑️",
  "Cleaning Chemicals":   "🧴",
  "Hand Soap":            "🧼",
  "Laundry Supplies":     "👕",
  "Dishwashing Supplies": "🍽️",
  "Guest Room Supplies":  "🛎️",
  "Towels and Linens":    "🛏️",
  "Food Service Supplies":"🍴",
  "Facility Supplies":    "🔧",
};

async function loadCategoryGrid() {
  const grid = document.getElementById("category-grid");
  if (!grid) return;
  if (typeof window.sb === "undefined") return;

  const { data: cats } = await window.sb
    .from("categories")
    .select("id, name, slug")
    .order("sort_order");

  if (!cats?.length) {
    document.getElementById("category-section")?.style.setProperty("display", "none");
    return;
  }

  grid.innerHTML = cats.map(cat => {
    const icon = CATEGORY_ICONS[cat.name] || "📦";
    return `
      <a href="catalog.html?category=${encodeURIComponent(cat.name)}" class="cat-card">
        <div class="cat-icon">${icon}</div>
        <span class="cat-name">${escHtml(cat.name)}</span>
      </a>`;
  }).join("");
}

/* ============================================================
   CART PAGE
   ============================================================ */

function loadCartPage() {
  const container  = document.getElementById("cart-items");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl    = document.getElementById("estimated-total");
  if (!container) return;

  const cart = getCart();
  container.innerHTML = "";
  let subtotal = 0, totalItems = 0;

  if (cart.length === 0) {
    container.innerHTML = `<p class="empty-cart">Your cart is empty. <a href="catalog.html">Shop now</a></p>`;
    subtotalEl.textContent = "$0.00";
    totalEl.textContent    = "$0.00";
    document.querySelector(".summary-row span").textContent = "Subtotal (0 items)";
    return;
  }

  cart.forEach((item, index) => {
    const itemTotal = item.price * item.quantity;
    subtotal   += itemTotal;
    totalItems += item.quantity;
    container.innerHTML += `
      <div class="cart-row">
        <div class="cart-product">
          <img src="${item.image || 'blanket.png'}" alt="${escHtml(item.name)}">
          <div>
            <h3>${escHtml(item.name)}</h3>
            <p>${escHtml(item.description || "")}</p>
            <small class="in-stock">⊙ In Stock</small>
          </div>
        </div>
        <span class="product-price">$${item.price.toFixed(2)}</span>
        <div class="qty-box">
          <button class="qty-minus" data-index="${index}">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-plus"  data-index="${index}">+</button>
        </div>
        <select class="reorder-dropdown">
          <option value="Once">Once</option>
          <option value="Weekly">Weekly</option>
          <option value="Every 2 Weeks">Every 2 Weeks</option>
          <option value="Monthly">Monthly</option>
          <option value="Every 45 Days">Every 45 Days</option>
          <option value="Every 60 Days">Every 60 Days</option>
          <option value="Custom Schedule">Custom Schedule</option>
        </select>
        <span class="item-total">$${itemTotal.toFixed(2)}</span>
        <button class="trash-btn" data-index="${index}"><img src="trash.svg" alt="Delete"></button>
      </div>`;
  });

  document.querySelector(".summary-row span").textContent = `Subtotal (${totalItems} items)`;
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  totalEl.textContent    = `$${subtotal.toFixed(2)}`;
  setupCartButtons();
  setupReorderDropdowns();
}

function setupCartButtons() {
  document.querySelectorAll(".qty-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      cart[btn.dataset.index].quantity += 1;
      saveCart(cart); updateCartBadge(); loadCartPage();
    });
  });
  document.querySelectorAll(".qty-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      if (cart[btn.dataset.index].quantity > 1) cart[btn.dataset.index].quantity -= 1;
      saveCart(cart); updateCartBadge(); loadCartPage();
    });
  });
  document.querySelectorAll(".trash-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      cart.splice(btn.dataset.index, 1);
      saveCart(cart); updateCartBadge(); loadCartPage();
    });
  });
}

/* ============================================================
   CHECKOUT PAGE
   ============================================================ */

function setupCheckoutPage() {
  loadCheckoutProducts();
  const form = document.getElementById("checkoutForm");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    await submitOrder(form);
  });

  /* Pre-fill if logged in */
  if (typeof window.sb !== "undefined") {
    window.sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: profile } = await window.sb.from("profiles").select("*").eq("id", session.user.id).single();
      if (!profile) return;
      const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      set("checkoutBusiness", profile.business_name);
      set("checkoutContact",  profile.contact_name);
      set("checkoutPhone",    profile.phone);
      set("checkoutEmail",    session.user.email);
    });
  }
}

function loadCheckoutProducts() {
  const container  = document.getElementById("checkout-products");
  const summaryEl  = document.getElementById("summary-items");
  const subtotalEl = document.getElementById("summary-subtotal");
  const totalEl    = document.getElementById("summary-total");
  const countEl    = document.getElementById("summary-count");
  if (!container) return;

  const cart = getCart();
  if (cart.length === 0) {
    container.innerHTML = `<p>Your cart is empty. <a href="catalog.html">Shop now</a></p>`;
    if (countEl) countEl.textContent = "0 Items";
    if (subtotalEl) subtotalEl.textContent = "$0.00";
    if (totalEl)    totalEl.textContent    = "$0.00";
    return;
  }

  container.innerHTML = cart.map(item => {
    const qty   = item.quantity || 1;
    const total = Number(item.price) * qty;
    return `
      <div class="checkout-product">
        <img src="${item.image || 'blanket.png'}" alt="${escHtml(item.name)}">
        <div>
          <h4>${escHtml(item.name)}</h4>
          <p>${escHtml(item.description || "")}</p>
          <small>⊙ In Stock</small>
        </div>
        <strong class="product-price">$${Number(item.price).toFixed(2)}</strong>
        <div class="qty-box"><span class="qty-value">${qty}</span></div>
        <strong class="product-total">$${total.toFixed(2)}</strong>
      </div>`;
  }).join("");

  if (summaryEl) {
    summaryEl.innerHTML = cart.map(item => {
      const qty   = item.quantity || 1;
      const total = Number(item.price) * qty;
      return `<p><span>${escHtml(item.name)} × ${qty}</span><strong>$${total.toFixed(2)}</strong></p>`;
    }).join("");
  }

  const subtotal = cart.reduce((s, i) => s + Number(i.price) * (i.quantity || 1), 0);
  if (countEl)    countEl.textContent    = `${cart.reduce((s,i) => s + (i.quantity||1), 0)} Items`;
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl)    totalEl.textContent    = `$${subtotal.toFixed(2)}`;
}

async function submitOrder(form) {
  const errEl  = document.getElementById("checkoutError");
  const successEl = document.getElementById("checkoutSuccess");
  const btn    = form.querySelector("button[type=submit]");
  const cart   = getCart();
  if (!cart.length) return;

  if (errEl) errEl.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "Placing order…"; }

  const businessName = document.getElementById("checkoutBusiness")?.value.trim() || "";
  const contactName  = document.getElementById("checkoutContact")?.value.trim() || "";
  const phone        = document.getElementById("checkoutPhone")?.value.trim() || "";
  const email        = document.getElementById("checkoutEmail")?.value.trim() || "";
  const street       = document.getElementById("checkoutStreet")?.value.trim() || "";
  const city         = document.getElementById("checkoutCity")?.value.trim() || "";
  const state        = document.getElementById("checkoutState")?.value.trim() || "";
  const zip          = document.getElementById("checkoutZip")?.value.trim() || "";
  const orderType    = document.querySelector("input[name=orderType]:checked")?.value || "one_time";

  const subtotal = cart.reduce((s,i) => s + Number(i.price) * (i.quantity||1), 0);

  if (typeof window.sb === "undefined") {
    if (btn) { btn.disabled = false; btn.textContent = "Place Order Request"; }
    if (errEl) { errEl.textContent = "Backend not connected. Configure Supabase first."; errEl.style.display = "block"; }
    return;
  }

  const { data: { session } } = await window.sb.auth.getSession();

  const orderPayload = {
    user_id       : session?.user?.id || null,
    customer_name : contactName,
    customer_email: email,
    business_name : businessName,
    phone,
    shipping_address: { street, city, state, zip },
    order_type    : orderType,
    subtotal,
    total         : subtotal,
    status        : "pending",
    payment_method: "cod",
  };

  const { data: order, error } = await window.sb.from("orders").insert(orderPayload).select().single();

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = "Place Order Request"; }
    if (errEl) { errEl.textContent = "Failed to place order: " + error.message; errEl.style.display = "block"; }
    return;
  }

  /* Insert order items */
  const items = cart.map(i => ({
    order_id  : order.id,
    product_id: i.id || null,
    name      : i.name,
    price     : Number(i.price),
    quantity  : i.quantity || 1,
    subtotal  : Number(i.price) * (i.quantity || 1),
  }));
  await window.sb.from("order_items").insert(items);

  /* Clear cart */
  saveCart([]);
  updateCartBadge();

  if (successEl) {
    successEl.textContent = `Order ${order.order_number} placed! We'll confirm shortly.`;
    successEl.style.display = "block";
  }
  if (btn) { btn.disabled = false; btn.textContent = "Place Order Request"; }
  form.reset();
  loadCheckoutProducts();

  setTimeout(() => { window.location.href = "account.html"; }, 3000);
}

/* ============================================================
   CATALOG — Dynamic product loading
   ============================================================ */

async function loadCatalogProducts(filterCategories = [], searchQuery = "") {
  const grid = document.getElementById("catalog-grid");
  if (!grid) return;

  grid.innerHTML = `<div class="catalog-loading">Loading products…</div>`;

  if (typeof window.sb === "undefined") {
    grid.innerHTML = `<p class="catalog-empty">Backend not connected. Please configure Supabase.</p>`;
    return;
  }

  let query = window.sb.from("products")
    .select("*, inventory(stock_qty, status)")
    .eq("is_active", true)
    .order("name");

  if (filterCategories.length > 0) {
    query = query.in("category_name", filterCategories);
  }
  if (searchQuery) {
    query = query.ilike("name", `%${searchQuery}%`);
  }

  const { data: products, error } = await query;

  if (error || !products?.length) {
    grid.innerHTML = `<p class="catalog-empty">No products found.</p>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const inv     = p.inventory?.[0];
    const stock   = inv?.status || "in_stock";
    const imgSrc  = p.image_url || "blanket.png";
    const salePrice = p.is_on_sale && p.sale_price ? p.sale_price : null;
    const displayPrice = salePrice ? salePrice : p.price;

    return `
      <div class="product-card" data-url="product.html?id=${p.id}" data-product-id="${p.id}">
        ${p.is_on_sale ? `<div class="badge-sale">SALE</div>` : ""}
        ${p.is_featured ? `<div class="badge-featured">FEATURED</div>` : ""}
        <div class="product-image">
          <img src="${escHtml(imgSrc)}" alt="${escHtml(p.name)}" onerror="this.src='blanket.png'">
        </div>
        <div class="product-content">
          <h3>${escHtml(p.name)}</h3>
          ${p.sku ? `<p class="product-sku">SKU: ${escHtml(p.sku)}</p>` : ""}
          <p class="product-description">${escHtml(p.description || "")}</p>
          <div class="product-details">
            <div class="detail-item"><img src="box.svg" alt=""><span>Case Qty: ${p.case_qty || 1}</span></div>
            <div class="detail-item"><img src="pack.svg" alt=""><span>Pack Size: ${p.pack_size || 1}</span></div>
          </div>
          <div class="product-footer">
            <div class="price-group">
              ${salePrice
                ? `<span class="price-original">$${Number(p.price).toFixed(2)}</span>
                   <span class="price sale">$${Number(salePrice).toFixed(2)}</span>`
                : `<span class="price">$${Number(p.price).toFixed(2)}</span>`}
            </div>
            ${stock === "out_of_stock"
              ? `<button class="add-btn" disabled>Out of Stock</button>`
              : `<button class="add-btn"
                   data-name="${escHtml(p.name)}"
                   data-price="${displayPrice}"
                   data-image="${escHtml(imgSrc)}"
                   data-product-id="${p.id}">Add to Order</button>`}
          </div>
        </div>
      </div>`;
  }).join("");

  /* Re-attach event handlers for dynamically rendered cards */
  setupAddToCartButtons();
  setupProductCardClicks();
}

/* ============================================================
   UTIL
   ============================================================ */

function escHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = "block";
}
