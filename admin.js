/* ============================================================
   Room Ready Supply — Admin Dashboard  (Supabase-powered)
   ============================================================ */

/* ── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.sb === "undefined") {
    showLoginError("Supabase not configured. Set your credentials in supabase.js.");
    return;
  }
  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) { showLogin(); return; }

  const { data: profile } = await window.sb.from("profiles").select("role").eq("id", session.user.id).single();
  if (profile?.role !== "admin") {
    showLogin();
    showLoginError("Access denied. Admin privileges required.");
    return;
  }
  document.getElementById("adminNameDisplay").textContent = session.user.email;
  showDashboard();
  switchTab("dashboard");

  /* Wire buttons */
  document.getElementById("openAddProduct")?.addEventListener("click", openAddProduct);
  document.getElementById("saveProduct")?.addEventListener("click", saveProduct);
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
  setupSettings(session.user.id);
});

/* ── Auth ──────────────────────────────────────────────────── */

function showLogin()    { document.getElementById("adminLoginOverlay").style.display = "flex"; document.getElementById("adminDashboard").style.display = "none"; }
function showDashboard(){ document.getElementById("adminLoginOverlay").style.display = "none"; document.getElementById("adminDashboard").style.display = "flex"; }
function showLoginError(msg){ const el = document.getElementById("adminLoginError"); if (el){ el.textContent = msg; el.style.display = msg ? "block" : "none"; } }

document.getElementById("adminLoginForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const email    = document.getElementById("adminEmail")?.value.trim() || "";
  const password = document.getElementById("adminPassword")?.value || "";
  const btn      = e.target.querySelector("button[type=submit]");
  btn.disabled   = true; btn.textContent = "Signing in…";
  showLoginError("");

  const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = "Sign In";
  if (error) { showLoginError(error.message); return; }

  const { data: profile } = await window.sb.from("profiles").select("role").eq("id", data.user.id).single();
  if (profile?.role !== "admin") {
    await window.sb.auth.signOut();
    showLoginError("This account does not have admin access.");
    return;
  }
  document.getElementById("adminNameDisplay").textContent = data.user.email;
  showDashboard();
  switchTab("dashboard");
  setupSettings(data.user.id);
});

document.getElementById("adminLogout")?.addEventListener("click", async () => {
  await window.sb.auth.signOut();
  showLogin();
});

/* ── Tab navigation ────────────────────────────────────────── */

function switchTab(tab) {
  document.querySelectorAll(".a-nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  document.querySelectorAll(".a-tab").forEach(el => {
    el.style.display = el.id === "tab-" + tab ? "block" : "none";
  });
  document.getElementById("adminPageTitle").textContent =
    { dashboard:"Dashboard", products:"Products", inventory:"Inventory",
      orders:"Orders", users:"Users", reports:"Reports & Analytics", settings:"Settings" }[tab] || tab;

  if (tab === "dashboard")  renderDashboardTab();
  if (tab === "products")   renderProductsTable();
  if (tab === "inventory")  renderInventoryTable();
  if (tab === "orders")     renderOrdersTable();
  if (tab === "users")      renderUsersTable();
  if (tab === "reports")    renderReportsTab();
}

document.querySelectorAll(".a-nav-item").forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); switchTab(el.dataset.tab); });
});

/* ── Dashboard ─────────────────────────────────────────────── */

