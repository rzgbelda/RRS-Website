console.log("Script loaded!");

document.addEventListener("DOMContentLoaded", () => {
  updateCartBadge();
  setupReorderDropdowns();
  setupAddToCartButtons();
  setupProductCardClicks();
  setupLogin();
  setupAccountDropdown();
  setupPasswordToggle();
  setupProductQuantity();
  setupProductGallery();
  loadCartPage();
  setupCheckoutQuantity();
  updateCheckoutSummary();
  loadCheckoutProducts();
});

/* =========================
   CART BADGE
========================= */

function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

function saveCart(cart) {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function updateCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge) return;

  const cart = getCart();

  const totalItems = cart.reduce((sum, item) => {
    return sum + item.quantity;
  }, 0);

  badge.textContent = totalItems;
  badge.style.display = totalItems > 0 ? "flex" : "none";
}

/* =========================
   ADD TO CART
========================= */

function setupAddToCartButtons() {
  document.querySelectorAll(".add-btn").forEach(button => {
    button.addEventListener("click", e => {
      e.stopPropagation();

      const card = button.closest(".product-card");

      let product;

      if (card) {
        product = {
          name: card.querySelector("h3")?.textContent.trim() || button.dataset.name,
          description: card.querySelector(".product-description")?.textContent.trim() || "",
          price: parseFloat(card.querySelector(".price")?.textContent.replace("$", "")) || Number(button.dataset.price) || 0,
          image: card.querySelector(".product-image img")?.getAttribute("src") || button.dataset.image || "",
          quantity: Number(document.getElementById("qtyValue")?.textContent) || 1
        };
      } else {
        product = {
          name: button.dataset.name,
          price: Number(button.dataset.price) || 0,
          image: button.dataset.image || "",
          quantity: 1
        };
      }

      let cart = getCart();

      const existingProduct = cart.find(item => item.name === product.name);

      if (existingProduct) {
        existingProduct.quantity += 1;
      } else {
        cart.push(product);
      }

      saveCart(cart);
      updateCartBadge();
      flyToCart(button);
    });
  });
}

/* =========================
   FLY TO CART ANIMATION
========================= */

function flyToCart(button) {
  const cartIcon = document.querySelector(".cart-container");
  if (!cartIcon) return;

  const buttonRect = button.getBoundingClientRect();
  const cartRect = cartIcon.getBoundingClientRect();

  const flyingItem = document.createElement("div");
  flyingItem.classList.add("flying-cart-item");

  flyingItem.innerHTML = `<img src="Cart.png" alt="">`;

  document.body.appendChild(flyingItem);

  flyingItem.style.left = buttonRect.left + buttonRect.width / 2 + "px";
  flyingItem.style.top = buttonRect.top + buttonRect.height / 2 + "px";

  setTimeout(() => {
    flyingItem.style.left = cartRect.left + cartRect.width / 2 + "px";
    flyingItem.style.top = cartRect.top + cartRect.height / 2 + "px";
    flyingItem.style.transform = "scale(0.2)";
    flyingItem.style.opacity = "0";
  }, 10);

  setTimeout(() => {
    flyingItem.remove();
  }, 800);
}

/* =========================
   PRODUCT CARD CLICK
========================= */

function setupProductCardClicks() {
  document.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", () => {
      if (card.dataset.url) {
        window.location.href = card.dataset.url;
      }
    });
  });
}

/* =========================
   REORDER DROPDOWN
========================= */

function setupReorderDropdowns() {
  document.querySelectorAll(".reorder-dropdown").forEach(dropdown => {

    function updateDropdown() {
      if (dropdown.value === "Once") {
        dropdown.classList.remove("selected");
      } else {
        dropdown.classList.add("selected");
      }
    }

    updateDropdown(); // run on page load

    dropdown.addEventListener("change", updateDropdown);

  });
}

/* =========================
   LOGIN
========================= */

/* ---------- USER AUTH HELPERS ---------- */

function getUsers() {
  return JSON.parse(localStorage.getItem("rrs_users") || "[]");
}

function saveUsers(users) {
  localStorage.setItem("rrs_users", JSON.stringify(users));
}

