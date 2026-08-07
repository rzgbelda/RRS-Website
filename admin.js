/* ============================================================
   Room Ready Supply — Admin Dashboard  (Supabase-powered)
   ============================================================ */

/* ── Bootstrap ─────────────────────────────────────────────── */
window._adminRole = "admin"; // default; overwritten below

async function loadWarpModeBadge() {
  try {
    // Removed — Warp replaced by Estes Express
    return;
    const res = await fetch("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mode" }),
    });
    const { mode } = await res.json();
    const badge = document.getElementById("warpModeBadge");
    if (!badge) return;
    if (mode === "live") {
      badge.style.cssText += "display:flex;background:#dcfce7;color:#15803d;border:1.5px solid #86efac;";
      badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block;"></span> Warp LIVE`;
    } else {
      badge.style.cssText += "display:flex;background:#fef9ec;color:#b45309;border:1.5px solid #fde68a;";
      badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;display:inline-block;"></span> Warp TEST`;
    }
  } catch (e) { console.warn("[Warp] Mode check failed:", e.message); }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.sb === "undefined") {
    showLoginError("Supabase not configured. Set your credentials in supabase.js.");
    return;
  }
  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) { showLogin(); return; }

  const { data: profile } = await window.sb.from("profiles").select("role").eq("id", session.user.id).single();
  const role = profile?.role;

  // Allow "admin" full access and "sub_distributor" limited access
  if (role !== "admin" && role !== "sub_distributor") {
    showLogin();
    showLoginError("Access denied. Admin privileges required.");
    return;
  }

  window._adminRole = role;
  document.getElementById("adminNameDisplay").textContent = session.user.email;
  applyRoleRestrictions(role);
  showDashboard();
  switchTab("dashboard");
  loadWarpModeBadge();
  updateNotifBadgeFromStorage();

  /* Wire buttons */
  document.getElementById("openCsvImport")?.addEventListener("click", openCsvImport);
  document.getElementById("openAddProduct")?.addEventListener("click", openAddProduct);
  document.getElementById("saveProduct")?.addEventListener("click", saveProduct);
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
  if (role === "admin") setupSettings(session.user.id);

  // Wire sub-distributor modal buttons via addEventListener (avoids inline onclick issues)
  bindSdButtons();
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
  const role = profile?.role;
  if (role !== "admin" && role !== "sub_distributor") {
    await window.sb.auth.signOut();
    showLoginError("This account does not have admin access.");
    return;
  }
  window._adminRole = role;
  document.getElementById("adminNameDisplay").textContent = data.user.email;
  applyRoleRestrictions(role);
  showDashboard();
  switchTab("dashboard");
  if (role === "admin") setupSettings(data.user.id);
  bindSdButtons();
});

document.getElementById("adminLogout")?.addEventListener("click", async () => {
  await window.sb.auth.signOut();
  showLogin();
});

/* ── Role-based access control ─────────────────────────────── */

const ADMIN_ONLY_TABS = ["products","inventory","orders","users","manage-hero","manage-about","settings","seo"];

function resetRoleRestrictions() {
  // Restore all hidden nav items (needed when switching accounts without full page reload)
  document.querySelectorAll(".admin-only-nav").forEach(el => { el.style.display = ""; });
  var badge = document.querySelector(".sd-partner-badge");
  if (badge) badge.remove();
}

function applyRoleRestrictions(role) {
  resetRoleRestrictions(); // always reset first
  if (role === "admin") return; // full access — nothing to hide
  if (document.querySelector(".sd-partner-badge")) return; // already applied

  // Hide admin-only nav items and sections
  document.querySelectorAll(".admin-only-nav").forEach(el => {
    el.style.display = "none";
  });

  // Add a role badge below the logo
  const logoEl = document.querySelector(".a-sidebar-logo");
  if (logoEl) {
    const badge = document.createElement("div");
    badge.className = "sd-partner-badge";
    badge.style.cssText = "text-align:center;padding:8px 16px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(245,130,32,.85);";
    badge.textContent = "Partner Portal";
    logoEl.parentNode.insertBefore(badge, logoEl.nextSibling);
  }
}

function isTabAllowed(tab) {
  if (window._adminRole === "admin") return true;
  return !ADMIN_ONLY_TABS.includes(tab);
}

function showAccessDeniedOverlay() {
  var existing = document.getElementById("accessDeniedOverlay");
  if (existing) { existing.style.display = "flex"; return; }
  var div = document.createElement("div");
  div.id = "accessDeniedOverlay";
  div.style.cssText = "position:fixed;inset:0;background:rgba(10,22,40,.65);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:8000;";
  div.innerHTML = '<div style="background:#fff;border-radius:20px;padding:48px 40px;max-width:380px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.25);">' +
    '<div style="width:56px;height:56px;border-radius:14px;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
    '<h3 style="font-size:18px;font-weight:800;color:#0d1f38;margin:0 0 8px;letter-spacing:-.3px;">Access Restricted</h3>' +
    '<p style="font-size:13px;color:#8a9bb5;margin:0 0 24px;line-height:1.6;">This section is only available to administrators. Your partner account has access to Dashboard, Sub-Distributors, and Reports.</p>' +
    '<button onclick="document.getElementById(\'accessDeniedOverlay\').style.display=\'none\'" style="background:linear-gradient(135deg,#f58220,#e0711a);color:#fff;border:none;border-radius:10px;padding:12px 28px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Got it</button>' +
    '</div>';
  document.body.appendChild(div);
}

function bindSdButtons() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn || !btn.id) return;
    switch(btn.id) {
      case 'btnOpenSdModal':   openSdModal();        break;
      case 'btnOpenEmpModal':  openEmpModal();       break;
      case 'btnCloseSdModal':  closeSdModal();       break;
      case 'btnCloseSdX':      closeSdModal();       break;
      case 'btnSaveSd':        saveSdDistributor();  break;
      case 'btnCloseEmpModal': closeEmpModal();      break;
      case 'btnCloseEmpX':     closeEmpModal();      break;
      case 'btnSaveEmp':       saveEmployee();       break;
      case 'btnGenSdCode':     generateSdCode();     break;
      case 'btnSdCreateLogin': createSdLogin();      break;
      case 'btnGenEmpCode':    generateEmpCode();    break;
    }
  });
}

/* ── Tab navigation ────────────────────────────────────────── */

function switchTab(tab) {
  // Block restricted tabs for non-admins
  if (!isTabAllowed(tab)) {
    showAccessDeniedOverlay();
    return;
  }
  document.querySelectorAll(".a-nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  document.querySelectorAll(".a-tab").forEach(el => {
    el.style.display = el.id === "tab-" + tab ? "block" : "none";
  });
  document.getElementById("adminPageTitle").textContent =
    { dashboard:"Dashboard", products:"Products", inventory:"Inventory",
      orders:"Orders", users:"Users", reports:"Reports & Analytics", settings:"Settings",
      seo:"SEO Health", "manage-hero":"Hero Section", "manage-about":"About Section",
      "quote-requests":"Quote Requests" }[tab] || tab;

  if (tab === "dashboard")        renderDashboardTab();
  if (tab === "products")         renderProductsTable();
  if (tab === "inventory")        renderInventoryTable();
  if (tab === "orders")           renderOrdersTable();
  if (tab === "users")            renderUsersTable();
  if (tab === "reports")          renderReportsTab();
  if (tab === "seo")              renderSeoTab();
  if (tab === "manage-hero")      loadHeroSection();
  if (tab === "manage-about")     loadAboutSection();
  if (tab === "sub-distributors") renderSubDistributorsTab();
  if (tab === "quote-requests")   renderQuoteRequestsTable();
}

document.querySelectorAll(".a-nav-item").forEach(el => {
  el.addEventListener("click", e => { e.preventDefault(); switchTab(el.dataset.tab); });
});

/* ── Dashboard ─────────────────────────────────────────────── */

async function renderDashboardTab() {
  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const g = document.getElementById("dashGreeting");
  if (g) g.textContent = greet + " 👋";

  const [
    { count: prodCount },
    { count: orderCount },
    { count: pendingCount },
    { count: userCount },
    { data: lowStockItems },
    { data: recentOrders },
    { data: allOrderTotals },
  ] = await Promise.all([
    window.sb.from("products").select("*",        { count:"exact", head:true }).eq("is_active", true),
    window.sb.from("orders").select("*",          { count:"exact", head:true }),
    window.sb.from("orders").select("*",          { count:"exact", head:true }).eq("status", "pending"),
    window.sb.from("profiles").select("*",        { count:"exact", head:true }).eq("role","customer"),
    window.sb.from("inventory").select("*, products(name, category_name)").in("status",["out_of_stock","low_stock"]),
    window.sb.from("orders").select("order_number, customer_name, business_name, total, status, created_at").order("created_at",{ascending:false}).limit(6),
    window.sb.from("orders").select("total, status").neq("status", "cancelled"),
  ]);

  const revenue = (allOrderTotals || []).reduce((sum, o) => sum + Number(o.total || 0), 0);

  setEl("statRevenue",    "$" + revenue.toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2}));
  setEl("statProducts",   prodCount  ?? 0);
  setEl("statOrders",     orderCount ?? 0);
  setEl("statUsers",      userCount  ?? 0);
  setEl("statOutOfStock", (lowStockItems || []).filter(i => i.status === "out_of_stock").length);

  const pendEl = document.getElementById("statPending");
  if (pendEl) {
    pendEl.textContent = pendingCount ? pendingCount + " pending" : "";
    pendEl.style.color = pendingCount ? "#f59e0b" : "";
  }

  const ro = document.getElementById("recentOrdersBody");
  if (ro) ro.innerHTML = (recentOrders || []).map(o => {
    const totalDollars = o.total ? '$' + Number(o.total).toFixed(2) : '—';
    return `
    <tr>
      <td><strong>${escHtml(o.order_number || "—")}</strong></td>
      <td>${escHtml(o.customer_name || o.business_name || "—")}</td>
      <td>${fmt(o.created_at)}</td>
      <td><strong>${totalDollars}</strong></td>
      <td><span class="a-badge ${badgeClass(o.status)}">${o.status}</span></td>
    </tr>`;
  }).join("") || "<tr><td colspan='5' class='a-empty'>No orders yet.</td></tr>";

  const ls = document.getElementById("lowStockBody");
  if (ls) ls.innerHTML = (lowStockItems || []).map(i => `
    <tr>
      <td>${escHtml(i.products?.name || "—")}</td>
      <td>${escHtml(i.products?.category_name || "—")}</td>
      <td>${i.stock_qty}</td>
      <td><span class="a-badge ${i.status === "out_of_stock" ? "a-badge-red" : "a-badge-yellow"}">${i.status === "out_of_stock" ? "Out of Stock" : "Low Stock"}</span></td>
    </tr>`).join("") || "<tr><td colspan='4' class='a-empty'>All products in stock.</td></tr>";

  // Load trend chart defaulting to daily
  loadTrendChart("daily");
}

/* ── Trend Chart ────────────────────────────────────────────── */
let _trendChartInstance = null;

async function loadTrendChart(mode, btnEl) {
  // Update active tab button
  document.querySelectorAll(".dash-chart-tab").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  const now = new Date();
  let labels = [], revenueData = [], ordersData = [];

  // Fetch all orders with created_at, total, and status
  const { data: orders } = await window.sb.from("orders").select("created_at, total, status");
  const rows = orders || [];
  let cancelledData = [];

  if (mode === "daily") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString("en-US", { month:"short", day:"numeric" }));
      const dayRows = rows.filter(o => o.created_at?.slice(0, 10) === key);
      const active  = dayRows.filter(o => o.status !== "cancelled");
      ordersData.push(active.length);
      revenueData.push(active.reduce((s, o) => s + Number(o.total || 0), 0));
      cancelledData.push(dayRows.filter(o => o.status === "cancelled").length);
    }
  } else if (mode === "weekly") {
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(now); wStart.setDate(wStart.getDate() - i * 7 - wStart.getDay());
      const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
      labels.push("Wk " + wStart.toLocaleDateString("en-US", { month:"short", day:"numeric" }));
      const wRows  = rows.filter(o => { const d = new Date(o.created_at); return d >= wStart && d <= wEnd; });
      const active = wRows.filter(o => o.status !== "cancelled");
      ordersData.push(active.length);
      revenueData.push(active.reduce((s, o) => s + Number(o.total || 0), 0));
      cancelledData.push(wRows.filter(o => o.status === "cancelled").length);
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      labels.push(d.toLocaleDateString("en-US", { month:"short", year:"2-digit" }));
      const mRows  = rows.filter(o => o.created_at?.slice(0, 7) === key);
      const active = mRows.filter(o => o.status !== "cancelled");
      ordersData.push(active.length);
      revenueData.push(active.reduce((s, o) => s + Number(o.total || 0), 0));
      cancelledData.push(mRows.filter(o => o.status === "cancelled").length);
    }
  }

  if (_trendChartInstance) _trendChartInstance.destroy();

  _trendChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue ($)",
          data: revenueData,
          borderColor: "#ED7226",
          backgroundColor: "rgba(237,114,38,0.08)",
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: "#ED7226",
          tension: 0.4,
          fill: true,
          yAxisID: "yRevenue",
        },
        {
          label: "Orders",
          data: ordersData,
          borderColor: "#1565c0",
          backgroundColor: "rgba(21,101,192,0.06)",
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: "#1565c0",
          tension: 0.4,
          fill: true,
          yAxisID: "yOrders",
        },
        {
          label: "Cancelled",
          data: cancelledData,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.07)",
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 4,
          pointBackgroundColor: "#ef4444",
          tension: 0.4,
          fill: true,
          yAxisID: "yOrders",
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { font: { size: 12 }, usePointStyle: true, padding: 20 } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.yAxisID === "yRevenue"
              ? " Revenue: $" + Number(ctx.parsed.y).toFixed(2)
              : ctx.dataset.label === "Cancelled"
                ? " Cancelled: " + ctx.parsed.y
                : " Orders: " + ctx.parsed.y
          }
        }
      },
      scales: {
        x: { grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 11 }, color: "#8899aa" } },
        yRevenue: {
          position: "left",
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: { font: { size: 11 }, color: "#ED7226", callback: v => "$" + v },
        },
        yOrders: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, color: "#64748b", stepSize: 1 },
        }
      }
    }
  });
}

/* ── Products ──────────────────────────────────────────────── */

