/* ==================================================
   Room Ready Supply — Admin Dashboard
   Credentials: admin@roomreadysupply.com / RRS@Admin2024
================================================== */

const ADMIN_EMAIL    = "admin@roomreadysupply.com";
const ADMIN_PASS_KEY = "rrs_admin_pass";
const DEFAULT_PASS   = "RRS@Admin2024";

const KEYS = {
  products : "rrs_products",
  orders   : "rrs_orders",
  users    : "rrs_users",
  siteInfo : "rrs_site_info",
  session  : "rrs_admin_session",
};

/* ---- Default seed products ---- */
const DEFAULT_PRODUCTS = [
  { id:"p001", name:"Premium Hospitality Blanket",    category:"Towels and Linens",     description:"Commercial Grade Comfort",             price:34.99, unit:"Case", caseQty:6, packSize:1, stockQty:120, stock:"in_stock",  image:"blanket.png",    featured:true  },
  { id:"p002", name:"Heavy Duty Trash Liners",        category:"Trash Liners",          description:"40-42 Gallon, 1.5mil strength",         price:45.00, unit:"Case", caseQty:100, packSize:1, stockQty:85,  stock:"in_stock",  image:"trashbag.png",   featured:true  },
  { id:"p003", name:"Commercial Toilet Paper",        category:"Toilet Paper",          description:"2-Ply, 550 Sheets per Roll",             price:52.00, unit:"Case", caseQty:96,  packSize:1, stockQty:200, stock:"in_stock",  image:"toiletpaper.png",featured:true  },
  { id:"p004", name:"Hand Soap Dispenser Refill",     category:"Hand Soap",             description:"Foaming Hand Soap, Gentle Formula",      price:28.50, unit:"Case", caseQty:6,   packSize:1, stockQty:60,  stock:"in_stock",  image:"handsoap.png",   featured:true  },
  { id:"p005", name:"Multi-Surface Cleaner",          category:"Cleaning Chemicals",    description:"Ready-to-use disinfectant spray",         price:38.00, unit:"Case", caseQty:12,  packSize:1, stockQty:45,  stock:"in_stock",  image:"cleaner.png",    featured:false },
  { id:"p006", name:"Paper Towel Rolls",              category:"Paper Towels",          description:"2-Ply Jumbo Roll, 350 Sheets",            price:41.00, unit:"Case", caseQty:30,  packSize:1, stockQty:150, stock:"in_stock",  image:"papertowel.png", featured:false },
  { id:"p007", name:"Laundry Detergent",              category:"Laundry Supplies",      description:"HE Commercial Formula, 5-Gallon",         price:62.00, unit:"Pail", caseQty:1,   packSize:1, stockQty:18,  stock:"low_stock", image:"detergent.png",  featured:false },
  { id:"p008", name:"Dish Soap Concentrate",          category:"Dishwashing Supplies",  description:"Commercial Concentrate, cuts grease",     price:24.00, unit:"Case", caseQty:4,   packSize:1, stockQty:0,   stock:"out_of_stock", image:"dishsoap.png", featured:false },
  { id:"p009", name:"Hotel Shampoo Bottles",          category:"Guest Room Supplies",   description:"2oz individually packaged, lightly scented",price:35.00, unit:"Case", caseQty:288, packSize:1, stockQty:96,  stock:"in_stock",  image:"shampoo.png",    featured:false },
  { id:"p010", name:"White Bath Towels",              category:"Towels and Linens",     description:"27x52in, 6lb ring-spun cotton",           price:78.00, unit:"Dozen", caseQty:12, packSize:1, stockQty:60,  stock:"in_stock",  image:"towel.png",      featured:false },
  { id:"p011", name:"Compostable To-Go Containers",  category:"Food Service Supplies",  description:"9-inch clamshell, eco-friendly",           price:31.00, unit:"Case", caseQty:200, packSize:1, stockQty:12,  stock:"low_stock", image:"container.png",  featured:false },
  { id:"p012", name:"Mop & Bucket Kit",              category:"Facility Supplies",      description:"32oz cotton loop mop with wringer bucket", price:49.00, unit:"Kit",  caseQty:1,   packSize:1, stockQty:30,  stock:"in_stock",  image:"mop.png",        featured:false },
];