function hashPass(str) {
  return btoa(encodeURIComponent(str));
}

function currentUser() {
  try { return JSON.parse(sessionStorage.getItem("rrs_user")); }
  catch { return null; }
}

/* ---------- LOGIN SETUP ---------- */

function setupLogin() {
  updateLoginUI();
  setupAuthTabs();
  setupRegister();

  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", e => {
    e.preventDefault();
    const email    = (document.getElementById("emailInput")?.value || "").trim().toLowerCase();
    const password = (document.getElementById("passwordInput")?.value || "").trim();
    const errEl    = document.getElementById("loginError");

    const users = getUsers();
    const user  = users.find(u => u.email.toLowerCase() === email && u.passwordHash === hashPass(password));

    if (user) {
      localStorage.setItem("loggedIn", "true");
      sessionStorage.setItem("rrs_user", JSON.stringify({
        id           : user.id,
        email        : user.email,
        contactName  : user.contactName,
        businessName : user.businessName,
      }));
      window.location.href = "index.html";
    } else {
      if (errEl) { errEl.textContent = "Incorrect email or password. Please try again."; errEl.style.display = "block"; }
    }
  });

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedIn");
      sessionStorage.removeItem("rrs_user");
      window.location.href = "login.html";
    });
  }
}

/* ---------- AUTH TABS (Sign In / Create Account) ---------- */

function setupAuthTabs() {
  const tabSignIn   = document.getElementById("tabSignIn");
  const tabRegister = document.getElementById("tabRegister");
  const signInPanel   = document.getElementById("signInPanel");
  const registerPanel = document.getElementById("registerPanel");

  if (!tabSignIn || !tabRegister) return;

  function showSignIn() {
    signInPanel.style.display   = "";
    registerPanel.style.display = "none";
    tabSignIn.classList.add("active");
    tabRegister.classList.remove("active");
  }

  function showRegister() {
    signInPanel.style.display   = "none";
    registerPanel.style.display = "";
    tabRegister.classList.add("active");
    tabSignIn.classList.remove("active");
  }

  tabSignIn.addEventListener("click",   showSignIn);
  tabRegister.addEventListener("click", showRegister);

  document.getElementById("switchToRegister")?.addEventListener("click", e => { e.preventDefault(); showRegister(); });
  document.getElementById("switchToSignIn")?.addEventListener("click",   e => { e.preventDefault(); showSignIn(); });
  document.getElementById("goToSignIn")?.addEventListener("click",       e => { e.preventDefault(); showSignIn(); });
}

/* ---------- REGISTER ---------- */

function setupRegister() {
  const registerForm = document.getElementById("registerForm");
  if (!registerForm) return;

  registerForm.addEventListener("submit", e => {
    e.preventDefault();

    const businessName   = document.getElementById("regBusiness")?.value.trim() || "";
    const businessType   = document.getElementById("regBusinessType")?.value || "";
    const contactName    = document.getElementById("regName")?.value.trim() || "";
    const email          = (document.getElementById("regEmail")?.value || "").trim().toLowerCase();
    const phone          = document.getElementById("regPhone")?.value.trim() || "";
    const password       = document.getElementById("regPassword")?.value || "";
    const confirm        = document.getElementById("regConfirm")?.value || "";
    const errEl          = document.getElementById("registerError");
    const successEl      = document.getElementById("registerSuccess");

    const showErr = msg => { errEl.textContent = msg; errEl.style.display = "block"; successEl.style.display = "none"; };

    if (!businessName)  return showErr("Business name is required.");
    if (!businessType)  return showErr("Please select a business type.");
    if (!contactName)   return showErr("Contact name is required.");
    if (!email || !/\S+@\S+\.\S+/.test(email)) return showErr("Please enter a valid email address.");
    if (password.length < 8) return showErr("Password must be at least 8 characters.");
    if (password !== confirm) return showErr("Passwords do not match.");

    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === email)) {
      return showErr("An account with this email already exists.");
    }

    const newUser = {
      id           : "u" + Date.now().toString(36),
      businessName,
      businessType,
      contactName,
      email,
      phone,
      passwordHash : hashPass(password),
      createdAt    : new Date().toISOString(),
    };

    users.push(newUser);
    saveUsers(users);

    errEl.style.display = "none";
    registerForm.reset();
    successEl.style.display = "block";
  });
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
const accountBtn = document.querySelector(".account-btn");