async function renderDashboardTab() {
  const [
    { count: prodCount },
    { count: orderCount },
    { count: userCount },
    { data: lowStockItems },
    { data: recentOrders },
    { data: recentUsers }
  ] = await Promise.all([
    window.sb.from("products").select("*",  { count:"exact", head:true }).eq("is_active", true),
    window.sb.from("orders").select("*",    { count:"exact", head:true }),
    window.sb.from("profiles").select("*",  { count:"exact", head:true }).eq("role","customer"),
    window.sb.from("inventory").select("*, products(name, category_name)").eq("status","out_of_stock"),
    window.sb.from("orders").select("order_number, customer_name, business_name, total, status, created_at").order("created_at",{ascending:false}).limit(5),
    window.sb.from("profiles").select("contact_name, business_name, created_at").eq("role","customer").order("created_at",{ascending:false}).limit(5),
  ]);

  setEl("statProducts",  prodCount  ?? 0);
  setEl("statOrders",    orderCount ?? 0);
  setEl("statUsers",     userCount  ?? 0);
  setEl("statOutOfStock",(lowStockItems || []).length);

  const ro = document.getElementById("recentOrdersBody");
  if (ro) ro.innerHTML = (recentOrders || []).map(o => `
    <tr>
      <td>${escHtml(o.order_number)}</td>
      <td>${escHtml(o.customer_name || "—")}</td>
      <td>${escHtml(o.business_name || "—")}</td>
      <td>${fmt(o.created_at)}</td>
      <td><span class="a-badge ${badgeClass(o.status)}">${o.status}</span></td>
      <td>$${Number(o.total).toFixed(2)}</td>
    </tr>`).join("") || "<tr><td colspan='6' class='a-empty'>No orders yet</td></tr>";

  const ls = document.getElementById("lowStockBody");
  if (ls) ls.innerHTML = (lowStockItems || []).map(i => `
    <tr>
      <td>${escHtml(i.products?.name || "—")}</td>
      <td>${escHtml(i.products?.category_name || "—")}</td>
      <td>${i.stock_qty}</td>
      <td><span class="a-badge a-badge-red">Out of Stock</span></td>
    </tr>`).join("") || "<tr><td colspan='4' class='a-empty'>All products in stock.</td></tr>";
}

/* ── Products ──────────────────────────────────────────────── */

async function renderProductsTable(filter) {
  filter = filter || "";
  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="a-empty" style="padding:30px">Loading…</td></tr>`;

  let q = window.sb.from("products").select("*, inventory(stock_qty, status)").order("name");
  if (filter) q = q.ilike("name", `%${filter}%`);
  const { data: products } = await q;

  tbody.innerHTML = (products || []).map(p => {
    const inv = p.inventory?.[0];
    return `<tr>
      <td><img src="${escHtml(p.image_url || "blanket.png")}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" onerror="this.src='blanket.png'"></td>
      <td>
        <strong>${escHtml(p.name)}</strong>
        ${p.sku ? `<br><small style="color:#aaa">SKU: ${escHtml(p.sku)}</small>` : ""}
      </td>
      <td>${escHtml(p.category_name || "—")}</td>
      <td>
        $${Number(p.price).toFixed(2)}
        ${p.is_on_sale && p.sale_price ? `<br><small style="color:#ED7226">Sale: $${Number(p.sale_price).toFixed(2)}</small>` : ""}
      </td>
      <td>${p.case_qty || 1}</td>
      <td>${inv?.stock_qty ?? 0} — <span class="a-badge ${badgeClass(inv?.status)}">${inv?.status || "?"}</span></td>
      <td><span class="a-badge ${p.is_featured ? "a-badge-orange" : "a-badge-gray"}">${p.is_featured ? "Yes" : "No"}</span></td>
      <td>
        <button class="a-btn-sm" onclick="openEditProduct('${p.id}')">Edit</button>
        <button class="a-btn-sm a-btn-danger" onclick="openDeleteProduct('${p.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="a-empty">No products found.</td></tr>`;
}

document.getElementById("productSearch")?.addEventListener("input", e => renderProductsTable(e.target.value.trim()));

/* ── Product Modal ─────────────────────────────────────────── */

function openAddProduct() {
  document.getElementById("modalTitle").textContent = "Add Product";
  document.getElementById("productForm")?.reset();
  document.getElementById("editProductId").value = "";
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = "blanket.png";
  document.getElementById("productFormError").style.display = "none";
  openModal("productModal");
}