async function renderProductsTable(filter) {
  filter = filter || "";
  const tbody = document.getElementById("productsTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="a-empty" style="padding:30px">Loading…</td></tr>`;

  // Deactivated products are hidden unless explicitly asked for. The admin
  // policy lets staff read inactive rows, so this list was also showing 91
  // dead rows from an old seed -- they read as duplicates of real products
  // at stale prices, which is exactly how they were reported.
  const showHidden = document.getElementById("showHiddenProducts")?.checked;
  let q = window.sb.from("products").select("*, inventory(stock_qty, status)").order("name");
  if (!showHidden) q = q.eq("is_active", true);
  if (filter) q = q.ilike("name", `%${filter}%`);
  const { data: products } = await q;

  tbody.innerHTML = (products || []).map(p => {
    const inv = p.inventory?.[0];
    return `<tr data-id="${p.id}"${p.is_active ? "" : ' style="opacity:.55;background:#fafafa"'}>
      <td style="text-align:center">
        <input type="checkbox" class="product-cb" data-id="${p.id}"
          style="width:16px;height:16px;cursor:pointer;accent-color:#ED7226"
          onchange="updateBulkBar()">
      </td>
      <td><img src="${escHtml(p.image_url || "assets/img/product-placeholder.svg")}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" onerror="this.src='assets/img/product-placeholder.svg'"></td>
      <td>
        <strong>${escHtml(p.name)}</strong>
        ${p.is_active ? "" : `<span class="a-badge a-badge-gray" style="margin-left:7px" title="Not visible to customers">Hidden</span>`}
        ${p.sku ? `<br><small style="color:#aaa">SKU: ${escHtml(p.sku)}</small>` : ""}
      </td>
      <td>${escHtml(p.category_name || "—")}</td>
      <td>
        $${Number(p.price).toFixed(2)}
        ${p.is_on_sale && p.sale_price ? `<br><small style="color:#ED7226">Sale: $${Number(p.sale_price).toFixed(2)}</small>` : ""}
        ${p.cost_per_case ? `<br><small style="color:#64748b">Cost: $${Number(p.cost_per_case).toFixed(2)}</small>` : ""}
        ${p.cost_per_case && p.price ? `<br><small style="color:#16a34a">Margin: ${(((p.price - p.cost_per_case) / p.price) * 100).toFixed(1)}%</small>` : ""}
      </td>
      <td>${p.case_qty || 1}</td>
      <td>${inv
        ? `${inv.stock_qty ?? 0} — <span class="a-badge ${badgeClass(inv.status)}">${inv.status}</span>`
        : `<span class="a-badge a-badge-gray" title="No inventory record exists for this product yet">Not tracked</span>`
      }</td>
      <td><span class="a-badge ${p.is_featured ? "a-badge-orange" : "a-badge-gray"}">${p.is_featured ? "Yes" : "No"}</span></td>
      <td>
        <button class="a-btn-sm" onclick="openEditProduct('${p.id}')">Edit</button>
        <button class="a-btn-sm a-btn-danger" onclick="openDeleteProduct('${p.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="a-empty">No products found.</td></tr>`;

  // Wire up Select All checkbox
  const selectAll = document.getElementById("selectAllProducts");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.onchange = () => {
      document.querySelectorAll(".product-cb").forEach(cb => cb.checked = selectAll.checked);
      updateBulkBar();
    };
  }
}

function updateBulkBar() {
  const checked = document.querySelectorAll(".product-cb:checked");
  const bar   = document.getElementById("bulkBar");
  const count = document.getElementById("bulkCount");
  const selectAll = document.getElementById("selectAllProducts");
  const total = document.querySelectorAll(".product-cb").length;
  if (bar)   bar.style.display = checked.length > 0 ? "flex" : "none";
  if (count) count.textContent  = `${checked.length} selected`;
  if (selectAll) selectAll.indeterminate = checked.length > 0 && checked.length < total;
  if (selectAll && checked.length === total && total > 0) selectAll.checked = true;
  if (selectAll && checked.length === 0) selectAll.checked = false;
}

function clearSelection() {
  document.querySelectorAll(".product-cb").forEach(cb => cb.checked = false);
  const selectAll = document.getElementById("selectAllProducts");
  if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
  updateBulkBar();
}

async function bulkDelete() {
  const ids = [...document.querySelectorAll(".product-cb:checked")].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} product${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;

  // Delete inventory first (FK constraint), then products
  await window.sb.from("inventory").delete().in("product_id", ids);
  const { error } = await window.sb.from("products").delete().in("id", ids);

  if (error) { alert("Error deleting: " + error.message); return; }
  clearSelection();
  renderProductsTable(document.getElementById("productSearch")?.value.trim() || "");
}

document.getElementById("productSearch")?.addEventListener("input", e => renderProductsTable(e.target.value.trim()));

/* ── Product Modal ─────────────────────────────────────────── */

function openAddProduct() {
  document.getElementById("modalTitle").textContent = "Add Product";
  document.getElementById("productForm")?.reset();
  document.getElementById("editProductId").value = "";
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = "assets/img/product-placeholder.svg";
  document.getElementById("productFormError").style.display = "none";
  // form.reset() does not touch the hidden base-price field or the readonly
  // tier fields, so clear them explicitly before the panel is shown.
  ["prodPrice", "prodPrice1", "prodPrice2", "prodPrice3"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  recalcTierPricing();
  openModal("productModal");
}

/**
 * Category markup rates, from the company pricing sheet.
 * [1-5 cases, 6-29 cases, 30+ cases] as a fraction added to cost.
 *
 * Verified against every supplier-priced product in the catalog:
 * selling price = cost x (1 + markup) reproduced all 117 exactly.
 * Keys must match the Category options in admin.html.
 */
const CATEGORY_MARKUPS = {
  "Paper Products":                [0.35, 0.28, 0.22],
  "Towels":                        [0.45, 0.35, 0.28],
  "Bed Sheets & Linens":           [0.45, 0.35, 0.28],
  "Pillows & Mattress Protectors": [0.55, 0.45, 0.35],
  "Furniture":                     [0.40, 0.30, 0.25],
  "Trash Liners & Can Liners":     [0.45, 0.35, 0.28],
  "Cleaning Chemicals":            [0.40, 0.32, 0.25],
  "Housekeeping Supplies":         [0.55, 0.45, 0.35],
  "Guest Amenities":               [0.70, 0.55, 0.40],
  "Gloves & PPE":                  [0.35, 0.28, 0.22],
};

/**
 * Recalculate all three tier prices from cost x category markup.
 *
 * Cost is the only price anyone types. Tiers are always derived, so a
 * supplier cost increase cannot leave a stale tier behind -- which is
 * exactly how eight glove SKUs ended up selling below cost.
 */
function recalcTierPricing() {
  const cat  = document.getElementById("prodCategory")?.value || "";
  const cost = parseFloat(document.getElementById("prodCostPerCase")?.value);
  const note = document.getElementById("tierMarkupNote");
  const f1 = document.getElementById("prodPrice1");
  const f2 = document.getElementById("prodPrice2");
  const f3 = document.getElementById("prodPrice3");
  const base = document.getElementById("prodPrice");
  if (!f1 || !f2 || !f3) return;

  const m = CATEGORY_MARKUPS[cat];

  // No markup for this category (blank, or a product still on one of the
  // old category names). Leave whatever prices are stored alone rather than
  // blanking them -- clearing here would destroy a legacy product's pricing
  // just by opening its edit form.
  if (!m) {
    if (note) {
      note.textContent = cat
        ? `No markup defined for "${cat}" — choose a category to calculate`
        : "Select a category to calculate pricing";
      note.style.color = "#b45309";
    }
    return;
  }
  if (!(cost > 0)) {
    if (note) {
      note.textContent = `${cat} — ${m.map(x => Math.round(x * 100) + "%").join(" / ")} markup · enter cost`;
      note.style.color = "#94a3b8";
    }
    return;
  }

  const p = m.map(rate => (cost * (1 + rate)).toFixed(2));
  f1.value = p[0];
  f2.value = p[1];
  f3.value = p[2];
  if (base) base.value = p[0];   // base price always tracks the 1-5 tier

  if (note) {
    note.textContent = `${cat} — ${m.map(x => Math.round(x * 100) + "%").join(" / ")} markup on $${cost.toFixed(2)} cost`;
    note.style.color = "#15803d";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ["prodCategory", "prodCostPerCase"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("input", recalcTierPricing); el.addEventListener("change", recalcTierPricing); }
  });
});

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
  setVal("prodPrice1",     p.price_tier1    || "");
  setVal("prodPrice2",     p.price_tier2    || "");
  setVal("prodPrice3",     p.price_tier3    || "");
  setVal("prodSalePrice",  p.sale_price     || "");
  setVal("prodUnit",       p.unit           || "Case");
  setVal("prodCaseQty",    p.case_qty       || 1);
  setVal("prodPackSize",   p.pack_size      || 1);
  setVal("prodStockQty",   p.inventory?.[0]?.stock_qty ?? 0);
  setVal("prodStock",      p.inventory?.[0]?.status    || "in_stock");
  setVal("prodImage",      p.image_url      || "");
  setVal("prodCostPerCase",  p.cost_per_case   || "");
  setVal("prodLandedCost",   p.landed_cost     || "");
  setVal("prodTruckloadQty", p.truckload_qty   || "");
  setChk("prodIsOnSale",   !!p.is_on_sale);
  setChk("prodFeatured",   !!p.is_featured);
  setChk("prodActive",     !!p.is_active);
  // Recompute from the stored cost. If the tiers on file are stale (a
  // supplier cost went up but prices were never redone) the corrected
  // figures appear immediately, which is the whole point of deriving them.
  recalcTierPricing();
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = p.image_url || "assets/img/product-placeholder.svg";
  document.getElementById("productFormError").style.display = "none";
  openModal("productModal");
}

document.getElementById("prodImage")?.addEventListener("input", e => {
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = e.target.value || "assets/img/product-placeholder.svg";
});

async function saveProduct() {
  const errEl    = document.getElementById("productFormError");
  const id       = document.getElementById("editProductId").value;
  const isOnSale = document.getElementById("prodIsOnSale")?.checked || false;
  const spRaw    = parseFloat(document.getElementById("prodSalePrice")?.value) || null;
  const name     = (document.getElementById("prodName")?.value || "").trim();

  if (!name) { errEl.textContent = "Product name is required."; errEl.style.display = "block"; return; }

  // Tier prices are derived, so an empty 1-5 tier means the category or cost
  // is missing. Saving anyway would publish a $0.00 product.
  if (!(parseFloat(document.getElementById("prodPrice1")?.value) > 0)) {
    errEl.textContent = "Pick a category and enter Cost Per Case — tier prices are calculated from them.";
    errEl.style.display = "block";
    return;
  }
  errEl.style.display = "none";

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const payload = {
    name,
    slug,
    sku           : (document.getElementById("prodSku")?.value || "").trim() || null,
    category_name : (document.getElementById("prodCategory")?.value || "").trim(),
    description   : (document.getElementById("prodDescription")?.value || "").trim(),
    price         : parseFloat(document.getElementById("prodPrice")?.value) || 0,
    price_tier1   : parseFloat(document.getElementById("prodPrice1")?.value) || null,
    price_tier2   : parseFloat(document.getElementById("prodPrice2")?.value) || null,
    price_tier3   : parseFloat(document.getElementById("prodPrice3")?.value) || null,
    sale_price    : isOnSale ? spRaw : null,
    is_on_sale    : isOnSale,
    unit          : document.getElementById("prodUnit")?.value || "Case",
    case_qty      : parseInt(document.getElementById("prodCaseQty")?.value) || 1,
    pack_size     : parseInt(document.getElementById("prodPackSize")?.value) || 1,
    image_url     : (document.getElementById("prodImage")?.value || "").trim() || null,
    cost_per_case : parseFloat(document.getElementById("prodCostPerCase")?.value) || null,
    landed_cost   : parseFloat(document.getElementById("prodLandedCost")?.value)  || null,
    truckload_qty : parseInt(document.getElementById("prodTruckloadQty")?.value)   || null,
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

/* ── CSV Bulk Import ─────────────────────────────────────────── */

let _csvRows    = [];
let _csvRunning = false;

/* ============================================================
   CONVERTER  (xlsx / csv → mapped → download RRS CSV)
============================================================ */
const CVT_COLS = [
  { key:"name",          label:"Name",         required:true },
  { key:"sku",           label:"SKU" },
  { key:"description",   label:"Description" },
  { key:"price",         label:"Price",        required:true },
  { key:"sale_price",    label:"Sale Price" },
  { key:"is_on_sale",    label:"Is On Sale" },
  { key:"category_name", label:"Category",     required:true },
  { key:"case_qty",      label:"Case Qty" },
  { key:"pack_size",     label:"Pack Size" },
  { key:"unit",          label:"Unit" },
  { key:"is_featured",   label:"Is Featured" },
  { key:"is_active",     label:"Is Active" },
  { key:"image_url",     label:"Image URL" },
  { key:"stock_qty",     label:"Stock Qty" },
  { key:"stock_status",  label:"Stock Status" },
];

let _cvtSourceCols = [];
let _cvtSourceRows = [];
let _cvtMapping    = {};

function showCvtPanel() {
  const csvSection = document.getElementById("csvSection");
  const cvtPanel   = document.getElementById("cvtPanel");
  if (!cvtPanel) return;
  /* hide all child sections of csvSection except cvtPanel */
  Array.from(csvSection.children).forEach(el => {
    if (el.id !== "cvtPanel") el.style.display = "none";
  });
  cvtPanel.style.display = "";
  showCvtStep(1);

  const inp  = document.getElementById("cvtFileInput");
  const zone = document.getElementById("cvtDropZone");
  if (inp)  inp.onchange = e => { if (e.target.files[0]) cvtHandleFile(e.target.files[0]); };
  if (zone) {
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add("dragover"); };
    zone.ondragleave = ()  => zone.classList.remove("dragover");
    zone.ondrop      = e  => { e.preventDefault(); zone.classList.remove("dragover"); const f = e.dataTransfer.files[0]; if (f) cvtHandleFile(f); };
  }
}

function hideCvtPanel() {
  const csvSection = document.getElementById("csvSection");
  const cvtPanel   = document.getElementById("cvtPanel");
  if (!cvtPanel) return;
  cvtPanel.style.display = "none";
  /* restore csvSection children */
  const header = csvSection.querySelector(".csv-page-header");
  const step1  = document.getElementById("csvStep1");
  if (header) header.style.display = "";
  if (step1)  step1.style.display  = "";
  showCsvStep(1);
}

function showCvtStep(n) {
  [1,2,3].forEach(i => {
    const el  = document.getElementById("cvtStep" + i);
    const dot = document.getElementById("cvtDot"  + i);
    if (el)  el.style.display = (i === n) ? "" : "none";
    if (dot) dot.className = "csv-step-dot" + (i <= n ? " active" : "") + (i === n ? " current" : "");
  });
}

function cvtHandleFile(file) {
  const name = file.name.toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls");
  const isCsv  = name.endsWith(".csv");
  if (!isXlsx && !isCsv) { showToast("Please select a .xlsx, .xls, or .csv file."); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      let rows;
      if (isXlsx) {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type:"array" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" });
      } else {
        /* CSV — re-use existing parseCsv but without requiring "name" col */
        const text = e.target.result;
        const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
        const headers = csvSplitLine(lines[0]).map(h => h.trim());
        rows = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim(); if (!line) continue;
          const vals = csvSplitLine(line);
          const obj  = {};
          headers.forEach((h, j) => { obj[h] = (vals[j] ?? "").trim(); });
          rows.push(obj);
        }
      }
      if (!rows.length) { showToast("No data rows found."); return; }
      _cvtSourceCols = Object.keys(rows[0]);
      _cvtSourceRows = rows;
      _cvtMapping    = cvtAutoMap(_cvtSourceCols);
      document.getElementById("cvtFileName").textContent      = file.name;
      document.getElementById("cvtRowCountLabel").textContent = rows.length.toLocaleString();
      cvtRenderMappingGrid();
      showCvtStep(2);
    } catch(err) { showToast("Parse error: " + err.message); }
  };
  isXlsx ? reader.readAsArrayBuffer(file) : reader.readAsText(file);
}

function cvtAutoMap(cols) {
  const mapping = {};
  const norm = s => s.toLowerCase().replace(/[\s_\-\/]+/g,"");
  const aliases = {
    name:          ["name","productname","title","item","itemname"],
    sku:           ["sku","skucode","itemcode","code","partnumber","id","productid"],
    description:   ["description","desc","details","info","notes"],
    price:         ["price","cost","caseprice","unitprice","msrp","listprice"],
    sale_price:    ["saleprice","discountprice","specialprice","promoprice"],
    is_on_sale:    ["isonsale","onsale","sale","discount","promo"],
    category_name: ["category","categoryname","dept","department","type","producttype","productcategory"],
    case_qty:      ["caseqty","casecount","quantitypercase","casesize","qtypercase"],
    pack_size:     ["packsize","pack","packs","packcount","packqty"],
    unit:          ["unit","uom","unitofmeasure","unittype"],
    is_featured:   ["isfeatured","featured","highlight","top","bestseller"],
    is_active:     ["isactive","active","status","enabled","available"],
    image_url:     ["imageurl","image","img","photo","picture","url","photourl"],
    stock_qty:     ["stockqty","stock","quantity","qty","inventory","onhand","stockcount"],
    stock_status:  ["stockstatus","availability","instock","availabilitystatus"],
  };
  for (const col of cols) {
    const n = norm(col);
    for (const [tk, al] of Object.entries(aliases)) {
      if (al.some(a => n === a || n.includes(a)) && !mapping[tk]) { mapping[tk] = col; break; }
    }
  }
  return mapping;
}

