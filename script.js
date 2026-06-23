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

  fetch("products.csv")
    .then(response => response.text())
    .then(csvText => {
      allProducts = parseCSV(csvText);

      renderProducts(allProducts);
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
      price3: values[14]?.trim() || ""

      
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

function renderProducts(products) {
  const productsGrid = document.getElementById("products-grid");
  if (!productsGrid) return;

  productsGrid.innerHTML = "";

  const visibleProducts = products.filter(product => {
    return (
      cleanPrice(product.price1) > 0 ||
      cleanPrice(product.price2) > 0 ||
      cleanPrice(product.price3) > 0 ||
      cleanPrice(product.price) > 0
    );
  });

  visibleProducts.forEach(product => {
    const price = cleanPrice(product.price1) || cleanPrice(product.price);

    productsGrid.innerHTML += `
      <div class="product-card" data-url="product.html?item=${encodeURIComponent(product.itemNumber)}">
        <div class="product-image">
          <img src="${product.image}" alt="${product.name}">
        </div>

        <div class="product-content">
          <h3>${product.name}</h3>

          <p class="product-description">
            ${product.description || ""}
          </p>

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
              <span class="unit">/ Case</span>
            </div>

            <button 
              class="add-btn"
              data-item="${product.itemNumber}"
              data-name="${product.name}"
              data-description="${product.description || ""}"
              data-price="${price}"
              data-price1="${cleanPrice(product.price1)}"
              data-price2="${cleanPrice(product.price2)}"
              data-price3="${cleanPrice(product.price3)}"
              data-image="${product.image}"
            >
              Add to Order
            </button>
          </div>
        </div>
      </div>
    `;
  });

  setupProductCardClicks();
  setupAddToCartButtons();
}

function setupProductCardClicks() {
  document.querySelectorAll(".product-card").forEach(card => {
    card.onclick = e => {
      if (e.target.closest(".add-btn")) return;

      const url = card.dataset.url;
      if (url) {
        window.location.href = url;
      }
    };
  });
}

/* =========================
   SEARCH
========================= */

document.addEventListener("input", e => {
  if (e.target.id !== "search-input") return;

  const keyword = e.target.value.toLowerCase();

  const filteredProducts = allProducts.filter(product =>
    product.name.toLowerCase().includes(keyword) ||
    product.description.toLowerCase().includes(keyword) ||
    product.overview.toLowerCase().includes(keyword) ||
    product.feature1.toLowerCase().includes(keyword) ||
    product.feature2.toLowerCase().includes(keyword) ||
    product.feature3.toLowerCase().includes(keyword) ||
    product.feature4.toLowerCase().includes(keyword) ||
    product.itemNumber.toLowerCase().includes(keyword)
  );

  renderProducts(filteredProducts);
});

/* =========================
   PRODUCT PAGE
========================= */

function loadProductPage() {
  const productNameEl = document.getElementById("productName");
  if (!productNameEl) return;

  const params = new URLSearchParams(window.location.search);
  const itemNumber = params.get("item");

  if (!itemNumber) {
    productNameEl.textContent = "Product not found";
    return;
  }

  const product = allProducts.find(p => {
    return String(p.itemNumber).trim() === String(itemNumber).trim();
  });

  if (!product) {
    productNameEl.textContent = "Product not found";
    return;
  }

  const price = cleanPrice(product.price);

  document.title = `${product.name} | Room Ready Supply`;

  setText("breadcrumbProductName", product.name);
  setText("productName", product.name);
  setText("productItemNumber", product.itemNumber);
  setText("productCaseQty", product.caseQty);
  setText("productSize", product.size);

  setText("productDescription", product.description);
  setText("overviewDescription", product.overview || product.description);

  setText("productPrice", `$${price.toFixed(2)}`);

  setText("specName", product.name);
  setText("specItemNumber", product.itemNumber);
  setText("specCaseQty", product.caseQty);
  setText("specSize", product.size);
  setText("specPrice", `$${price.toFixed(2)}`);
  setText("tier1Price", product.price1 ? `$${cleanPrice(product.price1).toFixed(2)}` : "$--.--");
  setText("tier2Price", product.price2 ? `$${cleanPrice(product.price2).toFixed(2)}` : "$--.--");
  setText("tier3Price", product.price3 ? `$${cleanPrice(product.price3).toFixed(2)}` : "$--.--");

  const mainImage = document.getElementById("mainProductImage");
  const thumbImage = document.getElementById("thumbImage");

  if (mainImage) {
    mainImage.src = product.image;
    mainImage.alt = product.name;
  }

  if (thumbImage) {
    thumbImage.src = product.image;
    thumbImage.alt = product.name;
  }

  const featuresList = document.getElementById("featuresList");

  if (featuresList) {
    featuresList.innerHTML = "";

    [
      product.feature1,
      product.feature2,
      product.feature3,
      product.feature4
    ]
      .filter(feature => feature && feature.trim() !== "")
      .forEach(feature => {
        featuresList.innerHTML += `<li>${feature}</li>`;
      });
  }

  const addBtn = document.getElementById("productAddToCart");

  if (addBtn) {
    addBtn.dataset.item = product.itemNumber;
    addBtn.dataset.name = product.name;
    addBtn.dataset.description = product.description || "";
    addBtn.dataset.price = price;
    addBtn.dataset.image = product.image;
    addBtn.dataset.price1 = cleanPrice(product.price1);
    addBtn.dataset.price2 = cleanPrice(product.price2);
    addBtn.dataset.price3 = cleanPrice(product.price3);
  }
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
        quantity = Number(qtyValue.textContent) || 1;
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

  function updateProductPagePrice() {
    const qty = Number(qtyValue.textContent) || 1;

    const item = {
      quantity: qty,
      price: addBtn.dataset.price,
      price1: addBtn.dataset.price1,
      price2: addBtn.dataset.price2,
      price3: addBtn.dataset.price3
    };

    const tierPrice = getTierPrice(item);

    productPriceEl.textContent = `$${tierPrice.toFixed(2)}`;
  }

  plusQty.onclick = () => {
    qtyValue.textContent = Number(qtyValue.textContent) + 1;
    updateProductPagePrice();
  };

  minusQty.onclick = () => {
    const currentQty = Number(qtyValue.textContent) || 1;

    if (currentQty > 1) {
      qtyValue.textContent = currentQty - 1;
      updateProductPagePrice();
    }
  };

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

  if (countEl) countEl.textContent = `${itemCount} Items`;
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${subtotal.toFixed(2)}`;
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
          window.location.href = "index.html";
        }
      } else {
        // Fallback (no Supabase loaded)
        if (email === "test@test.com" && password === "test") {
          localStorage.setItem("loggedIn", "true");
          updateLoginUI();
          updateCartBadge();
          window.location.href = "index.html";
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
      <div class="product-card" data-url="product.html?item=${encodeURIComponent(product.itemNumber)}">

        <div class="product-image">
          <img src="${product.image}" alt="${product.name}">
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
          $${price.toFixed(2)} <span>/Case</span>
        </div>

        <button
          class="add-btn"
          data-item="${product.itemNumber}"
          data-name="${product.name}"
          data-description="${product.description || ""}"
          data-price="${price}"
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
  totalEl.textContent = `$${subtotal.toFixed(2)}`;
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

document.getElementById("submitOrderBtn")?.addEventListener("click", e => {
  e.preventDefault();

  const ref =
    "RRS-" +
    Math.floor(10000 + Math.random() * 90000);

  document.getElementById("orderRef").textContent = ref;

  document.getElementById("orderModal").classList.add("show");
});

// Profile page functionality
function setupProfilePage() {
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

  const checkoutInfo = JSON.parse(localStorage.getItem("checkoutInfo")) || {};
  const orders = JSON.parse(localStorage.getItem("orderHistory")) || [];

  const setText = (id, value, fallback = "Not added yet") => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || fallback;
  };

  setText("profile-business", checkoutInfo.businessName, "Room Ready Customer");
  setText("profile-email", checkoutInfo.email, "customer@email.com");

  setText("businessName", checkoutInfo.businessName, "Room Ready Customer");
  setText("contactName", checkoutInfo.contactName);
  setText("emailAddress", checkoutInfo.email, "customer@email.com");
  setText("phoneNumber", checkoutInfo.phone);

  setText("deliveryAddress", checkoutInfo.address, "No address saved yet");
  setText("deliveryCity", checkoutInfo.city);
  setText("deliveryState", checkoutInfo.state);
  setText("deliveryZip", checkoutInfo.zip);

  const orderHistoryList = document.getElementById("orderHistoryList");

  if (orderHistoryList && orders.length > 0) {
    orderHistoryList.innerHTML = "";

    orders.forEach((order, index) => {
      orderHistoryList.innerHTML += `
        <div class="order-card">
          <h4>Order #${index + 1}</h4>
          <p><strong>Date:</strong> ${order.date || "Recently placed"}</p>
          <p><strong>Total:</strong> ${order.total || "$0.00"}</p>
          <p><strong>Status:</strong> ${order.status || "Submitted"}</p>
        </div>
      `;
    });
  }

  const logoutProfileBtn = document.getElementById("logoutProfileBtn");

  if (logoutProfileBtn) {
    logoutProfileBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedIn");
      window.location.href = "login.html";
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