async function openEditProduct(id) {
  const { data: p } = await window.sb.from("products").select("*, inventory(stock_qty, status)").eq("id", id).single();
  if (!p) return;
  document.getElementById("modalTitle").textContent = "Edit Product";
  setVal("editProductId",  p.id);
  setVal("prodName",       p.name           || "");
  setVal("prodSku",        p.sku            || "");
  setVal("prodCategory",   p.category_name  || "");
  setVal("prodDescription",p.description    || "");
  setVal("prodPrice",      p.price          || 0);
  setVal("prodSalePrice",  p.sale_price     || "");
  setVal("prodUnit",       p.unit           || "Case");
  setVal("prodCaseQty",    p.case_qty       || 1);
  setVal("prodPackSize",   p.pack_size      || 1);
  setVal("prodStockQty",   p.inventory?.[0]?.stock_qty ?? 0);
  setVal("prodStock",      p.inventory?.[0]?.status    || "in_stock");
  setVal("prodImage",      p.image_url      || "");
  setChk("prodIsOnSale",   !!p.is_on_sale);
  setChk("prodFeatured",   !!p.is_featured);
  setChk("prodActive",     !!p.is_active);
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = p.image_url || "blanket.png";
  document.getElementById("productFormError").style.display = "none";
  openModal("productModal");
}

document.getElementById("prodImage")?.addEventListener("input", e => {
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = e.target.value || "blanket.png";
});

async function saveProduct() {
  const errEl    = document.getElementById("productFormError");
  const id       = document.getElementById("editProductId").value;
  const isOnSale = document.getElementById("prodIsOnSale")?.checked || false;
  const spRaw    = parseFloat(document.getElementById("prodSalePrice")?.value) || null;
  const name     = (document.getElementById("prodName")?.value || "").trim();

  if (!name) { errEl.textContent = "Product name is required."; errEl.style.display = "block"; return; }
  errEl.style.display = "none";

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const payload = {
    name,
    slug,
    sku           : (document.getElementById("prodSku")?.value || "").trim() || null,
    category_name : (document.getElementById("prodCategory")?.value || "").trim(),
    description   : (document.getElementById("prodDescription")?.value || "").trim(),
    price         : parseFloat(document.getElementById("prodPrice")?.value) || 0,
    sale_price    : isOnSale ? spRaw : null,
    is_on_sale    : isOnSale,
    unit          : document.getElementById("prodUnit")?.value || "Case",
    case_qty      : parseInt(document.getElementById("prodCaseQty")?.value) || 1,
    pack_size     : parseInt(document.getElementById("prodPackSize")?.value) || 1,
    image_url     : (document.getElementById("prodImage")?.value || "").trim() || null,
    is_featured   : document.getElementById("prodFeatured")?.checked || false,
    is_active     : document.getElementById("prodActive")?.checked ?? true,
    updated_at    : new Date().toISOString(),
  };

  const stockQty    = parseInt(document.getElementById("prodStockQty")?.value) || 0;
  const stockStatus = document.getElementById("prodStock")?.value || "in_stock";
  let productId = id;

  if (id) {
    const { error } = await window.sb.from("products").update(payload).eq("id", id);
    if (error) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; return; }
  } else {
    const { data, error } = await window.sb.from("products").insert(payload).select().single();
    if (error) { errEl.textContent = "Error: " + error.message; errEl.style.display = "block"; return; }
    productId = data.id;
  }

  await window.sb.from("inventory").upsert(
    { product_id: productId, stock_qty: stockQty, status: stockStatus, updated_at: new Date().toISOString() },
    { onConflict: "product_id" }
  );

  closeModal("productModal");
  showToast(id ? "Product updated!" : "Product added!");
  renderProductsTable();
}

async function openDeleteProduct(id) {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  const { error } = await window.sb.from("products").delete().eq("id", id);
  if (error) { showToast("Error: " + error.message); return; }
  showToast("Product deleted.");
  renderProductsTable();
}

/* ── Image Upload ───────────────────────────────────────────── */

document.getElementById("prodImageFile")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const ext  = file.name.split(".").pop();
  const path = `products/${Date.now()}.${ext}`;
  showToast("Uploading…");
  const { error } = await window.sb.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) { showToast("Upload failed: " + error.message); return; }
  const { data: { publicUrl } } = window.sb.storage.from("product-images").getPublicUrl(path);
  setVal("prodImage", publicUrl);
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = publicUrl;
  showToast("Image uploaded!");
});

/* ── Inventory ─────────────────────────────────────────────── */