function cvtRenderMappingGrid() {
  const grid = document.getElementById("cvtMappingGrid");
  if (!grid) return;
  grid.innerHTML = CVT_COLS.map(col => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb">
      <div style="flex:1;min-width:0">
        <span style="font-size:13px;font-weight:600;color:#0f2b50">${col.label}${col.required ? ' <span style="color:#f26f21">*</span>' : ''}</span>
        <div style="font-size:11px;color:#aaa;font-family:monospace">${col.key}</div>
      </div>
      <select onchange="cvtUpdateMapping('${col.key}',this.value)" style="font-size:13px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;background:white;min-width:150px;color:${_cvtMapping[col.key]?'#0f2b50':'#aaa'}">
        <option value="">— skip —</option>
        ${_cvtSourceCols.map(c => `<option value="${escHtml(c)}" ${_cvtMapping[col.key]===c?"selected":""}>${escHtml(c)}</option>`).join("")}
      </select>
    </div>
  `).join("");
  cvtUpdateMappedCount();
}

function cvtUpdateMapping(key, val) {
  _cvtMapping[key] = val;
  cvtUpdateMappedCount();
}

function cvtUpdateMappedCount() {
  const count = CVT_COLS.filter(c => _cvtMapping[c.key]).length;
  const el = document.getElementById("cvtMappedCount");
  if (el) el.textContent = count;
}

function cvtBuildAndDownload() {
  const BOM = "﻿";
  const headers = CVT_COLS.map(c => c.key);
  const lines = [headers.map(h => `"${h}"`).join(",")];
  for (const srcRow of _cvtSourceRows) {
    const vals = headers.map(h => {
      const srcCol = _cvtMapping[h] || "";
      const v = srcCol ? String(srcRow[srcCol] ?? "") : "";
      return `"${v.replace(/"/g,'""')}"`;
    });
    lines.push(vals.join(","));
  }
  const csv  = BOM + lines.join("\r\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "rrs_products_import.csv"; a.click();
  URL.revokeObjectURL(url);
  showCvtStep(3);
}

/* Show/hide the inline CSV section inside the Products tab */
function showCsvSection() {
  _csvRows    = [];
  _csvRunning = false;
  const listView  = document.getElementById("productsListView");
  const csvSection = document.getElementById("csvSection");
  if (listView)   listView.style.display  = "none";
  if (csvSection) csvSection.style.display = "";
  showCsvStep(1);

  const inp = document.getElementById("csvFileInput");
  if (inp) {
    try { inp.value = ""; } catch (_) {}
    inp.onchange = e => { if (e.target.files[0]) handleCsvFile(e.target.files[0]); };
  }
  const zone = document.getElementById("csvDropZone");
  if (zone) {
    zone.ondragover  = e => { e.preventDefault(); zone.classList.add("dragover"); };
    zone.ondragleave = ()  => zone.classList.remove("dragover");
    zone.ondrop      = e  => {
      e.preventDefault();
      zone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) handleCsvFile(file);
    };
  }
}

function hideCsvSection() {
  if (_csvRunning) return;
  const listView  = document.getElementById("productsListView");
  const csvSection = document.getElementById("csvSection");
  if (listView)   listView.style.display  = "";
  if (csvSection) csvSection.style.display = "none";
}

/* Keep openCsvImport as alias in case anything still references it */
function openCsvImport()  { showCsvSection(); }
function closeCsvImport() { hideCsvSection(); }

function showCsvStep(n) {
  [1, 2, 3, 4].forEach(i => {
    const el  = document.getElementById("csvStep" + i);
    const dot = document.getElementById("csvDot"  + i);
    if (el)  el.style.display = (i === n) ? "" : "none";
    if (dot) dot.className = "csv-step-dot" + (i <= n ? " active" : "") + (i === n ? " current" : "");
  });
}

/* Placeholder for old modal function — no-op now */
function _ensureCsvModal() {
  if (document.getElementById("csvImportModal")) return;
  const div = document.createElement("div");
  div.innerHTML = `
<div id="csvImportModal" class="a-modal-overlay" style="display:none">
  <div class="a-modal" style="max-width:780px;width:95vw">
    <div class="a-modal-header">
      <h3>Bulk Import Products (CSV)</h3>
      <button class="a-modal-close" onclick="closeCsvImport()">✕</button>
    </div>
    <div class="a-modal-body" style="padding:20px 24px">
      <div id="csvStep1">
        <div id="csvDropZone" class="csv-drop-zone" onclick="document.getElementById('csvFileInput').click()">
          <div class="csv-drop-icon">📂</div>
          <p class="csv-drop-title">Drop your CSV file here or <span>click to browse</span></p>
          <p class="csv-drop-hint">Supports .csv files · Up to 16,000+ rows</p>
        </div>
        <input type="file" id="csvFileInput" accept=".csv,text/csv" style="display:none">
        <div style="display:flex;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap">
          <span style="font-size:13px;color:#666">No template?</span>
          <button class="a-btn-outline" style="width:auto;font-size:12px;padding:6px 14px" onclick="downloadCsvTemplate()">⬇ Download Template</button>
          <span style="font-size:12px;color:#94a3b8;margin-left:4px">Required: name, price, category_name</span>
        </div>
        <div class="csv-format-box">
          <p style="font-size:12px;font-weight:700;color:#0d2c50;margin-bottom:6px">CSV Column Reference</p>
          <div class="csv-cols-grid">
            <div><code>name</code> <span class="csv-req">required</span></div>
            <div><code>sku</code></div><div><code>description</code></div>
            <div><code>price</code></div><div><code>sale_price</code></div>
            <div><code>is_on_sale</code> <span class="csv-hint">true/false</span></div>
            <div><code>category_name</code></div><div><code>case_qty</code></div>
            <div><code>pack_size</code></div>
            <div><code>unit</code> <span class="csv-hint">Case/Pack/EA</span></div>
            <div><code>is_featured</code> <span class="csv-hint">true/false</span></div>
            <div><code>is_active</code> <span class="csv-hint">true/false</span></div>
            <div><code>image_url</code></div><div><code>stock_qty</code></div>
            <div><code>stock_status</code> <span class="csv-hint">in_stock/low_stock/out_of_stock</span></div>
          </div>
        </div>
      </div>
      <div id="csvStep2" style="display:none">
        <div class="csv-preview-header">
          <div><strong id="csvRowCount" style="font-size:15px;color:#0d2c50"></strong>
          <span style="font-size:13px;color:#666;margin-left:6px" id="csvDupNote"></span></div>
          <button class="a-btn-outline" style="width:auto;font-size:12px;padding:5px 12px" onclick="openCsvImport()">✕ Change File</button>
        </div>
        <div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:10px;margin-top:10px;max-height:260px;overflow-y:auto">
          <table class="a-table" id="csvPreviewTable" style="font-size:12px;min-width:600px">
            <thead id="csvPreviewHead"></thead><tbody id="csvPreviewBody"></tbody>
          </table>
        </div>
        <p style="font-size:12px;color:#94a3b8;margin-top:8px">Showing first 5 rows. All <span id="csvTotalPreview"></span> rows will be imported.</p>
      </div>
      <div id="csvStep3" style="display:none">
        <div style="text-align:center;padding:10px 0 6px">
          <p id="csvProgressLabel" style="font-size:14px;font-weight:600;color:#0d2c50;margin-bottom:14px">Importing products…</p>
          <div class="csv-progress-track"><div class="csv-progress-bar" id="csvProgressBar" style="width:0%"></div></div>
          <p id="csvProgressSub" style="font-size:12px;color:#666;margin-top:8px">0 / 0 processed</p>
        </div>
      </div>
      <div id="csvStep4" style="display:none">
        <div class="csv-result-grid">
          <div class="csv-result-card csv-result-green"><div class="csv-result-num" id="csvResInserted">0</div><div class="csv-result-lbl">Inserted</div></div>
          <div class="csv-result-card csv-result-blue"><div class="csv-result-num" id="csvResUpdated">0</div><div class="csv-result-lbl">Updated</div></div>
          <div class="csv-result-card csv-result-red"><div class="csv-result-num" id="csvResErrors">0</div><div class="csv-result-lbl">Errors</div></div>
        </div>
        <div id="csvErrorLog" style="display:none;margin-top:14px;max-height:140px;overflow-y:auto;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;background:#fef2f2;font-size:12px;color:#dc2626"></div>
      </div>
    </div>
    <div class="a-modal-footer" id="csvModalFooter">
      <button class="a-btn-outline" style="width:auto" onclick="closeCsvImport()">Cancel</button>
      <button class="a-btn-primary" id="csvImportBtn" style="display:none" onclick="runCsvImport()">Import All</button>
    </div>
  </div>
</div>`;
  document.body.appendChild(div.firstElementChild);
}

/* Parse a CSV file */
function handleCsvFile(file) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    showToast("Please select a .csv file."); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      _csvRows = parseCsv(e.target.result);
      if (!_csvRows.length) { showToast("No data rows found in CSV."); return; }
      renderCsvPreview(_csvRows);
      showCsvStep(2);
      document.getElementById("csvImportBtn").style.display = "";
    } catch (err) {
      showToast("CSV parse error: " + err.message);
    }
  };
  reader.readAsText(file);
}

/* RFC 4180-compatible CSV parser */
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = csvSplitLine(lines[0]).map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf("name");
  if (nameIdx === -1) throw new Error('CSV must have a "name" column.');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = csvSplitLine(line);
    const obj  = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] ?? "").trim(); });
    if (!obj.name) continue;   // skip blank name rows
    rows.push(obj);
  }
  return rows;
}

function csvSplitLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/* Preview — show first 5 rows */
function renderCsvPreview(rows) {
  const PREVIEW_COLS = ["name", "sku", "category_name", "price", "unit", "is_featured", "is_active"];
  const head = document.getElementById("csvPreviewHead");
  const body = document.getElementById("csvPreviewBody");
  if (!head || !body) return;

  head.innerHTML = "<tr>" + PREVIEW_COLS.map(c => `<th>${c}</th>`).join("") + "</tr>";
  body.innerHTML = rows.slice(0, 5).map(r =>
    "<tr>" + PREVIEW_COLS.map(c => `<td>${escHtml(r[c] || "—")}</td>`).join("") + "</tr>"
  ).join("");

  document.getElementById("csvRowCount").textContent    = `${rows.length.toLocaleString()} products ready to import`;
  document.getElementById("csvTotalPreview").textContent = rows.length.toLocaleString();

  /* Count rows with SKU (can detect duplicates) vs without */
  const withSku = rows.filter(r => r.sku).length;
  const dupNote = document.getElementById("csvDupNote");
  if (dupNote) dupNote.textContent = withSku
    ? `${withSku} have SKU — existing products with matching SKU will be updated.`
    : "No SKU column — all rows will be inserted as new products.";
}

/* Run the actual import in batches of 100 */
async function runCsvImport() {
  if (!_csvRows.length || _csvRunning) return;
  _csvRunning = true;
  document.getElementById("csvImportBtn").disabled = true;

  showCsvStep(3);

  /* ── Deduplicate within the CSV itself ───────────────────── */
  const normName = s => (s || "").toLowerCase().trim();
  const seenSku  = new Map(); // sku → last row index
  const seenName = new Map(); // normalized name → last row index
  _csvRows.forEach((r, i) => {
    if (r.sku) seenSku.set(r.sku.trim(), i);
    else        seenName.set(normName(r.name), i);
  });
  const deduped = _csvRows.filter((r, i) =>
    r.sku ? seenSku.get(r.sku.trim()) === i : seenName.get(normName(r.name)) === i
  );
  const csvDupCount = _csvRows.length - deduped.length;

  /* ── For no-SKU rows: skip products that already exist in DB by name ── */
  const noSkuRows = deduped.filter(r => !r.sku);
  let existingNames = new Set();
  if (noSkuRows.length) {
    const { data: existingProds } = await window.sb
      .from("products").select("name");
    if (existingProds) existingProds.forEach(p => existingNames.add(normName(p.name)));
  }
  const rows = deduped.filter(r => r.sku || !existingNames.has(normName(r.name)));
  const dbDupCount = deduped.length - rows.length;
  const skippedTotal = csvDupCount + dbDupCount;

  if (skippedTotal) {
    document.getElementById("csvProgressSub").textContent =
      `Skipped ${skippedTotal} duplicate(s) — importing ${rows.length} unique product(s)…`;
    await new Promise(r => setTimeout(r, 800));
  }

  const BATCH   = 100;
  const total   = rows.length;
  let inserted  = 0;
  let updated   = 0;
  const errLines = [];

  const setProgress = (done) => {
    const pct = total ? Math.round((done / total) * 100) : 100;
    document.getElementById("csvProgressBar").style.width = pct + "%";
    document.getElementById("csvProgressSub").textContent = `${done.toLocaleString()} / ${total.toLocaleString()} processed${skippedTotal ? ` (${skippedTotal} duplicates skipped)` : ""}`;
  };
  setProgress(0);

  /* Process in chunks */
  for (let start = 0; start < total; start += BATCH) {
    const chunk  = rows.slice(start, start + BATCH);
    const hasSku = chunk.some(r => r.sku);
    const now    = new Date().toISOString();

    const payloads = chunk.map(r => ({
      name         : r.name,
      sku          : r.sku  || null,
      slug         : r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description  : r.description  || null,
      price        : parseFloat(r.price)      || 0,
      sale_price   : parseFloat(r.sale_price) || null,
      is_on_sale   : ["true","1","yes"].includes((r.is_on_sale || "").toLowerCase()),
      category_name: r.category_name || null,
      case_qty     : parseInt(r.case_qty)  || 1,
      pack_size    : parseInt(r.pack_size) || 1,
      unit         : r.unit         || "Case",
      is_featured  : ["true","1","yes"].includes((r.is_featured || "").toLowerCase()),
      is_active    : r.is_active === "" || ["true","1","yes"].includes((r.is_active || "true").toLowerCase()),
      image_url    : r.image_url   || null,
      updated_at   : now,
    }));

    /* Upsert on SKU if present, otherwise plain insert */
    let result;
    if (hasSku) {
      result = await window.sb
        .from("products")
        .upsert(payloads, { onConflict: "sku", ignoreDuplicates: false })
        .select("id, sku");
    } else {
      result = await window.sb.from("products").insert(payloads).select("id");
    }

    if (result.error) {
      errLines.push(`Rows ${start + 1}–${start + chunk.length}: ${result.error.message}`);
      setProgress(start + chunk.length);
      continue;
    }

    /* Upsert inventory for each inserted/updated product */
    if (result.data?.length) {
      const invPayloads = result.data.map((p, i) => ({
        product_id : p.id,
        stock_qty  : parseInt(chunk[i]?.stock_qty)  || 0,
        status     : chunk[i]?.stock_status || "in_stock",
        updated_at : now,
      }));
      await window.sb.from("inventory")
        .upsert(invPayloads, { onConflict: "product_id" });
    }

    /* Count inserts vs updates (rough heuristic: upsert returns all) */
    if (hasSku) {
      updated   += result.data?.length || chunk.length;
    } else {
      inserted  += result.data?.length || chunk.length;
    }

    setProgress(start + chunk.length);
    await new Promise(r => setTimeout(r, 30)); // tiny yield to keep UI responsive
  }

  /* Show results */
  _csvRunning = false;
  document.getElementById("csvImportBtn").disabled = false;

  document.getElementById("csvResInserted").textContent = inserted.toLocaleString();
  document.getElementById("csvResUpdated").textContent  = updated.toLocaleString();
  document.getElementById("csvResErrors").textContent   = errLines.length;
  document.getElementById("csvProgressLabel").textContent = "Import complete!";
  const skipEl = document.getElementById("csvResSkipped");
  if (skipEl) skipEl.textContent = skippedTotal.toLocaleString();

  if (errLines.length) {
    const log = document.getElementById("csvErrorLog");
    log.innerHTML = errLines.map(e => `<div>• ${escHtml(e)}</div>`).join("");
    log.style.display = "block";
  }

  showCsvStep(4);
  renderProductsTable();  // refresh table in background
}

