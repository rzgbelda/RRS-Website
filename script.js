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

function setupLogin() {
  updateLoginUI();

  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", e => {
      e.preventDefault();

      const email = document.getElementById("emailInput")?.value.trim();
      const password = document.getElementById("passwordInput")?.value.trim();

      if (email === "test@test.com" && password === "test") {
        localStorage.setItem("loggedIn", "true");
        window.location.href = "index.html";
      } else {
        alert("Invalid email or password");
      }
    });
  }

  const logoutBtn = document.getElementById("logout-btn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedIn");
      window.location.href = "login.html";
    });
  }
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