async function renderInventoryTable() {
  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="a-empty">Loading…</td></tr>`;
  const { data: items } = await window.sb.from("inventory")
    .select("*, products(id, name, sku, category_name, price)")
    .order("updated_at", { ascending: false });

  tbody.innerHTML = (items || []).map(i => `
    <tr>
      <td>${escHtml(i.products?.name || "—")}</td>
      <td>${escHtml(i.products?.category_name || "—")}</td>
      <td>$${Number(i.products?.price || 0).toFixed(2)}</td>
      <td><input class="stock-qty-input" type="number" min="0" value="${i.stock_qty}" data-inv-id="${i.id}" style="width:80px;padding:6px;border:1.5px solid #ddd;border-radius:6px"></td>
      <td><span class="a-badge ${badgeClass(i.status)}">${i.status}</span></td>
      <td>
        <select class="a-select stock-status-select" data-inv-id="${i.id}" style="font-size:12px;padding:6px">
          <option value="in_stock"     ${i.status==="in_stock"?"selected":""}>In Stock</option>
          <option value="low_stock"    ${i.status==="low_stock"?"selected":""}>Low Stock</option>
          <option value="out_of_stock" ${i.status==="out_of_stock"?"selected":""}>Out of Stock</option>
        </select>
        <button class="a-btn-sm" onclick="updateInventory('${i.id}')">Save</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="6" class="a-empty">No inventory records.</td></tr>`;
}

async function updateInventory(id) {
  const qty    = parseInt(document.querySelector(`.stock-qty-input[data-inv-id="${id}"]`)?.value) || 0;
  const status = document.querySelector(`.stock-status-select[data-inv-id="${id}"]`)?.value || "in_stock";
  await window.sb.from("inventory").update({ stock_qty: qty, status, updated_at: new Date().toISOString() }).eq("id", id);
  showToast("Inventory updated!");
}

/* ── Orders ────────────────────────────────────────────────── */

async function renderOrdersTable(filter) {
  filter = filter || "";
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="a-empty">Loading…</td></tr>`;
  let q = window.sb.from("orders").select("*, order_items(id)").order("created_at", { ascending: false });
  if (filter) q = q.ilike("order_number", `%${filter}%`);
  const { data: orders } = await q;

  tbody.innerHTML = (orders || []).map(o => `
    <tr>
      <td><strong>${escHtml(o.order_number)}</strong></td>
      <td>${escHtml(o.customer_name || "—")}</td>
      <td>${escHtml(o.business_name || "—")}</td>
      <td>${(o.order_items || []).length}</td>
      <td>$${Number(o.total).toFixed(2)}</td>
      <td>${fmt(o.created_at)}</td>
      <td>
        <select onchange="updateOrderStatus('${o.id}', this.value)" class="a-select" style="font-size:12px">
          ${["pending","confirmed","processing","shipped","delivered","cancelled"].map(s =>
            `<option value="${s}" ${o.status===s?"selected":""}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
          ).join("")}
        </select>
      </td>
      <td><button class="a-btn-sm" onclick="openOrderModal('${o.id}')">View</button></td>
    </tr>`).join("") || `<tr><td colspan="8" class="a-empty">No orders yet.</td></tr>`;
}

document.getElementById("orderSearch")?.addEventListener("input", e => renderOrdersTable(e.target.value.trim()));

async function updateOrderStatus(orderId, status) {
  await window.sb.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  showToast("Order status updated.");
}

async function openOrderModal(id) {
  const { data: o } = await window.sb.from("orders").select("*, order_items(*)").eq("id", id).single();
  if (!o) return;
  const addr = o.shipping_address || {};
  document.getElementById("orderModalBody").innerHTML = `
    <p><strong>Order:</strong> ${escHtml(o.order_number)}</p>
    <p><strong>Customer:</strong> ${escHtml(o.customer_name || "—")}</p>
    <p><strong>Business:</strong> ${escHtml(o.business_name || "—")}</p>
    <p><strong>Email:</strong> ${escHtml(o.customer_email || "—")}</p>
    <p><strong>Phone:</strong> ${escHtml(o.phone || "—")}</p>
    <p><strong>Address:</strong> ${escHtml([addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ") || "—")}</p>
    <p><strong>Type:</strong> ${o.order_type === "reorder" ? "Reorder" : "One-Time"}</p>
    <p><strong>Status:</strong> <span class="a-badge ${badgeClass(o.status)}">${o.status}</span></p>
    <p><strong>Date:</strong> ${fmt(o.created_at)}</p>
    <hr style="margin:16px 0;border:1px solid #eee">
    <h4 style="margin-bottom:12px">Items</h4>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <thead><tr style="background:#f5f7fa">
        <th style="padding:8px 12px;text-align:left">Product</th>
        <th style="padding:8px;text-align:center">Qty</th>
        <th style="padding:8px;text-align:right">Price</th>
        <th style="padding:8px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>
        ${(o.order_items || []).map(i => `<tr style="border-top:1px solid #eee">
          <td style="padding:8px 12px">${escHtml(i.name)}</td>
          <td style="text-align:center">${i.quantity}</td>
          <td style="text-align:right">$${Number(i.price).toFixed(2)}</td>
          <td style="text-align:right">$${Number(i.subtotal).toFixed(2)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <div style="text-align:right;margin-top:12px;font-size:16px;font-weight:700">Total: $${Number(o.total).toFixed(2)}</div>`;
  openModal("orderModal");
}

/* ── Users ─────────────────────────────────────────────────── */

async function renderUsersTable(filter) {
  filter = filter || "";
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading…</td></tr>`;
  let q = window.sb.from("profiles").select("*").eq("role","customer").order("created_at",{ascending:false});
  if (filter) q = q.ilike("business_name", `%${filter}%`);
  const { data: users } = await q;

  tbody.innerHTML = (users || []).map(u => `
    <tr>
      <td>${escHtml(u.contact_name  || "—")}</td>
      <td>${escHtml(u.business_name || "—")}</td>
      <td>${escHtml(u.business_type || "—")}</td>
      <td>${escHtml(u.email         || "—")}</td>
      <td>${escHtml(u.phone         || "—")}</td>
      <td>${fmt(u.created_at)}</td>
      <td><button class="a-btn-sm a-btn-danger" onclick="deleteUser('${u.id}')">Remove</button></td>
    </tr>`).join("") || `<tr><td colspan="7" class="a-empty">No customers yet.</td></tr>`;
}

document.getElementById("userSearch")?.addEventListener("input", e => renderUsersTable(e.target.value.trim()));

async function deleteUser(id) {
  if (!confirm("Remove this user? This cannot be undone.")) return;
  await window.sb.from("profiles").delete().eq("id", id);
  showToast("User removed.");
  renderUsersTable();
}

/* ── Reports ───────────────────────────────────────────────── */

async function renderReportsTab() {
  const panel = document.getElementById("tab-reports");
  if (!panel) return;
  panel.innerHTML = `<div style="text-align:center;padding:40px;color:#888">Loading analytics…</div>`;

  const [
    { data: orders },
    { count: customerCount },
    { count: productCount }
  ] = await Promise.all([
    window.sb.from("orders").select("status, total, created_at"),
    window.sb.from("profiles").select("*", { count:"exact", head:true }).eq("role","customer"),
    window.sb.from("products").select("*", { count:"exact", head:true }).eq("is_active", true),
  ]);

  const allOrders    = orders || [];
  const totalRevenue = allOrders.filter(o => o.status !== "cancelled").reduce((s,o) => s + Number(o.total), 0);
  const byStatus     = {};
  allOrders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
  const byMonth      = {};
  allOrders.filter(o => o.status !== "cancelled").forEach(o => {
    const key = (o.created_at || "").slice(0,7) || "unknown";
    byMonth[key] = (byMonth[key] || 0) + Number(o.total);
  });

  panel.innerHTML = `
    <h2 style="font-size:22px;color:#0b2d52;margin-bottom:24px">Reports &amp; Analytics</h2>
    <div class="a-stats-grid" style="margin-bottom:32px">
      <div class="a-stat-card"><div><p class="a-stat-label">Total Revenue</p><p class="a-stat-value">$${totalRevenue.toFixed(2)}</p></div></div>
      <div class="a-stat-card"><div><p class="a-stat-label">Total Orders</p><p class="a-stat-value">${allOrders.length}</p></div></div>
      <div class="a-stat-card"><div><p class="a-stat-label">Customers</p><p class="a-stat-value">${customerCount ?? 0}</p></div></div>
      <div class="a-stat-card"><div><p class="a-stat-label">Active Products</p><p class="a-stat-value">${productCount ?? 0}</p></div></div>
    </div>
    <div class="a-reports-grid">
      <div class="a-card">
        <div class="a-card-header"><h3>Orders by Status</h3></div>
        <div style="padding:16px">
          ${Object.entries(byStatus).length
            ? Object.entries(byStatus).map(([s, n]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                  <span class="a-badge ${badgeClass(s)}">${s}</span>
                  <strong>${n}</strong>
                </div>`).join("")
            : "<p style='color:#aaa;font-size:13px'>No orders yet.</p>"}
        </div>
      </div>
      <div class="a-card">
        <div class="a-card-header"><h3>Revenue by Month</h3></div>
        <div style="padding:16px">
          ${Object.entries(byMonth).length
            ? Object.entries(byMonth).sort().map(([m, rev]) => `
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
                  <span>${m}</span><strong>$${Number(rev).toFixed(2)}</strong>
                </div>`).join("")
            : "<p style='color:#aaa;font-size:13px'>No revenue data yet.</p>"}
        </div>
      </div>
    </div>`;
}

/* ── Settings ──────────────────────────────────────────────── */

function setupSettings(userId) {
  document.getElementById("changePasswordForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const newPw  = document.getElementById("newPass")?.value || "";
    const confPw = document.getElementById("confirmPass")?.value || "";
    const msgEl  = document.getElementById("passwordChangeMsg");
    const errEl  = document.getElementById("passwordChangeErr");
    if (msgEl) msgEl.style.display = "none";
    if (errEl) errEl.style.display = "none";
    if (newPw.length < 8) { if (errEl){ errEl.textContent = "Password must be at least 8 characters."; errEl.style.display = "block"; } return; }
    if (newPw !== confPw) { if (errEl){ errEl.textContent = "Passwords do not match."; errEl.style.display = "block"; } return; }
    const { error } = await window.sb.auth.updateUser({ password: newPw });
    if (error) { if (errEl){ errEl.textContent = error.message; errEl.style.display = "block"; } return; }
    if (msgEl){ msgEl.textContent = "Password updated successfully!"; msgEl.style.display = "block"; }
    e.target.reset();
  });

  document.getElementById("siteInfoForm")?.addEventListener("submit", e => {
    e.preventDefault();
    showToast("Site info saved.");
  });
}

/* ── Modal helpers ─────────────────────────────────────────── */

function openModal(id)  { const el = document.getElementById(id); if (el) el.style.display = "flex"; }
function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

document.querySelectorAll(".a-modal-close, .a-modal-cancel, [id^=cancel][id$=Modal], [id^=close][id$=Modal]").forEach(btn => {
  btn.addEventListener("click", () => {
    const overlay = btn.closest(".a-modal-overlay");
    if (overlay) overlay.style.display = "none";
  });
});

/* ── Toast ─────────────────────────────────────────────────── */

function showToast(msg) {
  let toast = document.getElementById("adminToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "adminToast";
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0b2d52;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;display:none";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = "block";
  clearTimeout(window._adminToast);
  window._adminToast = setTimeout(() => { toast.style.display = "none"; }, 3000);
}

/* ── Util ──────────────────────────────────────────────────── */

function escHtml(str)   { return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmt(iso)       { if (!iso) return "—"; return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setVal(id, v)  { const el = document.getElementById(id); if (el) el.value = v; }
function setChk(id, v)  { const el = document.getElementById(id); if (el) el.checked = v; }

function badgeClass(status) {
  const m = {
    pending:"a-badge-yellow", confirmed:"a-badge-blue", processing:"a-badge-blue",
    shipped:"a-badge-green",  delivered:"a-badge-green", cancelled:"a-badge-red",
    in_stock:"a-badge-green", low_stock:"a-badge-yellow", out_of_stock:"a-badge-red",
  };
  return m[status] || "a-badge-gray";
}