/* ==================================================
   UTILS
================================================== */

function getProducts() { return JSON.parse(localStorage.getItem(KEYS.products) || "[]"); }
function saveProducts(p) { localStorage.setItem(KEYS.products, JSON.stringify(p)); }

function getOrders() { return JSON.parse(localStorage.getItem(KEYS.orders) || "[]"); }
function saveOrders(o) { localStorage.setItem(KEYS.orders, JSON.stringify(o)); }

function getUsers() { return JSON.parse(localStorage.getItem(KEYS.users) || "[]"); }

function getSiteInfo() {
  return JSON.parse(localStorage.getItem(KEYS.siteInfo) || '{"phone":"(123)-456-789","email":"roomready@email.com","address":""}');
}
function saveSiteInfo(s) { localStorage.setItem(KEYS.siteInfo, JSON.stringify(s)); }

function getAdminPass() { return localStorage.getItem(ADMIN_PASS_KEY) || DEFAULT_PASS; }

function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

function stockBadge(stock) {
  if (stock === "in_stock")      return '<span class="a-badge a-badge-green">In Stock</span>';
  if (stock === "low_stock")     return '<span class="a-badge a-badge-yellow">Low Stock</span>';
  if (stock === "out_of_stock")  return '<span class="a-badge a-badge-red">Out of Stock</span>';
  return '<span class="a-badge a-badge-gray">Unknown</span>';
}

function orderBadge(status) {
  const map = {
    pending    : "a-badge-orange",
    confirmed  : "a-badge-blue",
    processing : "a-badge-yellow",
    shipped    : "a-badge-blue",
    delivered  : "a-badge-green",
    cancelled  : "a-badge-red",
  };
  const cls = map[status] || "a-badge-gray";
  return `<span class="a-badge ${cls}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

function escHtml(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ==================================================
   AUTH
================================================== */

function isAdminLoggedIn() {
  return sessionStorage.getItem(KEYS.session) === "1";
}

function showDashboard() {
  document.getElementById("adminLoginOverlay").style.display = "none";
  document.getElementById("adminDashboard").style.display   = "flex";
  refreshStats();
  renderDashboardTab();
}

function showLogin() {
  sessionStorage.removeItem(KEYS.session);
  document.getElementById("adminDashboard").style.display   = "none";
  document.getElementById("adminLoginOverlay").style.display = "flex";
}

/* ==================================================
   NAVIGATION
================================================== */

let currentTab = "dashboard";

function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll(".a-nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  document.querySelectorAll(".a-tab").forEach(el => {
    el.style.display = el.id === "tab-" + tab ? "" : "none";
  });

  const titles = {
    dashboard : "Dashboard",
    products  : "Products",
    inventory : "Inventory",
    orders    : "Orders",
    users     : "Users",
    settings  : "Settings",
  };
  document.getElementById("adminPageTitle").textContent = titles[tab] || tab;

  if (tab === "dashboard")  renderDashboardTab();
  if (tab === "products")   renderProductsTable();
  if (tab === "inventory")  renderInventoryTable();
  if (tab === "orders")     renderOrdersTable();
  if (tab === "users")      renderUsersTable();
  if (tab === "settings")   loadSettings();
}

/* ==================================================
   STATS
================================================== */

function refreshStats() {
  const products = getProducts();
  const orders   = getOrders();
  const users    = getUsers();
  const outOfStock = products.filter(p => p.stock === "out_of_stock").length;

  const el = id => document.getElementById(id);
  if (el("statProducts"))  el("statProducts").textContent  = products.length;
  if (el("statOrders"))    el("statOrders").textContent    = orders.length;
  if (el("statUsers"))     el("statUsers").textContent     = users.length;
  if (el("statOutOfStock"))el("statOutOfStock").textContent= outOfStock;
}

/* ==================================================
   DASHBOARD TAB
================================================== */

function renderDashboardTab() {
  renderRecentOrders();
  renderLowStock();
}

function renderRecentOrders() {
  const orders = getOrders().slice(-5).reverse();
  const tbody = document.getElementById("recentOrdersBody");
  if (!tbody) return;
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="a-empty">No orders yet.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong>#${escHtml(o.id)}</strong></td>
      <td>${escHtml(o.customerName)}</td>
      <td>${escHtml(o.businessName)}</td>
      <td>${formatDate(o.createdAt)}</td>
      <td>${orderBadge(o.status)}</td>
      <td><button class="a-action-btn" onclick="openOrderModal('${escHtml(o.id)}')">View</button></td>
    </tr>
  `).join("");
}

