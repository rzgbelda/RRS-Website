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
  setupProductGallery();
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
