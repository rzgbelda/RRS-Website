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

  const { data: profile } = await window.sb.from("profiles").select("role, full_name").eq("id", session.user.id).single();
  const role = profile?.role;

  // Allow "admin" full access, "sub_distributor" limited access,
  // and "developer" the ticket board only
  if (role !== "admin" && role !== "sub_distributor" && role !== "developer" && role !== "marketing") {
    showLogin();
    showLoginError("Access denied. Admin privileges required.");
    return;
  }

  window._adminRole = role;
  window._adminUserId = session.user.id;
  window._adminUserEmail = session.user.email;
  applyUserPillDisplay(profile?.full_name, session.user.email);
  applyRoleRestrictions(role);
  showDashboard();
  switchTab(landingTabFor(role));
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

  const { data: profile } = await window.sb.from("profiles").select("role, full_name").eq("id", data.user.id).single();
  const role = profile?.role;
  if (role !== "admin" && role !== "sub_distributor" && role !== "developer" && role !== "marketing") {
    await window.sb.auth.signOut();
    showLoginError("This account does not have admin access.");
    return;
  }
  window._adminRole = role;
  window._adminUserId = data.user.id;
  window._adminUserEmail = data.user.email;
  applyUserPillDisplay(profile?.full_name, data.user.email);
  applyRoleRestrictions(role);
  showDashboard();
  switchTab(landingTabFor(role));
  if (role === "admin") setupSettings(data.user.id);
  bindSdButtons();
});

document.getElementById("adminLogout")?.addEventListener("click", async () => {
  await window.sb.auth.signOut();
  showLogin();
});

/* ── My Profile (display name) ────────────────────────────────── */

function applyUserPillDisplay(fullName, email) {
  const name = (fullName || "").trim() || email;
  document.getElementById("adminNameDisplay").textContent = name;
  const initial = ((fullName || "").trim()[0] || email[0] || "A").toUpperCase();
  const avatar = document.getElementById("userPillAvatar");
  if (avatar) avatar.textContent = initial;
}

function openMyProfileModal() {
  document.getElementById("myProfileName").value = document.getElementById("adminNameDisplay").textContent === window._adminUserEmail
    ? "" : document.getElementById("adminNameDisplay").textContent;
  document.getElementById("myProfileEmail").value = window._adminUserEmail || "";
  openModal("myProfileModal");
}

async function saveMyProfile() {
  const fullName = document.getElementById("myProfileName").value.trim();
  const btn = document.getElementById("myProfileSaveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const { error } = await window.sb.from("profiles").update({ full_name: fullName || null }).eq("id", window._adminUserId);

  btn.disabled = false; btn.textContent = "Save";
  if (error) { showToast("Couldn't save name: " + error.message); return; }

  applyUserPillDisplay(fullName, window._adminUserEmail);
  closeModal("myProfileModal");
  showToast("Profile updated.");
}

/* ── Role-based access control ─────────────────────────────── */

const ADMIN_ONLY_TABS = ["products","inventory","mix-match","orders","users","manage-hero","manage-about","settings","seo","best-deals","crm"];

// A developer account is scoped to the ticket board and nothing else -- no
// products, orders, customers, pricing, or revenue. Allow-list rather than
// deny-list, so any tab added later is closed to developers by default.
const DEVELOPER_TABS = ["dev-tickets"];

// A marketing account is scoped to the CRM/lead pipeline and nothing else --
// same allow-list reasoning as DEVELOPER_TABS above. Deliberately does NOT
// include dev-tickets or seo: those stay developer/admin-only per the
// requested scoping, even though marketing and developer are both "staff".
const MARKETING_TABS = ["dashboard", "crm"];

function isTabAllowed(tab) {
  if (window._adminRole === "developer") return DEVELOPER_TABS.includes(tab);
  if (window._adminRole === "marketing") return MARKETING_TABS.includes(tab);
  if (window._adminRole === "admin") return true;
  return !ADMIN_ONLY_TABS.includes(tab);
}

function landingTabFor(role) {
  if (role === "developer") return "dev-tickets";
  if (role === "marketing") return "crm";
  return "dashboard";
}

function resetRoleRestrictions() {
  // Restore all hidden nav items (needed when switching accounts without full page reload)
  document.querySelectorAll(".admin-only-nav").forEach(el => { el.style.display = ""; });
  document.querySelectorAll(".a-nav-item, .a-nav-section").forEach(el => { el.style.display = ""; });
  var badge = document.querySelector(".sd-partner-badge");
  if (badge) badge.remove();
}

function applyRoleRestrictions(role) {
  resetRoleRestrictions(); // always reset first
  if (role === "admin") return; // full access — nothing to hide

  if (role === "developer" || role === "marketing") {
    // Hide every nav item except this role's allow-list, and every section
    // heading that ends up with nothing under it.
    const allowed = role === "developer" ? DEVELOPER_TABS : MARKETING_TABS;
    document.querySelectorAll(".a-nav-item").forEach(el => {
      if (!allowed.includes(el.dataset.tab)) el.style.display = "none";
    });
    document.querySelectorAll(".a-nav-section").forEach(el => {
      let sib = el.nextElementSibling, keep = false;
      while (sib && sib.classList.contains("a-nav-item")) {
        if (sib.style.display !== "none") { keep = true; break; }
        sib = sib.nextElementSibling;
      }
      if (!keep) el.style.display = "none";
    });
    addRoleBadge(role === "developer" ? "Developer Portal" : "Marketing Portal");
    return;
  }

  // sub_distributor — hide admin-only nav items and sections
  document.querySelectorAll(".admin-only-nav").forEach(el => {
    el.style.display = "none";
  });
  addRoleBadge("Partner Portal");
}

function addRoleBadge(text) {
  if (document.querySelector(".sd-partner-badge")) return; // already applied
  const logoEl = document.querySelector(".a-sidebar-logo");
  if (!logoEl) return;
  const badge = document.createElement("div");
  badge.className = "sd-partner-badge";
  badge.style.cssText = "text-align:center;padding:8px 16px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(245,130,32,.85);";
  badge.textContent = text;
  logoEl.parentNode.insertBefore(badge, logoEl.nextSibling);
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
    '<p style="font-size:13px;color:#8a9bb5;margin:0 0 24px;line-height:1.6;">' +
      (window._adminRole === "developer"
        ? 'This section is only available to administrators. Your developer account has access to the Developer Tickets board.'
        : 'This section is only available to administrators. Your partner account has access to Dashboard, Affiliates, and Reports.') +
    '</p>' +
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
      "mix-match":"Mix & Match Groups",
      orders:"Orders", users:"Users", reports:"Reports & Analytics", settings:"Settings",
      seo:"SEO Health", "manage-hero":"Hero Section", "manage-about":"About Section",
      "quote-requests":"Quote Requests", "dev-tickets":"Developer Tickets",
      "best-deals":"Best Deals Campaign", "crm":"CRM & Leads" }[tab] || tab;

  if (tab === "dashboard")        renderDashboardTab();
  if (tab === "products")         renderProductsTable();
  if (tab === "inventory")        renderInventoryTable();
  if (tab === "mix-match")        renderMixMatchTab();
  if (tab === "orders")           renderOrdersTable();
  if (tab === "users")            renderUsersTable();
  if (tab === "reports")          renderReportsTab();
  if (tab === "seo")              renderSeoTab();
  if (tab === "manage-hero")      loadHeroSection();
  if (tab === "manage-about")     loadAboutSection();
  if (tab === "sub-distributors") renderSubDistributorsTab();
  if (tab === "quote-requests")   renderQuoteRequestsTable();
  if (tab === "dev-tickets")      renderDevTicketsTab();
  if (tab === "best-deals")       renderBestDealsTab();
  if (tab === "crm")              renderCrmTab();
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
  const category = document.getElementById("productCategoryFilter")?.value || "";
  let q = window.sb.from("products").select("*, inventory(stock_qty, status)").order("name");
  if (!showHidden) q = q.eq("is_active", true);
  if (filter) q = q.ilike("name", `%${filter}%`);
  if (category) q = q.eq("category_name", category);
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

// RRS-15: "Hide" here means the same thing the existing "Show hidden"
// filter already reads -- is_active:false, the same flag the single-
// product editor's "Show on site" checkbox already sets. Bulk deactivate
// is a much safer everyday action than bulk delete (product 90 rows of an
// old seed used to only be reachable one row at a time), and un-hide
// exists alongside it since a hide-only bulk action would be a dead end
// for anyone who selects the wrong rows.
async function bulkSetActive(active) {
  const ids = [...document.querySelectorAll(".product-cb:checked")].map(cb => cb.dataset.id);
  if (!ids.length) return;

  const { error } = await window.sb.from("products")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) { showToast("Error: " + error.message); return; }
  showToast(`${ids.length} product${ids.length > 1 ? "s" : ""} ${active ? "unhidden" : "hidden"}.`);
  clearSelection();
  renderProductsTable(document.getElementById("productSearch")?.value.trim() || "");
}

function bulkHide() { bulkSetActive(false); }
function bulkShow() { bulkSetActive(true); }

document.getElementById("productSearch")?.addEventListener("input", e => renderProductsTable(e.target.value.trim()));
document.getElementById("productCategoryFilter")?.addEventListener("change", () => renderProductsTable(document.getElementById("productSearch")?.value.trim() || ""));

/* ── Mix & Match MOQ Groups ───────────────────────────────────
   No separate groups table exists (see the 20260821 migration comment) --
   a "group" is purely products.moq_group values that happen to match. This
   whole section is a view + bulk-editor over that column pair, so every
   function here works by reading/writing moq_group / moq_group_min across
   whichever products are checked, never a group row of its own. */

let _moqEditingGroup = null; // group name being edited, or null while creating a new one
let _moqAllProducts  = [];   // cached for the picker so search doesn't re-query

async function renderMixMatchTab() {
  const wrap = document.getElementById("moqGroupCards");
  if (!wrap) return;
  wrap.innerHTML = `<div class="a-empty" style="grid-column:1/-1">Loading…</div>`;

  const { data: products, error } = await window.sb
    .from("products")
    .select("id, name, moq_group, moq_group_min")
    .not("moq_group", "is", null)
    .eq("is_active", true);

  if (error) {
    wrap.innerHTML = `<div class="a-empty" style="grid-column:1/-1">Error loading groups: ${escHtml(error.message)}</div>`;
    return;
  }

  const groups = {};
  (products || []).forEach(p => {
    if (!p.moq_group) return;
    if (!groups[p.moq_group]) groups[p.moq_group] = { name: p.moq_group, min: Number(p.moq_group_min) || 0, count: 0 };
    groups[p.moq_group].count++;
    groups[p.moq_group].min = Math.max(groups[p.moq_group].min, Number(p.moq_group_min) || 0);
  });

  const list = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));

  if (!list.length) {
    wrap.innerHTML = `<div class="a-empty" style="grid-column:1/-1">No Mix &amp; Match groups yet. Click "+ New Mix &amp; Match Group" to tag your first set of products.</div>`;
    return;
  }

  wrap.innerHTML = list.map(g => `
    <div class="a-card" style="padding:16px;cursor:pointer" onclick="openMoqGroupModal('${escHtml(g.name).replace(/'/g, "\\'")}')">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
        <strong style="font-size:14px;color:#0d2c50">${escHtml(g.name)}</strong>
        <span class="a-badge a-badge-orange">MOQ ${g.min}</span>
      </div>
      <p style="font-size:13px;color:#64748b;margin:8px 0 0">${g.count} product${g.count === 1 ? "" : "s"} in this group</p>
    </div>
  `).join("");
}

async function openMoqGroupModal(groupName) {
  _moqEditingGroup = groupName;
  document.getElementById("moqGroupModalTitle").textContent = groupName ? "Edit Mix & Match Group" : "New Mix & Match Group";
  document.getElementById("moqGroupNameInput").value = groupName || "";
  document.getElementById("moqGroupNameInput").disabled = !!groupName; // renaming a group is a delete+recreate, not a rename
  document.getElementById("moqGroupModalError").style.display = "none";
  document.getElementById("moqGroupProductSearch").value = "";
  document.getElementById("moqGroupDeleteBtn").style.display = groupName ? "" : "none";

  const { data: products } = await window.sb
    .from("products")
    .select("id, name, sku, category_name, moq_group, moq_group_min")
    .eq("is_active", true)
    .order("name");
  _moqAllProducts = products || [];

  const current = groupName ? _moqAllProducts.find(p => p.moq_group === groupName) : null;
  document.getElementById("moqGroupMinInput").value = current ? current.moq_group_min : "";

  // RRS-14: most groups map onto one real category (all the 5-gallon
  // chemicals, say), so the filter list is built from whatever categories
  // actually exist on active products rather than a hardcoded list that
  // could drift from the real catalog.
  const catSelect = document.getElementById("moqGroupCategoryFilter");
  if (catSelect) {
    const cats = [...new Set(_moqAllProducts.map(p => p.category_name).filter(Boolean))].sort();
    catSelect.innerHTML = `<option value="">All Categories</option>` +
      cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("");
  }

  renderMoqGroupProductPicker();
  openModal("moqGroupModal");
}