if (accountDropdown && accountBtn) {
  accountBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    accountDropdown.classList.toggle("active");
  });

  document.addEventListener("click", () => {
    accountDropdown.classList.remove("active");
  });
}
}

/* =========================
   PASSWORD EYE TOGGLE
========================= */

function setupPasswordToggle() {
  const passwordInput = document.getElementById("passwordInput");
  const togglePassword = document.getElementById("togglePassword");

  if (passwordInput && togglePassword) {
    togglePassword.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";

      passwordInput.type = isPassword ? "text" : "password";
      togglePassword.src = isPassword ? "eye-line.svg" : "eye-off-line.svg";
    });
  }
}

/* =========================
   PRODUCT QUANTITY
========================= */

function setupProductQuantity() {
  const qtyValue = document.getElementById("qtyValue");
  const plusQty = document.getElementById("plusQty");
  const minusQty = document.getElementById("minusQty");

  if (!qtyValue || !plusQty || !minusQty) return;

  plusQty.addEventListener("click", () => {
    qtyValue.textContent = Number(qtyValue.textContent) + 1;
  });

  minusQty.addEventListener("click", () => {
    if (Number(qtyValue.textContent) > 1) {
      qtyValue.textContent = Number(qtyValue.textContent) - 1;
    }
  });
}

/* =========================
   PRODUCT IMAGE GALLERY
========================= */

function setupProductGallery() {
  const images = [
    "75902.jpg",
    "Hotel.png",
    "Facilities.png",
    "pricetag.png"
  ];

  let currentImage = 0;

  const mainImage = document.getElementById("mainProductImage");
  const thumbContainer = document.querySelector(".thumb-row");
  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");

  if (!mainImage || !thumbContainer || !nextBtn || !prevBtn) return;

  function renderThumbnails() {
    thumbContainer.innerHTML = "";

    images.forEach((image, index) => {
      const thumb = document.createElement("img");
      thumb.src = image;
      thumb.className = "thumb";

      if (index === currentImage) {
        thumb.classList.add("active");
      }

      thumb.addEventListener("click", () => {
        currentImage = index;
        updateGallery();
      });

      thumbContainer.appendChild(thumb);
    });
  }

  function updateGallery() {
    mainImage.src = images[currentImage];

    document.querySelectorAll(".thumb").forEach((thumb, index) => {
      thumb.classList.toggle("active", index === currentImage);
    });
  }

  nextBtn.addEventListener("click", () => {
    currentImage = (currentImage + 1) % images.length;
    updateGallery();
  });

  prevBtn.addEventListener("click", () => {
    currentImage = (currentImage - 1 + images.length) % images.length;
    updateGallery();
  });

  renderThumbnails();
  updateGallery();
}


// Checkout page quantity buttons
function setupCheckoutQuantity() {
  document.querySelectorAll(".checkout-product").forEach(product => {
    const minusBtn = product.querySelector(".qty-minus");
    const plusBtn = product.querySelector(".qty-plus");
    const qtyValue = product.querySelector(".qty-value");

    if (!minusBtn || !plusBtn || !qtyValue) return;

    plusBtn.addEventListener("click", () => {
      qtyValue.textContent = Number(qtyValue.textContent) + 1;
      updateCheckoutSummary();
    });

    minusBtn.addEventListener("click", () => {
      let qty = Number(qtyValue.textContent);

      if (qty > 1) {
        qtyValue.textContent = qty - 1;
        updateCheckoutSummary();
      }
    });
  });
}