function renderLowStock() {
  const products = getProducts().filter(p => p.stock !== "in_stock");
  const tbody = document.getElementById("lowStockBody");
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="a-empty">All products in stock.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${escHtml(p.name)}</td>
      <td>${escHtml(p.category)}</td>
      <td>${p.stockQty ?? 0}</td>
      <td>${stockBadge(p.stock)}</td>
    </tr>
  `).join("");
}

/* ==================================================
   PRODUCTS TAB
================================================== */

function renderProductsTable(filter = "") {
  let products = getProducts();
  const catFilter = document.getElementById("productCategoryFilter")?.value || "";
  const search = (document.getElementById("productSearch")?.value || filter).toLowerCase();
  if (catFilter) products = products.filter(p => p.category === catFilter);
  if (search)    products = products.filter(p => p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search));

  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="a-empty">No products found. Click + Add Product to get started.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><img class="a-prod-img" src="${escHtml(p.image || "")}" alt="" onerror="this.style.visibility='hidden'"></td>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.category)}</td>
      <td><strong>$${Number(p.price).toFixed(2)}</strong> <span style="color:#999;font-size:11px">/${escHtml(p.unit||"Case")}</span></td>
      <td>${p.caseQty || "—"}</td>
      <td>${stockBadge(p.stock)}</td>
      <td>${p.featured ? '<span class="a-badge a-badge-blue">Yes</span>' : '<span style="color:#ccc">—</span>'}</td>
      <td>
        <button class="a-action-btn edit" onclick="openEditProduct('${escHtml(p.id)}')">Edit</button>
        <button class="a-action-btn delete" onclick="openDeleteProduct('${escHtml(p.id)}', '${escHtml(p.name)}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

/* ==================================================
   INVENTORY TAB
================================================== */

function renderInventoryTable() {
  let products = getProducts();
  const search = (document.getElementById("inventorySearch")?.value || "").toLowerCase();
  const stockFilter = document.getElementById("inventoryStockFilter")?.value || "";
  if (search)      products = products.filter(p => p.name.toLowerCase().includes(search));
  if (stockFilter) products = products.filter(p => p.stock === stockFilter);

  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="a-empty">No products found.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.category)}</td>
      <td>$${Number(p.price).toFixed(2)}</td>
      <td>${p.stockQty ?? 0}</td>
      <td>${stockBadge(p.stock)}</td>
      <td>
        <input class="stock-qty-input" type="number" min="0" value="${p.stockQty ?? 0}"
               id="sqty_${escHtml(p.id)}" />
        <select class="status-select" id="sstatus_${escHtml(p.id)}">
          <option value="in_stock"     ${p.stock==="in_stock"?"selected":""}>In Stock</option>
          <option value="low_stock"    ${p.stock==="low_stock"?"selected":""}>Low Stock</option>
          <option value="out_of_stock" ${p.stock==="out_of_stock"?"selected":""}>Out of Stock</option>
        </select>
        <button class="a-action-btn" onclick="updateInventory('${escHtml(p.id)}')">Save</button>
      </td>
    </tr>
  `).join("");
}

function updateInventory(id) {
  const products = getProducts();
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return;
  const qty    = parseInt(document.getElementById("sqty_" + id)?.value || 0);
  const status = document.getElementById("sstatus_" + id)?.value || "in_stock";
  products[idx].stockQty = qty;
  products[idx].stock    = status;
  saveProducts(products);
  renderInventoryTable();
  refreshStats();
  showToast("Inventory updated.");
}