function renderMoqGroupProductPicker() {
  const el = document.getElementById("moqGroupProductPicker");
  if (!el) return;
  const filter = (document.getElementById("moqGroupProductSearch")?.value || "").trim().toLowerCase();
  const category = document.getElementById("moqGroupCategoryFilter")?.value || "";

  const rows = _moqAllProducts.filter(p =>
    (!filter || p.name.toLowerCase().includes(filter) || (p.sku || "").toLowerCase().includes(filter)) &&
    (!category || p.category_name === category)
  );
  if (!rows.length) { el.innerHTML = `<div class="a-empty">No products match.</div>`; return; }

  el.innerHTML = rows.map(p => {
    const inThisGroup  = _moqEditingGroup && p.moq_group === _moqEditingGroup;
    const inOtherGroup = p.moq_group && p.moq_group !== _moqEditingGroup;
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;cursor:${inOtherGroup ? "not-allowed" : "pointer"};${inOtherGroup ? "opacity:.5" : ""}">
        <input type="checkbox" class="moq-product-cb" data-id="${p.id}" ${inThisGroup ? "checked" : ""} ${inOtherGroup ? "disabled" : ""} style="width:15px;height:15px;accent-color:#ED7226">
        <span style="flex:1">${escHtml(p.name)}${p.sku ? ` <span style="color:#aaa">— ${escHtml(p.sku)}</span>` : ""}</span>
        ${inOtherGroup ? `<span class="a-badge a-badge-gray" title="Already in another Mix & Match group">In "${escHtml(p.moq_group)}"</span>` : ""}
      </label>`;
  }).join("");
}

// Checks every row currently visible in the picker (i.e. respects the
// search/category filters already applied) -- doesn't touch rows hidden by
// the filter, and never touches disabled rows already locked into another
// group.
function selectAllVisibleMoqProducts() {
  document.querySelectorAll("#moqGroupProductPicker .moq-product-cb:not(:disabled)").forEach(cb => { cb.checked = true; });
}

async function saveMoqGroup() {
  const errEl = document.getElementById("moqGroupModalError");
  const name  = (document.getElementById("moqGroupNameInput")?.value || "").trim();
  const min   = parseInt(document.getElementById("moqGroupMinInput")?.value) || 0;

  if (!name)     { errEl.textContent = "Enter a group tag.";      errEl.style.display = "block"; return; }
  if (!(min > 0)) { errEl.textContent = "Enter a combined minimum greater than 0."; errEl.style.display = "block"; return; }

  // Creating a new group under a name that already exists would silently
  // merge the two -- reject it instead, same as the CSV importer's
  // duplicate-SKU guard elsewhere in this file.
  if (!_moqEditingGroup && _moqAllProducts.some(p => p.moq_group === name)) {
    errEl.textContent = `A group named "${name}" already exists. Edit it from the Mix & Match tab instead.`;
    errEl.style.display = "block";
    return;
  }

  const checkedIds = [...document.querySelectorAll(".moq-product-cb:checked")].map(cb => cb.dataset.id);
  if (!checkedIds.length) { errEl.textContent = "Select at least one product for this group."; errEl.style.display = "block"; return; }

  errEl.style.display = "none";

  // Everyone checked gets this group + minimum...
  const { error: addErr } = await window.sb
    .from("products")
    .update({ moq_group: name, moq_group_min: min, updated_at: new Date().toISOString() })
    .in("id", checkedIds);
  if (addErr) { errEl.textContent = "Error: " + addErr.message; errEl.style.display = "block"; return; }

  // ...and anyone who WAS in this group but got unchecked is released back
  // to being an independent product, not left half-configured.
  if (_moqEditingGroup) {
    const removedIds = _moqAllProducts
      .filter(p => p.moq_group === _moqEditingGroup && !checkedIds.includes(p.id))
      .map(p => p.id);
    if (removedIds.length) {
      await window.sb.from("products")
        .update({ moq_group: null, moq_group_min: null, updated_at: new Date().toISOString() })
        .in("id", removedIds);
    }
  }

  closeModal("moqGroupModal");
  showToast(_moqEditingGroup ? "Group updated." : "Group created.");
  renderMixMatchTab();
}

async function deleteMoqGroup() {
  if (!_moqEditingGroup) return;
  if (!confirm(`Delete the "${_moqEditingGroup}" group? Every product in it goes back to being ordered independently — nothing is deleted, just un-grouped.`)) return;

  const { error } = await window.sb
    .from("products")
    .update({ moq_group: null, moq_group_min: null, updated_at: new Date().toISOString() })
    .eq("moq_group", _moqEditingGroup);

  if (error) { alert("Error: " + error.message); return; }
  closeModal("moqGroupModal");
  showToast("Group deleted.");
  renderMixMatchTab();
}

/* ── Product Modal ─────────────────────────────────────────── */

function openAddProduct() {
  document.getElementById("modalTitle").textContent = "Add Product";
  document.getElementById("productForm")?.reset();
  document.getElementById("editProductId").value = "";
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = "assets/img/product-placeholder.svg";
  document.getElementById("productFormError").style.display = "none";
  renderProdGallery([]);
  // form.reset() does not touch the hidden base-price field or the readonly
  // tier fields, so clear them explicitly before the panel is shown.
  ["prodPrice", "prodPrice1", "prodPrice2", "prodPrice3", "prodFlatPriceInput"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const flatChk = document.getElementById("prodFlatPricing");
  if (flatChk) flatChk.checked = false;
  toggleFlatPricing();
  recalcTierPricing();
  openModal("productModal");
}

/**
 * Toggles between the default cost/category-derived tier pricing and a
 * single flat price for products that don't need volume tiers (a one-off
 * deal item, a sample, anything priced the same at any quantity). Checked,
 * this hides the cost/category requirement and takes one manual price
 * instead -- unchecked (the default) leaves the existing cost-derived
 * behavior untouched, so nothing about the normal workflow changes.
 */
function toggleFlatPricing() {
  const flat = document.getElementById("prodFlatPricing")?.checked || false;
  const flatRow = document.getElementById("flatPricingRow");
  const tieredFields = document.getElementById("tieredPricingFields");
  if (flatRow) flatRow.style.display = flat ? "" : "none";
  if (tieredFields) tieredFields.style.display = flat ? "none" : "";
  if (flat) syncFlatPrice();
}

function syncFlatPrice() {
  const v = document.getElementById("prodFlatPriceInput")?.value || "";
  const base = document.getElementById("prodPrice");
  if (base) base.value = v;
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
  "Towels":                        [0.50, 0.40, 0.33],
  "Bed Sheets & Linens":           [0.50, 0.40, 0.33],
  "Pillows & Mattress Protectors": [0.60, 0.50, 0.40],
  "Furniture":                     [0.45, 0.35, 0.30],
  "Trash Liners & Can Liners":     [0.45, 0.35, 0.28],
  "Cleaning Chemicals":            [0.40, 0.32, 0.25],
  "Housekeeping Supplies":         [0.55, 0.45, 0.35],
  "Guest Amenities":               [0.70, 0.55, 0.40],
  "Gloves & PPE":                  [0.35, 0.28, 0.22],
  "Laundry & Cleaning Chemicals":  [0.45, 0.37, 0.30],
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
  setVal("prodRetailPrice",p.retail_price   || "");
  setVal("prodMoq",         p.moq           || "");
  setVal("prodMoqGroup",    p.moq_group     || "");
  setVal("prodMoqGroupMin", p.moq_group_min || "");
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

  // A product with a price but no tiers was saved as flat-price -- reopen
  // it the same way instead of showing empty "calculated" tier fields.
  const isFlat = !p.price_tier1 && !p.price_tier2 && !p.price_tier3 && Number(p.price) > 0;
  setChk("prodFlatPricing", isFlat);
  setVal("prodFlatPriceInput", isFlat ? p.price : "");
  toggleFlatPricing();

  // Recompute from the stored cost. If the tiers on file are stale (a
  // supplier cost went up but prices were never redone) the corrected
  // figures appear immediately, which is the whole point of deriving them.
  recalcTierPricing();
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = p.image_url || "assets/img/product-placeholder.svg";
  document.getElementById("productFormError").style.display = "none";
  renderProdGallery(Array.isArray(p.images) ? p.images : []);
  openModal("productModal");
}

document.getElementById("prodImage")?.addEventListener("input", e => {
  const prev = document.getElementById("prodImagePreview");
  if (prev) prev.src = e.target.value || "assets/img/product-placeholder.svg";
});

/* ── Gallery images (RRS-13) ────────────────────────────────────
   image_url stays the one cover photo every other surface reads; this is
   an independent, ordered list of EXTRA photos shown on the product page.
   Tracked in memory while the modal is open (not read back out of the DOM
   on save) since a thumbnail has no input element of its own to hold a URL. */
let _prodGalleryImages = [];

function renderProdGallery(urls) {
  _prodGalleryImages = urls || [];
  const wrap = document.getElementById("prodGalleryThumbs");
  if (!wrap) return;
  wrap.innerHTML = _prodGalleryImages.map((url, i) => `
    <div style="position:relative;width:64px;height:64px">
      <img src="${escHtml(url)}" onerror="this.src='assets/img/product-placeholder.svg'"
        style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1.5px solid var(--border)">
      <button type="button" onclick="removeProdGalleryImage(${i})" title="Remove"
        style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;border:2px solid #fff;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">&times;</button>
    </div>`).join("");
}

function removeProdGalleryImage(index) {
  _prodGalleryImages.splice(index, 1);
  renderProdGallery(_prodGalleryImages);
}

document.getElementById("prodGalleryFile")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ""; // allow picking the same filename again later
  const ext  = file.name.split(".").pop();
  const path = `products/${Date.now()}-gallery.${ext}`;
  showToast("Uploading…");
  const { error } = await window.sb.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) { showToast("Upload failed: " + error.message); return; }
  const { data: { publicUrl } } = window.sb.storage.from("product-images").getPublicUrl(path);
  renderProdGallery([..._prodGalleryImages, publicUrl]);
  showToast("Image added!");
});

async function saveProduct() {
  const errEl    = document.getElementById("productFormError");
  const id       = document.getElementById("editProductId").value;
  const isOnSale = document.getElementById("prodIsOnSale")?.checked || false;
  const spRaw    = parseFloat(document.getElementById("prodSalePrice")?.value) || null;
  const name     = (document.getElementById("prodName")?.value || "").trim();

  if (!name) { errEl.textContent = "Product name is required."; errEl.style.display = "block"; return; }

  const isFlatPricing = document.getElementById("prodFlatPricing")?.checked || false;
  const flatPrice     = parseFloat(document.getElementById("prodFlatPriceInput")?.value) || 0;

  if (isFlatPricing) {
    if (!(flatPrice > 0)) {
      errEl.textContent = "Enter a price.";
      errEl.style.display = "block";
      return;
    }
  } else {
    // Tier prices are derived, so an empty 1-5 tier means the category or
    // cost is missing. Saving anyway would publish a $0.00 product.
    if (!(parseFloat(document.getElementById("prodPrice1")?.value) > 0)) {
      errEl.textContent = "Pick a category and enter Cost Per Case — tier prices are calculated from them. (Or check “Flat price” above if this product doesn't need volume tiers.)";
      errEl.style.display = "block";
      return;
    }
  }
  errEl.style.display = "none";

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // A group tag with no minimum (or a minimum with no tag) would silently
  // pool the product into a group with an unenforceable threshold -- treat
  // the pair as all-or-nothing rather than saving a half-configured group.
  const moqGroupRaw = (document.getElementById("prodMoqGroup")?.value || "").trim();
  const moqGroupMinRaw = parseInt(document.getElementById("prodMoqGroupMin")?.value) || null;
  const moqGroup = moqGroupRaw && moqGroupMinRaw ? moqGroupRaw : null;
  const moqGroupMin = moqGroupRaw && moqGroupMinRaw ? moqGroupMinRaw : null;

  const payload = {
    name,
    slug,
    sku           : (document.getElementById("prodSku")?.value || "").trim() || null,
    category_name : (document.getElementById("prodCategory")?.value || "").trim(),
    description   : (document.getElementById("prodDescription")?.value || "").trim(),
    // Flat-price products carry no tiers at all -- getTierPrice() (script.js)
    // already falls back to the base price at any quantity when tier1/2/3
    // are null, so this is the whole mechanism, not a partial one.
    price         : isFlatPricing ? flatPrice : (parseFloat(document.getElementById("prodPrice")?.value) || 0),
    price_tier1   : isFlatPricing ? null : (parseFloat(document.getElementById("prodPrice1")?.value) || null),
    price_tier2   : isFlatPricing ? null : (parseFloat(document.getElementById("prodPrice2")?.value) || null),
    price_tier3   : isFlatPricing ? null : (parseFloat(document.getElementById("prodPrice3")?.value) || null),
    sale_price    : isOnSale ? spRaw : null,
    is_on_sale    : isOnSale,
    retail_price  : parseFloat(document.getElementById("prodRetailPrice")?.value) || null,
    // Case/dozen ordering minimum -- e.g. "50" for a wash cloth sold in a
    // 50-dozen case, so the storefront can't sell a partial case. Distinct
    // from moq_group below, which pools several different SKUs together.
    moq           : parseInt(document.getElementById("prodMoq")?.value) || null,
    moq_group     : moqGroup,
    moq_group_min : moqGroupMin,
    unit          : document.getElementById("prodUnit")?.value || "Case",
    case_qty      : parseInt(document.getElementById("prodCaseQty")?.value) || 1,
    pack_size     : parseInt(document.getElementById("prodPackSize")?.value) || 1,
    image_url     : (document.getElementById("prodImage")?.value || "").trim() || null,
    images        : _prodGalleryImages,
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
  { key:"overview",      label:"Overview" },
  { key:"feature1",      label:"Feature 1" },
  { key:"feature2",      label:"Feature 2" },
  { key:"feature3",      label:"Feature 3" },
  { key:"feature4",      label:"Feature 4" },
  { key:"price",         label:"Price",        required:true },
  { key:"sale_price",    label:"Sale Price" },
  { key:"retail_price",  label:"Retail Price" },
  { key:"price_tier1",   label:"Price: 1-5 Cases" },
  { key:"price_tier2",   label:"Price: 6-29 Cases" },
  { key:"price_tier3",   label:"Price: 30+ Cases" },
  { key:"is_on_sale",    label:"Is On Sale" },
  { key:"category_name", label:"Category",     required:true },
  { key:"case_qty",      label:"Case Qty" },
  { key:"pack_size",     label:"Pack Size" },
  { key:"unit",          label:"Unit" },
  { key:"is_featured",   label:"Is Featured" },
  { key:"is_active",     label:"Is Active" },
  { key:"image_url",     label:"Image URL" },
  { key:"weight",        label:"Weight (lbs)" },
  { key:"length",        label:"Length (in)" },
  { key:"width",         label:"Width (in)" },
  { key:"height",        label:"Height (in)" },
  { key:"stock_qty",     label:"Stock Qty" },
  { key:"stock_status",  label:"Stock Status" },
  { key:"moq_group",     label:"Mix & Match Group" },
  { key:"moq_group_min", label:"Mix & Match Group Minimum" },
  { key:"images",        label:"Gallery Images (pipe-separated)" },
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
        /* CSV — re-use the same full-text tokenizer as parseCsv, just
           without requiring a "name" column. */
        const rawRows = parseCsvRows(stripBom(e.target.result));
        const headers = (rawRows[0] || []).map(h => h.trim());
        rows = [];
        for (let i = 1; i < rawRows.length; i++) {
          const vals = rawRows[i];
          if (vals.length === 1 && vals[0].trim() === "") continue;
          const obj = {};
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
    overview:      ["overview","longdescription","fulldescription","productoverview"],
    feature1:      ["feature1","feature1description","keyfeature1"],
    feature2:      ["feature2","feature2description","keyfeature2"],
    feature3:      ["feature3","feature3description","keyfeature3"],
    feature4:      ["feature4","feature4description","keyfeature4"],
    price:         ["price","cost","caseprice","unitprice"],
    sale_price:    ["saleprice","discountprice","specialprice","promoprice"],
    retail_price:  ["retailprice","msrp","listprice","comparatprice","compareatprice"],
    price_tier1:   ["pricetier1","tier1price","price15","price1to5","price15cases"],
    price_tier2:   ["pricetier2","tier2price","price629","price6to29","price629cases"],
    price_tier3:   ["pricetier3","tier3price","price30","price30plus","price30cases"],
    is_on_sale:    ["isonsale","onsale","sale","discount","promo"],
    category_name: ["category","categoryname","dept","department","type","producttype","productcategory"],
    case_qty:      ["caseqty","casecount","quantitypercase","casesize","qtypercase"],
    pack_size:     ["packsize","pack","packs","packcount","packqty"],
    unit:          ["unit","uom","unitofmeasure","unittype"],
    is_featured:   ["isfeatured","featured","highlight","top","bestseller"],
    is_active:     ["isactive","active","status","enabled","available"],
    image_url:     ["imageurl","image","img","photo","picture","url","photourl"],
    weight:        ["weight","weightlbs","weightlb","itemweight"],
    length:        ["length","lengthin","itemlength"],
    width:         ["width","widthin","itemwidth"],
    height:        ["height","heightin","itemheight"],
    stock_qty:     ["stockqty","stock","quantity","qty","inventory","onhand","stockcount"],
    stock_status:  ["stockstatus","availability","instock","availabilitystatus"],
    moq_group:     ["moqgroup","mixmatchgroup","mixandmatchgroup","moqtag"],
    moq_group_min: ["moqgroupmin","moqminimum","mixmatchminimum","moqgroupminimum","combinedminimum"],
    images:        ["images","galleryimages","additionalimages","photos","extraimages"],
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
      if (!_csvRows.length) {
        const reason = _csvRows.blankNameSkips?.length
          ? `Every row is missing a "name" value (row ${_csvRows.blankNameSkips.join(", ")}). Add a name to each row and re-upload.`
          : "No data rows found in CSV.";
        showToast(reason);
        return;
      }
      renderCsvPreview(_csvRows);
      showCsvStep(2);
      document.getElementById("csvImportBtn").style.display = "";
    } catch (err) {
      showToast("CSV parse error: " + err.message);
    }
  };
  reader.readAsText(file);
}

/* Full single-pass RFC 4180 tokenizer. The previous version pre-split the
   file on "\n" and only parsed quotes within each resulting line -- a real
   newline inside a quoted field (valid CSV, and something Excel/Sheets
   exports routinely for multi-line cell text) was treated as a row
   boundary, corrupting that row and misaligning every column in the next
   one. Processing the whole text as one stream, tracking quote-state
   across it, is what "RFC 4180-compatible" actually requires. */
function parseCsvRows(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// A UTF-8 file that's round-tripped through Excel/Sheets a couple of times
// (downloaded, edited, re-saved) can pick up a corrupted byte-order-mark:
// instead of surviving as the single invisible U+FEFF character real BOMs
// normally decode to, its 3 raw bytes (EF BB BF) sometimes get individually
// misread as three visible Latin-1 characters ("ï»¿") glued onto the very
// first header cell. Either form silently breaks the "name"/"price" column
// match below and makes the whole import fail with a confusing error --
// confirmed on a real user-submitted file where this was the entire
// problem; every other column (including a working "overview") parsed
// perfectly once this was stripped.
function stripBom(text) {
  if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
  if (text.slice(0, 3) === "ï»¿") return text.slice(3);
  return text;
}

function parseCsv(text) {
  const rawRows = parseCsvRows(stripBom(text));
  if (rawRows.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = rawRows[0].map(h => h.trim().toLowerCase());
  if (headers.indexOf("name")  === -1) throw new Error('CSV must have a "name" column.');
  if (headers.indexOf("price") === -1) throw new Error('CSV must have a "price" column.');

  // Rows missing the name used to be silently dropped with no trace, so a
  // typo'd or blank cell just made a product vanish from the import with
  // no way to tell why. Collect them (with their file row number, header
  // row counted as row 1) so the caller can tell the user exactly which
  // rows to fix instead of just importing fewer products than expected.
  const rows = [];
  const blankNameSkips = [];
  for (let i = 1; i < rawRows.length; i++) {
    const vals = rawRows[i];
    if (vals.length === 1 && vals[0].trim() === "") continue; // fully-blank line
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] ?? "").trim(); });
    if (!obj.name) { blankNameSkips.push(i + 1); continue; }
    rows.push(obj);
  }
  rows.blankNameSkips = blankNameSkips;
  return rows;
}

// Strips currency formatting ($, thousands commas, whitespace) before
// parsing -- plain parseFloat() stops at the first non-numeric character,
// so "$44.99" silently became 0 and "1,299.99" silently became 1. Also
// distinguishes "cell left blank" (0, not an error -- e.g. no sale price
// set) from "cell has something that isn't a number" (flagged invalid, so
// the caller can reject the row instead of silently importing it at $0 --
// the exact failure mode that already caused a real pricing incident here).
function parseMoneyCell(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { value: 0, empty: true, invalid: false };
  const cleaned = s.replace(/[$,\s]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return { value: 0, empty: false, invalid: true };
  return { value: n, empty: false, invalid: false };
}

// Same empty/invalid distinction as parseMoneyCell, for plain numeric
// fields (weight in lbs, dimensions in inches) that aren't currency --
// no $/comma stripping, since "$41 lbs" isn't a formatting convention
// anyone actually uses here and stripping it would hide real typos.
function parseNumCell(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { value: 0, empty: true, invalid: false };
  const n = parseFloat(s);
  if (isNaN(n)) return { value: 0, empty: false, invalid: true };
  return { value: n, empty: false, invalid: false };
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

  /* Which optional columns actually matched a header in this file, and how
     many rows have real (non-blank) data in each -- e.g. an "overview"
     header with a typo, stray space, or wrong casing-that-somehow-slipped-
     past normalizing would otherwise import silently with that field just
     staying blank on every row, with nothing in this screen to show why. */
  const colsEl = document.getElementById("csvColsDetected");
  if (colsEl) {
    const OPTIONAL_COLS = [
      ["overview", "Overview"], ["feature1", "Feature 1"], ["feature2", "Feature 2"],
      ["feature3", "Feature 3"], ["feature4", "Feature 4"], ["sale_price", "Sale Price"],
      ["retail_price", "Retail Price"], ["price_tier1", "Tier Pricing"],
      ["weight", "Weight"], ["length", "Dimensions"],
      ["moq_group", "Mix & Match Group"], ["images", "Gallery Images"],
    ];
    const seen = new Set();
    const detected = OPTIONAL_COLS.filter(([key, label]) => {
      if (seen.has(label)) return false; // price_tier1/length stand in for the whole group
      const withData = rows.filter(r => (r[key] || "").trim()).length;
      if (!withData) return false;
      seen.add(label);
      return true;
    }).map(([key, label]) => {
      const withData = rows.filter(r => (r[key] || "").trim()).length;
      return `${label} (${withData}/${rows.length})`;
    });
    if (detected.length) {
      colsEl.textContent = `Columns detected with data: ${detected.join(", ")}.`;
      colsEl.style.display = "";
    } else {
      colsEl.style.display = "none";
    }
  }

  /* Warn about missing required data *before* the user clicks Import,
     rather than only after the fact in the results screen -- so they know
     exactly what to fix in the spreadsheet and can re-upload once instead
     of importing broken/incomplete rows first. */
  const blankPriceRows = rows.filter(r => parseMoneyCell(r.price).empty);
  const warnEl = document.getElementById("csvSkipWarning");
  if (warnEl) {
    const msgs = [];
    if (rows.blankNameSkips?.length) {
      msgs.push(`${rows.blankNameSkips.length} row(s) skipped — missing a name (row ${rows.blankNameSkips.join(", ")}). Add a name and re-upload if you want these included.`);
    }
    if (blankPriceRows.length) {
      msgs.push(`${blankPriceRows.length} row(s) below are missing a price (${blankPriceRows.slice(0, 5).map(r => `"${r.name}"`).join(", ")}${blankPriceRows.length > 5 ? ", …" : ""}) — these will be skipped on import. Add a price and re-upload if you want them included.`);
    }
    if (msgs.length) {
      warnEl.innerHTML = msgs.map(m => `⚠ ${escHtml(m)}`).join("<br>");
      warnEl.style.display = "";
    } else {
      warnEl.style.display = "none";
    }
  }
}

/* Run the actual import in batches of 100 */
async function runCsvImport() {
  if (!_csvRows.length || _csvRunning) return;
  _csvRunning = true;
  document.getElementById("csvImportBtn").disabled = true;

  showCsvStep(3);

  const errLines = [];

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
    // .limit() explicit and generous: Supabase/PostgREST default-caps an
    // unbounded select() at 1000 rows, which would silently stop detecting
    // duplicates past the first 1000 products as the catalog grows.
    const { data: existingProds } = await window.sb
      .from("products").select("name").limit(50000);
    if (existingProds) existingProds.forEach(p => existingNames.add(normName(p.name)));
  }
  const preValidationRows = deduped.filter(r => r.sku || !existingNames.has(normName(r.name)));
  const dbDupCount = deduped.length - preValidationRows.length;

  /* ── Validate price/sale_price before anything gets imported ──────
     A price cell that isn't blank but also isn't a real number (e.g. a
     stray "TBD", or a currency format parseFloat can't handle on its own)
     used to silently import at $0.00 -- the exact failure mode that
     already caused a real pricing incident here. Reject those rows
     instead of importing them broken. */
  const rows = [];
  let missingPriceCount = 0;
  let invalidValueCount = 0;
  preValidationRows.forEach((r, idx) => {
    const priceInfo  = parseMoneyCell(r.price);
    const saleInfo   = parseMoneyCell(r.sale_price);
    const retailInfo = parseMoneyCell(r.retail_price);
    // Tier columns are entirely optional (blank means "no volume tiers,
    // just use price" -- same as the flat-price option in the product
    // editor), but if a value IS present it still has to be a real number,
    // same as every other price column here.
    const tier1Info = parseMoneyCell(r.price_tier1);
    const tier2Info = parseMoneyCell(r.price_tier2);
    const tier3Info = parseMoneyCell(r.price_tier3);
    // Weight/dimensions are also optional, plain (non-currency) numbers --
    // same treatment: blank is fine, present-but-garbage gets rejected
    // rather than silently imported as 0.
    const weightInfo = parseNumCell(r.weight);
    const lengthInfo = parseNumCell(r.length);
    const widthInfo  = parseNumCell(r.width);
    const heightInfo = parseNumCell(r.height);
    const moqMinInfo = parseNumCell(r.moq_group_min);
    // A blank price cell used to silently import at $0.00 -- price is
    // required (unlike sale_price/retail_price, where blank legitimately
    // means "no sale" / "no retail comparison set"), so treat a missing
    // price the same as a bad one: reject the row and say exactly what's
    // missing, instead of shipping a live product priced at zero with no
    // trace of why.
    if (priceInfo.empty) {
      missingPriceCount++;
      errLines.push(`"${r.name}": price is missing — add a price for this row and re-upload.`);
      return;
    }
    const badField =
      priceInfo.invalid  ? "price"        : saleInfo.invalid   ? "sale_price"   :
      retailInfo.invalid ? "retail_price" : tier1Info.invalid  ? "price_tier1"  :
      tier2Info.invalid  ? "price_tier2"  : tier3Info.invalid  ? "price_tier3"  :
      weightInfo.invalid ? "weight"       : lengthInfo.invalid ? "length"       :
      widthInfo.invalid  ? "width"        : heightInfo.invalid ? "height"       :
      moqMinInfo.invalid ? "moq_group_min" : null;
    if (badField) {
      invalidValueCount++;
      errLines.push(`"${r.name}": ${badField} "${r[badField]}" is not a valid number — row skipped, nothing imported for it.`);
      return;
    }
    rows.push(r);
  });
  const skippedTotal = csvDupCount + dbDupCount + missingPriceCount + invalidValueCount;

  if (skippedTotal) {
    const dupCount = csvDupCount + dbDupCount;
    const skipDesc = [
      dupCount           ? `${dupCount} duplicate(s)`      : null,
      missingPriceCount  ? `${missingPriceCount} missing price(s)` : null,
      invalidValueCount  ? `${invalidValueCount} invalid value(s)` : null,
    ].filter(Boolean).join(", ");
    document.getElementById("csvProgressSub").textContent =
      `Skipped ${skippedTotal} row(s) — ${skipDesc} — importing ${rows.length} product(s)…`;
    await new Promise(r => setTimeout(r, 800));
  }

  const BATCH   = 100;
  const total   = rows.length;
  let inserted  = 0;
  let updated   = 0;

  const setProgress = (done) => {
    const pct = total ? Math.round((done / total) * 100) : 100;
    document.getElementById("csvProgressBar").style.width = pct + "%";
    document.getElementById("csvProgressSub").textContent = `${done.toLocaleString()} / ${total.toLocaleString()} processed${skippedTotal ? ` (${skippedTotal} skipped)` : ""}`;
  };
  setProgress(0);

  const buildPayload = (r, now) => ({
    name         : r.name,
    sku          : r.sku  || null,
    slug         : r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    description  : r.description  || null,
    // A separate field from description, deliberately -- the product
    // page's Overview tab falls back to description when this is blank
    // (script.js), which is exactly why every CSV-imported product used
    // to show identical text in both places: this column never existed
    // in the importer before, so overview was always null.
    overview     : r.overview     || null,
    feature1     : r.feature1     || null,
    feature2     : r.feature2     || null,
    feature3     : r.feature3     || null,
    feature4     : r.feature4     || null,
    price        : parseMoneyCell(r.price).value,
    // Already validated above (invalid rows never reach here) -- .empty
    // distinguishes "blank cell" (stays null, no sale price set) from a
    // real "0" (stays 0), which parseFloat(...) || null could not: 0 is
    // falsy in JS, so a genuine $0.00 sale price used to silently become
    // null instead of staying 0.
    sale_price   : parseMoneyCell(r.sale_price).empty ? null : parseMoneyCell(r.sale_price).value,
    retail_price : parseMoneyCell(r.retail_price).empty ? null : parseMoneyCell(r.retail_price).value,
    // Optional. Left blank, a product has no volume tiers -- getTierPrice()
    // (script.js) falls back to `price` at any quantity, same as the
    // "Flat price" option in the single-product editor. Filled in, these
    // are what the storefront actually charges at 1-5 / 6-29 / 30+ cases;
    // nothing here is derived or auto-calculated the way the admin editor's
    // cost-per-case markup is -- CSV rows are trusted as typed.
    price_tier1  : parseMoneyCell(r.price_tier1).empty ? null : parseMoneyCell(r.price_tier1).value,
    price_tier2  : parseMoneyCell(r.price_tier2).empty ? null : parseMoneyCell(r.price_tier2).value,
    price_tier3  : parseMoneyCell(r.price_tier3).empty ? null : parseMoneyCell(r.price_tier3).value,
    is_on_sale   : ["true","1","yes"].includes((r.is_on_sale || "").toLowerCase()),
    category_name: r.category_name || null,
    case_qty     : parseInt(r.case_qty)  || 1,
    pack_size    : parseInt(r.pack_size) || 1,
    unit         : r.unit         || "Case",
    is_featured  : ["true","1","yes"].includes((r.is_featured || "").toLowerCase()),
    is_active    : r.is_active === "" || ["true","1","yes"].includes((r.is_active || "true").toLowerCase()),
    image_url    : r.image_url   || null,
    // Extra gallery photos beyond the one cover image (RRS-13) -- pipe-
    // separated so a single CSV cell can carry several URLs without
    // conflicting with the comma-delimited format of the file itself.
    images       : (r.images || "").split("|").map(s => s.trim()).filter(Boolean),
    weight       : parseNumCell(r.weight).empty ? null : parseNumCell(r.weight).value,
    length       : parseNumCell(r.length).empty ? null : parseNumCell(r.length).value,
    width        : parseNumCell(r.width).empty  ? null : parseNumCell(r.width).value,
    height       : parseNumCell(r.height).empty ? null : parseNumCell(r.height).value,
    // Same all-or-nothing rule as the single-product editor: a group tag
    // with no minimum (or vice versa) can't be enforced, so it doesn't count.
    moq_group     : (r.moq_group || "").trim() && parseInt(r.moq_group_min) ? r.moq_group.trim() : null,
    moq_group_min : (r.moq_group || "").trim() && parseInt(r.moq_group_min) ? parseInt(r.moq_group_min) : null,
    updated_at   : now,
  });

  /* Runs one Supabase call (upsert-by-sku or plain insert) for a group of
     rows that are all the same "kind" (all have a SKU, or none do), and
     folds the result into the running counters/inventory upserts. */
  async function importGroup(groupRows, hasSku, now) {
    if (!groupRows.length) return;
    const payloads = groupRows.map(r => buildPayload(r, now));

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
      errLines.push(`"${groupRows[0].name}"${groupRows.length > 1 ? ` and ${groupRows.length - 1} more` : ""}: ${result.error.message}`);
      return;
    }

    if (result.data?.length) {
      const invPayloads = result.data.map((p, i) => ({
        product_id : p.id,
        stock_qty  : parseInt(groupRows[i]?.stock_qty)  || 0,
        status     : groupRows[i]?.stock_status || "in_stock",
        updated_at : now,
      }));
      await window.sb.from("inventory")
        .upsert(invPayloads, { onConflict: "product_id" });
    }

    if (hasSku) updated  += result.data?.length || groupRows.length;
    else        inserted += result.data?.length || groupRows.length;
  }

  /* Process in chunks. Each chunk is split into a with-SKU group (upsert)
     and a without-SKU group (plain insert) rather than picking one mode
     for the whole chunk based on whether ANY row has a SKU -- a mixed
     chunk used to upsert every row, including no-SKU ones (sku: null),
     onConflict:"sku" -- which doesn't error (NULL never conflicts with
     NULL in Postgres), but silently mis-reports every one of those
     brand-new inserts as an "Updated" product instead of "Inserted". */
  for (let start = 0; start < total; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    const now   = new Date().toISOString();

    await importGroup(chunk.filter(r => r.sku), true, now);
    await importGroup(chunk.filter(r => !r.sku), false, now);

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
      "name","sku","description","overview","feature1","feature2","feature3","feature4",
      "price","sale_price","retail_price","price_tier1","price_tier2","price_tier3","is_on_sale",
      "category_name","case_qty","pack_size","unit",
      "is_featured","is_active","image_url",
      "weight","length","width","height",
      "stock_qty","stock_status",
      "moq_group","moq_group_min","images"
    ].map(q),

    /* ── Example 1: basic product, with real volume tiers -- price_tier1/2/3
       are what a customer actually pays at 1-5 / 6-29 / 30+ cases. price
       itself still has to be filled in (it's what shows before a quantity
       is picked, and what a tier-less product falls back to). description
       and overview are deliberately different: description is the short
       line shown near the top of the page, overview is the longer pitch
       in the Overview tab -- leaving overview blank just reuses
       description there instead, it doesn't have to be written twice. ── */
    [
      q("Premium Bath Towels"), q("SKU-001"), q("Soft commercial-grade bath towels, white"),
      q("Wholesale premium bath towels for hotels, motels, resorts, and commercial facilities. Ring-spun cotton holds up to high-volume commercial laundering without thinning or fraying."),
      q("Ring-spun cotton construction"), q("Holds up to commercial laundering"), q("Quick-drying"), q("Fade-resistant white"),
      n(24.99), n(""), n(34.99), n(24.99), n(22.50), n(19.99), b(false),
      q("Towels and Linens"), n(12), n(1), q("Case"),
      b(false), b(true), q(""),
      n(28), n(18), n(14), n(6),
      n(100), q("in_stock"),
      q(""), n(""), q("")
    ],

    /* ── Example 2: sale product, featured, no tiers (flat price at any qty) ── */
    [
      q("Antibacterial Hand Soap 1L"), q("SKU-002"), q("Foam hand soap refill, fresh scent"),
      q(""), q(""), q(""), q(""), q(""),
      n(18.50), n(15.99), n(25.00), n(""), n(""), n(""), b(true),
      q("Hand Soap"), n(6), n(1), q("Case"),
      b(true), b(true), q(""),
      n(""), n(""), n(""), n(""),
      n(50), q("in_stock"),
      q(""), n(""), q("")
    ],

    /* ── Example 3: low stock ── */
    [
      q("C-Fold Paper Towels"), q("SKU-003"), q("2-ply C-fold paper towels, 12 packs per case"),
      q(""), q(""), q(""), q(""), q(""),
      n(32.00), n(""), n(""), n(""), n(""), n(""), b(false),
      q("Paper Towels"), n(12), n(150), q("Case"),
      b(false), b(true), q(""),
      n(""), n(""), n(""), n(""),
      n(8), q("low_stock"),
      q(""), n(""), q("")
    ],

    /* ── Example 4: out of stock, inactive ── */
    [
      q("Trash Liner 55 Gallon"), q("SKU-004"), q("Heavy-duty black trash liners, 1.5 mil"),
      q(""), q(""), q(""), q(""), q(""),
      n(45.99), n(""), n(""), n(""), n(""), n(""), b(false),
      q("Trash Liners"), n(100), n(1), q("Case"),
      b(false), b(false), q(""),
      n(35), n(20), n(16), n(10),
      n(0), q("out_of_stock"),
      q(""), n(""), q("")
    ],

    /* ── Example 5: pack unit ── */
    [
      q("Toilet Seat Cover Dispenser"), q("SKU-005"), q("Wall-mount dispenser for seat covers"),
      q(""), q(""), q(""), q(""), q(""),
      n(12.75), n(""), n(""), n(""), n(""), n(""), b(false),
      q("Facility Supplies"), n(1), n(1), q("EA"),
      b(false), b(true), q(""),
      n(""), n(""), n(""), n(""),
      n(25), q("in_stock"),
      q(""), n(""), q("")
    ],

    /* ── Examples 6-7: Mix & Match MOQ group -- two products that share a
       moq_group tag pool toward one combined moq_group_min, instead of each
       needing its own case minimum. Every product meant to share a minimum
       needs the exact same moq_group text and the same moq_group_min. ── */
    [
      q("5-Gallon Laundry Detergent - Blue"), q("SKU-006"), q("Commercial liquid laundry detergent, 5-gallon pail"),
      q(""), q(""), q(""), q(""), q(""),
      n(89.00), n(""), n(""), n(""), n(""), n(""), b(false),
      q("Laundry & Cleaning Chemicals"), n(1), n(1), q("Pail"),
      b(false), b(true), q(""),
      n(""), n(""), n(""), n(""),
      n(40), q("in_stock"),
      q("5GAL-CHEMICALS"), n(36), q("")
    ],
    [
      q("5-Gallon Laundry Detergent - Oxi"), q("SKU-007"), q("Commercial liquid laundry detergent with oxi boost, 5-gallon pail"),
      q(""), q(""), q(""), q(""), q(""),
      n(92.00), n(""), n(""), n(""), n(""), n(""), b(false),
      q("Laundry & Cleaning Chemicals"), n(1), n(1), q("Pail"),
      b(false), b(true), q(""),
      n(""), n(""), n(""), n(""),
      n(40), q("in_stock"),
      q("5GAL-CHEMICALS"), n(36), q("")
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
  tbody.innerHTML = `<tr><td colspan="9" class="a-empty">Loading…</td></tr>`;
  let q = window.sb.from("orders").select("*").order("created_at", { ascending: false });
  if (filter) q = q.or(`order_number.ilike.%${filter}%,customer_name.ilike.%${filter}%,business_name.ilike.%${filter}%`);
  const statusFilter = document.getElementById("orderStatusFilter")?.value;
  if (statusFilter) q = q.eq("status", statusFilter);
  const paymentFilter = document.getElementById("orderPaymentFilter")?.value;
  if (paymentFilter) q = q.eq("payment_status", paymentFilter);
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
      <td><span class="a-badge ${paymentBadgeClass(o.payment_status)}">${paymentBadgeLabel(o.payment_status)}</span></td>
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
document.getElementById("orderPaymentFilter")?.addEventListener("change", () => renderOrdersTable(document.getElementById("orderSearch")?.value.trim()));

async function updateOrderStatus(orderId, status) {
  await window.sb.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", orderId);
  showToast("Order status updated.");
}

// Orders created from an invoice or payment-terms agreement (see
// api/send-invoice.js / api/send-terms-agreement.js) never run through
// checkout's shipping form, so shipping_address starts empty. Lets staff
// fill it in directly from the order modal.
async function openEditAddressModal(orderId) {
  const { data: o } = await window.sb.from("orders").select("shipping_address").eq("id", orderId).single();
  const addr = o?.shipping_address || {};
  document.getElementById("eaOrderId").value = orderId;
  document.getElementById("eaStreet").value = addr.street || "";
  document.getElementById("eaCity").value = addr.city || "";
  document.getElementById("eaState").value = addr.state || "";
  document.getElementById("eaZip").value = addr.zip || "";
  document.getElementById("eaError").style.display = "none";
  document.getElementById("editAddressModal").style.display = "flex";
}

async function saveEditedAddress() {
  const orderId = document.getElementById("eaOrderId").value;
  const street = document.getElementById("eaStreet").value.trim();
  const city   = document.getElementById("eaCity").value.trim();
  const state  = document.getElementById("eaState").value.trim().toUpperCase();
  const zip    = document.getElementById("eaZip").value.trim();

  const errEl = document.getElementById("eaError");
  if (!street || !city || !state || !zip) {
    errEl.textContent = "Street, city, state, and ZIP are all required for a freight quote.";
    errEl.style.display = "block";
    return;
  }
  if (!/^[A-Z]{2}$/.test(state)) {
    errEl.textContent = "State should be a 2-letter code, e.g. NC.";
    errEl.style.display = "block";
    return;
  }
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    errEl.textContent = "ZIP should be 5 digits (or 5+4), e.g. 27962.";
    errEl.style.display = "block";
    return;
  }
  errEl.style.display = "none";

  const btn = document.getElementById("eaSaveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const { error } = await window.sb.from("orders")
    .update({ shipping_address: { street, city, state, zip }, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  btn.disabled = false; btn.textContent = "Save Address";

  if (error) {
    errEl.textContent = "Could not save: " + error.message;
    errEl.style.display = "block";
    return;
  }

  document.getElementById("editAddressModal").style.display = "none";
  showToast("Ship-to address saved.");
  openOrderModal(orderId);
}

// Switches an order between carrier shipping, warehouse pickup, and
// in-house delivery. Deliberately does not touch shipping_address or any
// existing freight_quote/estes_* fields -- toggling back to ship should
// not silently lose an address someone already entered, and if staff
// toggle away then back, the old ship data is still there to resume from.
async function setFulfillmentMethod(orderId, method) {
  // Switching an already-invoiced order to in-house here does NOT add a
  // delivery fee: the customer was already billed a fixed total and may
  // have paid it. The fee is set on the quote, before money changes hands.
  const { error } = await window.sb.from("orders")
    .update({ fulfillment_method: method, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) { alert("Could not update: " + error.message); return; }
  const label = {
    pickup:   "Order switched to warehouse pickup.",
    in_house: "Order switched to in-house delivery. Estes/Shippo skipped.",
    ship:     "Order switched to carrier shipping.",
  }[method] || "Order updated.";
  showToast(label);
  openOrderModal(orderId);
}

// Sets/updates the in-house delivery fee on an order that hasn't been PAID
// yet. Recomputes `total` around the change (rather than just overwriting
// it) so a fee edited a second time doesn't stack on top of the old one --
// new total = current total with the OLD fee backed out, plus the new fee.
// Blocked only once the order is actually "paid" -- "pending_invoice" is
// the normal, expected status for an order awaiting its first invoice, not
// evidence one already went out; the fee can (and should) still be set
// right up until real money has moved.
async function saveInHouseDeliveryFee(orderId) {
  const input = document.getElementById("inHouseFeeInput");
  if (!input) return;
  const newFee = Math.max(0, parseFloat(input.value) || 0);

  const { data: o, error: readErr } = await window.sb
    .from("orders").select("total, in_house_delivery_fee, payment_status").eq("id", orderId).single();
  if (readErr || !o) { alert("Could not load the order: " + (readErr?.message || "not found")); return; }
  if (o.payment_status === "paid") {
    alert("This order has already been paid — the delivery fee can't be changed anymore.");
    openOrderModal(orderId);
    return;
  }

  const currentFee = Number(o.in_house_delivery_fee || 0);
  const newTotal = Math.max(0, Number(o.total || 0) - currentFee + newFee);

  const { error } = await window.sb.from("orders")
    .update({ in_house_delivery_fee: newFee, total: newTotal, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) { alert("Could not save the delivery fee: " + error.message); return; }

  showToast(`Delivery fee set to $${newFee.toFixed(2)}.`);
  openOrderModal(orderId);
  renderOrdersTable();
}

async function markPickedUp(orderId) {
  if (!confirm("Mark this order as picked up by the customer?")) return;
  const { error } = await window.sb.from("orders")
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) { alert("Could not update: " + error.message); return; }
  showToast("Order marked picked up.");
  openOrderModal(orderId);
  renderOrdersTable();
}

// One-time backfill for an order that was marked paid before proof-of-
// payment capture existed (api/stripe-webhook.js only writes it at the
// moment a payment actually completes). Searches Stripe directly for the
// real transaction rather than fabricating anything -- see
// api/lookup-payment-proof.js for how the match is found.
async function lookupPaymentProof(orderId) {
  const btn = document.getElementById("lookupProofBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Searching Stripe…"; }

  try {
    const res = await fetch("/api/lookup-payment-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Lookup failed");

    showToast(result.receipt_url ? "Found it — receipt attached." : "Found it — payment reference attached.");
    openOrderModal(orderId);
    renderOrdersTable();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = "🔎 Look Up Payment"; }
    alert("Couldn't find a matching Stripe payment: " + err.message);
  }
}

// Set on every openOrderModal() call so the invoice-preview/terms-agreement
// flows below (shared with the quote-request modal) can read the currently
// open order's email/business/total without a second query.
let currentOrderData = null;

const REORDER_FREQUENCY_LABELS = {
  weekly: "Weekly", every_2_weeks: "Every 2 Weeks", monthly: "Monthly",
  "45_days": "Every 45 Days", "60_days": "Every 60 Days", custom: "Custom Schedule",
};

// Shows either the live schedule (on the order that owns it) or a
// provenance note (on a draft the daily sweep generated from one) --
// never both, since a generated draft always carries reorder_active=false.
function renderReorderPanel(o) {
  if (o.reorder_active) {
    const freqLabel = REORDER_FREQUENCY_LABELS[o.reorder_frequency] || o.reorder_frequency || "—";
    return `
      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <strong style="font-size:13px;color:#1e3a8a;display:block">🔁 Reorder Schedule Active — ${escHtml(freqLabel)}</strong>
          <span style="font-size:12px;color:#3b5f9e">Next order will be prepared and emailed ${o.reorder_next_date ? "on " + fmt(o.reorder_next_date) : "soon"}.</span>
        </div>
        <button onclick="cancelOrderReorderSchedule('${o.id}')"
          style="background:#fff;color:#dc2626;border:1.5px solid #fca5a5;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">
          Cancel Schedule
        </button>
      </div>`;
  }
  if (o.reorder_source_order_id) {
    return `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:#64748b">
        🔁 Generated automatically by a reorder schedule. <a href="#" onclick="openOrderModal('${o.reorder_source_order_id}');return false" style="color:#0b2d52;font-weight:700">View original order &rarr;</a>
      </div>`;
  }
  return "";
}

/* ── Edit Order Items ─────────────────────────────────────────
   No matching UI existed at all before this -- order_items rendered as a
   flat read-only table, so a corrected invoice (wrong qty, a discontinued
   product swapped for another, a free-goods line) had nowhere to go except
   a brand new order. This lets staff fix the SAME order's items in place;
   re-sending the invoice afterward (the existing Preview & Email Invoice
   button) picks up the new items automatically since that endpoint reads
   order_items live. */

let _oiRowSeq = 0;
let _oiProducts = null; // cached across rows/opens within a session -- catalog doesn't change mid-edit

async function oiLoadProducts() {
  if (_oiProducts) return _oiProducts;
  const { data } = await window.sb.from("products")
    .select("id, name, price, price_tier1")
    .eq("is_active", true)
    .order("name");
  _oiProducts = data || [];
  return _oiProducts;
}

// Selecting a catalog product fills in name + price (still hand-editable
// afterward, since an invoice can carry a negotiated price that differs
// from the current catalog one -- the dropdown is a fast starting point,
// not a lock). "— Custom item —" (empty value) leaves both alone so a
// free-goods or one-off line typed by hand isn't clobbered by the picker.
function oiProductPicked(select) {
  const row = select.closest(".oi-row");
  const opt = select.selectedOptions[0];
  if (!select.value || !opt) return;
  row.querySelector(".oi-name").value = opt.textContent;
  row.querySelector(".oi-price").value = Number(opt.dataset.price || 0).toFixed(2);
}

function oiRowHtml(id, name, qty, price) {
  // Pre-select the dropdown when this row's name matches a real catalog
  // product exactly (case-insensitive) -- existing order items were named
  // from whatever the invoice/checkout captured at the time, so this is a
  // best-effort match, not a guarantee; anything that doesn't match just
  // starts on "Custom item" with its name/price already filled in as-is.
  const matched = _oiProducts?.find(p => p.name.toLowerCase() === String(name || "").trim().toLowerCase());
  const options = (_oiProducts || []).map(p => {
    const unitPrice = p.price_tier1 ?? p.price ?? 0;
    return `<option value="${p.id}" data-price="${unitPrice}"${matched?.id === p.id ? " selected" : ""}>${escHtml(p.name)}</option>`;
  }).join("");

  return `
    <div class="oi-row" data-row-id="${id}" style="display:grid;grid-template-columns:1.3fr 1fr 70px 100px 32px;gap:8px;align-items:center">
      <select class="oi-product" onchange="oiProductPicked(this)" style="padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px;background:#fff">
        <option value="">— Custom item —</option>
        ${options}
      </select>
      <input type="text" class="oi-name" value="${escHtml(name || "")}" placeholder="Product name" style="padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px">
      <input type="number" class="oi-qty" value="${qty}" min="0" step="1" style="padding:8px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px;text-align:center">
      <input type="number" class="oi-price" value="${Number(price).toFixed(2)}" min="0" step="0.01" style="padding:8px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px;text-align:right">
      <button type="button" onclick="this.closest('.oi-row').remove()" title="Remove"
        style="background:#fff;color:#dc2626;border:1.5px solid #fca5a5;border-radius:7px;width:32px;height:32px;font-size:15px;cursor:pointer;line-height:1">&times;</button>
    </div>`;
}

function addOrderItemRow(name, qty, price) {
  const wrap = document.getElementById("orderItemsRows");
  wrap.insertAdjacentHTML("beforeend", oiRowHtml(_oiRowSeq++, name || "", qty ?? 1, price ?? 0));
}

async function openEditOrderItems(orderId) {
  document.getElementById("oiOrderId").value = orderId;
  document.getElementById("orderItemsError").style.display = "none";
  const wrap = document.getElementById("orderItemsRows");
  wrap.innerHTML = `<div class="a-empty">Loading…</div>`;
  openModal("orderItemsModal");

  const [{ data: items }] = await Promise.all([
    window.sb.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    oiLoadProducts(),
  ]);
  wrap.innerHTML = "";
  (items || []).forEach(i => addOrderItemRow(i.product_name || i.name, i.quantity, i.price_per_case ?? i.price));
  if (!items || !items.length) addOrderItemRow("", 1, 0);
}

async function saveOrderItems() {
  const errEl = document.getElementById("orderItemsError");
  const orderId = document.getElementById("oiOrderId").value;
  const btn = document.getElementById("oiSaveBtn");

  const rows = [...document.querySelectorAll("#orderItemsRows .oi-row")].map(row => ({
    name: row.querySelector(".oi-name").value.trim(),
    quantity: parseInt(row.querySelector(".oi-qty").value) || 0,
    price: parseFloat(row.querySelector(".oi-price").value) || 0,
  })).filter(r => r.name && r.quantity > 0);

  if (!rows.length) { errEl.textContent = "Add at least one item with a name and quantity."; errEl.style.display = "block"; return; }

  errEl.style.display = "none";
  btn.disabled = true; btn.textContent = "Saving…";

  try {
    // Delete-then-insert rather than diffing row-by-row -- simplest correct
    // way to handle adds/removes/edits together, and order_items carries no
    // other data (no FKs pointing at a specific row) that a wholesale
    // replace would orphan.
    const { error: delErr } = await window.sb.from("order_items").delete().eq("order_id", orderId);
    if (delErr) throw delErr;

    const { error: insErr } = await window.sb.from("order_items").insert(
      rows.map(r => ({ order_id: orderId, product_name: r.name, quantity: r.quantity, price_per_case: r.price }))
    );
    if (insErr) throw insErr;

    // Total = new items + whatever delivery fee/tax were already on the
    // order -- editing items shouldn't silently wipe out a delivery fee or
    // tax that was set separately.
    const { data: o } = await window.sb.from("orders").select("in_house_delivery_fee, fulfillment_method, tax_amount").eq("id", orderId).single();
    const itemsTotal = rows.reduce((s, r) => s + r.price * r.quantity, 0);
    const deliveryFee = o?.fulfillment_method === "in_house" ? Number(o.in_house_delivery_fee || 0) : 0;
    const taxAmount = Number(o?.tax_amount || 0);
    const newTotal = itemsTotal + deliveryFee + taxAmount;

    const { error: updErr } = await window.sb.from("orders")
      .update({ subtotal: itemsTotal, total: newTotal, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (updErr) throw updErr;

    closeModal("orderItemsModal");
    showToast("Items updated.");
    openOrderModal(orderId);
    renderOrdersTable();
  } catch (err) {
    errEl.textContent = "Error: " + err.message;
    errEl.style.display = "block";
  } finally {
    btn.disabled = false; btn.textContent = "Save Items";
  }
}

async function cancelOrderReorderSchedule(orderId) {
  if (!confirm("Cancel this reorder schedule? No further automatic reorders will be generated.")) return;
  const { error } = await window.sb.from("orders").update({ reorder_active: false }).eq("id", orderId);
  if (error) { showToast("Error: " + error.message); return; }
  showToast("Reorder schedule cancelled.");
  openOrderModal(orderId);
  renderOrdersTable();
}

async function openOrderModal(id) {
  const { data: o } = await window.sb.from("orders").select("*, order_items(*)").eq("id", id).single();
  if (!o) return;
  currentOrderData = o;
  const addr = o.shipping_address || {};
  const isPending    = o.status === "pending";
  const isConfirmed  = o.status === "confirmed";
  const isCancelled  = o.status === "cancelled";
  const estesBooked  = !!o.estes_bol_number;
  const freightQuote = o.freight_quote ? (typeof o.freight_quote === "string" ? JSON.parse(o.freight_quote) : o.freight_quote) : null;
  const estesQuoted  = freightQuote?.carrier_name === "Estes Express";
  // Reported live: an invoice-created order for a customer picking up in
  // person got routed through the Estes rate flow purely because every
  // order implicitly assumed shipping. fulfillment_method (default
  // 'ship') lets staff mark an order as warehouse pickup instead, which
  // skips freight entirely -- see the pickup branch below.
  const isPickup     = o.fulfillment_method === "pickup";
  // In-house delivery: we drive it out ourselves for a fee set on the
  // quote. Like pickup, it deliberately hides the Estes/Shippo buttons --
  // booking a paid carrier pickup for an order we are delivering would be
  // a real, billable mistake.
  const isInHouse    = o.fulfillment_method === "in_house";
  const deliveryFee  = Number(o.in_house_delivery_fee || 0);
  const itemsTotal   = (o.order_items || []).reduce((s, i) => s + Number(i.price ?? i.price_per_case ?? 0) * Number(i.quantity ?? 1), 0);
  const taxAmount    = Number(o.tax_amount || 0);
  const taxRate      = Number(o.tax_rate || 0);

  // Action bar — only show for actionable statuses
  let actionBar = "";
  if (isPending && isPickup) {
    actionBar = `
      <div style="background:#fff7f0;border:1.5px solid #fed7aa;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <span style="font-size:20px;">🏪</span>
          <div>
            <strong style="font-size:14px;color:#9a3412;display:block;">Warehouse Pickup — No Freight Needed</strong>
            <span style="font-size:12px;color:#7c3f12;">Customer will collect this order in person. Mark it picked up once they've taken it.</span>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="markPickedUp('${o.id}')"
            style="flex:2;min-width:180px;background:#ED7226;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            ✅ Mark Picked Up
          </button>
          <button onclick="cancelOrderFromModal('${o.id}')"
            style="flex:1;min-width:120px;background:#fff;color:#dc2626;border:1.5px solid #fca5a5;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:600;cursor:pointer;">
            ✕ Cancel Order
          </button>
        </div>
      </div>`;
  } else if (isPending && isInHouse) {
    // Editable until actually paid: "pending_invoice" just means this order
    // is billed by invoice rather than checkout card capture -- it is the
    // NORMAL, expected status for an order that still needs its delivery
    // fee set before the (first) invoice goes out, not evidence one
    // already did. Only a real "paid" means the customer was charged a
    // fixed total already, which is the actual point past which changing
    // the fee would silently disagree with money that already moved.
    const feeIsLocked = o.payment_status === "paid";
    const feeEditor = feeIsLocked
      ? (deliveryFee > 0 ? `<span style="font-size:12px;color:#7c3f12;">Delivery fee <strong>$${deliveryFee.toFixed(2)}</strong> is locked in — this order has already been paid.</span>` : "")
      : `<div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
           <label style="font-size:12px;font-weight:700;color:#7c3f12;white-space:nowrap;">Delivery Fee $</label>
           <input id="inHouseFeeInput" type="number" min="0" step="0.01" value="${deliveryFee > 0 ? deliveryFee.toFixed(2) : ""}" placeholder="0.00"
             style="width:100px;padding:7px 10px;border:1.5px solid #fed7aa;border-radius:8px;font-size:13px;outline:none;">
           <button onclick="saveInHouseDeliveryFee('${o.id}')"
             style="background:#0b2d52;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;">
             Save Fee
           </button>
         </div>`;
    actionBar = `
      <div style="background:#fff7f0;border:1.5px solid #fed7aa;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <div>
            <strong style="font-size:14px;color:#9a3412;display:block;">In-House Delivery — No Carrier Needed</strong>
            <span style="font-size:12px;color:#7c3f12;">We deliver this order ourselves${deliveryFee > 0 && feeIsLocked ? ` for <strong>$${deliveryFee.toFixed(2)}</strong>, already billed on the invoice` : ""}. Mark it delivered once it's dropped off.</span>
            ${feeEditor}
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="markPickedUp('${o.id}')"
            style="flex:2;min-width:180px;background:#ED7226;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            ✅ Mark Delivered
          </button>
          <button onclick="setFulfillmentMethod('${o.id}','ship')"
            style="flex:1;min-width:150px;background:#fff;color:#0b2d52;border:1.5px solid #0b2d52;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:600;cursor:pointer;">
            Switch to carrier
          </button>
          <button onclick="cancelOrderFromModal('${o.id}')"
            style="flex:1;min-width:120px;background:#fff;color:#dc2626;border:1.5px solid #fca5a5;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:600;cursor:pointer;">
            ✕ Cancel Order
          </button>
        </div>
      </div>`;
  } else if (isPending) {
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
        <div><strong style="color:#15803d;font-size:13px;display:block;">${isPickup ? "Picked Up" : "Order Confirmed"}</strong></div>
      </div>`;
  }

  // Same badge quotes show ("Sent — Awaiting Response" / "Accepted") --
  // termsStatusBadge() just reads generic terms_status/terms_sent_at/
  // terms_accepted_at field names, which orders now carry too
  // (20260820b_order_terms_agreement.sql), so the exact same function
  // works unmodified for either.
  const termsBadge = termsStatusBadge(o);
  const reorderPanel = renderReorderPanel(o);

  document.getElementById("orderModalBody").innerHTML = `
    ${actionBar}
    ${termsBadge}
    ${reorderPanel}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13.5px;margin-bottom:16px;">
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Order #</span><br><strong>${escHtml(o.order_number)}</strong></div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Status</span><br><span class="a-badge ${badgeClass(o.status)}">${o.status}</span></div>
      <div>
        <span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Payment</span><br>
        <span class="a-badge ${paymentBadgeClass(o.payment_status)}">${paymentBadgeLabel(o.payment_status)}</span>
        ${o.payment_status === "paid" && (o.receipt_url || o.stripe_payment_intent_id) ? `
          <a href="${o.receipt_url ? escHtml(o.receipt_url) : `https://dashboard.stripe.com/${o.stripe_livemode === false ? "test/" : ""}payments/${escHtml(o.stripe_payment_intent_id)}`}"
            target="_blank" rel="noopener" style="margin-left:6px;font-size:11.5px;font-weight:700;color:#16a34a;text-decoration:none">
            ${o.receipt_url ? "View Receipt" : "View in Stripe"} &rarr;
          </a>` : ""}
        ${o.payment_status === "paid" && o.paid_at ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">Paid ${fmt(o.paid_at)}</div>` : ""}
        ${o.payment_status === "paid" && !o.stripe_payment_intent_id ? `
          <button onclick="lookupPaymentProof('${o.id}')" id="lookupProofBtn"
            style="margin-top:4px;height:24px;padding:0 9px;border-radius:6px;border:1px solid #d0d7e0;background:#fff;color:#475569;font-size:11px;font-weight:600;cursor:pointer">
            🔎 Look Up Payment
          </button>` : ""}
      </div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Customer</span><br>${escHtml(o.customer_name || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Business</span><br>${escHtml(o.business_name || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Email</span><br>${escHtml(o.customer_email || "—")}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Phone</span><br>${escHtml(o.phone || "—")}</div>
      <div style="grid-column:span 2">
        <span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${isPickup || isInHouse ? "Fulfillment" : "Ship To"}</span><br>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px">
          <span>${isPickup
            ? "🏪 Warehouse pickup"
            : isInHouse
              ? `🚚 In-house delivery${deliveryFee > 0 ? ` — $${deliveryFee.toFixed(2)}` : ""}${addr.street ? ` &nbsp;·&nbsp; ${escHtml([addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", "))}` : ""}`
              : escHtml([addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", ") || "—")}</span>
          ${isPickup
            ? `<button onclick="setFulfillmentMethod('${o.id}','ship')" class="a-ship-action-btn a-ship-action-outline">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                 Switch to shipping
               </button>`
            : isInHouse
            ? `<button onclick="openEditAddressModal('${o.id}')" class="a-ship-action-btn ${addr.street ? "a-ship-action-outline" : "a-ship-action-primary"}">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                 ${addr.street ? "Edit address" : "Add address"}
               </button>`
            : `<button onclick="openEditAddressModal('${o.id}')" class="a-ship-action-btn ${addr.street ? "a-ship-action-outline" : "a-ship-action-primary"}">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                 ${addr.street ? "Edit address" : "Add address"}
               </button>
               <button onclick="setFulfillmentMethod('${o.id}','in_house')" class="a-ship-action-btn a-ship-action-outline">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                 Deliver in-house
               </button>
               <button onclick="setFulfillmentMethod('${o.id}','pickup')" class="a-ship-action-btn a-ship-action-outline">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                 Switch to pickup
               </button>`}
        </div>
      </div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Type</span><br>${o.order_type === "reorder" ? "Reorder" : "One-Time"}</div>
      <div><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Date</span><br>${fmt(o.created_at)}</div>
      ${freightQuote ? `<div style="grid-column:span 2"><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Freight Quote</span><br>${escHtml(freightQuote.carrier_name || "—")} — $${Number(freightQuote.total_charge || 0).toFixed(2)}${freightQuote.transit_days ? ` (${freightQuote.transit_days} days)` : ""}</div>` : ""}
    </div>
    <hr style="margin:16px 0;border:none;border-top:1px solid #f0f4fa">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <h4 style="margin:0;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Items</h4>
      ${o.payment_status === "paid"
        ? `<span style="font-size:11.5px;color:#94a3b8" title="This order is already paid -- items are locked.">🔒 Locked (paid)</span>`
        : `<button onclick="openEditOrderItems('${o.id}')" style="background:#fff;color:#0b2d52;border:1.5px solid #cbd5e1;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">✎ Edit Items</button>`}
    </div>
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
        ${isInHouse && deliveryFee > 0 ? `<tr style="border-top:1px solid #f0f4fa">
          <td style="padding:9px 12px">In-House Delivery<span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px">Delivered by Room Ready Supply</span></td>
          <td style="text-align:center;padding:9px 8px">&mdash;</td>
          <td style="text-align:right;padding:9px 8px">&mdash;</td>
          <td style="text-align:right;padding:9px 8px;font-weight:600">$${deliveryFee.toFixed(2)}</td>
        </tr>` : ""}
        ${taxAmount > 0 ? `<tr style="border-top:1px solid #f0f4fa">
          <td style="padding:9px 12px">Sales Tax${addr.state ? ` <span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px">${escHtml(addr.state)}${taxRate ? ` &middot; ${(taxRate * 100).toFixed(2)}%` : ""}</span>` : ""}</td>
          <td style="text-align:center;padding:9px 8px">&mdash;</td>
          <td style="text-align:right;padding:9px 8px">&mdash;</td>
          <td style="text-align:right;padding:9px 8px;font-weight:600">$${taxAmount.toFixed(2)}</td>
        </tr>` : ""}
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
    ${o.payment_status !== "paid" ? `
    <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:10px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Sales Tax</h4>
    <p style="font-size:12.5px;color:#64748b;margin:0 0 10px;">Pick the ship-to state and the rate is looked up and applied automatically -- same table checkout and quotes use. Recalculating updates the order total and the invoice below.</p>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px">
      <select id="orderTaxState" class="a-select" style="height:34px;border-radius:8px;font-size:12.5px;padding:0 8px;width:auto">
        <option value="">State</option>
        <option value="AL">Alabama</option><option value="AK">Alaska</option><option value="AZ">Arizona</option>
        <option value="AR">Arkansas</option><option value="CA">California</option><option value="CO">Colorado</option>
        <option value="CT">Connecticut</option><option value="DE">Delaware</option><option value="DC">District of Columbia</option>
        <option value="FL">Florida</option><option value="GA">Georgia</option><option value="HI">Hawaii</option>
        <option value="ID">Idaho</option><option value="IL">Illinois</option><option value="IN">Indiana</option>
        <option value="IA">Iowa</option><option value="KS">Kansas</option><option value="KY">Kentucky</option>
        <option value="LA">Louisiana</option><option value="ME">Maine</option><option value="MD">Maryland</option>
        <option value="MA">Massachusetts</option><option value="MI">Michigan</option><option value="MN">Minnesota</option>
        <option value="MS">Mississippi</option><option value="MO">Missouri</option><option value="MT">Montana</option>
        <option value="NE">Nebraska</option><option value="NV">Nevada</option><option value="NH">New Hampshire</option>
        <option value="NJ">New Jersey</option><option value="NM">New Mexico</option><option value="NY">New York</option>
        <option value="NC">North Carolina</option><option value="ND">North Dakota</option><option value="OH">Ohio</option>
        <option value="OK">Oklahoma</option><option value="OR">Oregon</option><option value="PA">Pennsylvania</option>
        <option value="RI">Rhode Island</option><option value="SC">South Carolina</option><option value="SD">South Dakota</option>
        <option value="TN">Tennessee</option><option value="TX">Texas</option><option value="UT">Utah</option>
        <option value="VT">Vermont</option><option value="VA">Virginia</option><option value="WA">Washington</option>
        <option value="WV">West Virginia</option><option value="WI">Wisconsin</option><option value="WY">Wyoming</option>
      </select>
      <button onclick="saveOrderTax('${o.id}')"
        style="height:34px;padding:0 14px;border-radius:8px;font-size:12.5px;font-weight:700;background:#0b2d52;color:#fff;border:none;cursor:pointer;white-space:nowrap;">
        Save &amp; Recalculate Tax
      </button>
      <span style="font-size:11.5px;color:#64748b;">${taxAmount > 0 ? `Currently taxed at ${(taxRate * 100).toFixed(2)}% ($${taxAmount.toFixed(2)})` : ""}</span>
    </div>
    <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:10px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Invoice &amp; Payment</h4>
    <p style="font-size:12.5px;color:#64748b;margin:0 0 10px;">This order hasn't been paid yet. Preview the invoice, then email it with a one-click Stripe pay link -- no site visit or login needed on her end.</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button onclick="previewOrderInvoice('${o.id}')"
        style="background:#16a34a;color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;">
        &#128179; Preview &amp; Email Invoice
      </button>
      <button onclick="openTermsAgreementModalForOrder('${o.id}')"
        style="background:#fff;color:#0d1f38;border:1.5px solid #d0d7e0;border-radius:9px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">
        &#128196; Terms Agreement
      </button>
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
  const taxStateEl = document.getElementById("orderTaxState");
  if (taxStateEl) taxStateEl.value = addr.state || "";
  openModal("orderModal");
}

// Applies real, stored sales tax to an order that hasn't been paid yet --
// the orders table never had a working tax_amount column live (the
// create-orders migration defines one, but it was never actually applied;
// see the send-invoice.js comment for the same schema-drift issue). Tax
// is calculated off items + delivery fee (same taxable base checkout,
// quotes, and send-invoice.js all use), and the total is fully recomputed
// from those three known-good numbers rather than adjusted incrementally
// -- unlike the delivery fee, there's no "old tax" to back out first since
// this is the first time tax has ever been a first-class, stored value
// here rather than folded silently into whatever total already existed.
async function saveOrderTax(orderId) {
  const select = document.getElementById("orderTaxState");
  if (!select) return;
  const state = select.value;

  const { data: o, error: readErr } = await window.sb
    .from("orders").select("total, in_house_delivery_fee, payment_status, order_items(*)").eq("id", orderId).single();
  if (readErr || !o) { alert("Could not load the order: " + (readErr?.message || "not found")); return; }
  if (o.payment_status === "paid") {
    alert("This order has already been paid — tax can't be changed anymore.");
    openOrderModal(orderId);
    return;
  }

  const itemsTotal = (o.order_items || []).reduce((s, i) => s + Number(i.price_per_case ?? i.price ?? 0) * Number(i.quantity ?? 1), 0);
  const deliveryFee = Number(o.in_house_delivery_fee || 0);
  const rate = state ? (window.getTaxRate?.(state) || 0) : 0;
  const taxAmount = (itemsTotal + deliveryFee) * rate;
  const newTotal = itemsTotal + deliveryFee + taxAmount;

  const { error } = await window.sb.from("orders")
    .update({ tax_rate: rate, tax_amount: taxAmount, total: newTotal, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    // 42703 = undefined column -- the tax_rate/tax_amount columns this
    // needs (20260820_order_sales_tax.sql) haven't been added live yet.
    alert(error.code === "42703"
      ? "Sales tax isn't set up on the database yet — run the migration 20260820_order_sales_tax.sql in Supabase, then try again."
      : "Could not save the tax: " + error.message);
    return;
  }

  showToast(state ? `Tax set: ${state} at ${(rate * 100).toFixed(2)}% ($${taxAmount.toFixed(2)}).` : "Tax cleared (no state selected).");
  openOrderModal(orderId);
  if (typeof renderOrdersTable === "function") renderOrdersTable();
}

async function resendReceipt(orderId) {
  const email = document.getElementById('resendEmailInput')?.value.trim();
  const resultEl = document.getElementById('resendResult');
  if (!email) { resultEl.style.display='block'; resultEl.style.color='#dc2626'; resultEl.textContent='Please enter an email address.'; return; }

  const btn = document.querySelector('[onclick="resendReceipt(\'' + orderId + '\')"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  const { data: o } = await window.sb.from('orders').select('*, order_items(*)').eq('id', orderId).single();
  if (!o) { if (btn) { btn.disabled=false; btn.textContent='✉ Send Receipt'; } return; }

  const ANON = 'sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN';
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

  const ANON = 'sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN';
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

  const SUPABASE_ANON_KEY = "sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN";

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
const SUPABASE_ANON_KEY_ESTES = "sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN";
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

  // The action bar only offers this button for ship orders, but guard it
  // directly too -- a pickup order should never be able to trigger a
  // freight quote, full stop, regardless of what called this.
  if (order?.fulfillment_method === "pickup") {
    if (resultEl) {
      resultEl.innerHTML = `<div style="background:#fff7f0;border:1.5px solid #fed7aa;border-radius:10px;padding:12px 16px;">
        <strong style="color:#9a3412;font-size:13px;">This order is marked as warehouse pickup — no freight quote needed.</strong>
      </div>`;
    }
    return;
  }

  // Invoice- and terms-agreement-created orders never collect an address
  // (see api/send-invoice.js), so this is a real, expected case -- not
  // just defensive coding. Catching it here means a clear, actionable
  // message instead of Estes's raw "City, State, Zip... not valid
  // together" error, which is what an empty city/state/zip produces.
  if (!addr.city || !addr.state || !addr.zip) {
    if (resultEl) {
      resultEl.innerHTML = `<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px 16px;">
        <strong style="color:#dc2626;font-size:13px;display:block;margin-bottom:4px;">⚠️ No shipping address on file</strong>
        <span style="color:#b91c1c;font-size:12px;">This order has no ship-to address yet -- click "Add address" next to Ship To above, then try the quote again.</span>
      </div>`;
    }
    return;
  }

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

// RRS-19: a customer can now have multiple businesses under one account
// (public.businesses), so this lists one row PER BUSINESS instead of one
// per account -- matching how the mockup's admin table shows the same
// account twice for two different businesses. A customer with no
// businesses row yet (pre-migration/legacy accounts) falls back to a
// synthetic row built from their profile fields, same fallback account.html
// uses, so nobody just disappears from this table.
async function renderUsersTable(filter) {
  filter = filter || "";
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading…</td></tr>`;

  const { data: users } = await window.sb.from("profiles").select("*").eq("role","customer").order("created_at",{ascending:false});
  const userIds = (users || []).map(u => u.id);
  const { data: businesses } = userIds.length
    ? await window.sb.from("businesses").select("*").in("user_id", userIds).order("created_at")
    : { data: [] };

  const bizByUser = {};
  (businesses || []).forEach(b => { (bizByUser[b.user_id] ||= []).push(b); });

  let rows = [];
  (users || []).forEach(u => {
    const bizList = bizByUser[u.id]?.length ? bizByUser[u.id] : [{
      id: null, profile_id: u.id, business_name: u.business_name, business_type: u.business_type,
      contact_name: u.contact_name, phone: u.phone, email: u.email, created_at: u.created_at,
    }];
    bizList.forEach(b => rows.push({
      profileId: u.id, bizId: b.id,
      contact_name: b.contact_name || u.contact_name,
      business_name: b.business_name,
      business_type: b.business_type,
      email: b.email || u.email,
      phone: b.phone || u.phone,
      created_at: b.created_at || u.created_at,
    }));
  });

  if (filter) {
    const f = filter.toLowerCase();
    rows = rows.filter(r => (r.business_name || "").toLowerCase().includes(f));
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escHtml(r.contact_name  || "—")}</td>
      <td>${escHtml(r.business_name || "—")}</td>
      <td>${escHtml(r.business_type || "—")}</td>
      <td>${escHtml(r.email         || "—")}</td>
      <td>${escHtml(r.phone         || "—")}</td>
      <td>${fmt(r.created_at)}</td>
      <td><button class="a-btn-sm a-btn-danger" onclick="${r.bizId ? `removeBusinessRow('${r.bizId}')` : `deleteUser('${r.profileId}')`}">Remove</button></td>
    </tr>`).join("") || `<tr><td colspan="7" class="a-empty">No customers yet.</td></tr>`;
}

document.getElementById("userSearch")?.addEventListener("input", e => renderUsersTable(e.target.value.trim()));

async function deleteUser(id) {
  if (!confirm("Remove this user? This cannot be undone.")) return;
  await window.sb.from("profiles").delete().eq("id", id);
  showToast("User removed.");
  renderUsersTable();
}

// Removes a single business under a customer's account -- not the account
// itself. Their order/quote history is untouched (business_name is stored
// as free text on those rows, not a foreign key to this table).
async function removeBusinessRow(bizId) {
  if (!confirm("Remove this business? The customer's past orders and quotes for it are unaffected.")) return;
  const { error } = await window.sb.from("businesses").delete().eq("id", bizId);
  if (error) { showToast("Couldn't remove business: " + error.message); return; }
  showToast("Business removed.");
  renderUsersTable();
}

/* ── CRM & Leads (Marketing Account, Phase 1) ─────────────────
   A "lead" is a quote_requests row, not a separate record -- see the note
   at the top of the 20260828_marketing_crm.sql migration for why. This
   board follows the exact same board/drawer/drag-drop shape as the dev
   ticket board above (reuses its .tkt-board/.tkt-card/.tkt-drawer CSS),
   just against quote_requests + crm_activity_log instead of dev_tickets +
   dev_ticket_comments. */

const CRM_STATUS = [
  { key:"new",             label:"New Lead" },
  { key:"contacted",       label:"Contacted" },
  { key:"quote_sent",      label:"Quote Sent" },
  { key:"customer",        label:"Customer" },
  { key:"repeat_customer", label:"Repeat Customer" },
];
const CRM_STATUS_LABEL = Object.fromEntries(CRM_STATUS.map(s => [s.key, s.label]));
const CRM_SOURCES = ["Seamless","Landing Page","Website Checkout","Referral","Cold Call","Trade Show","Other"];
const CRM_ACTIVITY_TYPES = [
  { key:"call",      label:"Call" },
  { key:"email",      label:"Email" },
  { key:"note",       label:"Note" },
  { key:"follow_up",  label:"Follow-Up" },
  { key:"other",      label:"Other" },
];

const _crm = {
  leads: [],
  activityCounts: {},   // quote_request_id -> count
  reps: [],              // admin + marketing profiles, for the assigned-rep dropdown
  filters: { source:"all", rep:"all", q:"" },
};

async function renderCrmTab() {
  const panel = document.getElementById("tab-crm");
  if (!panel) return;
  panel.innerHTML = `<div class="a-empty" style="padding:50px">Loading leads…</div>`;

  const [leadsRes, activityRes, repsRes] = await Promise.all([
    window.sb.from("quote_requests").select("*").order("created_at", { ascending:false }),
    window.sb.from("crm_activity_log").select("quote_request_id"),
    window.sb.from("profiles").select("id,email,full_name,role").in("role", ["admin","marketing"]),
  ]);

  if (leadsRes.error) {
    panel.innerHTML = `<div class="a-empty" style="padding:50px">Couldn't load leads: ${escHtml(leadsRes.error.message)}<br><span style="font-size:12px;color:#94a3b8">If this says a column is missing, run the 20260828_marketing_crm.sql migration.</span></div>`;
    return;
  }

  _crm.leads = leadsRes.data || [];
  _crm.reps  = repsRes.data || [];
  _crm.activityCounts = {};
  (activityRes.data || []).forEach(a => { _crm.activityCounts[a.quote_request_id] = (_crm.activityCounts[a.quote_request_id] || 0) + 1; });

  // A lead's status only ever gets typed in here by staff, so a legacy or
  // externally-inserted row can carry something outside the 5-stage
  // pipeline (most commonly the older quote/detail workflow's own status
  // values) -- fall back to "new" for the board rather than dropping it.
  _crm.leads.forEach(l => { if (!CRM_STATUS_LABEL[l.status]) l.status = "new"; });

  panel.innerHTML = `
    <div class="tkt-header">
      <div>
        <h1 class="a-page-title">CRM &amp; Leads</h1>
        <p class="a-page-sub">Every quotation request, tracked from first contact through repeat business.</p>
      </div>
      <div class="tkt-header-actions">
        ${window._adminRole === "admin" ? `<button class="a-btn-secondary" onclick="openDevTeamModal()">Staff Accounts</button>` : ""}
      </div>
    </div>

    <div class="tkt-statstrip" id="crmStats"></div>

    <div class="tkt-filterbar">
      <div class="tkt-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="crmSearch" type="text" placeholder="Search business or contact…" value="${escHtml(_crm.filters.q)}" oninput="setCrmFilter('q', this.value)">
      </div>
      <select class="tkt-filtersel" onchange="setCrmFilter('source', this.value)">
        <option value="all">All sources</option>
        ${CRM_SOURCES.map(s => `<option value="${escHtml(s)}"${_crm.filters.source===s?" selected":""}>${escHtml(s)}</option>`).join("")}
      </select>
      <select class="tkt-filtersel" onchange="setCrmFilter('rep', this.value)">
        <option value="all">All reps</option>
        <option value="unassigned"${_crm.filters.rep==="unassigned"?" selected":""}>Unassigned</option>
        ${_crm.reps.map(r => `<option value="${r.id}"${_crm.filters.rep===r.id?" selected":""}>${escHtml(r.full_name || r.email)}</option>`).join("")}
      </select>
    </div>

    <div id="crmBoardWrap"></div>
  `;

  renderCrmStats();
  renderCrmBoard();
  updateCrmNavCount();
}

function renderCrmStats() {
  const el = document.getElementById("crmStats");
  if (!el) return;
  el.innerHTML = CRM_STATUS.map(col => {
    const n = _crm.leads.filter(l => l.status === col.key).length;
    return `<div class="tkt-stat"><span class="tkt-stat-n">${n}</span><span class="tkt-stat-l">${escHtml(col.label)}</span></div>`;
  }).join("");
}

function setCrmFilter(key, value) {
  _crm.filters[key] = value;
  renderCrmBoard();
}

function crmVisibleLeads() {
  const q = _crm.filters.q.trim().toLowerCase();
  return _crm.leads.filter(l => {
    if (_crm.filters.source !== "all" && (l.lead_source || "") !== _crm.filters.source) return false;
    if (_crm.filters.rep === "unassigned" && l.assigned_to) return false;
    if (_crm.filters.rep !== "all" && _crm.filters.rep !== "unassigned" && l.assigned_to !== _crm.filters.rep) return false;
    if (q) {
      const hay = `${l.business_name || ""} ${l.contact_name || ""} ${l.email || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderCrmBoard() {
  const wrap = document.getElementById("crmBoardWrap");
  if (!wrap) return;
  const visible = crmVisibleLeads();

  if (!_crm.leads.length) {
    wrap.innerHTML = `<div class="tkt-empty">
      <div class="tkt-empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      </div>
      <h3>No leads yet</h3>
      <p>Quotation requests submitted from the site will show up here automatically.</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `<div class="tkt-board">${CRM_STATUS.map(col => {
    const items = visible.filter(l => l.status === col.key);
    return `
      <section class="tkt-col" data-status="${col.key}"
        ondragover="crmDragOver(event)" ondragleave="crmDragLeave(event)" ondrop="crmDrop(event,'${col.key}')">
        <header class="tkt-col-head">
          <span class="tkt-col-dot tkt-dot-${col.key}"></span>
          <span class="tkt-col-title">${escHtml(col.label)}</span>
          <span class="tkt-col-count">${items.length}</span>
        </header>
        <div class="tkt-col-body">
          ${items.map(crmCard).join("") || `<div class="tkt-col-empty">Nothing here</div>`}
        </div>
      </section>`;
  }).join("")}</div>`;
}

function crmCard(l) {
  const rep = _crm.reps.find(r => r.id === l.assigned_to);
  const aCount = _crm.activityCounts[l.id] || 0;
  return `
    <article class="tkt-card" draggable="true"
      ondragstart="crmDragStart(event,'${l.id}')" ondragend="crmDragEnd(event)"
      onclick="openCrmDrawer('${l.id}')">
      <div class="tkt-card-top">
        <span class="tkt-num">${escHtml(l.customer_type || "—")}</span>
        ${l.lead_source ? `<span class="tkt-pri tkt-p-enhancement">${escHtml(l.lead_source)}</span>` : ""}
      </div>
      <p class="tkt-card-title">${escHtml(l.business_name || l.contact_name || "Unnamed lead")}</p>
      <div class="tkt-card-foot">
        <span class="tkt-type tkt-t-bug">${escHtml(l.contact_name || l.email || "")}</span>
        <div class="tkt-card-meta">
          ${aCount ? `<span class="tkt-chip" title="${aCount} activity entr${aCount>1?"ies":"y"}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${aCount}</span>` : ""}
          ${tktAvatar(rep?.email, 24)}
        </div>
      </div>
    </article>`;
}

/* Drag & drop between columns -- moving a card updates status immediately
   and logs a status_change activity entry, same as a manual status edit in
   the drawer would. */
let _crmDragId = null;
function crmDragStart(e, id) { _crmDragId = id; e.dataTransfer.effectAllowed = "move"; e.currentTarget.classList.add("dragging"); }
function crmDragEnd(e)       { _crmDragId = null; e.currentTarget.classList.remove("dragging"); document.querySelectorAll(".tkt-col.over").forEach(c => c.classList.remove("over")); }
function crmDragOver(e)      { e.preventDefault(); e.currentTarget.classList.add("over"); }
function crmDragLeave(e)     { e.currentTarget.classList.remove("over"); }
async function crmDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove("over");
  if (!_crmDragId) return;
  const id = _crmDragId; _crmDragId = null;
  await setCrmLeadStatus(id, status);
}

async function setCrmLeadStatus(id, status) {
  const lead = _crm.leads.find(x => x.id === id);
  if (!lead || lead.status === status) return;
  const from = lead.status;
  const { error } = await window.sb.from("quote_requests").update({ status }).eq("id", id);
  if (error) { showToast("Couldn't update lead: " + error.message); return; }
  lead.status = status;
  await logCrmActivity(id, "status_change", `Moved from "${CRM_STATUS_LABEL[from] || from}" to "${CRM_STATUS_LABEL[status] || status}"`, true);
  renderCrmStats();
  renderCrmBoard();
}

async function logCrmActivity(quoteRequestId, type, body, silent) {
  const { data: { user } } = await window.sb.auth.getUser();
  let authorName = null;
  if (user?.id) {
    const { data: p } = await window.sb.from("profiles").select("full_name").eq("id", user.id).single();
    authorName = p?.full_name || null;
  }
  const { error } = await window.sb.from("crm_activity_log").insert({
    quote_request_id: quoteRequestId,
    author_id: user?.id || null,
    author_name: authorName,
    activity_type: type,
    body,
  });
  if (error) { if (!silent) showToast("Couldn't log activity: " + error.message); return; }
  _crm.activityCounts[quoteRequestId] = (_crm.activityCounts[quoteRequestId] || 0) + 1;
}

function updateCrmNavCount() {
  const el = document.getElementById("crmNavCount");
  if (!el) return;
  const n = _crm.leads.filter(l => l.status === "new").length;
  el.textContent = n;
  el.style.display = n ? "inline-flex" : "none";
}

/* ── Lead detail drawer ───────────────────────────────────────── */

async function openCrmDrawer(id) {
  const overlay = document.getElementById("crmDrawerOverlay");
  const body    = document.getElementById("crmDrawerBody");
  overlay.style.display = "flex";
  requestAnimationFrame(() => overlay.classList.add("open"));

  const l = _crm.leads.find(x => x.id === id);
  if (!l) { body.innerHTML = `<div class="a-empty" style="padding:60px">Lead not found.</div>`; return; }

  const { data: activity } = await window.sb
    .from("crm_activity_log").select("*").eq("quote_request_id", id).order("created_at", { ascending:false });

  const items = Array.isArray(l.requested_items) ? l.requested_items : [];

  body.innerHTML = `
    <header class="tkt-dr-head">
      <div class="tkt-dr-headtop">
        <span class="tkt-num tkt-num-lg">Lead</span>
        <button class="tkt-iconbtn" title="Close" onclick="closeCrmDrawer(true)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <h2 class="tkt-dr-title">${escHtml(l.business_name || l.contact_name || "Unnamed lead")}</h2>
      <div class="tkt-dr-badges">
        <span class="tkt-type tkt-t-bug">${escHtml(l.customer_type || "—")}</span>
        <span class="tkt-status-pill tkt-dotbg-${l.status}">${escHtml(CRM_STATUS_LABEL[l.status] || l.status)}</span>
      </div>
    </header>

    <div class="tkt-dr-controls">
      <label class="tkt-dr-ctl">
        <span>Status</span>
        <select class="a-input" onchange="setCrmLeadStatus('${l.id}', this.value)">
          ${CRM_STATUS.map(s => `<option value="${s.key}"${l.status===s.key?" selected":""}>${escHtml(s.label)}</option>`).join("")}
        </select>
      </label>
      <label class="tkt-dr-ctl">
        <span>Lead Source</span>
        <select class="a-input" onchange="setCrmField('${l.id}','lead_source', this.value)">
          <option value=""${!l.lead_source?" selected":""}>— Not set —</option>
          ${CRM_SOURCES.map(s => `<option value="${escHtml(s)}"${l.lead_source===s?" selected":""}>${escHtml(s)}</option>`).join("")}
        </select>
      </label>
      <label class="tkt-dr-ctl">
        <span>Assigned Rep</span>
        <select class="a-input" onchange="setCrmField('${l.id}','assigned_to', this.value || null)">
          <option value=""${!l.assigned_to?" selected":""}>Unassigned</option>
          ${_crm.reps.map(r => `<option value="${r.id}"${l.assigned_to===r.id?" selected":""}>${escHtml(r.full_name || r.email)}</option>`).join("")}
        </select>
      </label>
    </div>

    <div class="tkt-dr-section">
      <h4>Contact</h4>
      <p class="tkt-dr-desc">${escHtml(l.contact_name || "—")}${l.email ? ` &middot; <a href="mailto:${escHtml(l.email)}">${escHtml(l.email)}</a>` : ""}${(l.phone_number || l.phone) ? ` &middot; ${escHtml(l.phone_number || l.phone)}` : ""}</p>
      ${items.length ? `<p class="tkt-dr-meta">Requested items: ${items.map(i => escHtml(`${i.name || ""} ×${i.quantity || 1}`)).join(", ")}</p>` : ""}
      ${l.notes ? `<p class="tkt-dr-meta">Notes: ${escHtml(l.notes)}</p>` : ""}
    </div>

    <div class="tkt-dr-section tkt-dr-facts">
      <div><span>Created</span><strong>${fmt(l.created_at)}</strong></div>
    </div>

    <div class="tkt-dr-section">
      <h4>Activity <span class="tkt-cnt">${(activity||[]).length}</span></h4>
      <div class="tkt-thread">
        ${(activity||[]).length ? activity.map(a => `
          <div class="tkt-comment">
            ${tktAvatar(a.author_name || "?", 30)}
            <div class="tkt-comment-body">
              <div class="tkt-comment-head">
                <strong>${escHtml(a.author_name || "Staff")}</strong>
                <span class="tkt-role-tag">${escHtml((CRM_ACTIVITY_TYPES.find(t=>t.key===a.activity_type)||{}).label || a.activity_type)}</span>
                <span class="tkt-comment-time">${timeAgo(a.created_at)}</span>
              </div>
              <p>${escHtml(a.body)}</p>
            </div>
          </div>`).join("") : `<p class="tkt-dr-meta" style="margin:0">No activity logged yet.</p>`}
      </div>
      <div style="margin-top:14px">
        <select id="crmActivityType" class="a-input" style="width:140px;display:inline-block;margin-bottom:8px">
          ${CRM_ACTIVITY_TYPES.map(t => `<option value="${t.key}">${escHtml(t.label)}</option>`).join("")}
        </select>
        <textarea id="crmActivityBody" class="a-input" rows="3" placeholder="Log a call, email, note, or follow-up…" style="resize:vertical"></textarea>
        <button class="a-btn-primary" style="margin-top:8px" onclick="submitCrmActivity('${l.id}')">Log Activity</button>
      </div>
    </div>
  `;
}

function closeCrmDrawer(force) {
  if (force !== true && force && force.target && force.target.id !== "crmDrawerOverlay") return;
  const overlay = document.getElementById("crmDrawerOverlay");
  overlay.classList.remove("open");
  setTimeout(() => { overlay.style.display = "none"; }, 180);
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("crmDrawerOverlay")?.style.display === "flex") closeCrmDrawer(true);
});

async function setCrmField(id, field, value) {
  const lead = _crm.leads.find(x => x.id === id);
  const { error } = await window.sb.from("quote_requests").update({ [field]: value }).eq("id", id);
  if (error) { showToast("Couldn't update: " + error.message); return; }
  if (lead) lead[field] = value;
  renderCrmBoard();
}

async function submitCrmActivity(id) {
  const typeEl = document.getElementById("crmActivityType");
  const bodyEl = document.getElementById("crmActivityBody");
  const body = (bodyEl?.value || "").trim();
  if (!body) return;
  await logCrmActivity(id, typeEl?.value || "note", body);
  bodyEl.value = "";
  openCrmDrawer(id); // re-render the thread with the new entry
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

/* ── Developer Tickets ─────────────────────────────────────── */

const TKT_STATUS = [
  { key:"open",         label:"Open" },
  { key:"in_progress",  label:"In Progress" },
  { key:"done",         label:"Done" },
  { key:"not_possible", label:"Not Possible" },
];
const TKT_STATUS_LABEL = Object.fromEntries(TKT_STATUS.map(s => [s.key, s.label]));
const TKT_PRIORITY = {
  critical:    { label:"Critical",    cls:"tkt-p-critical" },
  medium:      { label:"Medium",      cls:"tkt-p-medium" },
  enhancement: { label:"Enhancement", cls:"tkt-p-enhancement" },
};
const TKT_TYPE = {
  bug:   { label:"Bug",         cls:"tkt-t-bug" },
  error: { label:"Error",       cls:"tkt-t-error" },
  idea:  { label:"Enhancement", cls:"tkt-t-idea" },
};

const _tkt = {
  tickets: [],
  comments: {},          // ticket_id -> count
  developers: [],
  view: "board",
  filters: { priority:"all", type:"all", assignee:"all", q:"" },
};

function tktIsAdmin()    { return window._adminRole === "admin"; }
function tktAvatar(email, size) {
  const s = size || 26;
  if (!email) return `<span class="tkt-avatar tkt-avatar-empty" style="width:${s}px;height:${s}px" title="Unassigned">–</span>`;
  // Deterministic hue from the address so each person keeps the same colour.
  let h = 0; for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 360;
  return `<span class="tkt-avatar" style="width:${s}px;height:${s}px;background:hsl(${h} 62% 42%)" title="${escHtml(email)}"></span>`;
}

async function renderDevTicketsTab() {
  const panel = document.getElementById("tab-dev-tickets");
  if (!panel) return;
  panel.innerHTML = `<div class="a-empty" style="padding:50px">Loading tickets…</div>`;

  const [ticketsRes, commentsRes, devsRes] = await Promise.all([
    window.sb.from("dev_tickets").select("*").order("created_at", { ascending:false }),
    window.sb.from("dev_ticket_comments").select("ticket_id"),
    tktIsAdmin()
      ? window.sb.from("profiles").select("id,email,full_name,role").in("role", ["developer","admin"])
      : Promise.resolve({ data: [] }),
  ]);

  if (ticketsRes.error) {
    panel.innerHTML = `<div class="a-empty" style="padding:50px">Couldn't load tickets: ${escHtml(ticketsRes.error.message)}<br><span style="font-size:12px;color:#94a3b8">If this says the table is missing, run the 20260814_dev_tickets.sql migration.</span></div>`;
    return;
  }

  _tkt.tickets    = ticketsRes.data || [];
  _tkt.developers = devsRes.data || [];
  _tkt.comments   = {};
  (commentsRes.data || []).forEach(c => { _tkt.comments[c.ticket_id] = (_tkt.comments[c.ticket_id] || 0) + 1; });

  panel.innerHTML = `
    <div class="tkt-header">
      <div>
        <h1 class="a-page-title">Developer Tickets</h1>
        <p class="a-page-sub">${tktIsAdmin()
          ? "Report bugs, errors, and ideas found while testing — then track them to done."
          : "Tickets assigned to the development team."}</p>
      </div>
      <div class="tkt-header-actions">
        <div class="tkt-viewtoggle">
          <button class="tkt-viewbtn${_tkt.view==="board"?" active":""}" onclick="setTicketView('board')" title="Board view">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>
            Board
          </button>
          <button class="tkt-viewbtn${_tkt.view==="list"?" active":""}" onclick="setTicketView('list')" title="List view">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            List
          </button>
        </div>
        ${tktIsAdmin() ? `<button class="a-btn-secondary" onclick="openDevTeamModal()">Staff Accounts</button>` : ""}
        <button class="a-btn-primary" onclick="openNewTicket()">+ New Ticket</button>
      </div>
    </div>

    <div class="tkt-statstrip" id="tktStats"></div>

    <div class="tkt-filterbar">
      <div class="tkt-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="tktSearch" type="text" placeholder="Search tickets…" value="${escHtml(_tkt.filters.q)}" oninput="setTicketFilter('q', this.value)">
      </div>
      <select class="tkt-filtersel" onchange="setTicketFilter('priority', this.value)">
        <option value="all">All priorities</option>
        ${Object.entries(TKT_PRIORITY).map(([k,v]) => `<option value="${k}"${_tkt.filters.priority===k?" selected":""}>${v.label}</option>`).join("")}
      </select>
      <select class="tkt-filtersel" onchange="setTicketFilter('type', this.value)">
        <option value="all">All types</option>
        ${Object.entries(TKT_TYPE).map(([k,v]) => `<option value="${k}"${_tkt.filters.type===k?" selected":""}>${v.label}</option>`).join("")}
      </select>
      <select class="tkt-filtersel" onchange="setTicketFilter('assignee', this.value)">
        <option value="all">Everyone</option>
        <option value="me"${_tkt.filters.assignee==="me"?" selected":""}>Assigned to me</option>
        <option value="none"${_tkt.filters.assignee==="none"?" selected":""}>Unassigned</option>
      </select>
    </div>

    <div id="tktBoardWrap"></div>
  `;

  renderTicketStats();
  renderTicketBoard();
  updateDevTicketNavCount();
}

function renderTicketStats() {
  const el = document.getElementById("tktStats");
  if (!el) return;
  const open     = _tkt.tickets.filter(t => t.status === "open").length;
  const progress = _tkt.tickets.filter(t => t.status === "in_progress").length;
  const critical = _tkt.tickets.filter(t => t.priority === "critical" && !["done","not_possible"].includes(t.status)).length;
  const done     = _tkt.tickets.filter(t => t.status === "done").length;

  el.innerHTML = `
    <div class="tkt-stat"><span class="tkt-stat-n">${open}</span><span class="tkt-stat-l">Open</span></div>
    <div class="tkt-stat"><span class="tkt-stat-n">${progress}</span><span class="tkt-stat-l">In Progress</span></div>
    <div class="tkt-stat tkt-stat-critical"><span class="tkt-stat-n">${critical}</span><span class="tkt-stat-l">Critical unresolved</span></div>
    <div class="tkt-stat tkt-stat-done"><span class="tkt-stat-n">${done}</span><span class="tkt-stat-l">Done</span></div>
  `;
}

function tktVisibleTickets() {
  const f = _tkt.filters;
  const q = f.q.trim().toLowerCase();
  return _tkt.tickets.filter(t => {
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.type !== "all" && t.ticket_type !== f.type) return false;
    if (f.assignee === "none" && t.assignee_id) return false;
    if (f.assignee === "me" && t.assignee_id !== window._adminUserId) return false;
    if (q) {
      const hay = `${t.ticket_number} ${t.title} ${t.description} ${t.assignee_email || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function setTicketView(v)         { _tkt.view = v; renderDevTicketsTab(); }
function setTicketFilter(k, val)  {
  _tkt.filters[k] = val;
  renderTicketBoard();
  if (k === "q") document.getElementById("tktSearch")?.focus();
}

function renderTicketBoard() {
  const wrap = document.getElementById("tktBoardWrap");
  if (!wrap) return;
  const visible = tktVisibleTickets();

  if (!_tkt.tickets.length) {
    wrap.innerHTML = `<div class="tkt-empty">
      <div class="tkt-empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/></svg>
      </div>
      <h3>No tickets yet</h3>
      <p>File the first bug, error, or idea you run into while testing the site.</p>
      <button class="a-btn-primary" onclick="openNewTicket()">+ New Ticket</button>
    </div>`;
    return;
  }

  if (_tkt.view === "list") { renderTicketList(wrap, visible); return; }

  wrap.innerHTML = `<div class="tkt-board">${TKT_STATUS.map(col => {
    const items = visible.filter(t => t.status === col.key);
    return `
      <section class="tkt-col" data-status="${col.key}"
        ondragover="tktDragOver(event)" ondragleave="tktDragLeave(event)" ondrop="tktDrop(event,'${col.key}')">
        <header class="tkt-col-head">
          <span class="tkt-col-dot tkt-dot-${col.key}"></span>
          <span class="tkt-col-title">${col.label}</span>
          <span class="tkt-col-count">${items.length}</span>
        </header>
        <div class="tkt-col-body">
          ${items.map(tktCard).join("") || `<div class="tkt-col-empty">Nothing here</div>`}
        </div>
      </section>`;
  }).join("")}</div>`;
}

function tktCard(t) {
  const pr = TKT_PRIORITY[t.priority] || TKT_PRIORITY.medium;
  const ty = TKT_TYPE[t.ticket_type] || TKT_TYPE.bug;
  const cCount = _tkt.comments[t.id] || 0;
  return `
    <article class="tkt-card ${pr.cls}" draggable="true"
      ondragstart="tktDragStart(event,'${t.id}')" ondragend="tktDragEnd(event)"
      onclick="openTicketDrawer('${t.id}')">
      <div class="tkt-card-top">
        <span class="tkt-num">${escHtml(t.ticket_number || "—")}</span>
        <span class="tkt-pri ${pr.cls}">${pr.label}</span>
      </div>
      <p class="tkt-card-title">${escHtml(t.title)}</p>
      <div class="tkt-card-foot">
        <span class="tkt-type ${ty.cls}">${ty.label}</span>
        <div class="tkt-card-meta">
          ${t.screenshot_url ? `<span class="tkt-chip" title="Has screenshot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>` : ""}
          ${t.attachment_url ? `<span class="tkt-chip" title="Has attachment: ${escHtml(t.attachment_name || "")}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg></span>` : ""}
          ${cCount ? `<span class="tkt-chip" title="${cCount} comment${cCount>1?"s":""}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${cCount}</span>` : ""}
          ${tktAvatar(t.assignee_email, 24)}
        </div>
      </div>
    </article>`;
}

function renderTicketList(wrap, visible) {
  wrap.innerHTML = `
    <div class="a-card" style="overflow:hidden">
      <div style="overflow-x:auto">
        <table class="a-table tkt-table">
          <thead><tr>
            <th>Ticket</th><th>Summary</th><th>Type</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Created</th>
          </tr></thead>
          <tbody>
            ${visible.map(t => {
              const pr = TKT_PRIORITY[t.priority] || TKT_PRIORITY.medium;
              const ty = TKT_TYPE[t.ticket_type] || TKT_TYPE.bug;
              return `<tr class="tkt-row" onclick="openTicketDrawer('${t.id}')">
                <td><strong class="tkt-num">${escHtml(t.ticket_number || "—")}</strong></td>
                <td>${escHtml(t.title)}</td>
                <td><span class="tkt-type ${ty.cls}">${ty.label}</span></td>
                <td><span class="tkt-pri ${pr.cls}">${pr.label}</span></td>
                <td><span class="tkt-status-pill tkt-dotbg-${t.status}">${TKT_STATUS_LABEL[t.status] || t.status}</span></td>
                <td>${tktAvatar(t.assignee_email, 24)}</td>
                <td style="white-space:nowrap;color:#94a3b8;font-size:12px">${fmt(t.created_at)}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="7" class="a-empty">No tickets match these filters.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* Drag & drop between columns */
let _tktDragId = null;
function tktDragStart(e, id) { _tktDragId = id; e.dataTransfer.effectAllowed = "move"; e.currentTarget.classList.add("dragging"); }
function tktDragEnd(e)       { _tktDragId = null; e.currentTarget.classList.remove("dragging"); document.querySelectorAll(".tkt-col.over").forEach(c => c.classList.remove("over")); }
function tktDragOver(e)      { e.preventDefault(); e.currentTarget.classList.add("over"); }
function tktDragLeave(e)     { e.currentTarget.classList.remove("over"); }
async function tktDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove("over");
  if (!_tktDragId) return;
  const id = _tktDragId; _tktDragId = null;
  const t = _tkt.tickets.find(x => x.id === id);
  if (!t || t.status === status) return;
  await setTicketStatus(id, status);
}

async function setTicketStatus(id, status) {
  const t = _tkt.tickets.find(x => x.id === id);
  if (!t) return;
  const prev = t.status;
  t.status = status;                       // optimistic — board repaints instantly
  renderTicketStats(); renderTicketBoard();

  const { error } = await window.sb.from("dev_tickets").update({ status }).eq("id", id);
  if (error) {
    t.status = prev;
    renderTicketStats(); renderTicketBoard();
    showToast("Couldn't update status: " + error.message);
    return;
  }
  updateDevTicketNavCount();
  if (document.getElementById("tktDrawerOverlay").style.display === "flex") openTicketDrawer(id);
  notifyTicketEvent(t, "status", `Status changed to “${TKT_STATUS_LABEL[status]}”`);
}

/* ── New / edit ticket ─────────────────────────────────────── */

function openNewTicket() {
  document.getElementById("devTicketModalTitle").textContent = "New Ticket";
  document.getElementById("devTicketId").value = "";
  document.getElementById("devTicketTitle").value = "";
  document.getElementById("devTicketPageUrl").value = "";
  document.getElementById("devTicketDescription").value = "";
  document.getElementById("devTicketScreenshotFile").value = "";
  clearTicketScreenshot();
  document.getElementById("devTicketAttachFile").value = "";
  clearTicketAttachment();
  document.getElementById("devTicketSaveBtn").textContent = "Create Ticket";
  pickTicketType("bug");
  pickTicketPriority("medium");

  const sel = document.getElementById("devTicketAssignee");
  sel.innerHTML = `<option value="">Unassigned</option>` +
    _tkt.developers.map(d => `<option value="${d.id}" data-email="${escHtml(d.email || "")}">${escHtml(d.full_name || d.email || "")}${d.role === "developer" ? " (developer)" : ""}</option>`).join("");
  // Non-admins can't reassign work; the field is theirs to read, not change.
  sel.disabled = !tktIsAdmin();
  updateTicketAssigneeAvatar();

  openModal("devTicketModal");
}

function pickTicketType(value) {
  document.getElementById("devTicketType").value = value;
  document.querySelectorAll("#devTicketTypePills .tkt-pillbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.value === value);
  });
}

function pickTicketPriority(value) {
  document.getElementById("devTicketPriority").value = value;
  document.querySelectorAll("#devTicketPriorityPills .tkt-pillbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.value === value);
  });
}

function updateTicketAssigneeAvatar() {
  const sel = document.getElementById("devTicketAssignee");
  const email = sel.selectedOptions[0]?.dataset.email || null;
  document.getElementById("devTicketAssigneeAvatar").innerHTML = tktAvatar(email, 26);
}

function clearTicketScreenshot(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  document.getElementById("devTicketScreenshotFile").value = "";
  document.getElementById("devTicketDropzoneEmpty").style.display = "flex";
  document.getElementById("devTicketScreenshotPreviewWrap").style.display = "none";
}

function showTicketScreenshotFile(file) {
  const wrap  = document.getElementById("devTicketScreenshotPreviewWrap");
  const empty = document.getElementById("devTicketDropzoneEmpty");
  const img   = document.getElementById("devTicketScreenshotPreview");
  if (!file || !file.type?.startsWith("image/")) return;
  img.src = URL.createObjectURL(file);
  empty.style.display = "none";
  wrap.style.display = "block";
}

document.getElementById("devTicketScreenshotFile")?.addEventListener("change", e => {
  showTicketScreenshotFile(e.target.files[0]);
});

const _tktDropzone = document.getElementById("devTicketDropzone");
if (_tktDropzone) {
  ["dragenter", "dragover"].forEach(evt => _tktDropzone.addEventListener(evt, e => {
    e.preventDefault(); _tktDropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(evt => _tktDropzone.addEventListener(evt, e => {
    e.preventDefault(); _tktDropzone.classList.remove("dragover");
  }));
  _tktDropzone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    document.getElementById("devTicketScreenshotFile").files = e.dataTransfer.files;
    showTicketScreenshotFile(file);
  });
}

const TKT_ATTACH_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];

function clearTicketAttachment(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  document.getElementById("devTicketAttachFile").value = "";
  document.getElementById("devTicketAttachEmpty").style.display = "flex";
  document.getElementById("devTicketAttachPreviewWrap").style.display = "none";
}

function showTicketAttachFile(file) {
  if (!file) return;
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (!TKT_ATTACH_EXTS.includes(ext)) {
    showToast("Please attach a PDF, Word, or Excel file.");
    return;
  }
  document.getElementById("devTicketAttachName").textContent = file.name;
  document.getElementById("devTicketAttachEmpty").style.display = "none";
  document.getElementById("devTicketAttachPreviewWrap").style.display = "flex";
}

document.getElementById("devTicketAttachFile")?.addEventListener("change", e => {
  showTicketAttachFile(e.target.files[0]);
});

const _tktAttachDropzone = document.getElementById("devTicketAttachDropzone");
if (_tktAttachDropzone) {
  ["dragenter", "dragover"].forEach(evt => _tktAttachDropzone.addEventListener(evt, e => {
    e.preventDefault(); _tktAttachDropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(evt => _tktAttachDropzone.addEventListener(evt, e => {
    e.preventDefault(); _tktAttachDropzone.classList.remove("dragover");
  }));
  _tktAttachDropzone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    document.getElementById("devTicketAttachFile").files = e.dataTransfer.files;
    showTicketAttachFile(file);
  });
}

async function saveDevTicket() {
  const title = document.getElementById("devTicketTitle").value.trim();
  const description = document.getElementById("devTicketDescription").value.trim();
  if (!title || !description) { showToast("Summary and description are required."); return; }

  const btn = document.getElementById("devTicketSaveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  try {
    const file = document.getElementById("devTicketScreenshotFile").files[0];
    let screenshot_url = null;
    if (file) {
      const ext  = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `tickets/${Date.now()}.${ext}`;
      const { error: upErr } = await window.sb.storage.from("dev-note-screenshots").upload(path, file, { upsert:true });
      if (upErr) throw upErr;
      screenshot_url = path;
    }

    // Same private bucket as screenshots -- just a different path prefix so
    // the two kinds of upload never collide. Kept as its own column rather
    // than overloading screenshot_url since this is offered as a download
    // link, not rendered inline, and needs the original filename preserved.
    const attachFile = document.getElementById("devTicketAttachFile").files[0];
    let attachment_url = null, attachment_name = null;
    if (attachFile) {
      const ext  = (attachFile.name.split(".").pop() || "bin").toLowerCase();
      const path = `tickets/attachments/${Date.now()}.${ext}`;
      const { error: upErr } = await window.sb.storage.from("dev-note-screenshots").upload(path, attachFile, { upsert:true });
      if (upErr) throw upErr;
      attachment_url  = path;
      attachment_name = attachFile.name;
    }

    const { data: { user } } = await window.sb.auth.getUser();
    const sel = document.getElementById("devTicketAssignee");
    const assignee_id = sel.value || null;
    const assignee_email = assignee_id ? (sel.selectedOptions[0]?.dataset.email || null) : null;

    const payload = {
      title,
      description,
      ticket_type: document.getElementById("devTicketType").value,
      priority:    document.getElementById("devTicketPriority").value,
      page_url:    document.getElementById("devTicketPageUrl").value.trim() || null,
      assignee_id, assignee_email,
      reporter_id: user?.id || null,
      reporter_email: user?.email || null,
    };
    if (screenshot_url) payload.screenshot_url = screenshot_url;
    if (attachment_url) { payload.attachment_url = attachment_url; payload.attachment_name = attachment_name; }

    const { data: created, error } = await window.sb.from("dev_tickets").insert(payload).select().single();
    if (error) throw error;

    closeModal("devTicketModal");
    showToast(`Ticket ${created.ticket_number} created.`);
    await renderDevTicketsTab();
    if (created.assignee_email) notifyTicketEvent(created, "assigned", "You have been assigned a new ticket.");
  } catch (err) {
    showToast("Couldn't save ticket: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Create Ticket";
  }
}

async function deleteDevTicket(id) {
  const t = _tkt.tickets.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Delete ${t.ticket_number}? This also removes its comments and can't be undone.`)) return;
  if (t.screenshot_url) await window.sb.storage.from("dev-note-screenshots").remove([t.screenshot_url]);
  if (t.attachment_url) await window.sb.storage.from("dev-note-screenshots").remove([t.attachment_url]);
  const { error } = await window.sb.from("dev_tickets").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + error.message); return; }
  closeTicketDrawer(true);
  showToast("Ticket deleted.");
  renderDevTicketsTab();
}

/* ── Ticket detail drawer ──────────────────────────────────── */

async function openTicketDrawer(id) {
  const overlay = document.getElementById("tktDrawerOverlay");
  const body    = document.getElementById("tktDrawerBody");
  overlay.style.display = "flex";
  requestAnimationFrame(() => overlay.classList.add("open"));
  _tktCommentScreenshotFile = null; // don't carry a pasted image between tickets/reopens

  const t = _tkt.tickets.find(x => x.id === id);
  if (!t) { body.innerHTML = `<div class="a-empty" style="padding:60px">Ticket not found.</div>`; return; }

  const { data: comments } = await window.sb
    .from("dev_ticket_comments").select("*").eq("ticket_id", id).order("created_at", { ascending:true });

  const pr = TKT_PRIORITY[t.priority] || TKT_PRIORITY.medium;
  const ty = TKT_TYPE[t.ticket_type] || TKT_TYPE.bug;

  body.innerHTML = `
    <header class="tkt-dr-head">
      <div class="tkt-dr-headtop">
        <span class="tkt-num tkt-num-lg">${escHtml(t.ticket_number || "—")}</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${tktIsAdmin() ? `<button class="tkt-iconbtn" title="Delete ticket" onclick="deleteDevTicket('${t.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>` : ""}
          <button class="tkt-iconbtn" title="Close" onclick="closeTicketDrawer(true)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <h2 class="tkt-dr-title">${escHtml(t.title)}</h2>
      <div class="tkt-dr-badges">
        <span class="tkt-type ${ty.cls}">${ty.label}</span>
        <span class="tkt-pri ${pr.cls}">${pr.label}</span>
        <span class="tkt-status-pill tkt-dotbg-${t.status}">${TKT_STATUS_LABEL[t.status] || t.status}</span>
      </div>
    </header>

    <div class="tkt-dr-controls">
      <label class="tkt-dr-ctl">
        <span>Status</span>
        <select class="a-input" onchange="setTicketStatus('${t.id}', this.value)">
          ${TKT_STATUS.map(s => `<option value="${s.key}"${t.status===s.key?" selected":""}>${s.label}</option>`).join("")}
        </select>
      </label>
      <label class="tkt-dr-ctl">
        <span>Priority</span>
        <select class="a-input" onchange="setTicketField('${t.id}','priority',this.value)" ${tktIsAdmin()?"":"disabled"}>
          ${Object.entries(TKT_PRIORITY).map(([k,v]) => `<option value="${k}"${t.priority===k?" selected":""}>${v.label}</option>`).join("")}
        </select>
      </label>
      <label class="tkt-dr-ctl">
        <span>Assignee</span>
        <select class="a-input" onchange="setTicketAssignee('${t.id}', this)" ${tktIsAdmin()?"":"disabled"}>
          <option value="">Unassigned</option>
          ${_tkt.developers.map(d => `<option value="${d.id}" data-email="${escHtml(d.email||"")}"${t.assignee_id===d.id?" selected":""}>${escHtml(d.full_name || d.email || "")}${d.role==="developer"?" (developer)":""}</option>`).join("")}
          ${(!tktIsAdmin() && t.assignee_email) ? `<option value="${t.assignee_id}" selected>${escHtml(t.assignee_email)}</option>` : ""}
        </select>
      </label>
    </div>

    <div class="tkt-dr-section">
      <h4>Description</h4>
      <p class="tkt-dr-desc">${escHtml(t.description)}</p>
      ${t.page_url ? `<p class="tkt-dr-meta">Page: <code>${escHtml(t.page_url)}</code></p>` : ""}
      ${t.screenshot_url ? `<div id="tktShot" class="tkt-dr-shot"><span class="tkt-dr-meta">Loading screenshot…</span></div>` : ""}
      ${t.attachment_url ? `<div id="tktAttach" class="tkt-dr-meta">Loading attachment…</div>` : ""}
    </div>

    <div class="tkt-dr-section tkt-dr-facts">
      <div><span>Reported by</span><strong>${escHtml(t.reporter_email || "—")}</strong></div>
      <div><span>Created</span><strong>${fmt(t.created_at)}</strong></div>
      ${t.resolved_at ? `<div><span>Closed</span><strong>${fmt(t.resolved_at)}</strong></div>` : ""}
    </div>

    <div class="tkt-dr-section">
      <h4>Activity <span class="tkt-cnt">${(comments||[]).length}</span></h4>
      <div class="tkt-thread">
        ${(comments||[]).map(c => {
          const canManage = tktIsAdmin() || c.author_email === window._adminUserEmail;
          return `
          <div class="tkt-comment" data-comment-id="${c.id}">
            ${tktAvatar(c.author_email, 30)}
            <div class="tkt-comment-body">
              <div class="tkt-comment-head">
                <strong>${escHtml(c.author_name || c.author_email || "Unknown")}</strong>
                ${c.author_role ? `<span class="tkt-role-tag">${escHtml(c.author_role)}</span>` : ""}
                <span class="tkt-comment-time">${timeAgo(c.created_at)}${c.edited_at ? " · edited" : ""}</span>
                ${canManage ? `
                  <span class="tkt-comment-actions">
                    <button type="button" onclick="startEditTicketComment('${c.id}')" title="Edit">Edit</button>
                    <button type="button" onclick="deleteTicketComment('${c.id}','${t.id}')" title="Delete">Delete</button>
                  </span>` : ""}
              </div>
              <p class="tkt-comment-text">${escHtml(c.body)}</p>
              ${c.screenshot_url ? `<div class="tkt-comment-shot" id="tktCommentShot-${c.id}"><span class="tkt-dr-meta">Loading screenshot…</span></div>` : ""}
            </div>
          </div>`;
        }).join("") || `<p class="tkt-dr-meta">No comments yet.</p>`}
      </div>

      <div class="tkt-composer">
        ${tktAvatar(window._adminUserEmail, 30)}
        <div style="flex:1">
          <textarea id="tktCommentBody" class="a-input" rows="3" placeholder="Add a comment… (you can paste a screenshot here)" style="resize:vertical"></textarea>
          <div id="tktCommentShotPreviewWrap" style="display:none;margin-top:8px;position:relative">
            <img id="tktCommentShotPreview" alt="Pasted screenshot" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid #e2e8f0;display:block">
            <button type="button" class="tkt-dropzone-remove" onclick="clearTicketCommentScreenshot()" title="Remove" style="position:absolute;top:-8px;right:-8px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <label class="tkt-comment-attach" title="Attach a screenshot">
              <input type="file" id="tktCommentShotFile" accept="image/*" hidden onchange="showTicketCommentScreenshot(this.files[0])">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              Attach screenshot
            </label>
            <button class="a-btn-primary" id="tktCommentBtn" onclick="addTicketComment('${t.id}')">Comment</button>
          </div>
        </div>
      </div>
    </div>
  `;

  if (t.screenshot_url) {
    const { data } = await window.sb.storage.from("dev-note-screenshots").createSignedUrl(t.screenshot_url, 3600);
    const holder = document.getElementById("tktShot");
    if (holder && data?.signedUrl) {
      holder.innerHTML = `<a href="${data.signedUrl}" target="_blank" rel="noopener"><img src="${data.signedUrl}" alt="Screenshot attached to ${escHtml(t.ticket_number||"ticket")}"></a>`;
    } else if (holder) {
      holder.innerHTML = `<span class="tkt-dr-meta">Screenshot unavailable.</span>`;
    }
  }

  if (t.attachment_url) {
    // Signed, not the public getPublicUrl -- this bucket is private (same
    // one screenshots use), so a plain public URL would 404.
    const { data } = await window.sb.storage.from("dev-note-screenshots").createSignedUrl(t.attachment_url, 3600, { download: t.attachment_name || true });
    const holder = document.getElementById("tktAttach");
    if (holder && data?.signedUrl) {
      holder.innerHTML = `<a href="${data.signedUrl}" target="_blank" rel="noopener" class="tkt-attach-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        ${escHtml(t.attachment_name || "Download attachment")}
      </a>`;
    } else if (holder) {
      holder.innerHTML = `<span class="tkt-dr-meta">Attachment unavailable.</span>`;
    }
  }

  (comments || []).filter(c => c.screenshot_url).forEach(async c => {
    const { data } = await window.sb.storage.from("dev-note-screenshots").createSignedUrl(c.screenshot_url, 3600);
    const holder = document.getElementById(`tktCommentShot-${c.id}`);
    if (holder && data?.signedUrl) {
      holder.innerHTML = `<a href="${data.signedUrl}" target="_blank" rel="noopener"><img src="${data.signedUrl}" alt="Screenshot attached to comment"></a>`;
    } else if (holder) {
      holder.innerHTML = `<span class="tkt-dr-meta">Screenshot unavailable.</span>`;
    }
  });

  // Paste-to-attach: Ctrl+V an image straight into the comment box.
  const commentBox = document.getElementById("tktCommentBody");
  if (commentBox) {
    commentBox.onpaste = e => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      showTicketCommentScreenshot(item.getAsFile());
    };
  }
}

let _tktCommentScreenshotFile = null;
function showTicketCommentScreenshot(file) {
  if (!file || !file.type?.startsWith("image/")) return;
  _tktCommentScreenshotFile = file;
  const wrap = document.getElementById("tktCommentShotPreviewWrap");
  const img  = document.getElementById("tktCommentShotPreview");
  img.src = URL.createObjectURL(file);
  wrap.style.display = "block";
}
function clearTicketCommentScreenshot() {
  _tktCommentScreenshotFile = null;
  document.getElementById("tktCommentShotFile").value = "";
  document.getElementById("tktCommentShotPreviewWrap").style.display = "none";
}

function closeTicketDrawer(force) {
  // Backdrop clicks pass the event; the drawer itself stops propagation.
  if (force !== true && force && force.target && force.target.id !== "tktDrawerOverlay") return;
  const overlay = document.getElementById("tktDrawerOverlay");
  overlay.classList.remove("open");
  setTimeout(() => { overlay.style.display = "none"; }, 180);
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("tktDrawerOverlay")?.style.display === "flex") closeTicketDrawer(true);
});

async function setTicketField(id, field, value) {
  const t = _tkt.tickets.find(x => x.id === id);
  const { error } = await window.sb.from("dev_tickets").update({ [field]: value }).eq("id", id);
  if (error) { showToast("Couldn't update: " + error.message); return; }
  if (t) t[field] = value;
  renderTicketStats(); renderTicketBoard();
  showToast("Ticket updated.");
}

async function setTicketAssignee(id, sel) {
  const assignee_id = sel.value || null;
  const assignee_email = assignee_id ? (sel.selectedOptions[0]?.dataset.email || null) : null;
  const { error } = await window.sb.from("dev_tickets").update({ assignee_id, assignee_email }).eq("id", id);
  if (error) { showToast("Couldn't reassign: " + error.message); return; }
  const t = _tkt.tickets.find(x => x.id === id);
  if (t) { t.assignee_id = assignee_id; t.assignee_email = assignee_email; }
  renderTicketBoard();
  showToast(assignee_email ? "Assigned to " + assignee_email : "Unassigned.");
  if (t && assignee_email) notifyTicketEvent(t, "assigned", "You have been assigned this ticket.");
}

/* ── Edit / delete a ticket comment ─────────────────────────────
   Gated the same way in the template above and here: the comment's own
   author, or an admin (tktIsAdmin()) -- a regular developer account
   can't edit/delete someone else's comment, but staff can moderate. */

function startEditTicketComment(commentId) {
  const wrap = document.querySelector(`.tkt-comment[data-comment-id="${commentId}"] .tkt-comment-text`);
  if (!wrap) return;
  const original = wrap.textContent;
  wrap.dataset.original = original;
  wrap.outerHTML = `
    <div class="tkt-comment-text" data-comment-id="${commentId}">
      <textarea class="a-input tkt-comment-edit-box" rows="3" style="resize:vertical;margin-bottom:6px">${escHtml(original)}</textarea>
      <div style="display:flex;gap:8px">
        <button class="a-btn-primary" style="width:auto;padding:5px 12px;font-size:12px" onclick="saveEditTicketComment('${commentId}')">Save</button>
        <button class="a-btn-outline" style="width:auto;padding:5px 12px;font-size:12px" onclick="cancelEditTicketComment('${commentId}','${escHtml(original).replace(/'/g, "\\'")}')">Cancel</button>
      </div>
    </div>`;
}

function cancelEditTicketComment(commentId, original) {
  const wrap = document.querySelector(`.tkt-comment[data-comment-id="${commentId}"] .tkt-comment-text`);
  if (wrap) wrap.outerHTML = `<p class="tkt-comment-text">${escHtml(original)}</p>`;
}

async function saveEditTicketComment(commentId) {
  const box = document.querySelector(`.tkt-comment[data-comment-id="${commentId}"] .tkt-comment-edit-box`);
  const body = box?.value.trim();
  if (!body) { showToast("Comment can't be empty."); return; }

  const { error } = await window.sb.from("dev_ticket_comments")
    .update({ body, edited_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) { showToast("Couldn't save: " + error.message); return; }

  const wrap = box.closest(".tkt-comment-text");
  if (wrap) wrap.outerHTML = `<p class="tkt-comment-text">${escHtml(body)}</p>`;
  const timeEl = document.querySelector(`.tkt-comment[data-comment-id="${commentId}"] .tkt-comment-time`);
  if (timeEl && !timeEl.textContent.includes("edited")) timeEl.textContent += " · edited";
}

async function deleteTicketComment(commentId, ticketId) {
  if (!confirm("Delete this comment? This cannot be undone.")) return;
  const { error } = await window.sb.from("dev_ticket_comments").delete().eq("id", commentId);
  if (error) { showToast("Couldn't delete: " + error.message); return; }
  showToast("Comment deleted.");
  _tkt.comments[ticketId] = Math.max(0, (_tkt.comments[ticketId] || 1) - 1);
  await openTicketDrawer(ticketId);
  renderTicketBoard();
}

async function addTicketComment(ticketId) {
  const box = document.getElementById("tktCommentBody");
  let body = box.value.trim();
  if (!body && !_tktCommentScreenshotFile) return;
  if (!body) body = "📎 Screenshot attached.";

  const btn = document.getElementById("tktCommentBtn");
  btn.disabled = true; btn.textContent = "Posting…";

  try {
    let screenshot_url = null;
    if (_tktCommentScreenshotFile) {
      const ext  = (_tktCommentScreenshotFile.name?.split(".").pop() || "png").toLowerCase();
      const path = `comments/${Date.now()}.${ext}`;
      const { error: upErr } = await window.sb.storage.from("dev-note-screenshots").upload(path, _tktCommentScreenshotFile, { upsert: true });
      if (upErr) throw upErr;
      screenshot_url = path;
    }

    const { data: { user } } = await window.sb.auth.getUser();
    let authorName = null;
    if (user?.id) {
      const { data: authorProfile } = await window.sb.from("profiles").select("full_name").eq("id", user.id).single();
      authorName = authorProfile?.full_name || null;
    }
    const payload = {
      ticket_id: ticketId,
      author_id: user?.id || null,
      author_email: user?.email || null,
      author_name: authorName,
      author_role: window._adminRole || null,
      body,
    };
    if (screenshot_url) payload.screenshot_url = screenshot_url;

    const { error } = await window.sb.from("dev_ticket_comments").insert(payload);
    if (error) throw error;
  } catch (err) {
    btn.disabled = false; btn.textContent = "Comment";
    showToast("Couldn't post comment: " + err.message);
    return;
  }

  btn.disabled = false; btn.textContent = "Comment";
  _tkt.comments[ticketId] = (_tkt.comments[ticketId] || 0) + 1;
  box.value = "";
  clearTicketCommentScreenshot();
  await openTicketDrawer(ticketId);
  renderTicketBoard();

  const t = _tkt.tickets.find(x => x.id === ticketId);
  if (t) notifyTicketEvent(t, "comment", body.slice(0, 240));
}

function updateDevTicketNavCount() {
  const el = document.getElementById("devTicketNavCount");
  if (!el) return;
  const openCount = _tkt.tickets.filter(t => !["done","not_possible"].includes(t.status)).length;
  el.textContent = openCount;
  el.style.display = openCount ? "inline-flex" : "none";
}

/* ── Developer accounts ────────────────────────────────────── */

const STAFF_ROLE_HINTS = {
  developer: "They sign in at this same admin address, but only ever see the ticket board — no products, orders, customers, or revenue.",
  marketing: "They sign in at this same admin address, but only ever see the CRM/leads board — no products, orders, customers, or revenue.",
};

function updateDevTeamRoleHint() {
  const role = document.getElementById("devTeamRole")?.value || "developer";
  const hint = document.getElementById("devTeamRoleHint");
  if (hint) hint.textContent = STAFF_ROLE_HINTS[role] || "";
}

async function openDevTeamModal() {
  document.getElementById("devTeamList").innerHTML = `<p class="tkt-dr-meta" style="margin:0">Loading…</p>`;
  document.getElementById("devTeamRole").value = "developer";
  updateDevTeamRoleHint();
  document.getElementById("devTeamEmail").value = "";
  document.getElementById("devTeamName").value = "";
  document.getElementById("devTeamPassword").value = "";
  document.getElementById("devTeamError").style.display = "none";
  openModal("devTeamModal");

  // Not _tkt.developers -- that list is scoped to developer+admin for the
  // ticket-assignee dropdown specifically. This modal manages every staff
  // account type (developer AND marketing), so it fetches its own list.
  const { data: staff } = await window.sb.from("profiles").select("id,email,full_name,role").in("role", ["developer","marketing"]).order("created_at");
  document.getElementById("devTeamList").innerHTML = staff?.length
    ? staff.map(d => `
        <div class="tkt-teamrow">
          ${tktAvatar(d.email, 32)}
          <div style="flex:1;min-width:0">
            <strong>${escHtml(d.full_name || d.email || "")}</strong>
            <span>${escHtml(d.email || "")}</span>
          </div>
          <span class="tkt-role-tag">${escHtml(d.role)}</span>
        </div>`).join("")
    : `<p class="tkt-dr-meta" style="margin:0">No staff accounts yet. Create one below.</p>`;
}

async function createStaffAccount() {
  const email = document.getElementById("devTeamEmail").value.trim();
  const full_name = document.getElementById("devTeamName").value.trim();
  const password = document.getElementById("devTeamPassword").value;
  const role = document.getElementById("devTeamRole")?.value || "developer";
  const errEl = document.getElementById("devTeamError");
  errEl.style.display = "none";

  if (!email || !password) { errEl.textContent = "Email and password are required."; errEl.style.display = "block"; return; }
  if (password.length < 8)  { errEl.textContent = "Password must be at least 8 characters."; errEl.style.display = "block"; return; }

  const btn = document.getElementById("devTeamCreateBtn");
  btn.disabled = true; btn.textContent = "Creating…";

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/create-dev-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (session?.access_token || ""),
      },
      body: JSON.stringify({ email, password, full_name, role }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "Request failed");

    const roleLabel = role === "marketing" ? "Marketing" : "Developer";
    showToast(out.promoted
      ? `${email} already had an account -- promoted to ${roleLabel} and password reset.`
      : `${roleLabel} account created for ${email}`);
    openDevTeamModal(); // re-fetch so the new account shows in the list without a full close/reopen
    document.getElementById("devTeamEmail").value = "";
    document.getElementById("devTeamName").value = "";
    document.getElementById("devTeamPassword").value = "";
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  } finally {
    btn.disabled = false; btn.textContent = "Create Account";
  }
}

/* Email ping. Fire-and-forget: a mail failure must never block the board. */
async function notifyTicketEvent(ticket, event, message) {
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    await fetch("/api/notify-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        message,
        actor_email: session?.user?.email || null,
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          priority: ticket.priority,
          status: ticket.status,
          assignee_email: ticket.assignee_email,
          reporter_email: ticket.reporter_email,
        },
      }),
    });
  } catch (_) { /* email is best-effort */ }
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

// payment_status was never surfaced anywhere in the admin UI before this --
// only the fulfillment status (pending/confirmed/shipped/...) was shown,
// so there was no way to tell, at a glance, whether an emailed invoice had
// actually been paid. pending_invoice specifically is the state every
// invoice-based order sits in from the moment it's created until the
// customer completes the Stripe Payment Link -- api/stripe-webhook.js
// flips it to 'paid' the moment that happens, so this badge is a direct,
// real-time read of that.
function paymentBadgeClass(paymentStatus) {
  const m = {
    paid: "a-badge-green", captured: "a-badge-green",
    pending_invoice: "a-badge-yellow", pending: "a-badge-yellow", requires_capture: "a-badge-yellow",
    failed: "a-badge-red",
    refunded: "a-badge-gray",
  };
  return m[paymentStatus] || "a-badge-gray";
}
function paymentBadgeLabel(paymentStatus) {
  const m = {
    paid: "Paid", captured: "Paid",
    pending_invoice: "Awaiting Payment", pending: "Awaiting Payment", requires_capture: "Awaiting Payment",
    failed: "Failed", refunded: "Refunded",
  };
  return m[paymentStatus] || (paymentStatus || "—");
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
   BEST DEALS CAMPAIGN TAB
   Powers the /best-deals landing page. Deliberately stores only a sku
   reference plus the marketing copy -- name/price/image are read live
   from products at render time on both this admin list and the public
   page, so a price change never goes stale here the way a snapshot would.
============================================================ */

let _bdProductCache = [];

async function renderBestDealsTab() {
  const list = document.getElementById("bestDealsList");
  if (!list) return;
  list.innerHTML = `<div class="a-empty" style="padding:40px">Loading…</div>`;

  const { data: deals, error } = await window.sb
    .from("best_deals")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    list.innerHTML = `<div class="a-empty" style="padding:40px">Couldn't load: ${escHtml(error.message)}</div>`;
    return;
  }
  if (!deals || !deals.length) {
    list.innerHTML = `<div class="a-empty" style="padding:40px">No deals yet. Click "+ Add Deal" to build this month's lineup.</div>`;
    return;
  }

  const skus = [...new Set(deals.map(d => d.sku))];
  const { data: products } = await window.sb
    .from("products")
    .select("sku,name,image_url,price,is_active")
    .in("sku", skus);
  const productBySku = Object.fromEntries((products || []).map(p => [p.sku, p]));

  list.innerHTML = deals.map(d => {
    const p = productBySku[d.sku];
    const missing = !p;
    return `
    <div class="a-card" style="padding:16px 18px;display:flex;gap:14px;align-items:flex-start;${d.is_active ? "" : "opacity:.55"}">
      <img src="${p?.image_url || ""}" alt="" style="width:52px;height:52px;object-fit:contain;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;flex:none">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:11px;font-weight:800;color:#94a3b8;font-family:ui-monospace,monospace">#${d.position}</span>
          <strong style="font-size:14px;color:#0d1f38">${escHtml(d.hook_title)}</strong>
          <span class="a-badge ${d.is_active ? "a-badge-green" : "a-badge-yellow"}">${d.is_active ? "Active" : "Draft"}</span>
          ${missing ? `<span class="a-badge a-badge-red">Product not found (sku: ${escHtml(d.sku)})</span>` : (!p.is_active ? `<span class="a-badge a-badge-red">Product inactive</span>` : "")}
        </div>
        <div style="font-size:12.5px;color:#64748b;margin-bottom:4px">${escHtml(d.pitch_text)}</div>
        <div style="font-size:12px;color:#94a3b8">${p ? `${escHtml(p.name)} &middot; <strong style="color:#0d1f38">$${Number(p.price).toFixed(2)}</strong> <span style="color:#94a3b8">(live price)</span>` : ""}</div>
      </div>
      <div style="display:flex;gap:8px;flex:none">
        <button class="a-btn-secondary" style="font-size:12px;padding:6px 12px" onclick="editBestDeal('${d.id}')">Edit</button>
        <button class="a-btn-secondary" style="font-size:12px;padding:6px 12px;color:#dc2626" onclick="deleteBestDeal('${d.id}')">Delete</button>
      </div>
    </div>`;
  }).join("");
}

async function loadBestDealProductOptions() {
  if (_bdProductCache.length) return _bdProductCache;
  const { data } = await window.sb
    .from("products")
    .select("sku,name,image_url,price")
    .eq("is_active", true)
    .order("name");
  _bdProductCache = data || [];
  const dl = document.getElementById("bdProductList");
  if (dl) {
    dl.innerHTML = _bdProductCache.map(p => `<option value="${escHtml(p.sku)} — ${escHtml(p.name)}">`).join("");
  }
  return _bdProductCache;
}

function onBestDealProductPick() {
  const val = document.getElementById("bdSkuInput").value;
  const sku = val.split(" — ")[0].trim();
  const p = _bdProductCache.find(x => x.sku === sku);
  const preview = document.getElementById("bdProductPreview");
  if (!p) { preview.style.display = "none"; return; }
  document.getElementById("bdProductPreviewImg").src = p.image_url || "";
  document.getElementById("bdProductPreviewName").textContent = p.name;
  document.getElementById("bdProductPreviewPrice").textContent = `$${Number(p.price).toFixed(2)} (live price, shown automatically)`;
  preview.style.display = "flex";
}

async function openAddBestDeal() {
  document.getElementById("bestDealModalTitle").textContent = "Add Deal";
  document.getElementById("bdId").value = "";
  document.getElementById("bdSkuInput").value = "";
  document.getElementById("bdHookInput").value = "";
  document.getElementById("bdPitchInput").value = "";
  document.getElementById("bdPositionInput").value = "1";
  document.getElementById("bdActiveInput").value = "true";
  document.getElementById("bdProductPreview").style.display = "none";
  await loadBestDealProductOptions();
  openModal("bestDealModal");
}

async function editBestDeal(id) {
  const { data: d } = await window.sb.from("best_deals").select("*").eq("id", id).single();
  if (!d) return;
  document.getElementById("bestDealModalTitle").textContent = "Edit Deal";
  document.getElementById("bdId").value = d.id;
  document.getElementById("bdHookInput").value = d.hook_title;
  document.getElementById("bdPitchInput").value = d.pitch_text;
  document.getElementById("bdPositionInput").value = d.position;
  document.getElementById("bdActiveInput").value = String(d.is_active);
  await loadBestDealProductOptions();
  const p = _bdProductCache.find(x => x.sku === d.sku);
  document.getElementById("bdSkuInput").value = p ? `${p.sku} — ${p.name}` : d.sku;
  onBestDealProductPick();
  openModal("bestDealModal");
}

async function saveBestDeal() {
  const skuRaw = document.getElementById("bdSkuInput").value.split(" — ")[0].trim();
  const hook = document.getElementById("bdHookInput").value.trim();
  const pitch = document.getElementById("bdPitchInput").value.trim();
  const position = parseInt(document.getElementById("bdPositionInput").value) || 1;
  const isActive = document.getElementById("bdActiveInput").value === "true";
  const id = document.getElementById("bdId").value;

  if (!skuRaw) { showToast("Pick a product first."); return; }
  if (!hook || !pitch) { showToast("Hook headline and pitch text are required."); return; }

  const btn = document.getElementById("bdSaveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const payload = { sku: skuRaw, hook_title: hook, pitch_text: pitch, position, is_active: isActive, updated_at: new Date().toISOString() };
  const { error } = id
    ? await window.sb.from("best_deals").update(payload).eq("id", id)
    : await window.sb.from("best_deals").insert(payload);

  btn.disabled = false; btn.textContent = "Save Deal";
  if (error) { showToast("Couldn't save: " + error.message); return; }

  closeModal("bestDealModal");
  showToast("Deal saved.");
  renderBestDealsTab();
}

async function deleteBestDeal(id) {
  if (!confirm("Remove this deal from the campaign?")) return;
  const { error } = await window.sb.from("best_deals").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + error.message); return; }
  showToast("Deal removed.");
  renderBestDealsTab();
}

/* ============================================================
   SUB-DISTRIBUTORS TAB
============================================================ */

async function renderSubDistributorsTab() {
  const monthInput = document.getElementById('affPayoutMonth');
  if (monthInput && !monthInput.value) {
    // Default to last month, not the current one -- that's the period
    // actually due by the 10th, which is what someone opening this tab
    // is almost always here to check.
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    monthInput.value = d.toISOString().slice(0, 7);
  }
  await Promise.all([loadSdStats(), loadSdTable(), loadEmpTable(), renderAffiliatePayouts()]);
}

/* ── Monthly affiliate commission payouts (RRS-9) ─────────────────
   Tiered on whichever bracket that month's TOTAL referred revenue falls
   into (not a marginal/bracket-by-slice calculation like a tax table) --
   e.g. $6,000 referred in a month pays 15% on the full $6,000, not 10% on
   the first $4,500 and 15% on the rest. Company-wide, not configurable
   per affiliate here -- if a negotiated flat rate is ever needed instead,
   that's what sub_distributors.commission_pct already exists for. */
const AFFILIATE_COMMISSION_TIERS = [
  { max: 4500,      rate: 0.10 },
  { max: 9000,      rate: 0.15 },
  { max: Infinity,  rate: 0.20 },
];

function affiliateCommissionRate(revenue) {
  const tier = AFFILIATE_COMMISSION_TIERS.find(t => revenue <= t.max) || AFFILIATE_COMMISSION_TIERS[AFFILIATE_COMMISSION_TIERS.length - 1];
  return tier.rate;
}

async function renderAffiliatePayouts() {
  const tbody = document.getElementById('aff-payout-table-body');
  if (!tbody || !window.sb) return;
  tbody.innerHTML = '<tr><td colspan="6" class="a-empty">Loading…</td></tr>';

  const monthInput = document.getElementById('affPayoutMonth');
  const monthStr = monthInput?.value || new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const periodStart = monthStr + '-01';
  const periodEnd = new Date(new Date(periodStart + 'T00:00:00Z').getTime());
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const dueDate = new Date(periodEnd);
  dueDate.setUTCDate(10);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const [{ data: sds }, { data: referrals }, { data: payouts }] = await Promise.all([
    window.sb.from('sub_distributors').select('id,name,status').order('name'),
    window.sb.from('order_referrals').select('sub_distributor_id,orders(total,created_at)'),
    window.sb.from('affiliate_payouts').select('*').eq('period_month', periodStart),
  ]);

  if (!sds || !sds.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="a-empty">No affiliates yet.</td></tr>';
    return;
  }

  const revenueByAffiliate = {};
  (referrals || []).forEach(r => {
    const created = r.orders?.created_at;
    if (!created || created < periodStart || created >= periodEnd.toISOString()) return;
    revenueByAffiliate[r.sub_distributor_id] = (revenueByAffiliate[r.sub_distributor_id] || 0) + (parseFloat(r.orders?.total) || 0);
  });

  const payoutByAffiliate = {};
  (payouts || []).forEach(p => { payoutByAffiliate[p.sub_distributor_id] = p; });

  tbody.innerHTML = sds.map(sd => {
    const paid = payoutByAffiliate[sd.id];
    // Once paid, the locked-in numbers on the payout row are the source of
    // truth -- an order edited or refunded after payout shouldn't silently
    // change what the affiliate was actually already sent.
    const revenue = paid ? Number(paid.referred_revenue) : (revenueByAffiliate[sd.id] || 0);
    const rate = paid ? Number(paid.commission_rate) : affiliateCommissionRate(revenue);
    const commission = paid ? Number(paid.commission_amount) : revenue * rate;

    const statusCell = paid
      ? `<span class="a-badge a-badge-green">Paid ${fmt(paid.paid_at)}</span>`
      : (commission > 0
          ? `<button class="a-btn-sm" onclick="markAffiliatePayoutPaid('${sd.id}','${escHtml(sd.name).replace(/'/g, "\\'")}','${monthStr}')">Mark Paid</button>`
          : `<span class="a-badge a-badge-gray">Nothing due</span>`);

    return `<tr>
      <td><strong>${escHtml(sd.name)}</strong></td>
      <td>$${revenue.toFixed(2)}</td>
      <td>${(rate * 100).toFixed(0)}%</td>
      <td><strong>$${commission.toFixed(2)}</strong></td>
      <td>${fmt(dueDateStr)}</td>
      <td>${statusCell}</td>
    </tr>`;
  }).join('');
}

async function markAffiliatePayoutPaid(subDistributorId, name, monthStr) {
  const periodStart = monthStr + '-01';
  const periodEnd = new Date(new Date(periodStart + 'T00:00:00Z').getTime());
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  const dueDate = new Date(periodEnd);
  dueDate.setUTCDate(10);

  const { data: referrals } = await window.sb
    .from('order_referrals')
    .select('orders(total,created_at)')
    .eq('sub_distributor_id', subDistributorId);

  const revenue = (referrals || []).reduce((s, r) => {
    const created = r.orders?.created_at;
    if (!created || created < periodStart || created >= periodEnd.toISOString()) return s;
    return s + (parseFloat(r.orders?.total) || 0);
  }, 0);
  const rate = affiliateCommissionRate(revenue);
  const commission = revenue * rate;

  if (!(commission > 0)) { showToast('Nothing due for this affiliate this month.'); return; }
  if (!confirm(`Mark ${name}'s ${monthStr} commission ($${commission.toFixed(2)}) as paid? This locks in the amount.`)) return;

  const { error } = await window.sb.from('affiliate_payouts').upsert({
    sub_distributor_id: subDistributorId,
    period_month: periodStart,
    referred_revenue: revenue,
    commission_rate: rate,
    commission_amount: commission,
    due_date: dueDate.toISOString().slice(0, 10),
    status: 'paid',
    paid_at: new Date().toISOString(),
  }, { onConflict: 'sub_distributor_id,period_month' });

  if (error) { showToast('Error: ' + error.message); return; }
  showToast('Marked paid.');
  renderAffiliatePayouts();
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
    tbody.innerHTML = '<tr><td colspan="9" class="a-empty">No affiliates yet.</td></tr>';
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
  document.getElementById('sdModalTitle').textContent = sd ? 'Edit Affiliate' : 'Add Affiliate';
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
  if (!confirm('Delete affiliate "' + name + '"?')) return;
  var result = await window.sb.from('sub_distributors').delete().eq('id', id);
  if (result.error) return showToast('Error: ' + result.error.message, 'error');
  showToast('Affiliate deleted.');
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
  var sdOptions = '<option value="">Select parent affiliate…</option>';
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
        '<div style="grid-column:span 2;"><label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:5px;">Parent Affiliate *</label><select id="empParent" style="width:100%;padding:9px 12px;border:1.5px solid #e4e9f2;border-radius:9px;font-size:13.5px;box-sizing:border-box;">' + sdOptions + '</select></div>' +
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
  if (!parent) return showErr('Please select a parent affiliate.');
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

  // A developer account has no read access to orders or quote requests, so
  // asking for them would only produce RLS errors. Their feed is tickets only.
  const isDev = window._adminRole === "developer";

  const [ordersRes, quotesRes, ticketsRes] = await Promise.all([
    isDev ? Promise.resolve({ data: [] })
          : window.sb.from("orders").select("id,created_at,status,shipping_name,total").gte("created_at", since).order("created_at", { ascending: false }).limit(10),
    isDev ? Promise.resolve({ data: [] })
          : window.sb.from("quote_requests").select("id,created_at,status,business_name,contact_name").gte("created_at", since).order("created_at", { ascending: false }).limit(10),
    window.sb.from("dev_tickets")
      .select("id,ticket_number,title,priority,status,assignee_id,assignee_email,updated_at,created_at")
      .gte("updated_at", since).order("updated_at", { ascending: false }).limit(15),
  ]);

  const readIds = getReadIds();

  // Only surface tickets that are actually this person's problem: assigned to
  // them, or (for admins) unresolved criticals anyone should be aware of.
  const myTickets = (ticketsRes.data || []).filter(t => {
    if (t.assignee_id && t.assignee_id === window._adminUserId) return true;
    return !isDev && t.priority === "critical" && !["done","not_possible"].includes(t.status);
  });

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
    ...myTickets.map(t => ({
      // Key on updated_at so a ticket that changes again re-alerts instead of
      // staying silently "read" from a previous update.
      id: "ticket-" + t.id + "-" + t.updated_at,
      type: "ticket",
      title: `${t.ticket_number} · ${t.title}`,
      sub: `${(TKT_PRIORITY[t.priority] || {}).label || t.priority} · ${TKT_STATUS_LABEL[t.status] || t.status}`,
      time: t.updated_at || t.created_at,
      action: () => { switchTab("dev-tickets"); toggleNotifPanel(); },
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
    ticket: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V7a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z"/></svg>`,
  };
  const iconBg = { order:"#eff6ff", quote:"#fff7f0", ticket:"#f5f3ff" };
  const iconFg = { order:"#3b82f6", quote:"#e8621a", ticket:"#7c3aed" };

  list.innerHTML = items.map(item => {
    const isUnread = !readIds.has(item.id);
    const ago = timeAgo(item.time);
    return `<div onclick="handleNotifClick('${item.id}')" style="padding:12px 18px;border-bottom:1px solid #f8fafc;cursor:pointer;display:flex;gap:12px;align-items:flex-start;background:${isUnread ? "#fffbf7" : "#fff"};transition:.15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='${isUnread ? "#fffbf7" : "#fff"}'">
      <div style="width:30px;height:30px;border-radius:8px;background:${iconBg[item.type]||"#fff7f0"};color:${iconFg[item.type]||"#e8621a"};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
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
  else if (id.startsWith("ticket-")) switchTab("dev-tickets");
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
  const isDev = window._adminRole === "developer";

  const [o, q, t] = await Promise.all([
    isDev ? Promise.resolve({ data: [] }) : window.sb.from("orders").select("id,created_at").gte("created_at", since),
    isDev ? Promise.resolve({ data: [] }) : window.sb.from("quote_requests").select("id,created_at").gte("created_at", since),
    window.sb.from("dev_tickets").select("id,updated_at,assignee_id").gte("updated_at", since),
  ]);

  const readIds = getReadIds();
  const total = [
    ...(o.data||[]).map(x => "order-"+x.id),
    ...(q.data||[]).map(x => "quote-"+x.id),
    ...(t.data||[]).filter(x => x.assignee_id && x.assignee_id === window._adminUserId)
                   .map(x => "ticket-"+x.id+"-"+x.updated_at),
  ].filter(id => !readIds.has(id)).length;
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

    const fileBadge = r.file_url
      ? `<a href="${esc(r.file_url)}" target="_blank" onclick="event.stopPropagation()" title="View attached file: ${esc(r.file_name||'file')}" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:2px 7px;background:#fff7f0;border:1px solid #fed7aa;border-radius:10px;color:#e8621a;font-size:10.5px;font-weight:700;text-decoration:none;vertical-align:middle">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          PDF
        </a>`
      : "";

    return `<tr>
      <td>${date}</td>
      <td><strong>${esc(r.business_name)}</strong>${fileBadge}<br><small>${esc(r.customer_type||"")}</small></td>
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

// r.terms_status/terms_sent_at/terms_accepted_at are populated by
// api/send-terms-agreement.js and api/terms-agreement.js -- see the
// migration for why this lives on quote_requests instead of requiring a
// join against terms_agreements just to render a badge.
function termsStatusBadge(r) {
  if (!r.terms_status) return "";
  const fmt = iso => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (r.terms_status === "accepted") {
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:10px 14px;background:#f0fdf4;border-radius:10px">
      <span style="font-size:12px;font-weight:700;color:#166534">✅ Payment Terms Accepted</span>
      <span style="margin-left:auto;font-size:11px;color:#94a3b8">${fmt(r.terms_accepted_at)}</span>
    </div>`;
  }
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:10px 14px;background:#fefce8;border-radius:10px">
    <span style="font-size:12px;font-weight:700;color:#854d0e">⏳ Payment Terms Sent — Awaiting Response</span>
    <span style="margin-left:auto;font-size:11px;color:#94a3b8">${fmt(r.terms_sent_at)}</span>
  </div>`;
}

// Manual quote entry -- for a customer the admin knows personally who has
// no account and never submitted the public request form. Creates a
// quote_requests row server-side (user_id: null, same shape a public guest
// submission produces) via /api/admin-create-quote, then drops straight
// into the normal detail/composer flow so nothing downstream needs to know
// this quote didn't start from the public form.
function openManualQuoteModal() {
  document.getElementById("mqBusinessName").value = "";
  document.getElementById("mqContactName").value = "";
  document.getElementById("mqEmail").value = "";
  document.getElementById("mqPhone").value = "";
  document.getElementById("mqCustomerType").value = "";
  document.getElementById("mqShippingStreet").value = "";
  document.getElementById("mqShippingCity").value = "";
  document.getElementById("mqShippingState").value = "";
  document.getElementById("mqShippingZip").value = "";
  document.getElementById("mqNotes").value = "";
  openModal("manualQuoteModal");
}

async function saveManualQuote() {
  const email = document.getElementById("mqEmail").value.trim();
  if (!email) { showToast("Customer email is required"); return; }

  const btn = document.getElementById("mqSaveBtn");
  const originalLabel = btn.textContent;
  btn.disabled = true; btn.textContent = "Creating…";

  try {
    const res = await fetch("/api/admin-create-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: document.getElementById("mqBusinessName").value.trim(),
        contact_name:  document.getElementById("mqContactName").value.trim(),
        email,
        phone_number:  document.getElementById("mqPhone").value.trim(),
        customer_type: document.getElementById("mqCustomerType").value,
        shipping_street: document.getElementById("mqShippingStreet").value.trim(),
        shipping_city:   document.getElementById("mqShippingCity").value.trim(),
        shipping_state:  document.getElementById("mqShippingState").value,
        shipping_zip:    document.getElementById("mqShippingZip").value.trim(),
        notes:         document.getElementById("mqNotes").value.trim(),
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to create quote");

    closeModal("manualQuoteModal");
    await renderQuoteRequestsTable();
    openQuoteDetail(result.id);
    showToast("Quote created — add products and pricing, then send when ready");
  } catch (err) {
    showToast("Couldn't create quote: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = originalLabel;
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
          <span>Product</span><span style="text-align:center">Qty</span>
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

  const termsBadge = termsStatusBadge(r);

  document.getElementById("quoteDetailBody").innerHTML = `
    <!-- Status pill -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:${termsBadge ? "8px" : "20px"};padding:10px 14px;background:${sc.bg};border-radius:10px">
      <span style="width:8px;height:8px;border-radius:50%;background:${sc.dot};flex-shrink:0"></span>
      <span style="font-size:12px;font-weight:700;color:${sc.color};text-transform:uppercase;letter-spacing:.06em">${r.status||"new"}</span>
      <span style="margin-left:auto;font-size:11px;color:#94a3b8">Submitted ${new Date(r.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
    </div>
    ${termsBadge}

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

    <!-- Shipping address -- editable independently of the composer, so a
         quote sent before these fields existed (or one whose customer
         never gave an address) can get one added -- and tax recalculated
         off the state -- without re-sending the whole quote to the
         customer. Also the only place fulfillment knows where to ship a
         quote-based order once it's invoiced. -->
    <div style="margin-bottom:20px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px;background:#fbfcfe">
      <p style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 10px">Shipping Address</p>
      <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:8px">
        <input id="quoteDetailShippingStreet" class="a-input" placeholder="Street address" style="height:34px;font-size:12.5px">
      </div>
      <div style="display:grid;grid-template-columns:1fr 140px 110px;gap:8px;margin-bottom:10px">
        <input id="quoteDetailShippingCity" class="a-input" placeholder="City" style="height:34px;font-size:12.5px">
        <select id="quoteDetailShippingState" class="a-select" style="height:34px;border-radius:8px;font-size:12.5px;padding:0 8px">
          <option value="">State</option>
          <option value="AL">Alabama</option><option value="AK">Alaska</option><option value="AZ">Arizona</option>
          <option value="AR">Arkansas</option><option value="CA">California</option><option value="CO">Colorado</option>
          <option value="CT">Connecticut</option><option value="DE">Delaware</option><option value="DC">District of Columbia</option>
          <option value="FL">Florida</option><option value="GA">Georgia</option><option value="HI">Hawaii</option>
          <option value="ID">Idaho</option><option value="IL">Illinois</option><option value="IN">Indiana</option>
          <option value="IA">Iowa</option><option value="KS">Kansas</option><option value="KY">Kentucky</option>
          <option value="LA">Louisiana</option><option value="ME">Maine</option><option value="MD">Maryland</option>
          <option value="MA">Massachusetts</option><option value="MI">Michigan</option><option value="MN">Minnesota</option>
          <option value="MS">Mississippi</option><option value="MO">Missouri</option><option value="MT">Montana</option>
          <option value="NE">Nebraska</option><option value="NV">Nevada</option><option value="NH">New Hampshire</option>
          <option value="NJ">New Jersey</option><option value="NM">New Mexico</option><option value="NY">New York</option>
          <option value="NC">North Carolina</option><option value="ND">North Dakota</option><option value="OH">Ohio</option>
          <option value="OK">Oklahoma</option><option value="OR">Oregon</option><option value="PA">Pennsylvania</option>
          <option value="RI">Rhode Island</option><option value="SC">South Carolina</option><option value="SD">South Dakota</option>
          <option value="TN">Tennessee</option><option value="TX">Texas</option><option value="UT">Utah</option>
          <option value="VT">Vermont</option><option value="VA">Virginia</option><option value="WA">Washington</option>
          <option value="WV">West Virginia</option><option value="WI">Wisconsin</option><option value="WY">Wyoming</option>
        </select>
        <input id="quoteDetailShippingZip" class="a-input" placeholder="ZIP" maxlength="10" style="height:34px;font-size:12.5px">
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="a-btn-primary" style="height:34px;padding:0 14px;font-size:12.5px;white-space:nowrap" onclick="saveQuoteShippingAddress()">Save &amp; Recalculate Tax</button>
        <span id="quoteDetailTaxNote" style="font-size:11.5px;color:#64748b"></span>
      </div>
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
  document.getElementById("quoteDetailShippingStreet").value = r.shipping_street || "";
  document.getElementById("quoteDetailShippingCity").value = r.shipping_city || "";
  document.getElementById("quoteDetailShippingState").value = r.shipping_state || "";
  document.getElementById("quoteDetailShippingZip").value = r.shipping_zip || "";
  const taxNoteEl = document.getElementById("quoteDetailTaxNote");
  if (taxNoteEl) {
    taxNoteEl.textContent = r.tax_amount > 0
      ? `Currently taxed at ${((r.tax_rate || 0) * 100).toFixed(2)}% ($${Number(r.tax_amount).toFixed(2)})`
      : "";
  }
  document.getElementById("quoteDetailModal").style.display = "flex";
}

// Sets/changes the shipping address on an already-created quote request
// directly -- independent of the composer -- and recalculates tax from
// the state, off the quote's existing subtotal + delivery fee. This is
// what lets a quote sent before these fields existed (or one that never
// had an address) get a real ship-to and correct tax before it's
// invoiced, without re-sending the whole quote email to the customer.
async function saveQuoteShippingAddress() {
  if (!currentQuoteId) return;
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return;

  const street = document.getElementById("quoteDetailShippingStreet").value.trim();
  const city   = document.getElementById("quoteDetailShippingCity").value.trim();
  const state  = document.getElementById("quoteDetailShippingState").value;
  const zip    = document.getElementById("quoteDetailShippingZip").value.trim();
  const btn = document.querySelector('[onclick="saveQuoteShippingAddress()"]');
  if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }

  // Tax applies to items + delivery fee, same base used everywhere else
  // (composer, send-quote, invoice). subtotal is items-only by the
  // established convention, so the fee has to be added back in here too.
  const taxableBase = (Number(r.subtotal) || 0) + (Number(r.in_house_delivery_fee) || 0);
  const rate = state ? (window.getTaxRate?.(state) || 0) : 0;
  const taxAmount = taxableBase * rate;
  const grandTotal = taxableBase + taxAmount;

  const { error } = await window.sb.from("quote_requests").update({
    shipping_street: street || null,
    shipping_city: city || null,
    shipping_state: state || null,
    shipping_zip: zip || null,
    tax_rate: rate,
    tax_amount: taxAmount,
    // Only recompute grand_total if this quote already has real pricing
    // (i.e. it's been quoted) -- for a not-yet-quoted request there's
    // nothing to base a total on yet, and the composer will set it later.
    ...(r.status === "quoted" || r.grand_total > 0 ? { grand_total: grandTotal } : {}),
  }).eq("id", currentQuoteId);

  if (btn) { btn.textContent = "Save & Recalculate Tax"; btn.disabled = false; }

  if (error) {
    alert("Error saving shipping address: " + error.message);
    return;
  }

  r.shipping_street = street || null;
  r.shipping_city = city || null;
  r.shipping_state = state || null;
  r.shipping_zip = zip || null;
  r.tax_rate = rate;
  r.tax_amount = taxAmount;
  if (r.status === "quoted" || r.grand_total > 0) r.grand_total = grandTotal;

  const taxNoteEl = document.getElementById("quoteDetailTaxNote");
  if (taxNoteEl) {
    taxNoteEl.textContent = state
      ? `Now taxed at ${(rate * 100).toFixed(2)}% ($${taxAmount.toFixed(2)}) — new total $${grandTotal.toFixed(2)}`
      : "Tax cleared (no state set)";
  }
  showToast("Shipping address saved" + (state ? ` — tax recalculated at ${(rate * 100).toFixed(2)}%` : ""));
}

/* ── Quote Composer ─────────────────────────────────────────── */

const SEND_QUOTE_URL = "https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/send-quote";
const SUPABASE_ANON_KEY = "sb_publishable_B17JFi1RywMYN_a-UN_qzw_sWH_5lDN";

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

// Mirrors getTierPrice()/isSoldByDozen() in script.js. The storefront and
// this composer must agree exactly: if they disagree, a customer is
// quoted one price and charged another.
function tierPriceForQty(product, qty) {
  const q = Number(qty) || 1;
  const t1 = Number(product.price_tier1) || 0;
  const t2 = Number(product.price_tier2) || 0;
  const t3 = Number(product.price_tier3) || 0;

  // Sold by the dozen: one flat rate at every quantity. Without this, a
  // quote for 50 dozen wash cloths would cross the "30+" line and apply a
  // case volume discount that no longer exists.
  if (String(product.unit || "").trim().toLowerCase() === "dozen") return t1;

  if (q >= 30) return t3 || t2 || t1;
  if (q >= 6)  return t2 || t1;
  return t1;
}

let _quoteComposerProducts = [];
// Array-backed line items, source of truth for the composer -- rewritten
// from the old DOM-NodeList-position approach specifically because that
// approach had no way to add a line that didn't already exist in
// r.requested_items (getComposerPayload pulled every item's *name* from
// that array by position, not from any input on the page at all). That
// meant a quote request with zero requested_items -- exactly what every
// manually-entered quote has, since the admin hasn't typed products into
// the composer yet -- rendered a "add them manually below" message with
// no actual way to add anything. Each line now carries its own name, so
// items can be added/removed/edited freely regardless of what the
// customer originally requested (or didn't).
let _quoteComposerLines = [];

async function openQuoteComposer() {
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return;

  // Default valid until = 10 days from now. Prices are moving with fuel
  // costs right now, so every quote is only held for 10 days unless staff
  // deliberately override it for a specific case.
  const d = new Date(); d.setDate(d.getDate() + 10);
  document.getElementById("quoteValidUntil").value = d.toISOString().slice(0, 10);
  document.getElementById("quoteMessage").value = `Dear ${r.contact_name},\n\nThank you for your interest in Room Ready Supply. Please find your custom volume pricing quote below. We look forward to serving your hospitality needs.\n\nFeel free to contact us with any questions.`;
  document.getElementById("quoteNet30").checked = false;
  document.getElementById("quoteInHouse").checked = false;
  document.getElementById("quoteInHouseFee").value = "0.00";
  document.getElementById("quoteShippingState").value = r.shipping_state || "";
  toggleQuoteInHouse();

  document.getElementById("quoteLineItems").innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">Loading catalog pricing…</div>`;
  document.getElementById("quoteComposerModal").style.display = "flex";

  const { data: products } = await window.sb
    .from("products")
    .select("name, price_tier1, price_tier2, price_tier3, unit, moq")
    .eq("is_active", true);
  _quoteComposerProducts = products || [];

  const dl = document.getElementById("quoteComposerProductList");
  if (dl) dl.innerHTML = _quoteComposerProducts.map(p => `<option value="${esc(p.name)}">`).join("");

  const requested = r.requested_items || [];
  _quoteComposerLines = requested.map(item => {
    const match = _quoteComposerProducts.find(p => normalizeProductName(p.name) === normalizeProductName(item.name));
    // A customer's quote request can ask for less than a product's real
    // minimum order (e.g. "1" wash cloth on a 25-dozen-case item) -- auto-
    // bump the starting quantity up to the catalog minimum; staff can
    // still raise it further, just never see a quote start below what's
    // actually sellable.
    const moq = match ? (parseInt(match.moq) || 1) : 1;
    const requestedQty = parseInt(item.quantity) || 1;
    const quantity = Math.max(requestedQty, moq);
    const autoPrice = match ? tierPriceForQty(match, quantity) : null;
    return {
      name: item.name || "",
      quantity,
      unit_price: autoPrice != null ? Number(autoPrice.toFixed(2)) : null,
      moq,
      matched: !!match,
      priceOverridden: false,
      bumpedNote: match && moq > 1 && quantity > requestedQty,
    };
  });

  renderQuoteComposerLines();
}

// Full re-render -- only called on add/remove/initial load, never on a
// keystroke inside a line (that would blow away focus/cursor position on
// every character typed). Per-line edits patch the DOM directly instead;
// see onQuoteLineNameInput/QtyInput/PriceInput below.
function renderQuoteComposerLines() {
  const container = document.getElementById("quoteLineItems");
  if (!_quoteComposerLines.length) {
    container.innerHTML = `<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">No products yet — click "Add Item" below.</div>`;
    recalcQuoteTotal();
    return;
  }

  container.innerHTML = _quoteComposerLines.map((line, idx) => {
    const hint = !line.matched && line.name
      ? `<br><small id="ql-hint-${idx}" style="color:#b45309;font-weight:600">Not in catalog — enter price manually</small>`
      : line.bumpedNote
        ? `<br><small id="ql-hint-${idx}" style="color:#0369a1;font-weight:600">Bumped up to the ${line.moq}-unit minimum order</small>`
        : `<small id="ql-hint-${idx}"></small>`;
    const autoStyled = line.unit_price != null && !line.priceOverridden;
    return `
      <div style="display:grid;grid-template-columns:1fr 100px 120px 100px 32px;gap:10px;padding:10px 14px;border-top:1px solid #f1f5f9;align-items:center;background:${idx%2===0?"#fff":"#fafbfc"}">
        <div>
          <input type="text" id="ql-name-${idx}" value="${esc(line.name)}" placeholder="Product name" list="quoteComposerProductList"
            oninput="onQuoteLineNameInput(${idx}, this.value)"
            style="width:100%;box-sizing:border-box;padding:5px 8px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px">
          ${hint}
        </div>
        <div style="text-align:center">
          <input type="number" id="ql-qty-${idx}" min="${line.moq || 1}" step="${line.moq > 1 ? line.moq : 1}" value="${line.quantity}"
            oninput="onQuoteLineQtyInput(${idx}, this.value)"
            style="width:70px;padding:5px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:13px;text-align:center">
        </div>
        <div style="text-align:right">
          <input type="number" id="ql-price-${idx}" min="0" step="0.01" value="${line.unit_price != null ? line.unit_price.toFixed(2) : ""}" placeholder="0.00"
            oninput="onQuoteLinePriceInput(${idx}, this.value)"
            style="width:100px;padding:5px 8px;border:1.5px solid ${autoStyled ? "#bbf7d0" : "#e2e8f0"};background:${autoStyled ? "#f0fdf4" : "#fff"};border-radius:7px;font-size:13px;text-align:right"
            title="${autoStyled ? "Auto-filled from catalog tier pricing — edit to override" : ""}">
        </div>
        <div style="text-align:right;font-size:13px;font-weight:700;color:#0d2c50" id="ql-line-${idx}">—</div>
        <button type="button" onclick="removeQuoteLine(${idx})" title="Remove item"
          style="width:28px;height:28px;border-radius:7px;border:1px solid #fecaca;background:#fff5f5;color:#dc2626;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0">&times;</button>
      </div>`;
  }).join("");

  recalcQuoteTotal();
}

function addQuoteLine() {
  _quoteComposerLines.push({ name: "", quantity: 1, unit_price: null, moq: 1, matched: false, priceOverridden: false, bumpedNote: false });
  renderQuoteComposerLines();
  document.getElementById(`ql-name-${_quoteComposerLines.length - 1}`)?.focus();
}

function removeQuoteLine(idx) {
  _quoteComposerLines.splice(idx, 1);
  renderQuoteComposerLines();
}

// Typed a product name: try to match the catalog for auto-pricing. Only
// the affected line's own price/qty inputs are patched directly (not a
// full re-render) so the name field the admin is actively typing into
// never loses focus mid-word.
function onQuoteLineNameInput(idx, value) {
  const line = _quoteComposerLines[idx];
  if (!line) return;
  line.name = value;

  const match = _quoteComposerProducts.find(p => normalizeProductName(p.name) === normalizeProductName(value));
  line.matched = !!match;

  if (match && !line.priceOverridden) {
    line.moq = parseInt(match.moq) || 1;
    line.quantity = Math.max(line.quantity || 1, line.moq);
    line.unit_price = Number(tierPriceForQty(match, line.quantity).toFixed(2));

    const qtyEl = document.getElementById(`ql-qty-${idx}`);
    if (qtyEl) { qtyEl.value = line.quantity; qtyEl.min = line.moq; qtyEl.step = line.moq > 1 ? line.moq : 1; }
    const priceEl = document.getElementById(`ql-price-${idx}`);
    if (priceEl) {
      priceEl.value = line.unit_price.toFixed(2);
      priceEl.style.borderColor = "#bbf7d0";
      priceEl.style.background = "#f0fdf4";
      priceEl.title = "Auto-filled from catalog tier pricing — edit to override";
    }
  }

  const hintEl = document.getElementById(`ql-hint-${idx}`);
  if (hintEl) {
    hintEl.textContent = !line.matched && line.name ? "Not in catalog — enter price manually" : "";
    hintEl.style.color = "#b45309";
  }

  recalcQuoteTotal();
}

// Quantity changed: if staff never touched the price, recompute it for the
// new quantity -- e.g. crossing from 4 to 6 cases should move from tier 1
// to tier 2 pricing automatically. A price staff have deliberately
// overridden is left alone.
function onQuoteLineQtyInput(idx, value) {
  const line = _quoteComposerLines[idx];
  if (!line) return;
  line.quantity = parseInt(value) || 1;

  if (!line.priceOverridden) {
    const match = _quoteComposerProducts.find(p => normalizeProductName(p.name) === normalizeProductName(line.name));
    if (match) {
      line.unit_price = Number(tierPriceForQty(match, line.quantity).toFixed(2));
      const priceEl = document.getElementById(`ql-price-${idx}`);
      if (priceEl) priceEl.value = line.unit_price.toFixed(2);
    }
  }

  recalcQuoteTotal();
}

// Staff typed into the price field directly -- from now on this line is a
// manual override, so quantity/name changes must not silently overwrite it.
function onQuoteLinePriceInput(idx, value) {
  const line = _quoteComposerLines[idx];
  if (!line) return;
  line.unit_price = parseFloat(value) || 0;
  line.priceOverridden = true;

  const priceEl = document.getElementById(`ql-price-${idx}`);
  if (priceEl) { priceEl.style.borderColor = "#e2e8f0"; priceEl.style.background = "#fff"; priceEl.title = ""; }

  recalcQuoteTotal();
}

function toggleQuoteInHouse() {
  const on = document.getElementById("quoteInHouse").checked;
  document.getElementById("quoteInHouseFeeRow").style.display = on ? "block" : "none";
  const box = document.getElementById("quoteInHouseBox");
  if (box) {
    box.style.borderColor = on ? "#fbbf85" : "#e2e8f0";
    box.style.background  = on ? "#fff8f2" : "#fbfcfe";
  }
  recalcQuoteTotal();
}

// The delivery fee counts toward the quoted total, so it has to be part of
// this sum -- otherwise the emailed quote, the invoice and the Stripe
// payment link would each disagree about what the customer owes.
function quoteInHouseFee() {
  if (!document.getElementById("quoteInHouse")?.checked) return 0;
  return Math.max(0, parseFloat(document.getElementById("quoteInHouseFee")?.value) || 0);
}

// Subtotal (items + in-house delivery fee) -> tax by shipping state ->
// grand total. Tax is 0 whenever no state is picked yet -- getTaxRate()
// (tax-rates.js) already falls back to 0 for an empty/unrecognized code,
// so this doesn't need its own guard, but the label reflects it either way
// so staff never mistake "no state picked" for "this state has 0% tax".
function quoteTaxRate() {
  const state = document.getElementById("quoteShippingState")?.value || "";
  return state ? (window.getTaxRate?.(state) || 0) : 0;
}

function recalcQuoteTotal() {
  let subtotal = 0;
  _quoteComposerLines.forEach((line, idx) => {
    const price = Number(line.unit_price) || 0;
    const qty   = parseInt(line.quantity) || 0;
    const lineTotal = price * qty;
    subtotal += lineTotal;
    const lineEl = document.getElementById(`ql-line-${idx}`);
    if (lineEl) lineEl.textContent = lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : "—";
  });
  subtotal += quoteInHouseFee();

  const rate = quoteTaxRate();
  const tax = subtotal * rate;
  const total = subtotal + tax;

  const state = document.getElementById("quoteShippingState")?.value || "";
  const taxLabelEl = document.getElementById("quoteTaxLabel");
  if (taxLabelEl) {
    taxLabelEl.textContent = state
      ? `Sales Tax (${state} · ${(rate * 100).toFixed(2)}%)`
      : "Sales Tax (select state)";
  }

  const setText2 = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText2("quoteSubtotal", `$${subtotal.toFixed(2)}`);
  setText2("quoteTaxAmount", `$${tax.toFixed(2)}`);
  setText2("quoteGrandTotal", `$${total.toFixed(2)}`);
}

function getComposerPayload() {
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return null;
  const items = _quoteComposerLines
    .filter(l => l.name?.trim() && Number(l.unit_price) > 0)
    .map(l => ({ name: l.name.trim(), quantity: parseInt(l.quantity) || 1, unit_price: Number(l.unit_price) }));
  const inHouse = document.getElementById("quoteInHouse").checked;
  return {
    quote_request_id: currentQuoteId,
    items,
    valid_until: document.getElementById("quoteValidUntil").value,
    message: document.getElementById("quoteMessage").value.trim(),
    net_30_terms: document.getElementById("quoteNet30").checked,
    fulfillment_method: inHouse ? "in_house" : "ship",
    in_house_delivery_fee: inHouse ? quoteInHouseFee() : 0,
    shipping_state: document.getElementById("quoteShippingState")?.value || "",
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

// Downloads the quote exactly as it's been customized in the composer --
// current quantities, any manually overridden prices, the message, Net 30
// and in-house delivery choices -- rather than only being downloadable
// after it's been sent and saved. Builds the same fields /api/quote-pdf.js
// reads off a real saved quote_requests row, just from the live form
// instead of the database, so nothing has to be sent first to get a PDF.
async function downloadQuotePreviewPdf() {
  const payload = getComposerPayload();
  if (!payload || !payload.items.length) { alert("Nothing to download yet — add at least one priced item first."); return; }

  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  const btn = document.getElementById("downloadQuotePreviewBtn");
  const original = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }

  try {
    const itemsTotal = payload.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const deliveryFee = payload.fulfillment_method === "in_house" ? (payload.in_house_delivery_fee || 0) : 0;
    const taxRate = payload.shipping_state ? (window.getTaxRate?.(payload.shipping_state) || 0) : 0;
    const taxAmount = (itemsTotal + deliveryFee) * taxRate;

    const res = await fetch("/api/quote-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quote_number: r?.quote_number || "PREVIEW",
        created_at: new Date().toISOString(),
        valid_until: payload.valid_until,
        business_name: r?.business_name || "",
        contact_name: r?.contact_name || "",
        email: r?.email || "",
        customer_type: r?.customer_type || "",
        quote_items: payload.items,
        quote_message: payload.message,
        net_30_terms: payload.net_30_terms,
        in_house_delivery_fee: deliveryFee,
        shipping_state: payload.shipping_state,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        grand_total: itemsTotal + deliveryFee + taxAmount,
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RRS-Quotation-Preview-${r?.business_name || "draft"}.pdf`.replace(/[^\w.-]+/g, "-");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Couldn't download the PDF: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function sendQuote() {
  const payload = getComposerPayload();
  if (!payload) return;
  if (!payload.items.length) { alert("Please enter at least one unit price before sending."); return; }
  if (!payload.valid_until) { alert("Please set a valid until date."); return; }
  if (!payload.shipping_state) { alert("Please select the customer's shipping state so sales tax can be calculated."); return; }

  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!confirm(`Send this quote to ${r?.email}?`)) return;

  await doSendQuote(payload);
}

async function sendQuoteFromPreview() {
  const payload = getComposerPayload();
  if (!payload) return;
  if (!payload.shipping_state) { alert("Please select the customer's shipping state so sales tax can be calculated."); return; }
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
//
// Mirrors the existing Preview Quote / Send to Customer flow: nothing is
// sent, no order is created and no Stripe Payment Link exists until staff
// review the actual rendered email and its prices, then explicitly send.
//
// The same preview overlay/iframe and "Email This Invoice" button are
// shared with the order-invoice flow below (previewOrderInvoice()) rather
// than duplicating the whole modal -- this flag is how sendInvoiceFromPreview()
// tells which of the two just opened it.
let _invoiceOrderMode = false;

async function previewInvoice() {
  _invoiceOrderMode = false;
  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return;

  const btn = document.getElementById("sendInvoiceBtn");
  const original = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }

  try {
    const res = await fetch("/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_request_id: currentQuoteId, preview_only: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Preview failed");

    document.getElementById("invoicePreviewFrame").srcdoc = data.html;
    document.getElementById("invoicePreviewOverlay").style.display = "flex";
  } catch (err) {
    alert("Preview error: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function sendInvoiceFromPreview() {
  if (_invoiceOrderMode) return sendOrderInvoiceFromPreview();

  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  if (!r) return;

  if (!confirm(`Email this invoice + payment link to ${r.email}?\n\nShe will be able to pay by card directly from the email, no site visit needed.`)) return;

  const btn = document.querySelector('#invoicePreviewOverlay button[onclick="sendInvoiceFromPreview()"]');
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const res = await fetch("/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_request_id: currentQuoteId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed");

    document.getElementById("invoicePreviewOverlay").style.display = "none";
    document.getElementById("quoteDetailModal").style.display = "none";
    alert(`✅ Invoice ${data.order_number} emailed to ${r.email}.\n\nPayment link:\n${data.payment_link}`);
  } catch (err) {
    alert("Could not send the invoice: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ── Order invoice/pay-link (same preview overlay + api/send-invoice.js as
   the quote flow above, just pointed at an existing order via order_id
   instead of creating a new one from a quote) ─────────────────────── */
async function previewOrderInvoice(orderId) {
  // Everything from here down is inside try/catch -- a click that fails
  // for ANY reason (a bad selector, a network error, a non-JSON error
  // page from a crashed function) must still end in a visible alert
  // instead of doing nothing, which is indistinguishable from the button
  // being broken.
  let btn, original;
  try {
    _invoiceOrderMode = true;
    const o = currentOrderData && currentOrderData.id === orderId ? currentOrderData : null;
    if (!o) throw new Error("Order data isn't loaded — close and reopen this order, then try again.");

    btn = document.querySelector(`[onclick="previewOrderInvoice('${orderId}')"]`);
    original = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }

    // A stuck "Loading…" with no error at all (reported live) means the
    // fetch itself never resolved or rejected -- normally that only
    // happens on a genuinely hung connection, which a plain fetch() has no
    // built-in limit for. This forces it to fail loudly after 20s instead
    // of leaving the button spinning forever with nothing to go on.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    let res;
    try {
      res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, preview_only: true }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name === "AbortError") throw new Error("Request timed out after 20 seconds — the server may be unreachable. Check your connection and try again.");
      throw new Error("Network error: " + fetchErr.message);
    } finally {
      clearTimeout(timeoutId);
    }
    let data;
    try { data = await res.json(); }
    catch (parseErr) { throw new Error(`Server returned an unexpected response (HTTP ${res.status}) -- ${parseErr.message}`); }
    if (!res.ok) throw new Error(data.error || `Preview failed (HTTP ${res.status})`);

    document.getElementById("invoicePreviewFrame").srcdoc = data.html;
    document.getElementById("invoicePreviewOverlay").style.display = "flex";
  } catch (err) {
    alert("Preview error: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function sendOrderInvoiceFromPreview() {
  const o = currentOrderData;
  if (!o) return;

  if (!confirm(`Email this invoice + payment link to ${o.customer_email}?\n\nThey will be able to pay by card directly from the email, no site visit needed.`)) return;

  const btn = document.querySelector('#invoicePreviewOverlay button[onclick="sendInvoiceFromPreview()"]');
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  // Same reasoning as previewOrderInvoice()'s timeout: this call also
  // creates a real Stripe Payment Link and sends a real email, so it's
  // given a bit longer (30s) before giving up.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    let res;
    try {
      res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: o.id }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name === "AbortError") throw new Error("Request timed out after 30 seconds — the server may be unreachable. Check whether it actually sent before retrying.");
      throw new Error("Network error: " + fetchErr.message);
    }
    let data;
    try { data = await res.json(); }
    catch (parseErr) { throw new Error(`Server returned an unexpected response (HTTP ${res.status}) -- ${parseErr.message}`); }
    if (!res.ok) throw new Error(data.error || "Send failed");

    document.getElementById("invoicePreviewOverlay").style.display = "none";
    alert(`✅ Invoice ${data.order_number} emailed to ${o.customer_email}.\n\nPayment link:\n${data.payment_link}`);
    // Refresh so the modal reflects the new pending_invoice status, and the
    // orders list picks up the change too.
    openOrderModal(o.id);
    if (typeof renderOrdersTable === "function") renderOrdersTable();
  } catch (err) {
    alert("Could not send the invoice: " + err.message);
  } finally {
    clearTimeout(timeoutId);
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ── Payment Terms Agreement ────────────────────────────────── */
// Confirms an approved 30-day net-terms exception before any invoice or
// payment link goes out -- a customer who agreed to pay after delivery
// should not get a "pay now" email the same week. See
// api/send-terms-agreement.js for the fixed wording (30 days from
// delivery, 10% late fee at the due date with no grace period, suspension
// at day 40) -- those numbers are intentionally not editable per-send.

// Tracks which quote or order (if either) this send is tied to, so
// acceptance status can show up on that quote/order's own detail view
// instead of only living in the standalone terms_agreements table.
// Opening from the toolbar (no argument) sends an untied agreement, same
// as before. Only ever one or the other, never both.
let _termsQuoteRequestId = null;
let _termsOrderId = null;

function openTermsAgreementModal(quoteRequestId) {
  _termsQuoteRequestId = quoteRequestId || null;
  _termsOrderId = null;
  const r = quoteRequestId ? allQuoteRequests.find(x => x.id === quoteRequestId) : null;

  document.getElementById("taContactName").value  = r ? (r.contact_name || "") : "";
  document.getElementById("taBusinessName").value = r ? (r.business_name || "") : "";
  document.getElementById("taEmail").value        = r ? (r.email || "") : "";
  document.getElementById("taTotal").value        = r ? (quoteItemsTotal(r) || "") : "";
  document.getElementById("termsAgreementModal").style.display = "flex";
}

// Same modal/send flow as the quote version above, pre-filled from the
// currently open order instead -- api/send-terms-agreement.js's
// quote_request_id is optional, so this just leaves it unset (nothing on
// the backend requires a quote to exist).
function openTermsAgreementModalForOrder(orderId) {
  // No error handling here previously -- a null element reference (or
  // anything else unexpected) threw uncaught and silently stopped the
  // function cold, before ever reaching the line that shows the modal.
  // That failure mode is indistinguishable from "the button does
  // nothing," which is exactly what got reported live.
  try {
    _termsQuoteRequestId = null;
    _termsOrderId = orderId;
    const o = currentOrderData && currentOrderData.id === orderId ? currentOrderData : null;
    if (!o) throw new Error("Order data isn't loaded — close and reopen this order, then try again.");

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Missing form field #${id} -- the Terms Agreement modal may not have loaded correctly.`);
      el.value = val;
    };
    setVal("taContactName",  o.customer_name  || "");
    setVal("taBusinessName", o.business_name  || "");
    setVal("taEmail",        o.customer_email || "");
    setVal("taTotal",        Number(o.total) || "");

    const modal = document.getElementById("termsAgreementModal");
    if (!modal) throw new Error("Missing #termsAgreementModal element.");
    modal.style.display = "flex";
  } catch (err) {
    alert("Couldn't open the Terms Agreement form: " + err.message);
  }
}

function getTermsAgreementPayload() {
  const contact_name  = document.getElementById("taContactName").value.trim();
  const business_name = document.getElementById("taBusinessName").value.trim();
  const email          = document.getElementById("taEmail").value.trim();
  const totalRaw        = document.getElementById("taTotal").value.trim();
  if (!contact_name || !business_name || !email) {
    alert("Contact name, business name, and email are all required.");
    return null;
  }
  return {
    contact_name, business_name, email,
    total: totalRaw ? Number(totalRaw) : null,
    quote_request_id: _termsQuoteRequestId,
    order_id: _termsOrderId,
  };
}

async function previewTermsAgreement() {
  const payload = getTermsAgreementPayload();
  if (!payload) return;

  const btn = document.getElementById("taPreviewBtn");
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }

  try {
    const res = await fetch("/api/send-terms-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, preview_only: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Preview failed");

    document.getElementById("termsPreviewFrame").srcdoc = data.html;
    document.getElementById("termsPreviewOverlay").style.display = "flex";
  } catch (err) {
    alert("Preview error: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function sendTermsAgreementFromPreview() {
  const payload = getTermsAgreementPayload();
  if (!payload) return;

  if (!confirm(`Email the payment terms agreement to ${payload.email}?`)) return;

  const btn = document.querySelector('#termsPreviewOverlay button[onclick="sendTermsAgreementFromPreview()"]');
  const original = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const res = await fetch("/api/send-terms-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed");

    document.getElementById("termsPreviewOverlay").style.display = "none";
    document.getElementById("termsAgreementModal").style.display = "none";
    alert(`✅ Payment terms agreement emailed to ${payload.email}.`);

    // Refresh so the "Sent — Awaiting Response" badge shows immediately
    // instead of only appearing after the next unrelated re-render.
    if (payload.quote_request_id) {
      await renderQuoteRequestsTable();
      openQuoteDetail(payload.quote_request_id);
    } else if (payload.order_id) {
      openOrderModal(payload.order_id);
      if (typeof renderOrdersTable === "function") renderOrdersTable();
    }
  } catch (err) {
    alert("Could not send the agreement: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
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