function updateCheckoutSummary() {
  const summaryItems = document.querySelector(".summary-items");
  const summaryCount = document.querySelector(".summary-head span");
  const subtotalText =
  document.getElementById("summary-subtotal");

  const totalText =
  document.getElementById("summary-total");

  if (!summaryItems || !summaryCount || !subtotalText || !totalText) return;

  summaryItems.innerHTML = "";

  let subtotal = 0;
  let totalItems = 0;

  document.querySelectorAll(".checkout-product").forEach(product => {
    const name = product.querySelector("h4").textContent;
    const priceText =
  product.querySelector(".product-price").textContent;

    const price = parseFloat(priceText.replace(/[^0-9.]/g, ""));
    const qty = Number(product.querySelector(".qty-value").textContent);
    const itemTotal = price * qty;

    subtotal += itemTotal;
    totalItems += qty;

    const productTotal =
  product.querySelector(".product-total");

    if (productTotal) {
      productTotal.textContent = `$${itemTotal.toFixed(2)}`;
    }

    summaryItems.innerHTML += `
      <div>
        <strong>${name}</strong>
        <span>$${itemTotal.toFixed(2)}</span>
        <p>Qty: ${qty}</p>
      </div>
    `;
  });

  summaryCount.textContent = `${totalItems} Items`;
  subtotalText.textContent = `$${subtotal.toFixed(2)}`;
  totalText.textContent = `$${subtotal.toFixed(2)}`;
}

//Products on cart page

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
    document.querySelector(".summary-row span").textContent = "Subtotal (0 items)";
    return;
  }

  cart.forEach((item, index) => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;
    totalItems += item.quantity;

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

        <span class="product-price">$${item.price.toFixed(2)}</span>

        <div class="qty-box">
          <button class="qty-minus" data-index="${index}">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-plus" data-index="${index}">+</button>
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

        <button class="trash-btn" data-index="${index}">
          <img src="trash.svg" alt="Delete">
        </button>
      </div>
    `;
  });

  document.querySelector(".summary-row span").textContent =
    `Subtotal (${totalItems} items)`;

  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  estimatedTotalEl.textContent = `$${subtotal.toFixed(2)}`;

  setupCartButtons();
  setupReorderDropdowns();
}

function setupCartButtons() {
  document.querySelectorAll(".qty-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const index = btn.dataset.index;

      cart[index].quantity += 1;

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    });
  });

  document.querySelectorAll(".qty-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const index = btn.dataset.index;

      if (cart[index].quantity > 1) {
        cart[index].quantity -= 1;
      }

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    });
  });

  document.querySelectorAll(".trash-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cart = getCart();
      const index = btn.dataset.index;

      cart.splice(index, 1);

      saveCart(cart);
      updateCartBadge();
      loadCartPage();
    });
  });
}

// Checkout from cart page
function loadCheckoutProducts() {
  const checkoutProducts = document.getElementById("checkout-products");
  const summaryItems = document.getElementById("summary-items");
  const subtotalEl = document.getElementById("summary-subtotal");
  const totalEl = document.getElementById("summary-total");
  const countEl = document.getElementById("summary-count");

  if (!checkoutProducts) return;

  const cart = JSON.parse(localStorage.getItem("cart")) || [];

  if (cart.length === 0) {
    checkoutProducts.innerHTML = `<p>Your cart is empty.</p>`;

    if (summaryItems) summaryItems.innerHTML = "";

    const itemCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    if (countEl) countEl.textContent = `${itemCount} Items`;
    if (subtotalEl) subtotalEl.textContent = "$0.00";
    if (totalEl) totalEl.textContent = "$0.00";

    return;
  }

  checkoutProducts.innerHTML = cart.map(item => {
    const qty = item.quantity || 1;
    const price = Number(item.price);
    const total = price * qty;

    return `
      <div class="checkout-product">
        <img src="${item.image}" alt="${item.name}">

        <div>
          <h4>${item.name}</h4>
          <p>${item.description || "Commercial Grade Comfort"}</p>
          <small>⊙ In Stock</small>
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
      const qty = item.quantity || 1;
      const price = Number(item.price);
      const total = price * qty;

      return `
        <p>
          <span>${item.name} × ${qty}</span>
          <strong>$${total.toFixed(2)}</strong>
        </p>
      `;
    }).join("");
  }

  const subtotal = cart.reduce((sum, item) => {
    return sum + Number(item.price) * (item.quantity || 1);
  }, 0);

  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${subtotal.toFixed(2)}`;
}