/* Download a blank template — Excel & Google Sheets compatible */
function downloadCsvTemplate() {
  /* Text fields: wrap in quotes. Number/boolean fields: no quotes so
     Excel/Sheets treat them as real numbers and checkboxes, not text. */
  function q(v)  { return '"' + String(v).replace(/"/g, '""') + '"'; } // quoted string
  function n(v)  { return v === "" ? "" : String(v); }                  // number (unquoted)
  function b(v)  { return v ? "TRUE" : "FALSE"; }                       // Excel boolean

  const rows = [
    /* ── Header row ── */
    [
      "name","sku","description",
      "price","sale_price","is_on_sale",
      "category_name","case_qty","pack_size","unit",
      "is_featured","is_active","image_url",
      "stock_qty","stock_status"
    ].map(q),

    /* ── Example 1: basic product ── */
    [
      q("Premium Bath Towels"), q("SKU-001"), q("Soft commercial-grade bath towels, white"),
      n(24.99), n(""), b(false),
      q("Towels and Linens"), n(12), n(1), q("Case"),
      b(false), b(true), q(""),
      n(100), q("in_stock")
    ],

    /* ── Example 2: sale product, featured ── */
    [
      q("Antibacterial Hand Soap 1L"), q("SKU-002"), q("Foam hand soap refill, fresh scent"),
      n(18.50), n(15.99), b(true),
      q("Hand Soap"), n(6), n(1), q("Case"),
      b(true), b(true), q(""),
      n(50), q("in_stock")
    ],

    /* ── Example 3: low stock ── */
    [
      q("C-Fold Paper Towels"), q("SKU-003"), q("2-ply C-fold paper towels, 12 packs per case"),
      n(32.00), n(""), b(false),
      q("Paper Towels"), n(12), n(150), q("Case"),
      b(false), b(true), q(""),
      n(8), q("low_stock")
    ],

    /* ── Example 4: out of stock, inactive ── */
    [
      q("Trash Liner 55 Gallon"), q("SKU-004"), q("Heavy-duty black trash liners, 1.5 mil"),
      n(45.99), n(""), b(false),
      q("Trash Liners"), n(100), n(1), q("Case"),
      b(false), b(false), q(""),
      n(0), q("out_of_stock")
    ],

    /* ── Example 5: pack unit ── */
    [
      q("Toilet Seat Cover Dispenser"), q("SKU-005"), q("Wall-mount dispenser for seat covers"),
      n(12.75), n(""), b(false),
      q("Facility Supplies"), n(1), n(1), q("EA"),
      b(false), b(true), q(""),
      n(25), q("in_stock")
    ],
  ];

  /* RFC 4180: CRLF line endings + UTF-8 BOM so Excel auto-detects encoding */
  const BOM = "﻿";
  const csv = BOM + rows.map(row => row.join(",")).join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "rrs_products_template.csv";
  a.click();
  URL.revokeObjectURL(url);
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
  let q = window.sb.from("orders").select("*").order("created_at", { ascending: false });
  if (filter) q = q.or(`order_number.ilike.%${filter}%,customer_name.ilike.%${filter}%,business_name.ilike.%${filter}%`);
  const statusFilter = document.getElementById("orderStatusFilter")?.value;
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data: orders } = await q;

  tbody.innerHTML = (orders || []).map(o => {
    const items = Array.isArray(o.items) ? o.items : (typeof o.items === "string" ? JSON.parse(o.items || "[]") : []);
    const totalDollars = o.total ? Number(o.total).toFixed(2) : "0.00";
    return `
    <tr>
      <td><strong>${escHtml(o.order_number)}</strong></td>
      <td>${escHtml(o.customer_name || "—")}</td>
      <td>${escHtml(o.business_name || "—")}</td>
      <td>${items.length} item${items.length !== 1 ? "s" : ""}</td>
      <td>$${totalDollars}</td>
      <td>${fmt(o.created_at)}</td>
      <td>
        <select onchange="updateOrderStatus('${o.id}', this.value)" class="a-select" style="font-size:12px;width:auto;min-width:130px">
          ${["processing","confirmed","shipped","delivered","cancelled","refunded"].map(s =>
            `<option value="${s}" ${o.status===s?"selected":""}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
          ).join("")}
        </select>
      </td>
      <td style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <button class="a-btn-sm" onclick="openOrderModal('${o.id}')">View</button>
        ${o.label_url ? `<a href="${escHtml(o.label_url)}" target="_blank" rel="noopener" class="a-btn-sm" style="background:#0B1F38;color:#fff;text-decoration:none;">&#128438; Label</a>` : ""}
        ${o.pro_number ? `<a href="https://www.estes-express.com/myestes/tracking/details?proNumber=${encodeURIComponent(o.pro_number)}" target="_blank" rel="noopener" class="a-btn-sm" style="background:#1d4ed8;color:#fff;text-decoration:none;">&#128666; BOL</a>` : ""}
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="a-empty">No orders yet.</td></tr>`;
}

document.getElementById("orderSearch")?.addEventListener("input", e => renderOrdersTable(e.target.value.trim()));
document.getElementById("orderStatusFilter")?.addEventListener("change", () => renderOrdersTable(document.getElementById("orderSearch")?.value.trim()));

async function updateOrderStatus(orderId, status) {
  await window.sb.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  showToast("Order status updated.");
}

async function openOrderModal(id) {
  const { data: o } = await window.sb.from("orders").select("*, order_items(*)").eq("id", id).single();
  if (!o) return;
  const addr = o.shipping_address || {};
  const isPending    = o.status === "pending";
  const isConfirmed  = o.status === "confirmed";
  const isCancelled  = o.status === "cancelled";
  const estesBooked  = !!o.estes_bol_number;
  const freightQuote = o.freight_quote ? (typeof o.freight_quote === "string" ? JSON.parse(o.freight_quote) : o.freight_quote) : null;
  const estesQuoted  = freightQuote?.carrier_name === "Estes Express";

  // Action bar — only show for actionable statuses
  let actionBar = "";
  if (isPending) {
    const quotePanel = estesQuoted ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 14px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div><span style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em;display:block">Freight Cost</span>
          <strong style="color:#0c4a6e;font-size:16px;">$${Number(freightQuote.total_charge).toFixed(2)}</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em;display:block">Transit</span>
          <strong style="color:#0c4a6e;font-size:16px;">${freightQuote.transit_days ?? "—"} days</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em;display:block">Est. Delivery</span>
          <strong style="color:#0c4a6e;font-size:13px;">${freightQuote.delivery_date ?? "—"}</strong></div>
      </div>
      ${freightQuote.test_mode ? `<div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11.5px;color:#92400e;font-weight:600;">🧪 TEST MODE — Quote is from Estes UAT. No real charges until credentials switch to production.</div>` : ""}` : "";

    actionBar = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <span style="font-size:20px;">📋</span>
          <div>
            <strong style="font-size:14px;color:#15803d;display:block;">Order Pending Review</strong>
            <span style="font-size:12px;color:#166534;">Get a freight quote from Estes Express, then confirm to book.</span>
          </div>
        </div>
        ${quotePanel}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="getEstesQuote('${o.id}')"
            style="flex:1;min-width:160px;background:#fff;color:#0b2d52;border:1.5px solid #0b2d52;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            📦 ${estesQuoted ? "Refresh Quote" : "Get Estes Quote"}
          </button>
          ${estesQuoted ? `<button onclick="bookWithEstes('${o.id}')"
            style="flex:2;min-width:180px;background:#0b2d52;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            🚚 Confirm &amp; Book with Estes
          </button>` : ""}
          <button onclick="cancelOrderFromModal('${o.id}')"
            style="flex:1;min-width:120px;background:#fff;color:#dc2626;border:1.5px solid #fca5a5;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:600;cursor:pointer;">
            ✕ Cancel Order
          </button>
        </div>
      </div>`;
  } else if (isConfirmed && estesBooked) {
    actionBar = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">✅</span>
        <div>
          <strong style="color:#15803d;font-size:13px;display:block;">Booked with Estes Express</strong>
          <span style="color:#166534;font-size:12px;">BOL: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${escHtml(o.estes_bol_number)}</code>
          ${o.estes_pro_number ? ` &nbsp;·&nbsp; PRO: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${escHtml(o.estes_pro_number)}</code>` : ""}</span>
        </div>
      </div>`;
  } else if (isConfirmed) {
    actionBar = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">✅</span>
        <div><strong style="color:#15803d;font-size:13px;display:block;">Order Confirmed</strong></div>
      </div>`;
  }

  document.getElementById("orderModalBody").innerHTML = `
    ${actionBar}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13.5px;margin-bottom:16px;">
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Order #</span><br><strong>${escHtml(o.order_number)}</strong></div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</span><br><span class="a-badge ${badgeClass(o.status)}">${o.status}</span></div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Customer</span><br>${escHtml(o.customer_name || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Business</span><br>${escHtml(o.business_name || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Email</span><br>${escHtml(o.customer_email || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Phone</span><br>${escHtml(o.phone || "—")}</div>
      <div style="grid-column:span 2"><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Ship To</span><br>${escHtml([addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ") || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Type</span><br>${o.order_type === "reorder" ? "Reorder" : "One-Time"}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Date</span><br>${fmt(o.created_at)}</div>
      ${freightQuote ? `<div style="grid-column:span 2"><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Freight Quote</span><br>${escHtml(freightQuote.carrier_name || "—")} — $${Number(freightQuote.total_charge || 0).toFixed(2)}${freightQuote.transit_days ? ` (${freightQuote.transit_days} days)` : ""}</div>` : ""}
    </div>
    <hr style="margin:16px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:10px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Items</h4>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <thead><tr style="background:#f8fafd">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Product</th>
        <th style="padding:8px;text-align:center;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Qty</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Price</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Subtotal</th>
      </tr></thead>
      <tbody>
        ${(o.order_items || []).map(i => { const price = Number(i.price ?? i.price_per_case ?? 0); const qty = Number(i.quantity ?? 1); return `<tr style="border-top:1px solid #f0f4fa">
          <td style="padding:9px 12px">${escHtml(i.name || i.product_name || "Product")}</td>
          <td style="text-align:center;padding:9px 8px">${qty}</td>
          <td style="text-align:right;padding:9px 8px">$${price.toFixed(2)}</td>
          <td style="text-align:right;padding:9px 8px;font-weight:600">$${(price * qty).toFixed(2)}</td>
        </tr>`; }).join("")}
      </tbody>
    </table>
    <div style="text-align:right;margin-top:14px;font-size:16px;font-weight:800;color:#0b2d52;">Total: $${Number(o.total).toFixed(2)}</div>
    ${(o.label_url || o.tracking_number || o.bol_number || o.pro_number) ? `
    <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:12px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Shipping</h4>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
      ${o.label_url ? `<a href="${escHtml(o.label_url)}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:7px;background:#0B1F38;color:#fff;border:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;">
        &#128438; Print Shipping Label
      </a>` : ""}
      ${o.tracking_number ? `<span style="font-size:13px;color:#334155;">
        Tracking: <a href="${o.tracking_url ? escHtml(o.tracking_url) : `https://www.fedex.com/fedextrack/?trknbr=${escHtml(o.tracking_number)}`}" target="_blank" rel="noopener"
          style="font-weight:700;color:#0B1F38;text-decoration:underline;">${escHtml(o.tracking_number)}</a>
        &nbsp;<span style="color:#94a3b8;font-size:11px;">(${escHtml(o.shipping_carrier || "Carrier")})</span>
      </span>` : ""}
      ${o.bol_number ? `<span style="font-size:13px;color:#334155;">BOL: <strong>${escHtml(o.bol_number)}</strong></span>` : ""}
      ${o.pro_number ? `<a href="https://www.estes-express.com/myestes/tracking/details?proNumber=${encodeURIComponent(o.pro_number)}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:7px;background:#1d4ed8;color:#fff;border:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;">
        &#128666; Track on Estes &rarr;
      </a>
      <span style="font-size:13px;color:#334155;">PRO: <strong>${escHtml(o.pro_number)}</strong></span>` : ""}
    </div>` : ""}
    <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:10px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Resend Receipt</h4>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <input id="resendEmailInput" type="email" placeholder="Enter email address"
        value="${escHtml(o.customer_email || '')}"
        style="flex:1;min-width:200px;padding:9px 13px;border:1.5px solid #d0d7e0;border-radius:8px;font-size:13px;outline:none;">
      <button onclick="resendReceipt('${o.id}')"
        style="background:#ED7226;color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
        &#9993; Send Receipt
      </button>
      <button id="downloadReceiptBtn" onclick="downloadReceipt('${o.id}')"
        style="background:#fff;color:#0d1f38;border:1.5px solid #d0d7e0;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
        &#8681; Download PDF
      </button>
    </div>
    <div id="resendResult" style="margin-top:8px;font-size:12.5px;display:none;"></div>
    <div id="orderActionResult" style="margin-top:14px;display:none;"></div>`;
  openModal("orderModal");
}

async function resendReceipt(orderId) {
  const email = document.getElementById('resendEmailInput')?.value.trim();
  const resultEl = document.getElementById('resendResult');
  if (!email) { resultEl.style.display='block'; resultEl.style.color='#dc2626'; resultEl.textContent='Please enter an email address.'; return; }

  const btn = document.querySelector('[onclick="resendReceipt(\'' + orderId + '\')"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const { data: o } = await window.sb.from('orders').select('*, order_items(*)').eq('id', orderId).single();
  if (!o) { if (btn) { btn.disabled=false; btn.textContent='✉ Send Receipt'; } return; }

  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY';
  try {
    const res = await fetch('https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/send-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}` },
      body: JSON.stringify({
        order_number:     o.order_number,
        customer_name:    o.customer_name  || '',
        customer_email:   email,
        business_name:    o.business_name  || '',
        phone:            o.phone          || '',
        shipping_address: o.shipping_address || {},
        subtotal:         o.subtotal       || o.total,
        total:            o.total,
        payment_method:   o.payment_method || '',
        items:            o.order_items    || [],
        created_at:       o.created_at,
        tracking_number:  o.tracking_number || null,
        shipping_carrier: o.shipping_carrier || null,
        bol_number:       o.bol_number     || null,
        pro_number:       o.pro_number     || null,
      }),
    });
    const data = await res.json();
    resultEl.style.display = 'block';
    if (data.success) {
      resultEl.style.color = '#15803d';
      resultEl.textContent = `✓ Receipt sent to ${email}`;
    } else {
      resultEl.style.color = '#dc2626';
      resultEl.textContent = `Failed: ${data.error || 'Unknown error'}`;
    }
  } catch(err) {
    resultEl.style.display = 'block';
    resultEl.style.color = '#dc2626';
    resultEl.textContent = `Error: ${err.message}`;
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '&#9993; Send Receipt'; }
}