/* ==================================================
   ORDERS TAB
================================================== */

function renderOrdersTable() {
  let orders = getOrders().slice().reverse();
  const search = (document.getElementById("orderSearch")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("orderStatusFilter")?.value || "";
  if (search)       orders = orders.filter(o => o.id.toLowerCase().includes(search) || (o.customerName||"").toLowerCase().includes(search) || (o.businessName||"").toLowerCase().includes(search));
  if (statusFilter) orders = orders.filter(o => o.status === statusFilter);

  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="a-empty">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td><strong>#${escHtml(o.id)}</strong></td>
      <td>${escHtml(o.customerName || "—")}</td>
      <td>${escHtml(o.businessName || "—")}</td>
      <td>${(o.items||[]).length} item(s)</td>
      <td><strong>$${Number(o.total||0).toFixed(2)}</strong></td>
      <td>${formatDate(o.createdAt)}</td>
      <td>
        <select class="status-select" onchange="updateOrderStatus('${escHtml(o.id)}', this.value)">
          ${["pending","confirmed","processing","shipped","delivered","cancelled"].map(s =>
            `<option value="${s}" ${o.status===s?"selected":""}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
          ).join("")}
        </select>
      </td>
      <td>
        <button class="a-action-btn" onclick="openOrderModal('${escHtml(o.id)}')">View</button>
        <button class="a-action-btn delete" onclick="openDeleteOrder('${escHtml(o.id)}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

function updateOrderStatus(orderId, status) {
  const orders = getOrders();
  const o = orders.find(o => o.id === orderId);
  if (o) { o.status = status; saveOrders(orders); refreshStats(); showToast("Order status updated."); }
}

/* ==================================================
   USERS TAB
================================================== */

function renderUsersTable() {
  let users = getUsers();
  const search = (document.getElementById("userSearch")?.value || "").toLowerCase();
  if (search) users = users.filter(u =>
    (u.contactName||"").toLowerCase().includes(search) ||
    (u.businessName||"").toLowerCase().includes(search) ||
    (u.email||"").toLowerCase().includes(search)
  );

  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="a-empty">No registered users yet.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escHtml(u.contactName)}</strong></td>
      <td>${escHtml(u.businessName)}</td>
      <td>${escHtml(u.businessType || "—")}</td>
      <td>${escHtml(u.email)}</td>
      <td>${escHtml(u.phone || "—")}</td>
      <td>${formatDate(u.createdAt)}</td>
      <td><button class="a-action-btn delete" onclick="openDeleteUser('${escHtml(u.id)}', '${escHtml(u.email)}')">Remove</button></td>
    </tr>
  `).join("");
}

/* ==================================================
   PRODUCT MODAL (Add / Edit)
================================================== */

function openAddProduct() {
  document.getElementById("modalTitle").textContent = "Add Product";
  document.getElementById("editProductId").value = "";
  clearProductForm();
  showModal("productModal");
}

function openEditProduct(id) {
  const p = getProducts().find(p => p.id === id);
  if (!p) return;
  document.getElementById("modalTitle").textContent = "Edit Product";
  document.getElementById("editProductId").value    = id;
  document.getElementById("prodName").value         = p.name || "";
  document.getElementById("prodCategory").value     = p.category || "";
  document.getElementById("prodDescription").value  = p.description || "";
  document.getElementById("prodPrice").value        = p.price || "";
  document.getElementById("prodUnit").value         = p.unit || "Case";
  document.getElementById("prodCaseQty").value      = p.caseQty || "";
  document.getElementById("prodPackSize").value     = p.packSize || "";
  document.getElementById("prodStockQty").value     = p.stockQty ?? "";
  document.getElementById("prodStock").value        = p.stock || "in_stock";
  document.getElementById("prodImage").value        = p.image || "";
  document.getElementById("prodFeatured").checked   = !!p.featured;
  showModal("productModal");
}

function clearProductForm() {
  ["prodName","prodDescription","prodPrice","prodUnit","prodCaseQty","prodPackSize","prodStockQty","prodImage"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const cat = document.getElementById("prodCategory"); if (cat) cat.value = "";
  const st  = document.getElementById("prodStock");    if (st)  st.value  = "in_stock";
  const ft  = document.getElementById("prodFeatured"); if (ft)  ft.checked = false;
  const err = document.getElementById("productFormError"); if (err) { err.style.display = "none"; err.textContent = ""; }
}

function saveProduct() {
  const id = document.getElementById("editProductId").value;
  const name     = document.getElementById("prodName").value.trim();
  const category = document.getElementById("prodCategory").value;
  const price    = parseFloat(document.getElementById("prodPrice").value);

  const errEl = document.getElementById("productFormError");
  if (!name)              { showFormError(errEl, "Product name is required."); return; }
  if (!category)          { showFormError(errEl, "Please select a category."); return; }
  if (isNaN(price) || price < 0) { showFormError(errEl, "Please enter a valid price."); return; }
  errEl.style.display = "none";

  const product = {
    id         : id || uid(),
    name,
    category,
    description: document.getElementById("prodDescription").value.trim(),
    price,
    unit       : document.getElementById("prodUnit").value.trim() || "Case",
    caseQty    : parseInt(document.getElementById("prodCaseQty").value) || 1,
    packSize   : parseInt(document.getElementById("prodPackSize").value) || 1,
    stockQty   : parseInt(document.getElementById("prodStockQty").value) || 0,
    stock      : document.getElementById("prodStock").value,
    image      : document.getElementById("prodImage").value.trim(),
    featured   : document.getElementById("prodFeatured").checked,
    updatedAt  : new Date().toISOString(),
  };

  const products = getProducts();
  if (id) {
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) products[idx] = { ...products[idx], ...product };
  } else {
    product.createdAt = new Date().toISOString();
    products.push(product);
  }
  saveProducts(products);
  hideModal("productModal");
  renderProductsTable();
  refreshStats();
  showToast(id ? "Product updated." : "Product added.");
}

/* ==================================================
   ORDER DETAIL MODAL
================================================== */

function openOrderModal(id) {
  const o = getOrders().find(o => o.id === id);
  if (!o) return;
  const body = document.getElementById("orderModalBody");
  body.innerHTML = `
    <div class="order-meta">
      <div class="order-meta-item"><strong>Order ID</strong>#${escHtml(o.id)}</div>
      <div class="order-meta-item"><strong>Date</strong>${formatDate(o.createdAt)}</div>
      <div class="order-meta-item"><strong>Customer</strong>${escHtml(o.customerName||"—")}</div>
      <div class="order-meta-item"><strong>Business</strong>${escHtml(o.businessName||"—")}</div>
      <div class="order-meta-item"><strong>Email</strong>${escHtml(o.email||"—")}</div>
      <div class="order-meta-item"><strong>Phone</strong>${escHtml(o.phone||"—")}</div>
      <div class="order-meta-item"><strong>Delivery Address</strong>${escHtml(o.address||"—")}</div>
      <div class="order-meta-item"><strong>Status</strong>${orderBadge(o.status)}</div>
    </div>
    <h4 style="font-size:14px;font-weight:700;margin-bottom:10px">Items Ordered</h4>
    <table class="order-detail-table">
      <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>
        ${(o.items||[]).map(item => `
          <tr>
            <td>${escHtml(item.name)}</td>
            <td>${item.quantity||1}</td>
            <td>$${Number(item.price||0).toFixed(2)}</td>
            <td>$${(Number(item.price||0) * (item.quantity||1)).toFixed(2)}</td>
          </tr>
        `).join("")}
        <tr style="font-weight:800">
          <td colspan="3" style="text-align:right">Total</td>
          <td>$${Number(o.total||0).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    ${o.notes ? `<p style="margin-top:14px;font-size:13px"><strong>Notes:</strong> ${escHtml(o.notes)}</p>` : ""}
  `;
  showModal("orderModal");
}

/* ==================================================
   DELETE HELPERS
================================================== */

let pendingDelete = null;

function openDeleteProduct(id, name) {
  document.getElementById("deleteModalMsg").textContent = `Delete "${name}"? This cannot be undone.`;
  pendingDelete = () => {
    const products = getProducts().filter(p => p.id !== id);
    saveProducts(products);
    renderProductsTable();
    if (currentTab === "inventory") renderInventoryTable();
    refreshStats();
    showToast("Product deleted.");
  };
  showModal("deleteModal");
}

function openDeleteOrder(id) {
  document.getElementById("deleteModalMsg").textContent = `Delete order #${id}? This cannot be undone.`;
  pendingDelete = () => {
    const orders = getOrders().filter(o => o.id !== id);
    saveOrders(orders);
    renderOrdersTable();
    refreshStats();
    showToast("Order deleted.");
  };
  showModal("deleteModal");
}

function openDeleteUser(id, email) {
  document.getElementById("deleteModalMsg").textContent = `Remove user "${email}"? This cannot be undone.`;
  pendingDelete = () => {
    const users = getUsers().filter(u => u.id !== id);
    localStorage.setItem(KEYS.users, JSON.stringify(users));
    renderUsersTable();
    refreshStats();
    showToast("User removed.");
  };
  showModal("deleteModal");
}

/* ==================================================
   MODAL HELPERS
================================================== */

function showModal(id) { document.getElementById(id).style.display = "flex"; }
function hideModal(id) { document.getElementById(id).style.display = "none"; }

function showFormError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

/* ==================================================
   SETTINGS
================================================== */

function loadSettings() {
  const info = getSiteInfo();
  const el = id => document.getElementById(id);
  if (el("sitePhone"))   el("sitePhone").value   = info.phone   || "";
  if (el("siteEmail"))   el("siteEmail").value    = info.email   || "";
  if (el("siteAddress")) el("siteAddress").value  = info.address || "";
}

/* ==================================================
   TOAST NOTIFICATION
================================================== */

function showToast(msg) {
  let toast = document.getElementById("rrs-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "rrs-toast";
    toast.style.cssText = "position:fixed;bottom:28px;right:28px;background:#0b2d52;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.2);transition:opacity .3s;";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

/* ==================================================
   INIT
================================================== */

document.addEventListener("DOMContentLoaded", () => {

  /* Admin login */
  document.getElementById("adminLoginForm").addEventListener("submit", e => {
    e.preventDefault();
    const email = document.getElementById("adminEmail").value.trim().toLowerCase();
    const pass  = document.getElementById("adminPassword").value;
    const errEl = document.getElementById("adminLoginError");

    if (email !== ADMIN_EMAIL.toLowerCase() || pass !== getAdminPass()) {
      errEl.textContent = "Invalid email or password.";
      errEl.style.display = "block";
      return;
    }
    errEl.style.display = "none";
    sessionStorage.setItem(KEYS.session, "1");
    showDashboard();
  });

  /* Logout */
  document.getElementById("adminLogout").addEventListener("click", () => { showLogin(); });

  /* Sidebar nav */
  document.querySelectorAll(".a-nav-item").forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); switchTab(el.dataset.tab); });
  });

  /* "View All" links in dashboard */
  document.querySelectorAll(".a-link-btn[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });

  /* Product search / filter */
  document.getElementById("productSearch")?.addEventListener("input", () => renderProductsTable());
  document.getElementById("productCategoryFilter")?.addEventListener("change", () => renderProductsTable());

  /* Inventory search / filter */
  document.getElementById("inventorySearch")?.addEventListener("input", () => renderInventoryTable());
  document.getElementById("inventoryStockFilter")?.addEventListener("change", () => renderInventoryTable());

  /* Order search / filter */
  document.getElementById("orderSearch")?.addEventListener("input", () => renderOrdersTable());
  document.getElementById("orderStatusFilter")?.addEventListener("change", () => renderOrdersTable());

  /* User search */
  document.getElementById("userSearch")?.addEventListener("input", () => renderUsersTable());

  /* Product modal */
  document.getElementById("openAddProduct").addEventListener("click", openAddProduct);
  document.getElementById("saveProduct").addEventListener("click", saveProduct);
  document.getElementById("closeProductModal").addEventListener("click", () => hideModal("productModal"));
  document.getElementById("cancelProductModal").addEventListener("click", () => hideModal("productModal"));

  /* Order modal */
  document.getElementById("closeOrderModal").addEventListener("click", () => hideModal("orderModal"));
  document.getElementById("cancelOrderModal").addEventListener("click", () => hideModal("orderModal"));

  /* Delete modal */
  document.getElementById("closeDeleteModal").addEventListener("click", () => hideModal("deleteModal"));
  document.getElementById("cancelDeleteModal").addEventListener("click", () => hideModal("deleteModal"));
  document.getElementById("confirmDeleteBtn").addEventListener("click", () => {
    if (pendingDelete) { pendingDelete(); pendingDelete = null; }
    hideModal("deleteModal");
  });

  /* Close modals on overlay click */
  document.querySelectorAll(".a-modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) overlay.style.display = "none";
    });
  });

  /* Settings: change password */
  document.getElementById("changePasswordForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const cur     = document.getElementById("currentPass").value;
    const newP    = document.getElementById("newPass").value;
    const confirm = document.getElementById("confirmPass").value;
    const errEl   = document.getElementById("passwordChangeErr");
    const msgEl   = document.getElementById("passwordChangeMsg");

    if (cur !== getAdminPass())        { showFormError(errEl, "Current password is incorrect."); msgEl.style.display="none"; return; }
    if (newP.length < 8)               { showFormError(errEl, "New password must be at least 8 characters."); msgEl.style.display="none"; return; }
    if (newP !== confirm)              { showFormError(errEl, "Passwords do not match."); msgEl.style.display="none"; return; }
    localStorage.setItem(ADMIN_PASS_KEY, newP);
    errEl.style.display = "none";
    msgEl.textContent = "Password updated successfully.";
    msgEl.style.display = "block";
    document.getElementById("changePasswordForm").reset();
  });

  /* Settings: site info */
  document.getElementById("siteInfoForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const info = {
      phone  : document.getElementById("sitePhone").value.trim(),
      email  : document.getElementById("siteEmail").value.trim(),
      address: document.getElementById("siteAddress").value.trim(),
    };
    saveSiteInfo(info);
    const msgEl = document.getElementById("siteInfoMsg");
    msgEl.textContent = "Contact info saved.";
    msgEl.style.display = "block";
    setTimeout(() => { msgEl.style.display = "none"; }, 2500);
  });

  /* Settings: seed products */
  document.getElementById("seedProducts")?.addEventListener("click", () => {
    const existing = getProducts();
    if (existing.length && !confirm("Products already exist. Seed default products anyway? Existing products will not be affected.")) return;
    const toAdd = DEFAULT_PRODUCTS.filter(d => !existing.find(e => e.id === d.id));
    saveProducts([...existing, ...toAdd]);
    refreshStats();
    showToast(`${toAdd.length} default products added.`);
    if (currentTab === "products") renderProductsTable();
    if (currentTab === "inventory") renderInventoryTable();
  });

  /* Settings: clear products */
  document.getElementById("clearProducts")?.addEventListener("click", () => {
    if (!confirm("Delete ALL products? This cannot be undone.")) return;
    localStorage.removeItem(KEYS.products);
    refreshStats();
    showToast("All products cleared.");
    if (currentTab === "products") renderProductsTable();
  });

  /* Settings: clear orders */
  document.getElementById("clearOrders")?.addEventListener("click", () => {
    if (!confirm("Delete ALL orders? This cannot be undone.")) return;
    localStorage.removeItem(KEYS.orders);
    refreshStats();
    showToast("All orders cleared.");
    if (currentTab === "orders") renderOrdersTable();
  });

  /* Check session */
  if (isAdminLoggedIn()) {
    showDashboard();
    /* Seed products if empty on first load */
    if (!getProducts().length) {
      saveProducts(DEFAULT_PRODUCTS.map(p => ({ ...p, createdAt: new Date().toISOString() })));
    }
  }
});