async function downloadReceipt(orderId) {
  const btn = document.getElementById('downloadReceiptBtn');
  const resultEl = document.getElementById('resendResult');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Preparing…'; }

  const { data: o } = await window.sb.from('orders').select('*, order_items(*)').eq('id', orderId).single();
  if (!o) { if (btn) { btn.disabled = false; btn.innerHTML = '&#8681; Download PDF'; } return; }

  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY';
  try {
    const res = await fetch('https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/send-receipt?download=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}` },
      body: JSON.stringify({
        order_number:     o.order_number,
        customer_name:    o.customer_name  || '',
        customer_email:   o.customer_email || 'no-reply@roomreadysupply.com',
        business_name:    o.business_name  || '',
        phone:            o.phone          || '',
        shipping_address: o.shipping_address || {},
        subtotal:         o.subtotal       || o.total,
        total:            o.total,
        payment_method:   o.payment_method || '',
        items:            o.order_items    || [],
        created_at:       o.created_at,
        tracking_number:  o.tracking_number || null,
        shipping_carrier: o.shipping_carrier || null,
        bol_number:       o.bol_number     || null,
        pro_number:       o.pro_number     || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RRS-Receipt-${o.order_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.color = '#dc2626';
      resultEl.textContent = `Download failed: ${err.message}`;
    }
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '&#8681; Download PDF'; }
}

function viewQuotePdf() {
  if (!currentQuoteId) return;
  window.open(`/quote-view?id=${currentQuoteId}&print=1`, "_blank");
}

function showWarpConfirmDialog() { return Promise.resolve(false); } // removed — use bookWithEstes

function _showWarpConfirmDialogUnused({ orderNumber, customer, business, shipTo, total, freightCost, carrier, isLive }) {
  return new Promise((resolve) => {
    const existing = document.getElementById("warpConfirmOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "warpConfirmOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;";

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;max-width:480px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.25);overflow:hidden;">
        <div style="background:#0b2d52;padding:20px 24px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:24px;">🚚</span>
          <div>
            <div style="color:#fff;font-size:15px;font-weight:800;">Confirm Warp Booking</div>
            <div style="color:#93c5fd;font-size:12px;margin-top:2px;">Please review before booking</div>
          </div>
        </div>
        ${isLive ? `<div style="background:#fef2f2;border-bottom:1px solid #fecaca;padding:10px 24px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;">⚠️</span>
          <span style="color:#dc2626;font-size:12px;font-weight:700;">LIVE MODE — This will create a REAL shipment and incur freight charges.</span>
        </div>` : `<div style="background:#fef9ec;border-bottom:1px solid #fde68a;padding:10px 24px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;">🧪</span>
          <span style="color:#b45309;font-size:12px;font-weight:700;">TEST MODE — No real shipment or charges will occur.</span>
        </div>`}
        <div style="padding:20px 24px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;font-size:13px;margin-bottom:18px;">
            <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Order</span><strong>${escHtml(orderNumber)}</strong></div>
            <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Order Total</span><strong>${escHtml(total)}</strong></div>
            <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Customer</span>${escHtml(customer || "—")}</div>
            <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Business</span>${escHtml(business || "—")}</div>
            <div style="grid-column:span 2"><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Ship To</span>${escHtml(shipTo || "—")}</div>
            <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Carrier</span>${escHtml(carrier)}</div>
            <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Est. Freight Cost</span><strong style="color:#0b2d52;">${escHtml(freightCost)}</strong></div>
          </div>
          <div style="background:#f8fafd;border:1.5px solid #e4e9f2;border-radius:10px;padding:12px 14px;font-size:12px;color:#64748b;margin-bottom:18px;">
            By confirming, you authorize Room Ready Supply to book this LTL shipment with Warp.${isLive ? " <strong style='color:#dc2626;'>Freight charges will apply.</strong>" : ""}
          </div>
          <div style="display:flex;gap:10px;">
            <button id="warpConfirmCancel" style="flex:1;padding:11px;border:1.5px solid #e4e9f2;border-radius:10px;background:#fff;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;">Cancel</button>
            <button id="warpConfirmProceed" style="flex:2;padding:11px;border:none;border-radius:10px;background:#0b2d52;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">
              ${isLive ? "✅ Yes, Book Shipment" : "✅ Yes, Book (Test)"}
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    document.getElementById("warpConfirmCancel").onclick  = () => { overlay.remove(); resolve(false); };
    document.getElementById("warpConfirmProceed").onclick = () => { overlay.remove(); resolve(true); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

async function approveAndBookWithWarp(orderId) {
  return bookWithEstes(orderId); // Warp removed — Estes Express is the carrier
}

async function _approveAndBookWithWarpUnused(orderId) {
  const resultEl = document.getElementById("orderActionResult");

  // Fetch order details first for the confirmation dialog
  const { data: order } = await window.sb.from("orders").select("*, order_items(*)").eq("id", orderId).single();
  const addr = order?.shipping_address || {};
  const freightQuote = order?.freight_quote ? (typeof order.freight_quote === "string" ? JSON.parse(order.freight_quote) : order.freight_quote) : null;
  const freightCost  = freightQuote?.total_charge ? `$${Number(freightQuote.total_charge).toFixed(2)}` : "TBD by Warp";
  const carrier      = freightQuote?.carrier_name || "Warp LTL";
  const isLiveMode   = document.getElementById("warpModeBadge")?.textContent?.includes("LIVE");

  // Show confirmation dialog
  const confirmed = await showWarpConfirmDialog({
    orderNumber:  order?.order_number,
    customer:     order?.customer_name,
    business:     order?.business_name,
    shipTo:       [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", "),
    total:        `$${Number(order?.total || 0).toFixed(2)}`,
    freightCost,
    carrier,
    isLive:       isLiveMode,
  });

  if (!confirmed) return; // user cancelled

  const btn = document.querySelector('[onclick^="approveAndBookWithWarp"]');
  if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Processing…"; }
  const warpPayload = { // addr already defined above
    reference:    order?.order_number,
    pickup_date:  nextBusinessDay(),
    origin: {
      street: "609 Washington St", city: "Plymouth", state: "NC", zip: "27962",
    },
    destination: {
      street: addr.street || "", city: addr.city || "", state: addr.state || "", zip: addr.zip || "",
      contact_name:  order?.customer_name  || "",
      contact_phone: order?.phone          || "",
      contact_email: order?.customer_email || "",
    },
    items: (order?.order_items || []).map(i => ({
      description: i.name || i.product_name || "Product", quantity: i.quantity,
      weight_lbs: 20, length_in: 14, width_in: 12, height_in: 10, freight_class: "70",
    })),
  };

  // Step 3: Call Warp booking via Edge Function (quote → book in one call)
  if (resultEl) {
    resultEl.style.display = "";
    resultEl.innerHTML = `<div style="color:#64748b;font-size:13px;padding:10px 0;">⏳ Booking with Warp…</div>`;
  }

  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY";

  let warpShipmentId = null;
  let warpError = null;

  try {
    const warpRes = await fetch("https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/warp-quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: "book",
        quotePayload: {
          origin_zip:      "27962",
          destination_zip: addr.zip || "",
          pickup_date:     warpPayload.pickup_date,
          pallets:         Math.max(1, Math.ceil((order?.order_items || []).length / 4)),
          weight_lbs_per_pallet: 400,
          commodity:       "general freight",
          length_in: 48, width_in: 40, height_in: 48,
        },
        bookPayload: {
          reference: order?.order_number,
          patch: {
            pickup: {
              street:      "609 Washington St",
              city:        "Plymouth",
              state:       "NC",
              zipCode:     "27962",
              contactName: "Room Ready Supply",
              phone:       "sales@roomreadysupply.com",
              email:       "sales@roomreadysupply.com",
            },
            delivery: {
              street:      addr.street || "",
              city:        addr.city   || "",
              state:       addr.state  || "",
              zipCode:     addr.zip    || "",
              contactName: order?.customer_name  || "",
              phone:       order?.phone          || "",
              email:       order?.customer_email || "",
            },
          },
        },
      }),
    });

    const warpData = await warpRes.json();

    if (!warpRes.ok || warpData.error) {
      warpError = warpData.error || warpData.message || `Warp API error (${warpRes.status})`;
    } else {
      warpShipmentId = warpData.id || warpData.shipment_id || warpData.quote_id || null;
      // Save shipment ID to order
      await window.sb.from("orders").update({
        warp_shipment_id: warpShipmentId ? String(warpShipmentId) : "booked",
        warp_booked_at:   new Date().toISOString(),
      }).eq("id", orderId);
    }
  } catch (e) {
    warpError = e.message;
  }

  // Step 4: Show result
  if (resultEl) {
    resultEl.style.display = "";
    if (warpError) {
      // Warp failed — keep order as pending so admin can retry
      resultEl.innerHTML = `
        <div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:14px 16px;">
          <strong style="color:#dc2626;font-size:13px;display:block;margin-bottom:4px;">⚠️ Warp Booking Failed — Order Still Pending</strong>
          <span style="color:#b91c1c;font-size:12px;">Warp returned an error: <em>${escHtml(warpError)}</em>. Order has NOT been confirmed. Fix the issue and try again.</span>
        </div>`;
      if (btn) { btn.disabled = false; btn.innerHTML = "🚚 Approve &amp; Book with Warp"; }
      showToast("Warp booking failed — order remains pending.");
    } else {
      // Warp succeeded — now confirm the order in DB
      await window.sb.from("orders").update({
        status:           "confirmed",
        warp_shipment_id: warpShipmentId ? String(warpShipmentId) : "booked",
        warp_booked_at:   new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      }).eq("id", orderId);

      resultEl.innerHTML = `
        <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:14px 16px;">
          <strong style="color:#15803d;font-size:13px;display:block;margin-bottom:4px;">✅ Booked with Warp!</strong>
          <span style="color:#166534;font-size:12px;">Order confirmed and shipment booked.${warpShipmentId ? ` Warp Shipment ID: <strong>${escHtml(String(warpShipmentId))}</strong>` : ""}</span>
        </div>`;
      showToast("Order confirmed and booked with Warp! 🚚");
    }
  }

  renderOrdersTable();
}

// ── Estes Express Integration ────────────────────────────────────────────────
const SUPABASE_ANON_KEY_ESTES = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY";
const ESTES_FN_URL = "https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/estes-freight";

async function callEstesFunction(action, payload) {
  const res = await fetch(ESTES_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY_ESTES}`,
    },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Estes error (${res.status})`);
  return data;
}

async function getEstesQuote(orderId) {
  const resultEl = document.getElementById("orderActionResult");
  if (resultEl) { resultEl.style.display = ""; resultEl.innerHTML = `<div style="color:#64748b;font-size:13px;padding:10px 0;">⏳ Getting Estes rate quote…</div>`; }

  const { data: order } = await window.sb.from("orders").select("*, order_items(*)").eq("id", orderId).single();
  const addr  = order?.shipping_address || {};
  const items = order?.order_items || [];

  // Calculate total shipment weight: sum of (qty × 40 lbs default per case)
  const totalWeight = items.reduce((sum, i) => sum + (i.quantity * (i.weight_lbs || 40)), 0) || 40;

  try {
    const quote = await callEstesFunction("quote", {
      destination_zip:   addr.zip   || "",
      destination_city:  addr.city  || "",
      destination_state: addr.state || "",
      weight_lbs: totalWeight,
    });

    // Save quote to order
    await window.sb.from("orders").update({
      freight_quote: JSON.stringify(quote),
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    if (resultEl) {
      resultEl.innerHTML = `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px 16px;">
        <strong style="color:#15803d;font-size:13px;display:block;margin-bottom:4px;">✅ Quote received — Estes Express</strong>
        <span style="color:#166534;font-size:12px;">$${Number(quote.total_charge).toFixed(2)} · ${quote.transit_days ?? "?"} transit days · Est. delivery: ${quote.delivery_date ?? "TBD"}</span>
      </div>`;
    }
    showToast("Estes quote received! Click 'Confirm & Book' to proceed.");
    // Reopen modal to refresh action bar with quote panel
    setTimeout(() => showOrderModal(orderId), 800);
  } catch (e) {
    if (resultEl) {
      resultEl.innerHTML = `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px 16px;">
        <strong style="color:#dc2626;font-size:13px;display:block;margin-bottom:4px;">⚠️ Quote Failed</strong>
        <span style="color:#b91c1c;font-size:12px;">${escHtml(e.message)}</span>
      </div>`;
    }
  }
}

async function bookWithEstes(orderId) {
  const resultEl = document.getElementById("orderActionResult");

  const { data: order } = await window.sb.from("orders").select("*, order_items(*)").eq("id", orderId).single();
  const addr  = order?.shipping_address || {};
  const items = order?.order_items || [];
  const freightQuote = order?.freight_quote
    ? (typeof order.freight_quote === "string" ? JSON.parse(order.freight_quote) : order.freight_quote)
    : null;

  const freightCostStr = freightQuote?.total_charge ? `$${Number(freightQuote.total_charge).toFixed(2)}` : "TBD";
  const confirmed = await showFreightConfirmDialog({
    orderNumber: order?.order_number,
    customer:    order?.customer_name,
    business:    order?.business_name,
    shipTo:      [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", "),
    total:       `$${Number(order?.total || 0).toFixed(2)}`,
    freightCost: freightCostStr,
    transitDays: freightQuote?.transit_days ?? "?",
    testMode:    !!freightQuote?.test_mode,
  });
  if (!confirmed) return;

  const btn = document.querySelector('[onclick^="bookWithEstes"]');
  if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Booking…"; }
  if (resultEl) { resultEl.style.display = ""; resultEl.innerHTML = `<div style="color:#64748b;font-size:13px;padding:10px 0;">⏳ Creating BOL with Estes…</div>`; }

  const totalWeight = items.reduce((sum, i) => sum + (i.quantity * (i.weight_lbs || 40)), 0) || 40;

  try {
    const result = await callEstesFunction("book", {
      order_number: order?.order_number,
      quote_id:     freightQuote?.quote_id ?? null,
      ship_date:    freightQuote?.ship_date ?? null,
      destination: {
        name:   order?.business_name || order?.customer_name || "Customer",
        street: addr.street || "",
        city:   addr.city   || "",
        state:  addr.state  || "",
        zip:    addr.zip    || "",
        phone:  order?.phone          || "",
        email:  order?.customer_email || "",
      },
      items: items.map(i => ({
        description: i.name || i.product_name || "Product",
        quantity:    i.quantity,
        weight_lbs:  i.quantity * (i.weight_lbs || 40),
      })),
    });

    // Save BOL + confirm order
    await window.sb.from("orders").update({
      status:           "confirmed",
      estes_bol_number: result.bol_number || "booked",
      estes_pro_number: result.pro_number || null,
      estes_booked_at:  new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }).eq("id", orderId);

    if (resultEl) {
      resultEl.innerHTML = `<div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:14px 16px;">
        <strong style="color:#15803d;font-size:13px;display:block;margin-bottom:4px;">✅ Booked with Estes Express!</strong>
        <span style="color:#166534;font-size:12px;">BOL: <strong>${escHtml(result.bol_number)}</strong>${result.pro_number ? ` · PRO: <strong>${escHtml(result.pro_number)}</strong>` : ""}</span>
      </div>`;
    }
    showToast("Order confirmed and booked with Estes Express! 🚚");
    renderOrdersTable();
  } catch (e) {
    if (resultEl) {
      resultEl.innerHTML = `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:14px 16px;">
        <strong style="color:#dc2626;font-size:13px;display:block;margin-bottom:4px;">⚠️ Estes Booking Failed — Order Still Pending</strong>
        <span style="color:#b91c1c;font-size:12px;">${escHtml(e.message)}</span>
      </div>`;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = "🚚 Confirm &amp; Book with Estes"; }
    showToast("Estes booking failed — order remains pending.");
  }
}

function showFreightConfirmDialog({ orderNumber, customer, business, shipTo, total, freightCost, transitDays, testMode }) {
  return new Promise((resolve) => {
    const existing = document.getElementById("estesConfirmOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "estesConfirmOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:18px;max-width:420px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.25);overflow:hidden;">
        <div style="padding:22px 24px 16px;border-bottom:1px solid #f0f4fa;">
          <strong style="font-size:16px;color:#0d1f38;display:block;margin-bottom:4px;">Confirm Estes Express Booking</strong>
          <span style="font-size:12px;color:#64748b;">Order #${escHtml(orderNumber)}</span>
        </div>
        ${testMode ? `<div style="background:#fef9ec;border-bottom:1px solid #fde68a;padding:10px 24px;font-size:12px;color:#b45309;font-weight:700;">🧪 TEST MODE — No real shipment or charges.</div>` : `<div style="background:#fef2f2;border-bottom:1px solid #fecaca;padding:10px 24px;font-size:12px;color:#dc2626;font-weight:700;">⚠️ LIVE — This will create a real Estes shipment.</div>`}
        <div style="padding:20px 24px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
          <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Customer</span>${escHtml(customer || "—")}</div>
          <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Business</span>${escHtml(business || "—")}</div>
          <div style="grid-column:span 2"><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Ship To</span>${escHtml(shipTo || "—")}</div>
          <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Order Total</span>${escHtml(total)}</div>
          <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Freight Cost</span><strong style="color:#0b2d52;">${escHtml(freightCost)}</strong></div>
          <div><span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;display:block;margin-bottom:2px;">Transit Days</span>${escHtml(String(transitDays))}</div>
        </div>
        <div style="padding:0 24px 20px;display:flex;gap:10px;">
          <button id="estesCancel" style="flex:1;padding:11px;border:1.5px solid #e4e9f2;border-radius:10px;background:#fff;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;">Cancel</button>
          <button id="estesProceed" style="flex:2;padding:11px;border:none;border-radius:10px;background:#0b2d52;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">
            ${testMode ? "✅ Yes, Book (Test)" : "✅ Yes, Book Shipment"}
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById("estesCancel").onclick  = () => { overlay.remove(); resolve(false); };
    document.getElementById("estesProceed").onclick = () => { overlay.remove(); resolve(true); };
    overlay.addEventListener("click", e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

async function cancelOrderFromModal(orderId) {
  if (!confirm("Are you sure you want to cancel this order? This cannot be undone.")) return;
  const { error } = await window.sb.from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) { showToast("Error: " + error.message); return; }
  showToast("Order cancelled.");
  closeModal("orderModal");
  renderOrdersTable();
}

function nextBusinessDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
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


/* ═══════════════════════════════════════════════════════════
   HERO SECTION MANAGEMENT
═══════════════════════════════════════════════════════════ */

async function loadHeroSection() {
  const { data } = await window.sb.from("site_content").select("*").eq("section", "hero").single();
  if (!data) return;
  const c = data.content || {};
  setVal("heroHeading",      c.heading      || "Keep Your|Rooms Ready|Without Chasing Supplies");
  setVal("heroHighlight",    c.highlight    || "Without Chasing Supplies");
  setVal("heroDescription",  c.description  || "");
  setVal("heroBtnPrimary",   c.btnPrimary   || "Shop Catalog");
  setVal("heroBtnSecondary", c.btnSecondary || "Request Business Pricing");
  setVal("heroBannerUrl",    c.bannerUrl    || "assets/img/banner1.jpg");
  const img = document.getElementById("heroBannerImg");
  if (img && c.bannerUrl) img.src = c.bannerUrl;
}

async function saveHeroSection() {
  const msg = document.getElementById("heroSaveMsg");
  msg.style.color = "#888"; msg.textContent = "Saving…";

  const content = {
    heading:      document.getElementById("heroHeading").value.trim(),
    highlight:    document.getElementById("heroHighlight").value.trim(),
    description:  document.getElementById("heroDescription").value.trim(),
    btnPrimary:   document.getElementById("heroBtnPrimary").value.trim(),
    btnSecondary: document.getElementById("heroBtnSecondary").value.trim(),
    bannerUrl:    document.getElementById("heroBannerUrl").value.trim(),
  };

  const { error } = await window.sb.from("site_content").upsert(
    { section: "hero", content },
    { onConflict: "section" }
  );

  if (error) {
    msg.style.color = "#ef4444"; msg.textContent = "Error: " + error.message;
  } else {
    msg.style.color = "#22c55e"; msg.textContent = "✓ Hero section saved!";
    showToast("Hero section updated");
    setTimeout(() => { msg.textContent = ""; }, 3000);
  }
}

function previewHeroBanner(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("heroBannerImg").src = e.target.result;
    document.getElementById("heroBannerUrl").value = file.name;
    showToast("Image previewed — save to apply");
  };
  reader.readAsDataURL(file);
}

/* ═══════════════════════════════════════════════════════════
   ABOUT SECTION MANAGEMENT
═══════════════════════════════════════════════════════════ */

const _defaultAboutFeatures = [
  { icon: "assets/icons/au1.svg", title: "Everyday Essentials",      desc: "Quality products for hospitality, rentals, cleaning teams, restaurants, and facilities." },
  { icon: "assets/icons/au2.svg", title: "Simple Business Ordering", desc: "Everyday essentials and simple ordering support for repeat buyers." },
  { icon: "assets/icons/au3.svg", title: "Reorder Made Easy",        desc: "Set reorder reminders or recurring schedules with approval before processing." },
];

let _aboutFeatures = JSON.parse(JSON.stringify(_defaultAboutFeatures));

async function loadAboutSection() {
  const { data } = await window.sb.from("site_content").select("*").eq("section", "about").single();
  if (data) {
    const c = data.content || {};
    setVal("aboutTag",       c.tag       || "ABOUT US");
    setVal("aboutTitle",     c.title     || "We Help Operators Stay Ready");
    setVal("aboutP1",        c.p1        || "");
    setVal("aboutP2",        c.p2        || "");
    setVal("aboutP3",        c.p3        || "");
    setVal("aboutBannerUrl", c.bannerUrl || "assets/img/banner3.jpg");
    const img = document.getElementById("aboutBannerImg");
    if (img && c.bannerUrl) img.src = c.bannerUrl;
    if (c.features) _aboutFeatures = c.features;
  }
  renderAboutFeatures();
}

function renderAboutFeatures() {
  const container = document.getElementById("aboutFeatures");
  if (!container) return;
  container.innerHTML = _aboutFeatures.map((f, i) => `
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center;background:#f9fafb;border-radius:8px;padding:12px 14px;">
      <input class="a-input" placeholder="Feature title" value="${escHtml(f.title)}"
        oninput="_aboutFeatures[${i}].title=this.value" style="margin:0">
      <input class="a-input" placeholder="Short description" value="${escHtml(f.desc)}"
        oninput="_aboutFeatures[${i}].desc=this.value" style="margin:0">
      <button onclick="_aboutFeatures.splice(${i},1);renderAboutFeatures()"
        style="background:#fee2e2;color:#ef4444;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:13px;">✕</button>
    </div>
  `).join("") + `
    <button onclick="_aboutFeatures.push({icon:'assets/icons/au1.svg',title:'',desc:''});renderAboutFeatures()"
      style="margin-top:4px;padding:8px 16px;background:#f0f7ff;color:#1a4a8a;border:1.5px dashed #1a4a8a;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">+ Add Feature</button>
  `;
}

async function saveAboutSection() {
  const msg = document.getElementById("aboutSaveMsg");
  msg.style.color = "#888"; msg.textContent = "Saving…";

  const content = {
    tag:       document.getElementById("aboutTag").value.trim(),
    title:     document.getElementById("aboutTitle").value.trim(),
    p1:        document.getElementById("aboutP1").value.trim(),
    p2:        document.getElementById("aboutP2").value.trim(),
    p3:        document.getElementById("aboutP3").value.trim(),
    bannerUrl: document.getElementById("aboutBannerUrl").value.trim(),
    features:  _aboutFeatures,
  };

  const { error } = await window.sb.from("site_content").upsert(
    { section: "about", content },
    { onConflict: "section" }
  );

  if (error) {
    msg.style.color = "#ef4444"; msg.textContent = "Error: " + error.message;
  } else {
    msg.style.color = "#22c55e"; msg.textContent = "✓ About section saved!";
    showToast("About section updated");
    setTimeout(() => { msg.textContent = ""; }, 3000);
  }
}

function previewAboutBanner(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("aboutBannerImg").src = e.target.result;
    document.getElementById("aboutBannerUrl").value = file.name;
    showToast("Image previewed — save to apply");
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   SUB-DISTRIBUTORS TAB
============================================================ */

async function renderSubDistributorsTab() {
  await Promise.all([loadSdStats(), loadSdTable(), loadEmpTable()]);
}

async function loadSdStats() {
  if (!window.sb) return;
  try {
    const [totalRes, activeRes, referralsRes] = await Promise.all([
      window.sb.from('sub_distributors').select('*', { count: 'exact', head: true }),
      window.sb.from('sub_distributors').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      window.sb.from('order_referrals').select('commission_amount'),
    ]);

    const total    = totalRes.count   || 0;
    const active   = activeRes.count  || 0;
    const referrals = referralsRes.data || [];
    const revenue   = referrals.reduce((s, r) => s + (parseFloat(r.commission_amount) || 0), 0);

    setText('sd-stat-total',   total);
    setText('sd-stat-active',  active);
    setText('sd-stat-orders',  referrals.length);
    setText('sd-stat-revenue', '$' + revenue.toFixed(2));
  } catch(e) {
    console.error('loadSdStats error:', e);
  }
}

async function loadSdTable() {
  const tbody = document.getElementById('sd-table-body');
  if (!tbody || !window.sb) return;
  tbody.innerHTML = '<tr><td colspan="9" class="a-empty">Loading…</td></tr>';

  const { data: sds, error } = await window.sb
    .from('sub_distributors')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !sds || !sds.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="a-empty">No sub-distributors yet.</td></tr>';
    return;
  }

  // Fetch stats per sub-distributor
  const ids = sds.map(s => s.id);
  const [{ data: links }, { data: referrals }] = await Promise.all([
    window.sb.from('customer_sub_distributor_links').select('sub_distributor_id').in('sub_distributor_id', ids),
    window.sb.from('order_referrals').select('sub_distributor_id,commission_amount,orders(total)').in('sub_distributor_id', ids),
  ]);

  const customerCount = {};
  (links || []).forEach(l => { customerCount[l.sub_distributor_id] = (customerCount[l.sub_distributor_id] || 0) + 1; });
  const orderCount = {};
  const revenueMap = {};
  (referrals || []).forEach(r => {
    orderCount[r.sub_distributor_id] = (orderCount[r.sub_distributor_id] || 0) + 1;
    revenueMap[r.sub_distributor_id] = (revenueMap[r.sub_distributor_id] || 0) + (parseFloat(r.orders && r.orders.total) || 0);
  });

  tbody.innerHTML = sds.map(sd => {
    const orders  = orderCount[sd.id] || 0;
    const rev     = revenueMap[sd.id] || 0;
    const custCnt = customerCount[sd.id] || 0;
    const badge   = sd.status === 'active'
      ? '<span class="a-badge a-badge-green">Active</span>'
      : '<span class="a-badge a-badge-gray">Inactive</span>';
    return `<tr>
      <td><strong>${esc(sd.name)}</strong><br><span style="font-size:11px;color:#8a9ab0">${esc(sd.email||'')}</span></td>
      <td>${esc(sd.contact_person||'—')}</td>
      <td><code style="background:#f0f3f9;padding:2px 7px;border-radius:5px;font-size:12px;">${esc(sd.referral_code)}</code></td>
      <td>${sd.commission_pct}%</td>
      <td>${custCnt}</td>
      <td>${orders}</td>
      <td>$${rev.toFixed(2)}</td>
      <td>${badge}</td>
      <td>
        <button class="a-icon-btn" title="Edit" onclick='editSd(${JSON.stringify(JSON.stringify(sd))})'>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="a-icon-btn" title="Delete" onclick="deleteSd('${sd.id}','${esc(sd.name)}')" style="color:#ef4444;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');

  window._sdTableData = sds;
}

async function loadEmpTable() {
  const tbody = document.getElementById('emp-table-body');
  if (!tbody || !window.sb) return;
  tbody.innerHTML = '<tr><td colspan="7" class="a-empty">Loading…</td></tr>';

  const { data: emps } = await window.sb
    .from('sub_distributor_employees')
    .select('*, sub_distributors(name)')
    .order('created_at', { ascending: false });

  if (!emps || !emps.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="a-empty">No employees yet.</td></tr>';
    return;
  }

  const empIds = emps.map(e => e.id);
  const { data: referrals } = await window.sb
    .from('order_referrals')
    .select('employee_id,orders(total)')
    .in('employee_id', empIds);

  const orderCount = {};
  const revenueMap = {};
  (referrals || []).forEach(r => {
    if (!r.employee_id) return;
    orderCount[r.employee_id] = (orderCount[r.employee_id] || 0) + 1;
    revenueMap[r.employee_id] = (revenueMap[r.employee_id] || 0) + (parseFloat(r.orders && r.orders.total) || 0);
  });

  tbody.innerHTML = emps.map(emp => {
    const badge = emp.status === 'active'
      ? '<span class="a-badge a-badge-green">Active</span>'
      : '<span class="a-badge a-badge-gray">Inactive</span>';
    return `<tr>
      <td><strong>${esc(emp.name)}</strong><br><span style="font-size:11px;color:#8a9ab0">${esc(emp.email||'')}</span></td>
      <td>${esc(emp.sub_distributors ? emp.sub_distributors.name : '—')}</td>
      <td><code style="background:#f0f3f9;padding:2px 7px;border-radius:5px;font-size:12px;">${esc(emp.referral_code)}</code></td>
      <td>${orderCount[emp.id] || 0}</td>
      <td>$${(revenueMap[emp.id] || 0).toFixed(2)}</td>
      <td>${badge}</td>
      <td>
        <button class="a-icon-btn" title="Edit" onclick='editEmp(${JSON.stringify(JSON.stringify(emp))})'>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="a-icon-btn" title="Delete" onclick="deleteEmp('${emp.id}','${esc(emp.name)}')" style="color:#ef4444;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function filterSdTable(q) {
  const rows = document.querySelectorAll('#sd-table-body tr');
  q = q.toLowerCase();
  rows.forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ── Sub-Distributor Modal ─────────────────────────────────────

function closeSdModal() {
  var m = document.getElementById('sdModal');
  if (m) m.style.display = 'none';
  var loginBtn = document.getElementById('btnSdCreateLogin');
  if (loginBtn) loginBtn.style.display = 'none';
}

function openSdModal(sd) {
  document.getElementById('sdModalTitle').textContent = sd ? 'Edit Sub-Distributor' : 'Add Sub-Distributor';
  document.getElementById('sdEditId').value   = sd ? sd.id : '';
  document.getElementById('sdName').value     = sd ? (sd.name || '') : '';
  document.getElementById('sdContact').value  = sd ? (sd.contact_person || '') : '';
  document.getElementById('sdEmail').value    = sd ? (sd.email || '') : '';
  document.getElementById('sdPhone').value    = sd ? (sd.phone || '') : '';
  document.getElementById('sdCode').value     = sd ? (sd.referral_code || '') : '';
  document.getElementById('sdCommission').value = sd ? (sd.commission_pct || '0') : '0';
  document.getElementById('sdStatus').value   = sd ? (sd.status || 'active') : 'active';
  document.getElementById('sdNotes').value    = sd ? (sd.notes || '') : '';
  document.getElementById('sdModalError').style.display = 'none';
  var loginBtn = document.getElementById('btnSdCreateLogin');
  if (loginBtn) loginBtn.style.display = sd ? 'inline-flex' : 'none';
  document.getElementById('sdModal').style.display = 'flex';
}

function editSd(jsonStr) {
  try { openSdModal(JSON.parse(jsonStr)); } catch(e) { console.error(e); }
}

function generateSdCode() {
  var name = document.getElementById('sdName').value.trim();
  var prefix = name ? name.replace(/\s+/g,'').toUpperCase().slice(0,4) : 'SD';
  document.getElementById('sdCode').value = prefix + Math.floor(1000 + Math.random() * 9000);
}

async function createSdLogin() {
  var id    = document.getElementById('sdEditId').value;
  var name  = document.getElementById('sdName').value.trim();
  var email = document.getElementById('sdEmail').value.trim();
  var errEl = document.getElementById('sdModalError');
  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }

  if (!email) return showErr('Email is required to create a login.');
  var password = prompt('Set a temporary password for ' + email + ':');
  if (!password) return;
  if (password.length < 8) return showErr('Password must be at least 8 characters.');

  try {
    var res = await fetch('https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/create-subdist-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.sb.supabaseKey },
      body: JSON.stringify({ email, password, name, sub_distributor_id: id }),
    });
    var data = await res.json();
    if (data.error) return showErr('Error: ' + data.error);
    errEl.style.display = 'none';
    showToast('Login created for ' + email + '. They can now sign in to the admin portal.');
  } catch(e) {
    showErr('Failed to create login: ' + e.message);
  }
}

async function saveSdDistributor() {
  var id         = document.getElementById('sdEditId').value;
  var name       = document.getElementById('sdName').value.trim();
  var code       = document.getElementById('sdCode').value.trim().toUpperCase();
  var commission = parseFloat(document.getElementById('sdCommission').value) || 0;
  var errEl      = document.getElementById('sdModalError');

  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  if (!name) return showErr('Name is required.');
  if (!code) return showErr('Referral code is required.');

  var payload = {
    name: name,
    contact_person: document.getElementById('sdContact').value.trim(),
    email:          document.getElementById('sdEmail').value.trim(),
    phone:          document.getElementById('sdPhone').value.trim(),
    referral_code:  code,
    commission_pct: commission,
    status:         document.getElementById('sdStatus').value,
    notes:          document.getElementById('sdNotes').value.trim(),
  };

  var result;
  if (id) {
    result = await window.sb.from('sub_distributors').update(payload).eq('id', id);
  } else {
    result = await window.sb.from('sub_distributors').insert(payload);
  }
  if (result.error) return showErr(result.error.code === '23505' ? 'Referral code already exists.' : result.error.message);

  closeSdModal();
  showToast(id ? 'Sub-distributor updated.' : 'Sub-distributor added.');
  loadSdTable();
  loadSdStats();
}

async function deleteSd(id, name) {
  if (!confirm('Delete sub-distributor "' + name + '"?')) return;
  var result = await window.sb.from('sub_distributors').delete().eq('id', id);
  if (result.error) return showToast('Error: ' + result.error.message, 'error');
  showToast('Sub-distributor deleted.');
  loadSdTable();
  loadSdStats();
}

// ── Employee Modal ────────────────────────────────────────────

function closeEmpModal() {
  var m = document.getElementById('empModalDynamic');
  if (m) m.remove();
}

async function openEmpModal(emp) {
  closeEmpModal();
  var sdsRes = await window.sb.from('sub_distributors').select('id,name').eq('status','active').order('name');
  var sdOptions = '<option value="">Select parent sub-distributor…</option>';
  (sdsRes.data||[]).forEach(function(s) {
    sdOptions += '<option value="' + s.id + '"' + (emp && emp.sub_distributor_id === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  var overlay = document.createElement('div');
  overlay.id = 'empModalDynamic';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  overlay.innerHTML = '<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.3);">' +
    '<div style="padding:22px 28px 16px;border-bottom:1px solid #f0f4fa;display:flex;justify-content:space-between;align-items:center;">' +
      '<h3 style="margin:0;font-size:17px;font-weight:800;color:#0d1f38;">' + (emp ? 'Edit Employee' : 'Add Employee / Referrer') + '</h3>' +
      '<button onclick="closeEmpModal()" style="border:none;background:#f3f6fb;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;color:#666;">✕</button>' +
    '</div>' +
    '<div style="padding:22px 28px;">' +
      '<input type="hidden" id="empEditId" value="' + (emp ? emp.id : '') + '">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Name *</label><input id="empName" type="text" placeholder="Jane Smith" value="' + (emp ? esc(emp.name) : '') + '" style="width:100%;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;box-sizing:border-box;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Email</label><input id="empEmail" type="email" placeholder="jane@abc.com" value="' + (emp ? esc(emp.email||'') : '') + '" style="width:100%;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;box-sizing:border-box;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Phone</label><input id="empPhone" type="text" placeholder="(555) 000-0000" value="' + (emp ? esc(emp.phone||'') : '') + '" style="width:100%;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;box-sizing:border-box;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Referral Code *</label><div style="display:flex;gap:8px;"><input id="empCode" type="text" placeholder="JANE2024" value="' + (emp ? esc(emp.referral_code) : '') + '" style="flex:1;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;text-transform:uppercase;box-sizing:border-box;"><button type="button" onclick="generateEmpCode()" style="padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;background:#f8fafd;cursor:pointer;font-size:12px;white-space:nowrap;">Auto-Gen</button></div></div>' +
        '<div style="grid-column:span 2;"><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Parent Sub-Distributor *</label><select id="empParent" style="width:100%;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;box-sizing:border-box;">' + sdOptions + '</select></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Status</label><select id="empStatus" style="width:100%;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;box-sizing:border-box;"><option value="active"' + (emp && emp.status==='active'?' selected':'') + '>Active</option><option value="inactive"' + (emp && emp.status==='inactive'?' selected':'') + '>Inactive</option></select></div>' +
      '</div>' +
      '<div id="empModalError" style="display:none;color:#ef4444;font-size:13px;margin-top:12px;padding:10px 14px;background:#fff0f0;border-radius:8px;border:1px solid #fecaca;"></div>' +
    '</div>' +
    '<div style="padding:16px 28px;border-top:1px solid #f0f4fa;display:flex;justify-content:flex-end;gap:10px;">' +
      '<button onclick="closeEmpModal()" style="padding:10px 20px;border:1.5px solid #e4e9f2;border-radius:9px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;">Cancel</button>' +
      '<button onclick="saveEmployee()" style="padding:10px 20px;border:none;border-radius:9px;background:#f58220;color:#fff;cursor:pointer;font-size:13px;font-weight:700;">Save Employee</button>' +
    '</div>' +
  '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeEmpModal(); });
  document.body.appendChild(overlay);
}

function editEmp(jsonStr) {
  try { openEmpModal(JSON.parse(jsonStr)); } catch(e) { console.error(e); }
}

function generateEmpCode() {
  var name = document.getElementById('empName').value.trim();
  var prefix = name ? name.replace(/\s+/g,'').toUpperCase().slice(0,4) : 'EMP';
  document.getElementById('empCode').value = prefix + Math.floor(1000 + Math.random() * 9000);
}

async function saveEmployee() {
  var id     = document.getElementById('empEditId').value;
  var name   = document.getElementById('empName').value.trim();
  var parent = document.getElementById('empParent').value;
  var code   = document.getElementById('empCode').value.trim().toUpperCase();
  var errEl  = document.getElementById('empModalError');

  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  if (!name)   return showErr('Name is required.');
  if (!parent) return showErr('Please select a parent sub-distributor.');
  if (!code)   return showErr('Referral code is required.');

  var payload = {
    name: name,
    sub_distributor_id: parent,
    email:  document.getElementById('empEmail').value.trim(),
    phone:  document.getElementById('empPhone').value.trim(),
    referral_code: code,
    status: document.getElementById('empStatus').value,
  };

  var result;
  if (id) {
    result = await window.sb.from('sub_distributor_employees').update(payload).eq('id', id);
  } else {
    result = await window.sb.from('sub_distributor_employees').insert(payload);
  }
  if (result.error) return showErr(result.error.code === '23505' ? 'Referral code already exists.' : result.error.message);

  closeEmpModal();
  showToast(id ? 'Employee updated.' : 'Employee added.');
  loadEmpTable();
}

async function deleteEmp(id, name) {
  if (!confirm('Delete employee "' + name + '"?')) return;
  var result = await window.sb.from('sub_distributor_employees').delete().eq('id', id);
  if (result.error) return showToast('Error: ' + result.error.message, 'error');
  showToast('Employee deleted.');
  loadEmpTable();
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Notifications ──────────────────────────────────────────── */

const NOTIF_STORAGE_KEY = "rrs_admin_read_notifs";

function getReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) || "[]")); } catch { return new Set(); }
}
function markIdRead(id) {
  const ids = getReadIds(); ids.add(id);
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify([...ids]));
}

let notifPanelOpen = false;

function toggleNotifPanel() {
  const panel = document.getElementById("notifPanel");
  notifPanelOpen = !notifPanelOpen;
  panel.style.display = notifPanelOpen ? "block" : "none";
  if (notifPanelOpen) loadNotifications();
}

// Close panel when clicking outside
document.addEventListener("click", e => {
  if (notifPanelOpen && !e.target.closest("#notifBtn") && !e.target.closest("#notifPanel")) {
    document.getElementById("notifPanel").style.display = "none";
    notifPanelOpen = false;
  }
});

async function loadNotifications() {
  if (!window.sb) return;
  const list = document.getElementById("notifList");
  list.innerHTML = `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px">Loading…</div>`;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // last 7 days

  const [ordersRes, quotesRes] = await Promise.all([
    window.sb.from("orders").select("id,created_at,status,shipping_name,total").gte("created_at", since).order("created_at", { ascending: false }).limit(10),
    window.sb.from("quote_requests").select("id,created_at,status,business_name,contact_name").gte("created_at", since).order("created_at", { ascending: false }).limit(10),
  ]);

  const readIds = getReadIds();

  const items = [
    ...(ordersRes.data || []).map(o => ({
      id: "order-" + o.id,
      type: "order",
      title: `New order from ${o.shipping_name || "customer"}`,
      sub: `$${Number(o.total||0).toFixed(2)} · ${o.status}`,
      time: o.created_at,
      action: () => { switchTab("orders"); toggleNotifPanel(); },
    })),
    ...(quotesRes.data || []).map(q => ({
      id: "quote-" + q.id,
      type: "quote",
      title: `Volume quote from ${q.business_name}`,
      sub: `${q.contact_name} · ${q.status}`,
      time: q.created_at,
      action: () => { switchTab("quote-requests"); toggleNotifPanel(); },
    })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time));

  const unread = items.filter(i => !readIds.has(i.id));
  updateNotifBadge(unread.length);

  if (!items.length) {
    list.innerHTML = `<div style="padding:28px;text-align:center;color:#94a3b8;font-size:13px">No activity in the last 7 days.</div>`;
    return;
  }

  const icons = {
    order: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
    quote: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>`,
  };

  list.innerHTML = items.map(item => {
    const isUnread = !readIds.has(item.id);
    const ago = timeAgo(item.time);
    return `<div onclick="handleNotifClick('${item.id}')" style="padding:12px 18px;border-bottom:1px solid #f8fafc;cursor:pointer;display:flex;gap:12px;align-items:flex-start;background:${isUnread ? "#fffbf7" : "#fff"};transition:.15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${isUnread ? "#fffbf7" : "#fff"}'">
      <div style="width:30px;height:30px;border-radius:8px;background:${item.type==="order"?"#eff6ff":"#fff7f0"};color:${item.type==="order"?"#3b82f6":"#e8621a"};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
        ${icons[item.type]}
      </div>
      <div style="flex:1;min-width:0">
        <p style="margin:0 0 2px;font-size:13px;font-weight:${isUnread?"700":"500"};color:#1e293b;line-height:1.3">${esc(item.title)}</p>
        <p style="margin:0;font-size:11px;color:#64748b">${esc(item.sub)}</p>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:10px;color:#94a3b8">${ago}</span>
        ${isUnread ? `<span style="width:7px;height:7px;background:#e8621a;border-radius:50%;flex-shrink:0"></span>` : ""}
      </div>
    </div>`;
  }).join("");
}

function handleNotifClick(id) {
  markIdRead(id);
  // find item and trigger action
  document.getElementById("notifPanel").style.display = "none";
  notifPanelOpen = false;
  if (id.startsWith("order-")) switchTab("orders");
  else if (id.startsWith("quote-")) switchTab("quote-requests");
  // refresh badge
  updateNotifBadgeFromStorage();
}

function markAllRead() {
  const list = document.getElementById("notifList");
  list.querySelectorAll("[onclick^='handleNotifClick']").forEach(el => {
    const match = el.getAttribute("onclick").match(/'([^']+)'/);
    if (match) markIdRead(match[1]);
  });
  loadNotifications();
}

function updateNotifBadge(count) {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  badge.style.display = count > 0 ? "flex" : "none";
  badge.textContent = count > 9 ? "9+" : count;
}

async function updateNotifBadgeFromStorage() {
  if (!window.sb) return;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [o, q] = await Promise.all([
    window.sb.from("orders").select("id,created_at").gte("created_at", since),
    window.sb.from("quote_requests").select("id,created_at").gte("created_at", since),
  ]);
  const readIds = getReadIds();
  const total = [...(o.data||[]).map(x => "order-"+x.id), ...(q.data||[]).map(x => "quote-"+x.id)]
    .filter(id => !readIds.has(id)).length;
  updateNotifBadge(total);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── Quote Requests ─────────────────────────────────────────── */

let allQuoteRequests = [];
let currentQuoteId   = null;
let _quoteFiltersWired = false;

async function renderQuoteRequestsTable() {
  if (!window.sb) return;
  const tbody  = document.getElementById("quoteRequestsTableBody");
  const search = (document.getElementById("quoteSearch")?.value || "").toLowerCase();
  const status = document.getElementById("quoteStatusFilter")?.value || "";

  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading…</td></tr>`;

  const { data, error } = await window.sb
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="a-empty">${error ? "Error loading requests." : "No quote requests yet."}</td></tr>`;
    return;
  }

  allQuoteRequests = data;

  let rows = data.filter(r => {
    const hay = `${r.business_name} ${r.contact_name} ${r.email}`.toLowerCase();
    return (!search || hay.includes(search)) && (!status || r.status === status);
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="a-empty">No matching requests.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const date     = new Date(r.created_at).toLocaleDateString();
    const items    = r.requested_items;
    const itemsStr = items?.length
      ? items.map(i => `${i.name} ×${i.quantity}`).join(", ")
      : "<em style='color:#94a3b8'>No products listed</em>";
    const badge = {
      new:      "background:#dbeafe;color:#1d4ed8",
      reviewed: "background:#fef3c7;color:#92400e",
      quoted:   "background:#d1fae5;color:#065f46",
      closed:   "background:#f1f5f9;color:#475569",
    }[r.status] || "";

    return `<tr>
      <td>${date}</td>
      <td><strong>${esc(r.business_name)}</strong><br><small>${esc(r.customer_type||"")}</small></td>
      <td>${esc(r.contact_name)}</td>
      <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
      <td style="max-width:220px;font-size:12px;line-height:1.4">${itemsStr}</td>
      <td><span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;${badge}">${r.status||"new"}</span></td>
      <td><button class="a-btn a-btn-sm" onclick="openQuoteDetail('${r.id}')">View</button></td>
    </tr>`;
  }).join("");

  // Wire search/filter exactly once. This function is called on every tab
  // switch, every "Save Status", and every "Send Quote" -- with
  // { once: true } it looked safe per-call, but the search box and filter
  // are static elements that live for the whole admin session, so every
  // call stacked ANOTHER listener onto the same node forever. After enough
  // renders in one session (completely normal admin usage), typing one
  // character into search fired dozens of stacked listeners at once, each
  // kicking off its own full re-fetch + re-render + re-stack -- the
  // panel-wide freezing reported live.
  if (!_quoteFiltersWired) {
    document.getElementById("quoteSearch")?.addEventListener("input", renderQuoteRequestsTable);
    document.getElementById("quoteStatusFilter")?.addEventListener("change", renderQuoteRequestsTable);
    _quoteFiltersWired = true;
  }
}

function openQuoteDetail(id) {
  const r = allQuoteRequests.find(x => x.id === id);
  if (!r) return;
  currentQuoteId = id;

  const statusColors = {
    new:      { bg:"#eff6ff", color:"#1d4ed8", dot:"#3b82f6" },
    reviewed: { bg:"#fefce8", color:"#854d0e", dot:"#eab308" },
    quoted:   { bg:"#f0fdf4", color:"#166534", dot:"#22c55e" },
    closed:   { bg:"#f8fafc", color:"#475569", dot:"#94a3b8" },
  };
  const sc = statusColors[r.status||"new"] || statusColors.new;

  // Update modal title with business name
  const titleEl = document.getElementById("quoteDetailTitle");
  if (titleEl) titleEl.textContent = r.business_name || "Quote Request";

  const pdfBtn = document.getElementById("viewQuotePdfBtn");
  if (pdfBtn) pdfBtn.style.display = r.quote_number ? "flex" : "none";

  // Only a priced, sent quote can be invoiced. Prefer the stored
  // grand_total, but older quotes (sent before the edge function was
  // fixed to save it) only have quote_items -- fall back to summing
  // those so this doesn't silently hide the button on real quotes.
  const invoiceBtn = document.getElementById("sendInvoiceBtn");
  const invoiceable = r.status === "quoted" && quoteItemsTotal(r) > 0;
  if (invoiceBtn) invoiceBtn.style.display = invoiceable ? "flex" : "none";

  const items = r.requested_items;
  const itemsHtml = items?.length
    ? `<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-top:8px">
        <div style="display:grid;grid-template-columns:1fr 90px;background:#f8fafc;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b">
          <span>Product</span><span style="text-align:center">Qty (cases)</span>
        </div>
        ${items.map((i, idx) => `
          <div style="display:grid;grid-template-columns:1fr 90px;padding:10px 14px;border-top:1px solid #f1f5f9;background:${idx%2===0?'#fff':'#fafbfc'};font-size:13px;align-items:center">
            <span style="color:#1e293b;font-weight:500">${esc(i.name)}</span>
            <span style="text-align:center;font-weight:700;color:#0d2c50">${i.quantity}</span>
          </div>`).join("")}
      </div>`
    : `<div style="padding:14px;background:#f8fafc;border-radius:10px;font-size:13px;color:#94a3b8;text-align:center;margin-top:8px">No specific products listed</div>`;

  const fileHtml = r.file_url
    ? `<a href="${r.file_url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:8px 14px;background:#fff7f0;border:1px solid #fed7aa;border-radius:8px;color:#e8621a;font-size:13px;font-weight:600;text-decoration:none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        ${esc(r.file_name || "View attached file")}
      </a>`
    : "";

  document.getElementById("quoteDetailBody").innerHTML = `
    <!-- Status pill -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:10px 14px;background:${sc.bg};border-radius:10px">
      <span style="width:8px;height:8px;border-radius:50%;background:${sc.dot};flex-shrink:0"></span>
      <span style="font-size:12px;font-weight:700;color:${sc.color};text-transform:uppercase;letter-spacing:.06em">${r.status||"new"}</span>
      <span style="margin-left:auto;font-size:11px;color:#94a3b8">Submitted ${new Date(r.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
    </div>

    <!-- Contact info grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px">
      ${[
        ["Business", esc(r.business_name)],
        ["Customer Type", esc(r.customer_type||"—")],
        ["Contact Name", esc(r.contact_name)],
        ["Email", `<a href="mailto:${esc(r.email)}" style="color:#e8621a;text-decoration:none">${esc(r.email)}</a>`],
      ].map(([label, val]) => `
        <div style="background:#fff;padding:12px 16px">
          <p style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 3px">${label}</p>
          <p style="font-size:13px;font-weight:600;color:#1e293b;margin:0">${val}</p>
        </div>`).join("")}
    </div>

    <!-- Requested products -->
    <div style="margin-bottom:20px">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin:0 0 4px">Requested Products</p>
      ${itemsHtml}
    </div>

    ${r.notes ? `
    <!-- Notes -->
    <div style="margin-bottom:16px">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;margin:0 0 6px">Notes</p>
      <p style="font-size:13px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0;line-height:1.6">${esc(r.notes)}</p>
    </div>` : ""}

    ${fileHtml ? `<div style="margin-bottom:8px">${fileHtml}</div>` : ""}
  `;

  document.getElementById("quoteStatusSelect").value = r.status || "new";
  document.getElementById("quoteDetailModal").style.display = "flex";
}

/* ── Quote Composer ─────────────────────────────────────────── */

const SEND_QUOTE_URL = "https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/send-quote";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpcHJrdmx5b3V3ZnpqbGFpYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjA0ODUsImV4cCI6MjA5NjczNjQ4NX0.y0K_i9oN9DUNx_xIxUDWbvyXsubYIKpJR5un1yLtvvY";

// Case-quantity tier pricing is already computed and stored per product
// (price_tier1/2/3, cost x category markup -- see admin.js's product
// editor). This reuses that same data so staff no longer have to look up
// and hand-type a unit price for every line of every quote, which was
// exactly the kind of manual step that caused this week's pricing bugs.
const QUOTE_NAME_STOPWORDS = /\s*[–—-]\s*wholesale pricing.*$/i;
function normalizeProductName(s) {
  return String(s || "")
    .replace(QUOTE_NAME_STOPWORDS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
// Some quotes were sent before the send-quote edge function was fixed to
// save grand_total, so that column is null on them even though the quote
// itself is real and priced. quote_items always has the numbers needed to
// invoice regardless, so derive the total from there instead of trusting
// grand_total to be present.
function quoteItemsTotal(r) {
  if (r.grand_total > 0) return Number(r.grand_total);
  return (r.quote_items || []).reduce((sum, i) => sum + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0);
}

function tierPriceForQty(product, qty) {
  const q = Number(qty) || 1;
  const t1 = Number(product.price_tier1) || 0;
  const t2 = Number(product.price_tier2) || 0;
  const t3 = Number(product.price_tier3) || 0;
  if (q >= 30) return t3 || t2 || t1;
  if (q >= 6)  return t2 || t1;
  return t1;
}

let _quoteComposerProducts = [];

async function openQuoteComposer() {
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return;

  // Default valid until = 10 days from now. Prices are moving with fuel
  // costs right now, so every quote is only held for 10 days unless staff
  // deliberately override it for a specific case.
  const d = new Date(); d.setDate(d.getDate() + 10);
  document.getElementById("quoteValidUntil").value = d.toISOString().slice(0, 10);
  document.getElementById("quoteMessage").value = `Dear ${r.contact_name},\n\nThank you for your interest in Room Ready Supply. Please find your custom volume pricing quote below. We look forward to serving your hospitality needs.\n\nFeel free to contact us with any questions.`;

  const items = r.requested_items || [];
  const container = document.getElementById("quoteLineItems");

  if (!items.length) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No products listed — add them manually below.</div>`;
    document.getElementById("quoteComposerModal").style.display = "flex";
    return;
  }

  container.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">Loading catalog pricing…</div>`;
  document.getElementById("quoteComposerModal").style.display = "flex";

  const { data: products } = await window.sb
    .from("products")
    .select("name, price_tier1, price_tier2, price_tier3")
    .eq("is_active", true);
  _quoteComposerProducts = products || [];

  container.innerHTML = items.map((item, idx) => {
    const match = _quoteComposerProducts.find(p => normalizeProductName(p.name) === normalizeProductName(item.name));
    const autoPrice = match ? tierPriceForQty(match, item.quantity) : null;
    return `
      <div style="display:grid;grid-template-columns:1fr 100px 120px 100px;gap:10px;padding:10px 14px;border-top:1px solid #f1f5f9;align-items:center;background:${idx%2===0?"#fff":"#fafbfc"}">
        <span style="font-size:13px;font-weight:500;color:#1e293b">${esc(item.name)}${!match ? `<br><small style="color:#b45309;font-weight:600">Not in catalog — enter price manually</small>` : ""}</span>
        <div style="text-align:center">
          <input type="number" min="1" value="${item.quantity}" data-idx="${idx}" class="ql-qty"
            style="width:70px;padding:5px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px;text-align:center"
            oninput="onQuoteQtyChange(${idx})">
        </div>
        <div style="text-align:right">
          <input type="number" min="0" step="0.01" value="${autoPrice ? autoPrice.toFixed(2) : ""}" placeholder="0.00"
            data-idx="${idx}" data-auto-price="${autoPrice != null ? autoPrice.toFixed(2) : ""}" class="ql-price"
            style="width:100px;padding:5px 8px;border:1.5px solid ${autoPrice ? "#bbf7d0" : "#e2e8f0"};background:${autoPrice ? "#f0fdf4" : "#fff"};border-radius:7px;font-size:13px;text-align:right"
            oninput="onQuotePriceChange(${idx})" title="${autoPrice ? "Auto-filled from catalog tier pricing — edit to override" : ""}">
        </div>
        <div style="text-align:right;font-size:13px;font-weight:700;color:#0d2c50" id="ql-line-${idx}">—</div>
      </div>`;
  }).join("");

  recalcQuoteTotal();
}

// Quantity changed: if staff never touched the price (it still matches
// the last auto-filled value), recompute it for the new quantity -- e.g.
// crossing from 4 to 6 cases should move from tier 1 to tier 2 pricing
// automatically. A price staff have deliberately overridden is left alone.
function onQuoteQtyChange(idx) {
  const priceEl = document.querySelector(`.ql-price[data-idx="${idx}"]`);
  const qtyEl   = document.querySelector(`.ql-qty[data-idx="${idx}"]`);
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  const item = r?.requested_items?.[idx];
  if (priceEl && item) {
    const wasAuto = priceEl.value === priceEl.dataset.autoPrice;
    const match = _quoteComposerProducts.find(p => normalizeProductName(p.name) === normalizeProductName(item.name));
    if (match && wasAuto) {
      const newPrice = tierPriceForQty(match, qtyEl.value).toFixed(2);
      priceEl.value = newPrice;
      priceEl.dataset.autoPrice = newPrice;
    }
  }
  recalcQuoteTotal();
}

// Staff typed into the price field directly -- from now on this line is a
// manual override, so quantity changes must not silently overwrite it.
function onQuotePriceChange(idx) {
  const priceEl = document.querySelector(`.ql-price[data-idx="${idx}"]`);
  if (priceEl) {
    priceEl.dataset.autoPrice = "__overridden__";
    priceEl.style.borderColor = "#e2e8f0";
    priceEl.style.background = "#fff";
    priceEl.title = "";
  }
  recalcQuoteTotal();
}

function recalcQuoteTotal() {
  let total = 0;
  document.querySelectorAll(".ql-price").forEach((priceEl, idx) => {
    const qtyEl = document.querySelectorAll(".ql-qty")[idx];
    const price = parseFloat(priceEl.value) || 0;
    const qty   = parseInt(qtyEl?.value) || 0;
    const line  = price * qty;
    total += line;
    const lineEl = document.getElementById(`ql-line-${idx}`);
    if (lineEl) lineEl.textContent = line > 0 ? `$${line.toFixed(2)}` : "—";
  });
  const el = document.getElementById("quoteGrandTotal");
  if (el) el.textContent = `$${total.toFixed(2)}`;
}

function getComposerPayload() {
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return null;
  const items = [];
  const priceEls = document.querySelectorAll(".ql-price");
  const qtyEls   = document.querySelectorAll(".ql-qty");
  const names     = (r.requested_items || []).map(i => i.name);
  priceEls.forEach((el, idx) => {
    const price = parseFloat(el.value);
    const qty   = parseInt(qtyEls[idx]?.value) || 1;
    if (price > 0) {
      items.push({ name: names[idx] || `Item ${idx+1}`, quantity: qty, unit_price: price });
    }
  });
  return {
    quote_request_id: currentQuoteId,
    items,
    valid_until: document.getElementById("quoteValidUntil").value,
    message: document.getElementById("quoteMessage").value.trim(),
  };
}

async function previewQuote() {
  const payload = getComposerPayload();
  if (!payload) return;
  if (!payload.items.length) { alert("Please enter at least one unit price before previewing."); return; }

  const btn = document.querySelector("button[onclick='previewQuote()']");
  if (btn) { btn.textContent = "Loading…"; btn.disabled = true; }

  try {
    const res = await fetch(SEND_QUOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ ...payload, preview_only: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Preview failed");

    const frame = document.getElementById("quotePreviewFrame");
    const overlay = document.getElementById("quotePreviewOverlay");
    frame.srcdoc = data.html;
    overlay.style.display = "flex";
  } catch (err) {
    alert("Preview error: " + err.message);
  } finally {
    if (btn) { btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview Quote`; btn.disabled = false; }
  }
}

async function sendQuote() {
  const payload = getComposerPayload();
  if (!payload) return;
  if (!payload.items.length) { alert("Please enter at least one unit price before sending."); return; }
  if (!payload.valid_until) { alert("Please set a valid until date."); return; }

  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!confirm(`Send this quote to ${r?.email}?`)) return;

  await doSendQuote(payload);
}

async function sendQuoteFromPreview() {
  const payload = getComposerPayload();
  if (!payload) return;
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!confirm(`Send this quote to ${r?.email}?`)) return;
  document.getElementById("quotePreviewOverlay").style.display = "none";
  await doSendQuote(payload);
}

async function doSendQuote(payload) {
  const btn = document.getElementById("sendQuoteBtn");
  if (btn) { btn.textContent = "Sending…"; btn.disabled = true; }

  try {
    const res = await fetch(SEND_QUOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed");

    document.getElementById("quoteComposerModal").style.display = "none";
    document.getElementById("quoteDetailModal").style.display = "none";
    if (confirm(`✅ Quote ${data.quote_number} sent successfully!\n\nOpen it now to save a PDF copy?`)) {
      window.open(`/quote-view?id=${currentQuoteId}&print=1`, "_blank");
    }
    renderQuoteRequestsTable();
  } catch (err) {
    alert("Send error: " + err.message);
  } finally {
    if (btn) { btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Send to Customer`; btn.disabled = false; }
  }
}

// Converts an already-quoted request into a real order (payment_status
// "pending_invoice") plus a Stripe Payment Link, and emails the customer a
// one-click "Pay Invoice Now" link -- so she never has to visit the site or
// log in. See api/send-invoice.js for the full flow; api/stripe-webhook.js
// marks the order paid and sends the usual confirmation emails the moment
// she completes payment.
async function sendInvoiceForCurrentQuote() {
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return;

  if (!confirm(`Email an invoice + payment link for $${quoteItemsTotal(r).toFixed(2)} to ${r.email}?\n\nShe will be able to pay by card directly from the email, no site visit needed.`)) return;

  const btn = document.getElementById("sendInvoiceBtn");
  const original = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const res = await fetch("/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_request_id: currentQuoteId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed");

    alert(`✅ Invoice ${data.order_number} emailed to ${r.email}.\n\nPayment link:\n${data.payment_link}`);
    document.getElementById("quoteDetailModal").style.display = "none";
  } catch (err) {
    alert("Could not send the invoice: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function saveQuoteStatus() {
  const btn = document.querySelector('[onclick="saveQuoteStatus()"]');
  if (!currentQuoteId) { alert("No quote selected."); return; }
  if (!window.sb) { alert("Supabase not initialized."); return; }
  const status = document.getElementById("quoteStatusSelect").value;
  if (!status) { alert("Please select a status."); return; }

  if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }

  const { error } = await window.sb.from("quote_requests").update({ status }).eq("id", currentQuoteId);

  if (btn) { btn.textContent = "Save Status"; btn.disabled = false; }

  if (error) {
    alert("Error saving status: " + error.message);
    return;
  }

  // Update local cache so UI reflects new status without re-fetch
  const local = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (local) local.status = status;

  document.getElementById("quoteDetailModal").style.display = "none";
  renderQuoteRequestsTable();
}
