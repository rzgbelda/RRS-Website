/* ============================================================
   Room Ready Supply — Admin Dashboard  (Supabase-powered)
   ============================================================ */

/* ── Bootstrap ─────────────────────────────────────────────── */
window._adminRole = "admin"; // default; overwritten below

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
  if (role !== "owner" && role !== "admin" && role !== "sub_distributor" && role !== "developer" && role !== "marketing") {
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
  updateNotifBadgeFromStorage();

  /* Wire buttons */
  document.getElementById("openCsvImport")?.addEventListener("click", openCsvImport);
  document.getElementById("openAddProduct")?.addEventListener("click", openAddProduct);
  document.getElementById("saveProduct")?.addEventListener("click", saveProduct);
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
  if (role === "owner") setupSettings(session.user.id);

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
  if (role !== "owner" && role !== "admin" && role !== "sub_distributor" && role !== "developer" && role !== "marketing") {
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
  if (role === "owner") setupSettings(data.user.id);
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
  resetMyProfilePasswordSection();
  openModal("myProfileModal");
}

// Collapsed by default, and reset every time the modal opens -- a
// half-typed new password (or a just-shown success message) from the
// last time someone opened My Profile must not linger into this one.
function resetMyProfilePasswordSection() {
  const form = document.getElementById("myProfilePwForm");
  const toggle = document.getElementById("myProfilePwToggle");
  if (form) { form.style.display = "none"; form.reset?.(); }
  if (toggle) toggle.textContent = "Change Password";
  document.getElementById("myProfileNewPass").value = "";
  document.getElementById("myProfileConfirmPass").value = "";
  document.getElementById("myProfilePwMsg").style.display = "none";
  document.getElementById("myProfilePwErr").style.display = "none";
}

function toggleMyProfilePassword() {
  const form = document.getElementById("myProfilePwForm");
  const toggle = document.getElementById("myProfilePwToggle");
  const showing = form.style.display !== "none";
  form.style.display = showing ? "none" : "block";
  toggle.textContent = showing ? "Change Password" : "Cancel";
  if (showing) resetMyProfilePasswordSection();
}

// Same window.sb.auth.updateUser() call and the same 8-char/match rules
// as the Settings-tab version of this form (setupSettings,
// changePasswordForm) -- this just makes the same capability reachable
// from a modal every role can open, not only staff on the Settings tab.
// Supabase's updateUser() re-uses the caller's already-authenticated
// session as proof of identity; it does not take or check a "current
// password" field (the Settings form's currentPass input is likewise
// never read by its handler -- an existing quirk, not something this
// introduces).
async function saveMyProfilePassword() {
  const newPw  = document.getElementById("myProfileNewPass").value || "";
  const confPw = document.getElementById("myProfileConfirmPass").value || "";
  const msgEl  = document.getElementById("myProfilePwMsg");
  const errEl  = document.getElementById("myProfilePwErr");
  const btn    = document.getElementById("myProfilePwSaveBtn");
  msgEl.style.display = "none";
  errEl.style.display = "none";

  if (newPw.length < 8) { errEl.textContent = "Password must be at least 8 characters."; errEl.style.display = "block"; return; }
  if (newPw !== confPw) { errEl.textContent = "Passwords do not match."; errEl.style.display = "block"; return; }

  btn.disabled = true; btn.textContent = "Updating…";
  const { error } = await window.sb.auth.updateUser({ password: newPw });
  btn.disabled = false; btn.textContent = "Update Password";

  if (error) { errEl.textContent = error.message; errEl.style.display = "block"; return; }

  msgEl.textContent = "Password updated successfully!";
  msgEl.style.display = "block";
  document.getElementById("myProfileNewPass").value = "";
  document.getElementById("myProfileConfirmPass").value = "";
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

const ADMIN_ONLY_TABS = ["products","inventory","mix-match","product-families","orders","users","manage-hero","manage-about","settings","seo","best-deals","crm","campaigns","vendors","order-exceptions","blog","sales-tax"];

// A developer account is scoped to the ticket board -- plus SEO, shared
// with marketing per the CEO's explicit instruction ("determine which SEO
// features... can be shared with the Marketing Account"). No products,
// orders, customers, pricing, or revenue. Allow-list rather than deny-list,
// so any tab added later is closed to developers by default.
const DEVELOPER_TABS = ["dev-tickets", "seo"];

// Marketing owns full day-to-day operations -- everything except
// account/user management and the dev ticket board.
const MARKETING_TABS = [
  "dashboard", "crm", "campaigns", "products", "inventory", "mix-match", "product-families", "orders",
  "quote-requests", "manage-hero", "manage-about", "best-deals",
  "sub-distributors", "seo", "reports", "dev-tickets", "vendors", "order-exceptions", "blog",
];

// Per direct CEO instruction: role='admin' is now the narrow, Azure-style
// account-management portal -- Users, Dev Tickets, and the two content
// sections, nothing else. Full unrestricted access moved to a NEW role,
// 'owner' (see isTabAllowed below) -- 'admin' no longer means that.
const ADMIN_ROLE_TABS = ["dashboard", "users", "dev-tickets", "manage-hero", "manage-about"];

// An affiliate login (role='sub_distributor') gets exactly one tab: their
// own commissions/sales/referral-code view. Previously this role had no
// entry here at all, so isTabAllowed's final fallback (deny-list against
// ADMIN_ONLY_TABS) let it through to "dashboard", "reports", and every
// other non-admin-only tab -- all of which show company-wide figures, not
// the affiliate's own. Allow-listed like every other non-owner role now,
// so a tab added later is closed to affiliates by default too.
const AFFILIATE_TABS = ["partner", "partner-products"];

function isTabAllowed(tab) {
  if (window._adminRole === "owner") return true; // full, unrestricted access
  if (window._adminRole === "developer") return DEVELOPER_TABS.includes(tab);
  if (window._adminRole === "marketing") return MARKETING_TABS.includes(tab);
  if (window._adminRole === "admin") return ADMIN_ROLE_TABS.includes(tab);
  if (window._adminRole === "sub_distributor") return AFFILIATE_TABS.includes(tab);
  return !ADMIN_ONLY_TABS.includes(tab);
}

// CRM & Leads and Campaigns are view-only for Owner by design (RRS-25
// follow-up): Owner can see everything there for oversight, but only
// Marketing can actually configure or change it. RLS (see migration
// 20260902f_crm_campaigns_owner_readonly.sql) is the real enforcement
// -- this is the UI-side guard so an Owner clicking Save gets a clear
// "you can't edit this" toast instead of a confusing RLS error, and so
// the buttons don't look clickable when they'd silently fail.
function isCrmCampaignsReadOnly() {
  return window._adminRole === "owner";
}

function blockIfCrmReadOnly() {
  if (!isCrmCampaignsReadOnly()) return false;
  showToast("Owner accounts can view CRM & Leads and Campaigns, but only Marketing can make changes here.");
  return true;
}

function landingTabFor(role) {
  if (role === "developer") return "dev-tickets";
  if (role === "marketing") return "crm";
  if (role === "admin") return "users";
  if (role === "sub_distributor") return "partner";
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
  // Deleted Orders is owner-only (see the soft-delete migration), and this
  // runs on both session-restore and fresh login, so it is the one place
  // that reliably sees every role change rather than one path only.
  showDeletedOrdersBtnIfOwner();
  if (role === "owner") {
    // "Full access, nothing to hide" is true for every real admin
    // capability, but My Dashboard / partner-products are an affiliate's
    // OWN view of their referral code and commissions -- keyed to a
    // sub_distributors row, not a company-wide report. An owner account
    // has no such row, so clicking in here throws "multiple (or no) rows
    // returned" (renderPartnerTab()'s .maybeSingle() failing) instead of
    // showing anything useful. resetRoleRestrictions() just above forces
    // every .a-nav-item's display back to "" -- undoing the partner tabs'
    // own display:none in admin.html -- and every other role re-hides
    // what it should not see in the branch below; owner returned before
    // reaching it, so these two stayed visible from that reset.
    document.querySelectorAll('.a-nav-item[data-tab="partner"], .a-nav-item[data-tab="partner-products"]')
      .forEach(el => { el.style.display = "none"; });
    return;
  }

  if (role === "developer" || role === "marketing" || role === "admin" || role === "sub_distributor") {
    // Hide every nav item except this role's allow-list, and every section
    // heading that ends up with nothing under it. sub_distributor used to
    // fall through to the plain "hide admin-only-nav" branch below, which
    // left Dashboard, Reports and every other non-admin-only tab visible --
    // all showing company-wide figures, not this affiliate's own.
    const allowed = role === "developer" ? DEVELOPER_TABS
      : role === "marketing" ? MARKETING_TABS
      : role === "sub_distributor" ? AFFILIATE_TABS
      : ADMIN_ROLE_TABS;
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
    addRoleBadge(role === "developer" ? "Developer Portal" : role === "marketing" ? "Marketing Portal" : role === "sub_distributor" ? "Partner Portal" : "Admin Portal");
    return;
  }

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
      "product-families":"Product Families",
      orders:"Orders", users:"Users", reports:"Reports & Analytics", settings:"Settings",
      seo:"SEO Health", "manage-hero":"Hero Section", "manage-about":"About Section",
      "quote-requests":"Quote Requests", "dev-tickets":"Developer Tickets",
      "best-deals":"Best Deals Campaign", "crm":"CRM & Leads", "campaigns":"Campaigns",
      "vendors":"Vendors", "order-exceptions":"Order Exceptions", "blog":"Blog",
      "sales-tax":"Sales Tax", "partner":"My Dashboard", "partner-products":"Products" }[tab] || tab;

  if (tab === "dashboard")        renderDashboardTab();
  if (tab === "products")         renderProductsTable();
  if (tab === "inventory")        renderInventoryTable();
  if (tab === "mix-match")        renderMixMatchTab();
  if (tab === "product-families") renderFamiliesTab();
  if (tab === "orders")           renderOrdersTable(document.getElementById("orderSearch")?.value.trim() || "");
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
  if (tab === "campaigns")        renderCampaignsTab();
  if (tab === "vendors")          renderVendorsTab();
  if (tab === "order-exceptions") renderExceptionsTab();
  if (tab === "blog")             renderBlogTab();
  if (tab === "sales-tax")        renderSalesTaxTab();
  if (tab === "partner")          renderPartnerTab();
  if (tab === "partner-products") renderPartnerProductsTab();
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
    window.sb.from("orders").select("*",          { count:"exact", head:true }).is("deleted_at", null),
    window.sb.from("orders").select("*",          { count:"exact", head:true }).eq("status", "pending").is("deleted_at", null),
    window.sb.from("profiles").select("*",        { count:"exact", head:true }).eq("role","customer"),
    window.sb.from("inventory").select("*, products(name, category_name)").in("status",["out_of_stock","low_stock"]),
    window.sb.from("orders").select("order_number, customer_name, business_name, total, status, created_at").is("deleted_at", null).order("created_at",{ascending:false}).limit(6),
    window.sb.from("orders").select("total, status").neq("status", "cancelled").is("deleted_at", null),
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
  const { data: orders } = await window.sb.from("orders").select("created_at, total, status").is("deleted_at", null);
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
  // Also matches SKU, not just name -- a distributor/vendor change means
  // staff need to find every product by SKU prefix (e.g. "RDU-") to bulk-
  // hide a discontinued supplier's line, and that prefix never appears in
  // the product name, so a name-only search silently found nothing for it.
  if (filter) q = q.or(`name.ilike.%${filter}%,sku.ilike.%${filter}%`);
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
        ${p.is_fast_ship ? `<span class="a-badge a-badge-orange" style="margin-left:7px" title="Shows a fast/free-delivery badge on this product's catalog card (RRS-31)">Fast Ship</span>` : ""}
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

/* ── Product Families ──────────────────────────────────────────
   Curates products.product_family / products.variant_label -- the pair
   renderProductGrid() in script.js groups on to show one catalog card per
   family instead of one per SKU.

   This is a PRESENTATION layer and nothing else. Every write here touches
   exactly those two columns: no price, cost, stock, image, MOQ, category or
   item number is ever modified, and no product row is created or deleted.
   Clearing a family puts its SKUs straight back to their own cards, so any
   grouping done here is reversible.

   Both columns move together, matching what the CSV importer writes (see
   runCsvImport): a family with no label, or a label with no family, would
   leave a card whose option button has nothing to name. ────────────────── */

let _famRows = [];          // every active product, as the storefront sees them
let _famEditing = null;     // family name being edited, or null when creating
let _famDraft = [];         // member product ids while the modal is open

async function renderFamiliesTab() {
  const list = document.getElementById("famList");
  if (!list) return;

  if (!_famRows.length) {
    list.innerHTML = `<div class="a-empty">Loading…</div>`;
    // Same column set the storefront reads, so what staff curate here is
    // what a customer will actually see on the card.
    const { data, error } = await window.sb
      .from("products")
      .select("id, sku, name, product_family, variant_label, category_name, price, in_stock, case_qty, pack_size, moq, unit, image_url")
      .eq("is_active", true)
      .order("name");
    if (error) { list.innerHTML = `<div class="a-empty">Error: ${famEsc(error.message)}</div>`; return; }
    _famRows = data || [];
  }

  const q = (document.getElementById("famSearch")?.value || "").trim().toLowerCase();

  const families = new Map();
  _famRows.forEach(r => {
    if (!r.product_family) return;
    if (!families.has(r.product_family)) families.set(r.product_family, []);
    families.get(r.product_family).push(r);
  });

  const solo = _famRows.filter(r => !r.product_family);

  document.getElementById("famStats").innerHTML = [
    ["Families", families.size],
    ["Grouped SKUs", _famRows.length - solo.length],
    ["Ungrouped SKUs", solo.length],
    ["Catalog cards", families.size + solo.length],
  ].map(([label, n]) => `
    <div class="fam-stat">
      <div class="fam-stat-num">${n}</div>
      <div class="fam-stat-label">${label}</div>
    </div>`).join("");

  const matches = (fam, members) => {
    if (!q) return true;
    if (fam.toLowerCase().includes(q)) return true;
    return members.some(m =>
      (m.name || "").toLowerCase().includes(q) || (m.sku || "").toLowerCase().includes(q));
  };

  const shown = [...families.entries()]
    .filter(([fam, members]) => matches(fam, members))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (!shown.length) {
    list.innerHTML = `<div class="a-empty">${q ? "No families match that search." : "No product families yet. Create one to group sibling SKUs into a single catalog card."}</div>`;
    return;
  }

  list.innerHTML = shown.map(([fam, members]) => {
    // Surfaced rather than silently tolerated: two members sharing a label
    // render as two identical-looking rows in the customer's option picker.
    const labels = members.map(m => m.variant_label || "");
    const dupe = new Set(labels).size !== labels.length;
    const missing = members.some(m => !m.variant_label);
    const out = members.filter(m => m.in_stock === false).length;

    const rows = members.map(m => `
      <tr>
        <td class="fam-sku">${famEsc(m.sku)}</td>
        <td class="fam-label-cell">${famEsc(m.variant_label || "—")}</td>
        <td class="fam-name-cell">${famEsc(m.name)}</td>
        <td class="fam-num">$${Number(m.price || 0).toFixed(2)}</td>
        <td class="fam-num">${famEsc(m.case_qty || "—")}</td>
        <td class="fam-num">${m.moq || 1}</td>
        <td class="fam-num">${m.in_stock === false
          ? `<span class="a-badge a-badge-red">Out</span>`
          : `<span class="a-badge a-badge-green">In stock</span>`}</td>
      </tr>`).join("");

    const flags = [];
    if (missing) flags.push(`<span class="a-badge a-badge-yellow">Missing variant label</span>`);
    if (dupe)    flags.push(`<span class="a-badge a-badge-red">Duplicate labels</span>`);
    if (out)     flags.push(`<span class="a-badge a-badge-gray">${out} out of stock</span>`);

    return `
      <div class="a-card fam-card">
        <div class="a-card-header fam-card-header">
          <div class="fam-card-title">
            <h3>${famEsc(fam)}</h3>
            <span class="fam-variant-count">${members.length} variant${members.length === 1 ? "" : "s"}</span>
            ${flags.join("")}
          </div>
          <button class="a-btn-sm" onclick="openFamilyModal(${famAttr(fam)})">Edit</button>
        </div>
        <div class="a-table-wrap">
          <table class="a-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Variant label</th>
                <th>Product name</th>
                <th class="fam-num">Price</th>
                <th class="fam-num">Case</th>
                <th class="fam-num">MOQ</th>
                <th class="fam-num">Stock</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join("");

  famRenderProposals();
}

// Suggested-groupings queue. Backed by cvtProposeCommaGroupings() (defined
// alongside the CSV importer's comma-name parser) run against the same
// _famRows this tab already has in memory -- read-only, no extra fetch,
// and it re-scores automatically any time renderFamiliesTab() reloads
// (e.g. after a save), so a family that gets grouped drops out of the
// queue on its own.
let _famProposalsIgnored = new Set();  // dismissed this session only (not persisted)

function famRenderProposals() {
  const wrap = document.getElementById("famProposalsWrap");
  if (!wrap) return;

  const all = cvtProposeCommaGroupings(_famRows).filter(p =>
    !_famProposalsIgnored.has(p.base));
  if (!all.length) { wrap.innerHTML = ""; return; }

  const section = (title, sub, items, cls, renderRow) => {
    if (!items.length) return "";
    return `
      <div class="fam-proposal-section">
        <div class="fam-proposal-section-head">
          <strong>${title}</strong>
          <span>${sub}</span>
        </div>
        ${items.map(p => renderRow(p)).join("")}
      </div>`;
  };

  // Full field set per member -- SKU, product name, variant label, price,
  // stock, case qty -- shown in the queue itself, not only in the apply
  // preview, so a reviewer can judge a MEDIUM/DATA candidate without
  // opening another modal first.
  const memberTable = (p, showLabel) => `
    <div class="a-table-wrap fam-proposal-table-wrap">
      <table class="a-table fam-proposal-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product Name</th>
            ${showLabel ? "<th>Variant Label</th>" : ""}
            <th class="fam-num">Price</th>
            <th class="fam-num">Case Qty</th>
            <th class="fam-num">Stock</th>
          </tr>
        </thead>
        <tbody>
          ${p.members.map(m => `
            <tr>
              <td class="fam-sku">${famEsc(m.row.sku)}</td>
              <td class="fam-name-cell">${famEsc(m.row.name)}</td>
              ${showLabel ? `<td class="fam-label-cell">${famEsc(cvtCleanLabel(m.tail)) || `<span class="fam-unresolved">unresolved</span>`}</td>` : ""}
              <td class="fam-num">$${Number(m.row.price || 0).toFixed(2)}</td>
              <td class="fam-num">${famEsc(m.row.case_qty || "—")}</td>
              <td class="fam-num">${m.row.in_stock === false ? '<span class="a-badge a-badge-red">Out</span>' : '<span class="a-badge a-badge-green">In stock</span>'}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  const highRow = (p) => `
    <div class="fam-proposal-card fam-proposal-high">
      <div class="fam-proposal-row">
        <div class="fam-proposal-title">
          <strong>${famEsc(p.base)}</strong>
          <span>${p.members.length} SKUs &middot; ${famEsc(p.axes.join(", "))}</span>
        </div>
        <div class="fam-proposal-actions">
          <button class="a-btn-sm" onclick="famDismissProposal(${famAttr(p.base)})">Dismiss</button>
          <button class="a-btn-sm fam-btn-apply" onclick="famApplyProposal(${famAttr(p.base)})">Apply grouping…</button>
        </div>
      </div>
      <p class="fam-proposal-reason">${famEsc(p.reason)}</p>
      ${memberTable(p, true)}
    </div>`;

  const mediumRow = (p) => `
    <div class="fam-proposal-card fam-proposal-medium">
      <div class="fam-proposal-row">
        <div class="fam-proposal-title">
          <strong>${famEsc(p.base)}</strong>
          <span>${p.members.length} SKUs &middot; REVIEW</span>
        </div>
        <div class="fam-proposal-actions">
          <button class="a-btn-sm" onclick="famDismissProposal(${famAttr(p.base)})">Dismiss</button>
          <button class="a-btn-sm" onclick="famReviewProposal(${famAttr(p.base)})">Review &amp; group manually</button>
        </div>
      </div>
      <p class="fam-proposal-reason fam-proposal-reason-warn">${famEsc(p.reason)}</p>
      ${memberTable(p, false)}
    </div>`;

  const dataRow = (p) => `
    <div class="fam-proposal-card fam-proposal-data">
      <div class="fam-proposal-row">
        <div class="fam-proposal-title">
          <strong>${famEsc(p.base)}</strong>
          <span>DATA ISSUE</span>
        </div>
      </div>
      <p class="fam-proposal-reason fam-proposal-reason-data">${famEsc(p.reason)}</p>
      ${memberTable(p, false)}
      <p class="fam-proposal-footnote">Not a grouping decision &mdash; fix the underlying product data first. No family is created or modified for these SKUs.</p>
    </div>`;

  wrap.innerHTML = `
    <div class="fam-proposals-head">
      <strong>Suggested groupings</strong>
      <span>from ungrouped SKUs &mdash; nothing here is applied automatically</span>
    </div>
    ${section("High confidence", "same brand + product name, differ only by known variant attributes",
        all.filter(p => p.confidence === "HIGH"), "high", highRow)}
    ${section("Needs review", "grouping is plausible but a human should confirm the axis",
        all.filter(p => p.confidence === "MEDIUM"), "medium", mediumRow)}
    ${section("Data issues", "not a grouping question — a duplicate SKU or a price/name conflict",
        all.filter(p => p.confidence === "DATA"), "data", dataRow)}
  `;
}

function famDismissProposal(base) {
  _famProposalsIgnored.add(base);
  famRenderProposals();
}

// The one path that turns a scored proposal into an actual write. Confined
// to HIGH confidence in the UI (the button doesn't exist for MEDIUM/DATA),
// and re-derives the members from _famRows by id rather than trusting the
// proposal's own snapshot, in case something else changed since it was
// scored.
function famApplyProposal(base) {
  const proposal = cvtProposeCommaGroupings(_famRows).find(p => p.base === base);
  if (!proposal) { famRenderProposals(); return; }
  if (proposal.confidence !== "HIGH") { alert("Only high-confidence groupings can be applied directly."); return; }

  if (_famRows.some(r => r.product_family === proposal.base)) {
    alert(`A family named "${proposal.base}" already exists.`);
    return;
  }

  document.getElementById("famPreviewTitle").textContent = "Apply Grouping";
  document.getElementById("famPreviewMeta").innerHTML = `
    <p class="fam-preview-title">${famEsc(proposal.base)}</p>
    <p class="fam-preview-confidence"><strong>HIGH confidence</strong> &middot; ${famEsc(proposal.reason)}</p>
    <p class="fam-preview-axes">Detected attributes: ${famEsc(proposal.axes.join(", ") || "—")}</p>`;

  document.getElementById("famPreviewRows").innerHTML = proposal.members.map(m => {
    const label = cvtCleanLabel(m.tail);
    return `
      <tr>
        <td class="fam-sku">${famEsc(m.row.sku)}</td>
        <td class="fam-name-cell">${famEsc(m.row.name)}</td>
        <td class="fam-label-cell">${famEsc(label) || `<span class="fam-unresolved">needs manual label</span>`}</td>
        <td class="fam-num">$${Number(m.row.price || 0).toFixed(2)}</td>
        <td class="fam-num">${famEsc(m.row.case_qty || "—")}</td>
        <td class="fam-num">${m.row.in_stock === false
          ? `<span class="a-badge a-badge-red">Out</span>`
          : `<span class="a-badge a-badge-green">In stock</span>`}</td>
      </tr>`;
  }).join("");

  const anyMissingLabel = proposal.members.some(m => !cvtCleanLabel(m.tail));
  const confirmBtn = document.getElementById("famPreviewConfirmBtn");
  confirmBtn.disabled = anyMissingLabel;
  confirmBtn.title = anyMissingLabel ? "One or more variant labels could not be generated cleanly — use \"Review & group manually\" instead." : "";
  confirmBtn.onclick = () => famApplyProposalConfirmed(proposal.base);

  document.getElementById("famPreviewModal").style.display = "flex";
}

// The actual write, reached only from the preview modal's own confirm
// button -- re-resolves the proposal fresh (rather than trusting a
// closure) in case the catalog changed while the modal was open.
async function famApplyProposalConfirmed(base) {
  const proposal = cvtProposeCommaGroupings(_famRows).find(p => p.base === base);
  if (!proposal || proposal.confidence !== "HIGH") { document.getElementById("famPreviewModal").style.display = "none"; return; }

  const stamp = new Date().toISOString();
  for (const m of proposal.members) {
    const label = cvtCleanLabel(m.tail);
    if (!label) { alert(`${m.row.sku} has no usable variant label — skipping this grouping. Use "Review & group manually" instead.`); return; }
    const { error } = await window.sb.from("products")
      .update({ product_family: proposal.base, variant_label: label, updated_at: stamp })
      .eq("id", m.row.id);
    if (error) { alert("Error applying grouping: " + error.message); return; }
    m.row.product_family = proposal.base;
    m.row.variant_label = label;
  }

  document.getElementById("famPreviewModal").style.display = "none";
  showToast(`Grouped ${proposal.members.length} SKUs into "${proposal.base}".`);
  _famRows = [];
  renderFamiliesTab();
}

// Opens the family editor pre-loaded with this proposal's SKUs so a human
// can adjust labels/membership before anything is saved -- MEDIUM never
// writes on its own.
function famReviewProposal(base) {
  const proposal = cvtProposeCommaGroupings(_famRows).find(p => p.base === base);
  if (!proposal) return;
  _famEditing = null; // creating, not editing an existing family
  _famDraft = proposal.members.map(m => m.row.id);
  document.getElementById("familyModalTitle").textContent = "New Family (review)";
  document.getElementById("famName").value = proposal.base;
  document.getElementById("famAddWrap").style.display = "none";
  document.getElementById("famWarn").style.display = "none";
  famRenderMembers();
  // Pre-fill each label from the cleaned detected tail (never the raw
  // parser text) so the reviewer is editing a sensible starting point,
  // not starting from blank text or fixing up messy punctuation by hand.
  proposal.members.forEach(m => {
    const input = document.querySelector(`.fam-label-input[data-id="${m.row.id}"]`);
    if (input) input.value = cvtCleanLabel(m.tail);
  });
  famCheckWarnings();
  document.getElementById("familyModal").style.display = "flex";
}

function famEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Family names carry quotes, ampersands and ® -- passing one through an
// inline onclick needs it encoded as a JS string literal, not just HTML-escaped.
function famAttr(s) {
  return famEsc(JSON.stringify(String(s == null ? "" : s)));
}

function openFamilyModal(familyName) {
  _famEditing = familyName || null;
  _famDraft = _famRows.filter(r => familyName && r.product_family === familyName).map(r => r.id);

  document.getElementById("familyModalTitle").textContent =
    familyName ? "Edit Family" : "New Family";
  document.getElementById("famName").value = familyName || "";
  document.getElementById("famAddWrap").style.display = "none";
  document.getElementById("famAddSearch").value = "";
  document.getElementById("famWarn").style.display = "none";

  famRenderMembers();
  document.getElementById("familyModal").style.display = "flex";
}

function famRenderMembers() {
  const wrap = document.getElementById("famMembers");
  const members = _famDraft.map(id => _famRows.find(r => r.id === id)).filter(Boolean);
  const splitBar = document.getElementById("famSplitBar");

  document.getElementById("famMemberCount").textContent =
    members.length ? `${members.length} SKU${members.length === 1 ? "" : "s"}` : "";

  if (!members.length) {
    wrap.innerHTML = `<div class="a-empty" style="padding:18px;font-size:13px">No SKUs yet — use “Add SKU” to choose which products belong to this family.</div>`;
    if (splitBar) splitBar.style.display = "none";
    famCheckWarnings(members);
    return;
  }

  // "Move to" targets every OTHER existing family. Picking one is a single
  // move: it leaves this family's draft immediately and is written to that
  // target family (not this one) on save, same as re-doing it through two
  // separate edits would, but in one action from the SKU's current row.
  const otherFamilies = [...new Set(_famRows.map(r => r.product_family).filter(f => f && f !== _famEditing))].sort();
  const moveOptions = `<option value="">Move to…</option>` +
    otherFamilies.map(f => `<option value="${famEsc(f)}">${famEsc(f)}</option>`).join("");

  wrap.innerHTML = members.map(m => `
    <div style="display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid #e5e9f0;border-radius:9px;margin-bottom:7px;flex-wrap:wrap">
      <input type="checkbox" class="fam-split-cb" data-id="${famEsc(m.id)}" title="Select for split"
             style="width:16px;height:16px;flex:0 0 16px">
      <img src="${famEsc(m.image_url || "assets/img/product-placeholder.svg")}" alt=""
           onerror="this.src='assets/img/product-placeholder.svg'"
           style="width:34px;height:34px;object-fit:contain;background:#f7f9fc;border-radius:6px;flex:0 0 34px">
      <div style="flex:1;min-width:170px">
        <div style="font-size:12.5px;font-weight:600;color:#0d2c50;line-height:1.3">${famEsc(m.name)}</div>
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#94a3b8">${famEsc(m.sku)} · $${Number(m.price || 0).toFixed(2)}</div>
      </div>
      <input type="text" class="fam-label-input" data-id="${famEsc(m.id)}"
             value="${famEsc(m.variant_label || "")}"
             oninput="famCheckWarnings()"
             placeholder="Option label, e.g. Brown / 800 ft"
             style="padding:7px 10px;border:1.5px solid #d0d7e0;border-radius:7px;font-size:12.5px;min-width:180px;flex:1">
      ${otherFamilies.length ? `
      <select onchange="if(this.value)moveMember(${famAttr(m.id)},this.value)"
              style="padding:7px 8px;border:1.5px solid #d0d7e0;border-radius:7px;font-size:12px;max-width:150px">
        ${moveOptions}
      </select>` : ""}
      <button type="button" onclick="famRemove(${famAttr(m.id)})"
              title="Remove from family"
              style="border:none;background:transparent;color:#dc2626;cursor:pointer;font-size:18px;line-height:1;padding:4px 7px">&times;</button>
    </div>`).join("");

  if (splitBar) splitBar.style.display = members.length > 1 ? "flex" : "none";
  famCheckWarnings(members);
}

// Moves one SKU straight into an existing family without a second modal:
// clear its label (the target family's own labels won't match it), write
// product_family + variant_label directly, then drop it from this draft
// so the current family's editor reflects the move immediately.
async function moveMember(id, targetFamily) {
  const row = _famRows.find(r => r.id === id);
  if (!row) return;
  const label = prompt(`Variant label for "${row.name}" inside "${targetFamily}":`, row.variant_label || "");
  if (label === null) { famRenderMembers(); return; } // cancelled -- undo the select's value
  if (!label.trim()) { alert("A variant label is required."); famRenderMembers(); return; }

  const { error } = await window.sb.from("products")
    .update({ product_family: targetFamily, variant_label: label.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) { alert("Error moving SKU: " + error.message); return; }

  row.product_family = targetFamily;
  row.variant_label = label.trim();
  _famDraft = _famDraft.filter(x => x !== id);
  famRenderMembers();
  showToast(`Moved to "${targetFamily}".`);
}

// Splits the checked subset of the CURRENT family's members into a brand
// new family in one save, instead of removing them here and separately
// creating a family with them. The members being split keep whatever
// variant label they already had -- a split is "these belong somewhere
// else", not a relabeling, so nothing here should silently change the
// text the customer already sees.
async function splitFamily() {
  const checked = [...document.querySelectorAll(".fam-split-cb:checked")].map(cb => cb.dataset.id);
  if (!checked.length) { alert("Check at least one member to split out."); return; }
  if (checked.length === _famDraft.length) { alert("That's every member — rename this family instead of splitting all of it out."); return; }

  const newName = (document.getElementById("famSplitName")?.value || "").trim();
  if (!newName) { alert("Enter a name for the new family."); return; }
  if (_famRows.some(r => r.product_family === newName)) {
    alert(`A family named "${newName}" already exists. Choose a different name, or move these SKUs to it individually instead.`);
    return;
  }

  const stamp = new Date().toISOString();
  for (const id of checked) {
    const row = _famRows.find(r => r.id === id);
    const { error } = await window.sb.from("products")
      .update({ product_family: newName, updated_at: stamp })
      .eq("id", id);
    if (error) { alert("Error splitting family: " + error.message); return; }
    if (row) row.product_family = newName;
  }

  _famDraft = _famDraft.filter(id => !checked.includes(id));
  document.getElementById("famSplitName").value = "";
  famRenderMembers();
  showToast(`Split ${checked.length} SKU${checked.length === 1 ? "" : "s"} into "${newName}".`);
}

// Live guard rails. These mirror exactly what breaks on the storefront: a
// one-member family renders as a plain card (pointless), a missing label
// leaves the option button unnamed, and two identical labels show the
// customer two rows they cannot tell apart.
function famCheckWarnings() {
  const warn = document.getElementById("famWarn");
  if (!warn) return;
  const labels = [...document.querySelectorAll(".fam-label-input")].map(i => i.value.trim());
  const msgs = [];

  if (_famDraft.length === 1) msgs.push("A family with one SKU shows as an ordinary product card — add another SKU or leave this product ungrouped.");
  if (labels.some(l => !l))   msgs.push("Every member needs a variant label; that text is what the customer picks between.");
  const filled = labels.filter(Boolean);
  if (new Set(filled).size !== filled.length) msgs.push("Two members share the same label — the option list would show duplicate rows.");

  warn.innerHTML = msgs.join("<br>");
  warn.style.display = msgs.length ? "block" : "none";
}

function famToggleAdd() {
  const w = document.getElementById("famAddWrap");
  const open = w.style.display === "none";
  w.style.display = open ? "block" : "none";
  if (open) { famRenderAddResults(); document.getElementById("famAddSearch").focus(); }
}

function famRenderAddResults() {
  const q = (document.getElementById("famAddSearch")?.value || "").trim().toLowerCase();
  const box = document.getElementById("famAddResults");

  // Offer ungrouped products, plus anything already in THIS family. A SKU
  // belonging to another family is deliberately excluded: moving it is a
  // decision to make from that family, so a product can never silently end
  // up in two places.
  let pool = _famRows.filter(r =>
    !_famDraft.includes(r.id) &&
    (!r.product_family || r.product_family === _famEditing));

  if (q) pool = pool.filter(r =>
    (r.name || "").toLowerCase().includes(q) || (r.sku || "").toLowerCase().includes(q));

  if (!pool.length) {
    box.innerHTML = `<div style="padding:12px;font-size:12.5px;color:#94a3b8">${q ? "No ungrouped products match." : "No ungrouped products left."}</div>`;
    return;
  }

  box.innerHTML = pool.slice(0, 60).map(r => `
    <button type="button" onclick="famAdd(${famAttr(r.id)})"
            style="display:flex;gap:9px;align-items:center;width:100%;text-align:left;padding:8px 11px;border:none;border-bottom:1px solid #eef2f7;background:#fff;cursor:pointer">
      <img src="${famEsc(r.image_url || "assets/img/product-placeholder.svg")}" alt=""
           onerror="this.src='assets/img/product-placeholder.svg'"
           style="width:28px;height:28px;object-fit:contain;background:#f7f9fc;border-radius:5px;flex:0 0 28px">
      <span style="flex:1;min-width:0">
        <span style="display:block;font-size:12.5px;color:#0d2c50;font-weight:600;line-height:1.3">${famEsc(r.name)}</span>
        <span style="display:block;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#94a3b8">${famEsc(r.sku)} · ${famEsc(r.category_name || "")}</span>
      </span>
      <span style="font-size:12px;color:#64748b;white-space:nowrap">$${Number(r.price || 0).toFixed(2)}</span>
    </button>`).join("");
}

function famAdd(id) {
  if (!_famDraft.includes(id)) _famDraft.push(id);
  famRenderMembers();
  famRenderAddResults();
}

function famRemove(id) {
  _famDraft = _famDraft.filter(x => x !== id);
  famRenderMembers();
  famRenderAddResults();
}

async function saveFamily() {
  const name = (document.getElementById("famName")?.value || "").trim();
  if (!name) { alert("Enter a family display name."); return; }

  // Creating a family under a name already in use would merge the two
  // silently, which is the one grouping mistake that is tedious to undo.
  if (!_famEditing && _famRows.some(r => r.product_family === name)) {
    alert(`A family named "${name}" already exists. Edit that family instead.`);
    return;
  }

  const labels = {};
  let blank = false;
  document.querySelectorAll(".fam-label-input").forEach(i => {
    const v = i.value.trim();
    if (!v) blank = true;
    labels[i.dataset.id] = v;
  });

  if (!_famDraft.length) { alert("Add at least one SKU, or delete the family."); return; }
  if (blank) { alert("Every member needs a variant label before saving."); return; }

  const filled = Object.values(labels);
  if (new Set(filled).size !== filled.length) {
    alert("Two members share the same variant label. Give each one a label the customer can tell apart.");
    return;
  }
  if (_famDraft.length === 1 &&
      !confirm("This family has only one SKU, so it will show as an ordinary product card. Save anyway?")) return;

  const stamp = new Date().toISOString();

  // One update per distinct label -- Supabase cannot set different values
  // for different rows in a single call, and the row count here is a
  // handful, not a bulk job.
  for (const id of _famDraft) {
    const { error } = await window.sb.from("products")
      .update({ product_family: name, variant_label: labels[id], updated_at: stamp })
      .eq("id", id);
    if (error) { alert("Error saving: " + error.message); return; }
  }

  // Anyone dropped from the family goes back to being its own card. Both
  // columns are cleared together so no SKU is left with a label but no
  // family (which the storefront would ignore, and the importer treats as
  // invalid).
  if (_famEditing) {
    const removed = _famRows
      .filter(r => r.product_family === _famEditing && !_famDraft.includes(r.id))
      .map(r => r.id);
    if (removed.length) {
      const { error } = await window.sb.from("products")
        .update({ product_family: null, variant_label: null, updated_at: stamp })
        .in("id", removed);
      if (error) { alert("Error releasing removed SKUs: " + error.message); return; }
    }
  }

  document.getElementById("familyModal").style.display = "none";
  showToast(_famEditing ? "Family updated." : "Family created.");
  _famRows = [];            // force a refetch so the table matches the database
  renderFamiliesTab();
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
  updateMetaCharCounts();
  loadProductVendorOptions();
  openModal("productModal");
}

// Live count next to the SEO Title/Description labels -- 60/155 mirror the
// same display-length limits buildSeoTitleTag()/buildMetaDesc()
// (api/product-meta.js) already trim the auto-generated versions to, so
// staff get the same "will this get cut off in search results" signal for
// a manual override that the auto-generated copy is already held to.
function updateMetaCharCounts() {
  const setCount = (fieldId, countId, limit) => {
    const field = document.getElementById(fieldId);
    const out   = document.getElementById(countId);
    if (!field || !out) return;
    const len = field.value.length;
    out.textContent = `${len} / ${limit}`;
    out.classList.toggle("over", len > limit);
  };
  setCount("prodMetaTitle",       "prodMetaTitleCount", 60);
  setCount("prodMetaDescription", "prodMetaDescCount",  155);
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

let _prodVendorCache = null;
async function loadProductVendorOptions() {
  if (_prodVendorCache) return _prodVendorCache;
  const { data } = await window.sb.from("vendors").select("id, name").eq("is_active", true).order("name");
  _prodVendorCache = data || [];
  const sel = document.getElementById("prodVendor");
  if (sel) {
    sel.innerHTML = `<option value="">RRS-fulfilled (default)</option>` +
      _prodVendorCache.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join("");
  }
  return _prodVendorCache;
}

async function openEditProduct(id) {
  const { data: p } = await window.sb.from("products").select("*, inventory(stock_qty, status)").eq("id", id).single();
  if (!p) return;
  document.getElementById("modalTitle").textContent = "Edit Product";
  await loadProductVendorOptions();
  setVal("prodVendor", p.vendor_id || "");
  setVal("editProductId",  p.id);
  setVal("prodName",       p.name           || "");
  setVal("prodSku",        p.sku            || "");
  setVal("prodCategory",   p.category_name  || "");
  setVal("prodDescription",p.description    || "");
  setVal("prodMetaTitle",       p.meta_title       || "");
  setVal("prodMetaDescription", p.meta_description || "");
  updateMetaCharCounts();
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
  setChk("prodFastShip",   !!p.is_fast_ship);
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
    // Optional SEO overrides -- null (not empty string) when blank, so
    // "|| fallback" in api/product-meta.js and script.js's
    // populateProductPage() correctly falls through to the auto-generated
    // title/description instead of treating "" as a deliberately-empty tag.
    meta_title       : (document.getElementById("prodMetaTitle")?.value || "").trim() || null,
    meta_description : (document.getElementById("prodMetaDescription")?.value || "").trim() || null,
    vendor_id        : document.getElementById("prodVendor")?.value || null,
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
    is_fast_ship  : document.getElementById("prodFastShip")?.checked || false,
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

/* The closed vocabulary products.product_tier accepts (20260915c). */
const PRODUCT_TIERS = ["Economy","Premium","Luxury","Suites","Ringspun","Hospitality","Wrinkle-Free"];

/* Maps a spreadsheet cell to a valid product_tier, or null.
   Anything unrecognized becomes null rather than being passed through: the
   column has a CHECK constraint, and a single bad cell in a 300-row file
   would otherwise fail the whole batch upsert and import nothing. Tier is
   optional merchandising data, so silently dropping a junk value is much
   better than losing the import. */
function normalizeProductTier(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const norm = s.toLowerCase().replace(/[\s_-]+/g, "");
  return PRODUCT_TIERS.find(t => t.toLowerCase().replace(/[\s_-]+/g, "") === norm) || null;
}

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
  // Per-product volume breakpoints. Distributors set their own: the
  // OfficeCrave feed carries 76 distinct combinations, so these cannot be
  // assumed to be 6/30. In that file they are columns O/P/Q, and the
  // PRICES that go with them are U/V/W (Tier N Selling Price) -- NOT
  // R/S/T, which are supplier cost.
  { key:"tier1_min_qty", label:"Tier 1: Min Qty (OfficeCrave col O)" },
  { key:"tier2_min_qty", label:"Tier 2: Min Qty (OfficeCrave col P)" },
  { key:"tier3_min_qty", label:"Tier 3: Min Qty (OfficeCrave col Q)" },
  // Staff-only margin data -- never reaches products_public.
  { key:"cost_per_case", label:"Cost (staff only)" },
  { key:"tier1_cost",    label:"Tier 1 Cost (staff only)" },
  { key:"tier2_cost",    label:"Tier 2 Cost (staff only)" },
  { key:"tier3_cost",    label:"Tier 3 Cost (staff only)" },
  { key:"distributor",   label:"Distributor (innstyle / sasso / officecrave)" },
  { key:"in_stock",      label:"In Stock (false hides Add to Cart)" },
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
  { key:"product_family",label:"Product Family (groups sizes into one card)" },
  { key:"variant_label", label:"Variant Label (the dropdown option)" },
  { key:"product_tier",  label:"Product Tier (Economy / Premium / Luxury — optional)" },
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
    // "itemnumber" first so it wins outright on the supplier feeds, which
    // all head this column "Item Number".
    //
    // Bare "id" is deliberately NOT an alias. The fallback match is a
    // substring test, so "id" is contained in "width (inches)" -- every
    // one of these feeds has a width column, and the SKU silently became
    // the width. "productid" still covers the genuine case.
    sku:           ["itemnumber","sku","skucode","itemcode","code","partnumber","productid"],
    description:   ["description","desc","details","info","notes"],
    overview:      ["overview","longdescription","fulldescription","productoverview"],
    feature1:      ["feature1","feature1description","keyfeature1"],
    feature2:      ["feature2","feature2description","keyfeature2"],
    feature3:      ["feature3","feature3description","keyfeature3"],
    feature4:      ["feature4","feature4description","keyfeature4"],
    // "sellingprice" first: all three supplier feeds carry BOTH a
    // "Price" column (their own cost to us) and a "Selling Price" column
    // (what the customer pays). Matching "price" first mapped the
    // supplier's cost in as the retail price.
    //
    // "cost" is NOT an alias here for the same reason -- it belongs to
    // cost_per_case, and a selling-price field must never resolve to it.
    price:         ["sellingprice","price","caseprice","unitprice"],
    sale_price:    ["saleprice","discountprice","specialprice","promoprice"],
    retail_price:  ["retailprice","msrp","listprice","comparatprice","compareatprice"],
    // Tier SELLING prices. "tierNsellingprice" is listed first and matched
    // exactly so OfficeCrave's "Tier 1 Selling Price" (col U) wins over
    // its "Tier 1 Cost" (col R) -- mapping cost here would publish the
    // supplier's cost as the customer's price.
    price_tier1:   ["tier1sellingprice","pricetier1","tier1price","price15","price1to5","price15cases"],
    price_tier2:   ["tier2sellingprice","pricetier2","tier2price","price629","price6to29","price629cases"],
    price_tier3:   ["tier3sellingprice","pricetier3","tier3price","price30","price30plus","price30cases"],
    // Tier quantity thresholds -- OfficeCrave cols O/P/Q, headed bare
    // "Tier 1"/"Tier 2"/"Tier 3".
    tier1_min_qty: ["tier1","tier1minqty","tier1qty","tier1quantity","tier1min"],
    tier2_min_qty: ["tier2","tier2minqty","tier2qty","tier2quantity","tier2min"],
    tier3_min_qty: ["tier3","tier3minqty","tier3qty","tier3quantity","tier3min"],
    // Staff-only cost columns.
    cost_per_case: ["cost","costpercase","unitcost","supplierCost"],
    tier1_cost:    ["tier1cost"],
    tier2_cost:    ["tier2cost"],
    tier3_cost:    ["tier3cost"],
    distributor:   ["distributor","supplier","vendor","source"],
    // OfficeCrave heads this column bare "STOCK"; the others have no
    // stock column at all and fall back to in-stock (see
    // cvtNormalizeValue).
    in_stock:      ["stock","instock","stockstatus","availability"],
    is_on_sale:    ["isonsale","onsale","sale","discount","promo"],
    category_name: ["category","categoryname","dept","department","type","producttype","productcategory"],
    // "cs" is how all three supplier feeds head the case quantity. It is
    // also what cvtPerCaseBasePrice() needs to spot a per-each base price
    // sitting beside per-case tier prices.
    case_qty:      ["cs","caseqty","casecount","quantitypercase","casesize","qtypercase"],
    pack_size:     ["packsize","pack","packs","packcount","packqty"],
    // "priceby" is how all three supplier feeds head this column.
    unit:          ["priceby","unit","uom","unitofmeasure","unittype"],
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
    product_family:["productfamily","family","variantgroup","groupname","parentproduct"],
    variant_label: ["variantlabel","variant","option","optionlabel","sizelabel","variantname"],
    product_tier:  ["producttier","tier","grade","quality","qualitytier","line","productline","collection"],
  };
  // Two passes, exact before fuzzy. The fuzzy rule is a substring test, so
  // a single pass lets a longer header be claimed by a shorter alias that
  // happens to be contained in it: OfficeCrave's "Tier 1 Cost" (supplier
  // cost) contains "tier1" and would be mapped as the tier QUANTITY, and
  // "Tier 1 Selling Price" likewise -- publishing cost as the customer
  // price, or a price where a quantity belongs. Matching every exact
  // header first means each column is claimed by the alias that names it
  // precisely, and only genuinely unmatched columns fall through to the
  // looser test.
  const claimed = new Set();

  // Pass 0: preferred exact headers. A target whose FIRST alias matches a
  // header exactly claims it before any other target can, even if that
  // other target also matches exactly.
  //
  // Needed because these feeds carry both "Price" (their cost to us) and
  // "Selling Price" (what the customer pays). Both exact-match something,
  // and whichever the loop reached first won -- which mapped the
  // supplier's cost in as the retail price.
  for (const [tk, al] of Object.entries(aliases)) {
    const preferred = al[0];
    const hit = cols.find(c => !claimed.has(c) && norm(c) === preferred);
    if (hit && !mapping[tk]) { mapping[tk] = hit; claimed.add(hit); }
  }

  for (const col of cols) {
    if (claimed.has(col)) continue;
    const n = norm(col);
    for (const [tk, al] of Object.entries(aliases)) {
      if (!mapping[tk] && al.some(a => n === a)) {
        mapping[tk] = col; claimed.add(col); break;
      }
    }
  }

  for (const col of cols) {
    if (claimed.has(col)) continue;
    const n = norm(col);
    for (const [tk, al] of Object.entries(aliases)) {
      if (!mapping[tk] && al.some(a => n.includes(a))) {
        mapping[tk] = col; claimed.add(col); break;
      }
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

/* Derives product_family / variant_label from a product NAME, so a vendor
   file that has no such columns (almost none do) still produces grouped
   size-dropdown cards instead of one card per size.

   Vendor names are near-universally "<Family> <sep> <size>, <spec>, <pack>"
   -- e.g. "Ringspun Cotton Bath Towel - 27\" x 50\", 14 lb/dozen, White,
   Case of 48". Everything before the separator names the product; the size
   and pack after it are what distinguishes one SKU from its siblings.

   Grouping is keyed on the NAME rather than the SKU because the name is what
   the card title shows -- so the title and its dropdown can never disagree.

   The pack form (Case of 48 vs Individual) belongs in the LABEL, not the
   family: those are different SKUs at very different prices, and merging
   them into one option would hide that from the buyer.

   Returns {family, label}; blank family means "leave this row ungrouped". */
const CVT_NAME_SEP = /\s[–—-]\s/;  // en dash, em dash, or hyphen, space-padded
const CVT_PACK_RE  = /\b(Case of \d+ Sets|Case of \d+ Pairs|Case of \d+|Individual Set|Individual Pair|Individually|Individual|Open Stock|Pack of \d+|Box of \d+)\b/i;
const CVT_UNAVAIL_RE = /\s*[–-]\s*Currently Unavailable\s*$/i;

function cvtDeriveVariant(name) {
  const s = String(name || "").trim();
  const m = s.match(CVT_NAME_SEP);
  if (!m) return { family: "", label: "" };

  const family = s.slice(0, m.index).trim();
  const rest   = s.slice(m.index + m[0].length).trim();
  if (!family || !rest) return { family: "", label: "" };

  const parts = rest.split(",").map(x => x.trim());
  let size = parts[0] || "";

  let pack = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const pm = parts[i].match(CVT_PACK_RE);
    if (pm) { pack = pm[0]; break; }
  }

  // "Currently Unavailable" is stock status, not an option a buyer picks.
  size = size.replace(CVT_UNAVAIL_RE, "").trim();
  pack = pack.replace(CVT_UNAVAIL_RE, "").trim();

  let label = size;
  if (pack && pack.toLowerCase() !== size.toLowerCase()) {
    label = size ? `${size} - ${pack}` : pack;
  }
  return { family, label: label.trim() };
}

/* Runs cvtDeriveVariant over every row and keeps only the groupings worth
   rendering. Returns Map(row -> {family, label}); {"",""} means ungrouped.

   Two rules decide what survives:
    - a family needs 2+ members, since a one-option dropdown is worse than
      none, and every member needs a non-empty label;
    - a repeated SKU doesn't count toward its family's size. Vendor files do
      repeat rows, and counting a repeat could manufacture a two-option
      dropdown out of a single real product. The importer upserts by SKU, so
      the repeat never becomes a second product anyway. */
function cvtGroupVariants(rows, nameCol, skuCol) {
  const derived = new Map();
  if (!nameCol) return derived;

  const famCount = {};
  const seenSku = new Set();
  for (const r of rows) {
    const d = cvtDeriveVariant(r[nameCol]);
    derived.set(r, d);
    const sku = skuCol ? String(r[skuCol] ?? "").trim() : "";
    if (sku && seenSku.has(sku)) continue;
    if (sku) seenSku.add(sku);
    if (d.family && d.label) famCount[d.family] = (famCount[d.family] || 0) + 1;
  }
  for (const [r, d] of derived) {
    if (!d.family || !d.label || famCount[d.family] < 2) {
      derived.set(r, { family: "", label: "" });
    }
  }
  return derived;
}

/* ── Comma-separated variant detection ─────────────────────────
   cvtDeriveVariant() above only fires on "<Family> - <size>, <spec>"
   names (a dash separator). Names that instead front-load everything
   into commas -- "Pacific Blue® Hardwound Paper Towels, Brown, 800-ft.,
   6 Rolls" -- have no dash at all, so they fell straight through
   ungrouped. Confirmed against the live catalog: 149 of 300 active SKUs
   are still ungrouped, and every one of the OfficeCrave-style paper/
   chemical names uses this comma form.

   This does NOT replace cvtDeriveVariant -- it is tried second, only
   when the dash parser found nothing, and it is far more conservative:
   it proposes candidates for review rather than writing product_family
   directly. Grouping by keyword alone (Phase 4 of the brief this was
   commissioned under) is exactly what this must not do, so nothing here
   ever auto-applies without a HIGH confidence score, and even HIGH
   results are surfaced in a dry-run report before any write happens. */

// Vocabulary that marks a comma-delimited segment as a VARIANT descriptor
// rather than more of the product's own name. Split into two groups on
// purpose:
//
// - NUMERIC/UNIT patterns (dimensions, counts, ply, pack units) are safe
//   to match anywhere inside a segment, since a real product name never
//   contains a bare "7 x 8" or "6 Rolls/Carton".
// - WORD patterns (color, scent, packaging) are NOT safe to match as a
//   substring -- "Pacific Blue® Hardwound Paper Towels" contains "Blue"
//   as part of the BRAND, not a color option, and matching it there
//   wrongly split the brand's own name off as a variant tail. These only
//   count when the color/scent word makes up the whole segment (allowing
//   short qualifiers like "Fresh Scent" or "2/Box"), never when it's
//   embedded in a longer descriptive phrase.
const CVT_NUMERIC_ATTR_RE = new RegExp(
  "\\b(" + [
    // Unit can be space-joined ("800 ft") or hyphen-joined ("1150-ft",
    // "800-ft."), and may be followed by another word ("1150-ft Rolls")
    // rather than ending the segment -- the trailing \b alone (not \s*)
    // already tolerates a period or word boundary right after the unit.
    "\\d+(\\.\\d+)?[\\-\\s]*(oz|ft|lb|lbs|gal|gallon|gallons|qt|in|mm|cm)\\b",
    "\\d+\\s*[x\\u00d7]\\s*\\d+",                 // "7 x 8", "8\" x 800 ft"
    "\\d+[\\-\\s]?ply",
    "\\d+\\s*(sheet|sheets|roll|rolls|wipe|wipes|towel|towels|packet|packets|pack|packs|pod|pods|box|boxes|bottle|bottles|canister|canisters|carton|cartons|bucket|pail)\\b",
    "\\d+\\s*/\\s*(carton|case|box|pack|canister|roll)\\b",
    "(individual|case of \\d+|pack of \\d+|box of \\d+|open stock)",
  ].join("|") + ")",
  "i"
);
// Whole-segment only (anchored ^...$, ignoring surrounding whitespace and
// a trailing SKU-echo in parens) -- "Brown" is a color, "Pacific Blue®
// Hardwound Paper Towels" is not, even though both contain "Blue".
const CVT_WORD_ATTR_RE = new RegExp(
  "^(" + [
    "(white|brown|black|blue|green|yellow|clear|grey|gray|natural|tan)",
    "(unscented|fragrance-free|original( scent)?|fresh scent|lemon( fresh)?|lemon\\s*(&|and)\\s*lime.*|citrus|lavender|floral|outdoor fresh|april fresh|crisp( clean)?)",
  ].join("|") + ")\\s*(\\([A-Z0-9-]+\\))?$",
  "i"
);
function CVT_ATTR_RE_test(segment) {
  return CVT_NUMERIC_ATTR_RE.test(segment) || CVT_WORD_ATTR_RE.test(segment.trim());
}

// A whole segment that is JUST an in-parens SKU echo ("(80168CT)") or a
// bare catalog/NSN number carries no product-name information either way
// -- ignored when deciding where the descriptive tail begins.
const CVT_SKU_ECHO_RE = /^\(?[A-Z0-9-]{5,}\)?$/;

/* Splits "<Base Product Name>, <descriptor>, <descriptor>, ..." on commas
   and returns the longest leading run of segments that together read as
   the base product name -- i.e. none of them individually look like a
   variant attribute. Everything after that run is the candidate variant
   tail.

   This is deliberately NOT "split on the first comma": a name like
   "Mr. Clean Magic Eraser Extra Durable, 2.3 x 4.6, ..." has to keep
   "Extra Durable" attached to the base, because it precedes the first
   segment that actually matches CVT_ATTR_RE -- dropping it at the first
   comma regardless of content would strip real product-name words.
   Returns {base, tail[]}; tail is empty when no comma exists (nothing
   for this pass to add over cvtDeriveVariant). */
function cvtSplitCommaName(name) {
  const raw = String(name || "").trim();
  const segments = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (segments.length < 2) return { base: raw, tail: [] };

  let splitAt = segments.length; // default: no attribute segment found at all
  for (let i = 0; i < segments.length; i++) {
    if (CVT_SKU_ECHO_RE.test(segments[i])) continue;
    if (CVT_ATTR_RE_test(segments[i])) { splitAt = i; break; }
  }
  if (splitAt === 0) return { base: "", tail: segments };      // whole name is attributes -- no usable base
  if (splitAt === segments.length) return { base: raw, tail: [] }; // no attribute segment -- leave as-is

  return {
    base: segments.slice(0, splitAt).join(", "),
    tail: segments.slice(splitAt).filter(s => !CVT_SKU_ECHO_RE.test(s)),
  };
}

// Recognised variant AXES, so the report can say what actually
// distinguishes the members of a candidate family instead of just
// dumping raw text. Order matters only for display.
const CVT_AXIS_PATTERNS = [
  ["Color",     /\b(white|brown|black|blue|green|yellow|clear|grey|gray|natural|tan)\b/i],
  ["Scent",     /\b(unscented|fragrance-free|original scent|fresh scent|lemon|lime|citrus|lavender|floral|outdoor fresh|april fresh|crisp( clean)?|early morning breeze)\b/i],
  ["Ply",       /\b(\d)[\-\s]?ply\b/i],
  ["Length",    /\b(\d+([.,]\d+)?)[\-\s]?(ft|feet)\b/i],
  ["Dimensions",/\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?(\s*[x×]\s*\d+(\.\d+)?)?(\s*(in|inch|inches|mm|cm))?\b/i],
  ["Sheet count", /\b(\d+)\s*sheets?\b/i],
  ["Roll count",  /\b(\d+)\s*rolls?\b/i],
  ["Wipe count",  /\b(\d+)\s*wipes?\b/i],
  ["Pack size",   /\b(\d+)\s*\/\s*(carton|case|box|pack|canister)\b/i],
  ["Weight/Volume", /\b(\d+(\.\d+)?)\s*(oz|lb|lbs|gal|gallons?|qt)\b/i],
  ["Packaging", /\b(individual|case of \d+|pack of \d+|box of \d+|open stock)\b/i],
];

function cvtDetectAxes(tailSegments) {
  const text = tailSegments.join(", ");
  const axes = [];
  for (const [name, re] of CVT_AXIS_PATTERNS) {
    if (re.test(text)) axes.push(name);
  }
  return axes;
}

/* Builds the CUSTOMER-FACING variant label from a candidate's raw tail
   segments -- never the raw parser text. Confirmed live on the two named
   HIGH examples:
     Pacific Blue Hardwound: "White 1-Ply, 1150-ft Rolls, 6 Rolls"
       -> "White — 1150 ft — 6 Rolls"
     Morcon Morsoft:         "1-Ply, 8\" x 800 ft, Brown, 6 Rolls/Carton"
       -> "Brown — 800 ft — 6 Rolls"

   Each axis has its own extractor that scans EVERY tail segment (not just
   one), so a compound segment like "White 1-Ply" still yields its color
   even though ply shares the segment -- a per-segment "first match wins"
   strategy (tried and reverted) silently dropped the color there because
   ply's own pattern happened to test true first.

   Axes are then emitted in a FIXED order (color, scent, length,
   dimensions, ply, counts, pack size, weight/volume) regardless of what
   order the source text listed them in, so every member of a family
   reads the same way -- Pacific Blue's raw text puts length before color
   on one SKU and omits it on another; the label must not inherit that
   inconsistency.

   Ply is intentionally excluded from the label: cvtScoreCandidate already
   requires every member of a HIGH family to share the same ply (a
   difference there would fail the "format must match" check), so it is
   identical across every option and never distinguishes one from another
   -- showing it on every row would be noise, not a customer choice. */
const CVT_LABEL_AXES = [
  ["color",  s => { const m = s.match(/\b(white|brown|black|blue|green|yellow|clear|grey|gray|natural|tan)\b/i); return m ? cvtLabelWord(m[1]) : null; }],
  ["scent",  s => { const m = s.match(/\b(unscented|fragrance-free|fresh scent|lemon\s*(?:&|and)\s*lime(?:\s+blossom)?|lemon(?:\s+fresh)?|citrus|lavender|floral|outdoor fresh|april fresh|crisp(?:\s+clean)?|early morning breeze)\b/i); return m ? cvtLabelWord(m[1]) : null; }],
  ["length", s => { const m = s.match(/(\d+(?:\.\d+)?)[\-\s]*(?:ft|feet)\b/i); return m ? `${m[1]} ft` : null; }],
  ["dims",   s => { const m = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*(in|inch|inches|mm|cm)?/i);
                     if (!m) return null;
                     const unit = m[4] ? " " + m[4].toLowerCase() : "\"";
                     return [m[1], m[2], m[3]].filter(Boolean).join(" x ") + unit; }],
  ["sheets", s => { const m = s.match(/(\d+)\s*sheets?\b/i); return m ? `${m[1]} Sheets` : null; }],
  ["rolls",  s => { const m = s.match(/(\d+)\s*rolls?\b/i); return m ? `${m[1]} Rolls` : null; }],
  ["wipes",  s => { const m = s.match(/(\d+)\s*wipes?\b/i); return m ? `${m[1]} Wipes` : null; }],
  ["pack",   s => { const m = s.match(/(\d+)\s*\/\s*(carton|case|box|pack|canister)\b/i); return m ? `${m[1]}/${cvtLabelWord(m[2])}` : null; }],
  ["weight", s => { const m = s.match(/(\d+(?:\.\d+)?)\s*(oz|lb|lbs|gal|gallons?|qt)\b/i); return m ? `${m[1]} ${m[2]}` : null; }],
];
function cvtLabelWord(s) {
  return s.trim().replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(/\b(And|Or|Of|The)\b/g, w => w.toLowerCase());
}
function cvtCleanLabel(tailSegments) {
  const joined = tailSegments.join(", ");
  const parts = [];
  for (const [, extract] of CVT_LABEL_AXES) {
    const v = extract(joined);
    if (v) parts.push(v);
  }
  // A segment matching nothing above is silently left out of the label
  // rather than shown raw. cvtScoreCandidate already keeps that segment
  // out of HIGH confidence (it fails the "every segment recognised"
  // check), so this only affects MEDIUM/DATA candidates opened for
  // manual review, where the admin edits the label before saving.
  return parts.join(" — ");
}

// Tokens that mark a genuine FORMAT change rather than a size/color/count
// variant -- two SKUs differing only by these are not safely "the same
// product, different option" without a human confirming it (Phase 4:
// "Blue Laundry Detergent" vs "...With Oxi" must not auto-merge, and
// bottle format is the same kind of problem -- a pull-top bottle and a
// spray bottle are different physical products, not two sizes of one).
const CVT_FORMAT_CHANGE_RE = /\b(spray|pull.?top|refill|pump|trigger|aerosol|concentrate[d]?|ready.to.use|wipes?|liquid|powder|pods?|sheets?|gel)\b/i;

/* Scores one candidate family (base name + its member rows) against the
   confidence rules this was commissioned under:

     HIGH   -- 2+ distinct SKUs, every member's tail is built entirely from
               recognised variant vocabulary (CVT_ATTR_RE), all members
               share the same set of format-changing tokens (so the
               difference really is size/color/count, not product type),
               and no two members are exact name+price+image duplicates.
     MEDIUM -- candidate has a real base and 2+ members, but the tails
               mix in a format change, or contain text outside the known
               attribute vocabulary that a parser cannot safely classify.
     DATA   -- two members share the exact same name. This is a catalog
               data problem (duplicate SKU, or a price/image conflict on
               what claims to be one product), not a grouping decision,
               and is never a candidate for auto-grouping either way.

   Returns null for a "base" with fewer than 2 members (nothing to group).
   Never mutates rows and never touches product_family/variant_label --
   this is read-only analysis. */
function cvtScoreCandidate(base, rows) {
  if (rows.length < 2) return null;

  const parsed = rows.map(r => ({ row: r, ...cvtSplitCommaName(r.name) }));

  const exactDupes = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].name === rows[j].name) exactDupes.push([rows[i], rows[j]]);
    }
  }
  if (exactDupes.length) {
    const [a, b] = exactDupes[0];
    const reason = (a.price === b.price && a.image_url === b.image_url)
      ? `${a.sku} and ${b.sku} share an identical name, price and image — likely a duplicate SKU, not a variant pair.`
      : `${a.sku} and ${b.sku} share an identical name but differ in price ($${a.price} vs $${b.price}) or image — a catalog data conflict, not a grouping decision.`;
    return { base, confidence: "DATA", reason, members: parsed, axes: [] };
  }

  const emptyTail = parsed.filter(p => !p.tail.length);
  if (emptyTail.length) {
    return {
      base, confidence: "LOW",
      reason: `No comma-separated variant text was found in ${emptyTail.length} of ${rows.length} names — nothing for this parser to compare.`,
      members: parsed, axes: [],
    };
  }

  const allText = parsed.map(p => p.tail.join(", "));
  // Every tail SEGMENT must look like recognised variant vocabulary, not
  // just the joined text as a whole -- a tail can legitimately mix a
  // numeric segment ("800-ft.") with a word segment ("Brown"), and each
  // is checked on its own terms (CVT_ATTR_RE_test), not against a single
  // pattern spanning the whole comma-joined string.
  const unrecognised = parsed.filter(p => p.tail.some(seg => !CVT_ATTR_RE_test(seg)));
  const formatFlags = allText.map(t => (t.match(CVT_FORMAT_CHANGE_RE) || []).map(m => m[0].toLowerCase()));
  const formatSets = formatFlags.map(f => new Set(f));
  const formatsDiffer = formatSets.some((s, i) => i > 0 &&
    (s.size !== formatSets[0].size || [...s].some(t => !formatSets[0].has(t))));

  const axes = cvtDetectAxes(parsed.flatMap(p => p.tail));

  if (unrecognised.length) {
    return {
      base, confidence: "MEDIUM",
      reason: `${unrecognised.length} of ${rows.length} members has variant text outside recognised size/color/count vocabulary — needs a human to confirm the axis.`,
      members: parsed, axes,
    };
  }
  if (formatsDiffer) {
    return {
      base, confidence: "MEDIUM",
      reason: `Members differ by packaging FORMAT (e.g. spray vs. pull-top vs. refill), not just size or count — confirm these are the same product before grouping.`,
      members: parsed, axes,
    };
  }
  if (!axes.length) {
    return {
      base, confidence: "MEDIUM",
      reason: `Variant text is present but didn't match a named axis (color/length/ply/etc.) — review before grouping.`,
      members: parsed, axes,
    };
  }

  return {
    base, confidence: "HIGH",
    reason: `Same brand and product name; members differ only by ${axes.join(", ").toLowerCase()}.`,
    members: parsed, axes,
  };
}

/* Runs the comma-based pass over every row NOT already in a family and
   NOT already claimed by cvtDeriveVariant's dash pass. Returns an array
   of scored candidates, sorted HIGH -> MEDIUM -> LOW -> DATA, for the
   dry-run report. Read-only: this never writes to the database. */
function cvtProposeCommaGroupings(rows) {
  const ungrouped = rows.filter(r => !r.product_family);
  const byBase = new Map();
  for (const r of ungrouped) {
    const { base } = cvtSplitCommaName(r.name);
    if (!base) continue;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(r);
  }

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2, DATA: 3 };
  const results = [];
  for (const [base, members] of byBase) {
    if (members.length < 2) continue;
    const scored = cvtScoreCandidate(base, members);
    if (scored) results.push(scored);
  }
  return results.sort((a, b) => order[a.confidence] - order[b.confidence] || b.members.length - a.members.length);
}

/* Per-column cleanup applied to every emitted cell.
 *
 * Three things the supplier feeds need before they can be imported:
 *
 * 1. TIER THRESHOLDS. Only OfficeCrave ships them (cols O/P/Q). The
 *    InnStyle and Sasso files use the older fixed scheme, and their tier
 *    price columns literally say "Price 1-5 / 6-29 / 30+ Cases" -- so
 *    when a threshold column is absent but that tier HAS a price, the
 *    scheme's own breakpoints (1/6/30) are filled in. Leaving them blank
 *    would make getTierPrice() treat the tier as nonexistent and silently
 *    drop the volume discount those files do offer.
 *
 * 2. STOCK. Only OfficeCrave's "In Stock"/"Out Of Stock" label is trusted.
 *    InnStyle's numeric Inventory column is NOT read as availability --
 *    64 of its 174 rows sit at 0, and treating those as unavailable would
 *    pull a third of that catalog off the storefront on an assumption.
 *    Anything unrecognised stays in stock.
 *
 * 3. NUMBERS. These files write "1,106.00" and "$45.00"; both have to lose
 *    their separators or the numeric columns import as null.
 */
const CVT_TIER_DEFAULT_MIN = { tier1_min_qty: 1, tier2_min_qty: 6, tier3_min_qty: 30 };

/* Known-bad figures in a supplier feed, corrected on import.
 *
 * Deliberately a short, explicit, per-SKU list rather than a rule that
 * "fixes" suspicious numbers: silently rewriting supplier pricing is how
 * a wrong price reaches a customer with nobody able to explain it. Each
 * entry records a value whose intended figure is unambiguous, and is
 * removed once the distributor corrects their file.
 *
 * 3098 (Clorox 2 for Colors) -- OfficeCrave's tier-2 COST reads $55.84
 * where $5.84 belongs, a misplaced decimal that inflated the 105+ price
 * to $80.97 against a $9.06 base. $5.84 x 1.43 (the Laundry & Cleaning
 * Chemicals 6-29 markup) = $8.35, which sits correctly below the $8.85
 * tier 1. Confirmed against products - Markup%.csv, which reproduces
 * every other tier price on this SKU exactly.
 *
 * Not listed: 99737, whose tier costs run backwards (31.72 base, 33.74
 * at 3+, 32.30 at 28+). There is no single unambiguous fix there, so its
 * tiers are dropped by the above-base rule instead and it sells at its
 * correct base price until OfficeCrave confirms the real figures.
 */
const CVT_PRICE_CORRECTIONS = {
  "3098:price_tier2": "8.35",
};

/* The SKU of a source row, for the corrections list above. */
function cvtRowSku(srcRow) {
  const col = _cvtMapping.sku;
  return col ? String(srcRow[col] ?? "").trim() : "";
}

/* The base price must be in the same unit as the tier prices.
 *
 * InnStyle's feed mixes them: "Selling Price" is per EACH while its tier
 * columns are per CASE, on 90 of its 172 rows. Imported literally, a
 * product page showed a $10.08 base beside a $483.60 "1-5 cases" tier --
 * reading as a 4,700% markup for ordering one case. OfficeCrave has no
 * such mismatch (0 of 99).
 *
 * Detected rather than hardcoded per distributor: when tier 1 is
 * approximately the base times the case quantity, the two are in
 * different units and the tier figure (per case) is the correct base.
 * A genuine per-case base never sits at 1/CS of its own tier price, so
 * this cannot fire on a correctly-formed row.
 */
function cvtPerCaseBasePrice(srcRow) {
  const num = key => {
    const col = _cvtMapping[key];
    if (!col) return null;
    const n = parseFloat(String(srcRow[col] ?? "").replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const base = num("price");
  const tier1 = num("price_tier1");
  const csCol = _cvtMapping.case_qty;
  const cs = csCol ? parseInt(String(srcRow[csCol] ?? "").replace(/[^0-9]/g, ""), 10) : NaN;

  if (!base || !tier1 || !Number.isFinite(cs) || cs < 2) return null;

  // Within 2% of base x case-qty -- allows for the supplier's own rounding.
  const expected = base * cs;
  if (Math.abs(tier1 - expected) / expected < 0.02) return tier1;
  return null;
}

function cvtNormalizeValue(key, value, srcRow) {
  let v = String(value ?? "").trim();

  if (key === "price") {
    const perCase = cvtPerCaseBasePrice(srcRow);
    if (perCase != null) return perCase.toFixed(2);
  }

  if (key in CVT_TIER_DEFAULT_MIN) {
    // A threshold is meaningless without a price to go with it -- it
    // would describe a tier the pricing code then can't apply. Checked
    // against the CLEANED price so a junk cell (a lone ".") doesn't count
    // as one.
    const priceKey = "price_tier" + key.charAt(4);
    const priceCol = _cvtMapping[priceKey];
    const rawPrice = priceCol ? String(srcRow[priceCol] ?? "") : "";
    const hasPrice = cvtNormalizeValue(priceKey, rawPrice, srcRow) !== "";
    if (!hasPrice) return "";

    if (v) return String(parseInt(v.replace(/[^0-9]/g, ""), 10) || "");
    // No threshold column in this feed: fall back to the fixed scheme.
    return String(CVT_TIER_DEFAULT_MIN[key]);
  }

  // A tier priced AT OR ABOVE the base price is not a volume discount --
  // it charges more for ordering more. Dropped rather than imported,
  // since the threshold rule below then drops with it and the card
  // disappears cleanly.
  //
  // Two real cases in the OfficeCrave feed, both traced to its cost
  // column rather than to the thresholds (the Markup% sheet reproduces
  // every tier-1 price exactly, so the markup formula is sound):
  //
  //   99737 -- costs run backwards (31.72 base, 33.74 at 3+, 32.30 at
  //     28+, 31.72 at 87+), so tier 1 and 2 price above base. All its
  //     tiers drop; it sells at its correct $45.99 base until OfficeCrave
  //     confirms the real figures.
  //
  //   3098 -- tier-2 cost reads $55.84 where $5.84 belongs, inflating
  //     that tier to $80.97 against a $9.06 base. Corrected below rather
  //     than dropped, because the intended value is unambiguous.
  //
  // A tier EQUAL to base is caught by the same test: InnStyle's only tier
  // column is "Price 1-5 Cases", which restates the regular price, and
  // 170 of its 172 products would otherwise render a "1+ Cases" card
  // advertising a discount the buyer can never get. Dropping the price
  // drops the threshold with it (the threshold rule above requires a
  // valid price), so the card disappears cleanly.
  if (/^price_tier[123]$/.test(key) && v) {
    const corrected = CVT_PRICE_CORRECTIONS[cvtRowSku(srcRow) + ":" + key];
    if (corrected != null) return corrected;

    const priceCol = _cvtMapping.price;
    const base = priceCol
      ? cvtNormalizeValue("price", String(srcRow[priceCol] ?? ""), srcRow)
      : "";
    const cleaned = v.replace(/[$,\s]/g, "");
    if (base && parseFloat(cleaned) >= parseFloat(base)) return "";
  }

  // Supplier feeds disagree on casing -- Sasso writes "EACH", the others
  // "Each". Left as two distinct units they'd group and filter
  // separately. Only the casing is touched: Pack/Set/Box/Pair/Bucket are
  // genuinely different pack forms a buyer sees, not noise.
  if (key === "unit" && v) {
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  }

  if (key === "in_stock") {
    if (!v) return "true";
    return /out\s*of\s*stock|^no$|^false$|^0$/i.test(v) ? "false" : "true";
  }

  // Strip currency symbols and thousands separators from numeric columns.
  //
  // Anything that still isn't a number after cleaning is dropped rather
  // than passed through: these feeds contain stray cells (a lone "."
  // sits in one InnStyle 30+ price), and letting that reach the importer
  // writes a junk price onto a live product. Empty is the honest value --
  // an absent tier price just means that tier doesn't exist.
  if (/^(price|sale_price|retail_price|price_tier[123]|cost_per_case|tier[123]_cost|weight|length|width|height|moq_group_min|case_qty)$/.test(key)) {
    if (!v) return "";
    const cleaned = v.replace(/[$,\s]/g, "");
    if (!/^-?\d*\.?\d+$/.test(cleaned)) return "";
    return Number.isFinite(parseFloat(cleaned)) ? cleaned : "";
  }

  return v;
}

/* Refuses to emit if any customer-facing price column is mapped to a
 * source column whose header names it as cost.
 *
 * These feeds carry cost and selling price side by side, with near-
 * identical headers ("Tier 1 Cost" vs "Tier 1 Selling Price", "Price" vs
 * "Selling Price"). A mis-map there publishes what RRS pays as what the
 * customer pays -- every sale at zero margin, and nothing downstream
 * would flag it. Blocking beats warning: the file still imports cleanly
 * after the mapping is corrected, and an unnoticed warning does not.
 *
 * Returns an array of human-readable problems; empty means safe.
 */
function cvtPriceMappingProblems(mapping) {
  const customerFacing = {
    price:        "Base Price",
    sale_price:   "Sale Price",
    price_tier1:  "Tier 1 Price",
    price_tier2:  "Tier 2 Price",
    price_tier3:  "Tier 3 Price",
  };
  const problems = [];
  for (const [key, label] of Object.entries(customerFacing)) {
    const srcCol = mapping[key];
    if (srcCol && /\bcost\b/i.test(srcCol)) {
      problems.push(`${label} is mapped to "${srcCol}" — that's a cost column, not a selling price.`);
    }
  }
  return problems;
}

function cvtBuildAndDownload() {
  const problems = cvtPriceMappingProblems(_cvtMapping);
  if (problems.length) {
    alert(
      "Import blocked — a customer-facing price is mapped to a cost column:\n\n" +
      problems.map(p => "  • " + p).join("\n") +
      "\n\nFix the mapping above and try again."
    );
    return;
  }

  const BOM = "﻿";
  const headers = CVT_COLS.map(c => c.key);
  const lines = [headers.map(h => `"${h}"`).join(",")];

  // Auto-derive the variant columns only when the vendor file didn't supply
  // them -- an explicit mapping always wins over anything guessed here.
  const autoVariants = !_cvtMapping.product_family && !_cvtMapping.variant_label;
  const derived = autoVariants
    ? cvtGroupVariants(_cvtSourceRows, _cvtMapping.name, _cvtMapping.sku)
    : new Map();

  for (const srcRow of _cvtSourceRows) {
    const vals = headers.map(h => {
      const srcCol = _cvtMapping[h] || "";
      let v = srcCol ? String(srcRow[srcCol] ?? "") : "";
      if (!srcCol && autoVariants && (h === "product_family" || h === "variant_label")) {
        const d = derived.get(srcRow) || { family: "", label: "" };
        v = h === "product_family" ? d.family : d.label;
      }
      v = cvtNormalizeValue(h, v, srcRow);
      return `"${v.replace(/"/g,'""')}"`;
    });
    lines.push(vals.join(","));
  }

  if (autoVariants) {
    const groupedRows = [...derived.values()].filter(d => d.family).length;
    const famTotal = new Set([...derived.values()].filter(d => d.family).map(d => d.family)).size;
    if (groupedRows) {
      showToast(`Auto-grouped ${groupedRows} rows into ${famTotal} size-variant families`);
    }
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
  let existingNames = new Set();
  // Fetched unconditionally (used to be gated on whether the CSV had any
  // no-SKU rows): a SKU-bearing row can still collide on
  // slug with an existing product, and the disambiguation pass just below
  // needs the full set of slugs already in use either way.
  const existingSlugs = new Set();
  {
    // .limit() explicit and generous: Supabase/PostgREST default-caps an
    // unbounded select() at 1000 rows, which would silently stop detecting
    // duplicates past the first 1000 products as the catalog grows.
    const { data: existingProds } = await window.sb
      .from("products").select("name, slug").limit(50000);
    if (existingProds) existingProds.forEach(p => {
      existingNames.add(normName(p.name));
      if (p.slug) existingSlugs.add(p.slug);
    });
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

  /* ── Assign a unique slug to every row before any insert happens ──
     products.slug has a unique DB constraint, and the whole import used
     to compute it as slugify(name) alone with no collision check. Rows
     are batched 100-at-a-time into a single insert() call (see BATCH
     below), so ONE slug collision inside a batch -- e.g. two genuinely
     identical product names that are really different sizes/colors,
     distinguished only by product_family/variant_label, which this
     catalog uses on purpose (renderVariantCard in script.js) -- made
     Postgres reject the entire batch of up to 100 rows, not just the
     colliding one. That is exactly the "and 99 more" error this fixes:
     the site's own products.csv has 10 such name collisions today
     (matching Empress glove variants, NOVA towel roll sizes, etc.), so
     this was not a rare edge case.

     Prefer itemNumber/SKU for the base slug when present -- same
     precedence script.js's own client-side slug fallback already uses
     (see the `slug: (itemNumber || name)...` line there) -- since a SKU
     is inherently unique and sidesteps the whole problem for any row
     that has one. Whatever the base slug turns out to be, if it's
     already taken (by an earlier row in this same import, or by a
     product already in the database), append -2, -3, ... until it isn't. */
  const slugBase = r => ((r.sku || r.name || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "product";
  const usedSlugs = new Set(existingSlugs);
  rows.forEach(r => {
    let candidate = slugBase(r);
    let n = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slugBase(r)}-${n}`;
      n++;
    }
    usedSlugs.add(candidate);
    r._resolvedSlug = candidate;
  });

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
    // Pre-computed above, unique across this whole import AND against
    // every slug already in the database -- see the slug-assignment pass
    // right before the batching loop.
    slug         : r._resolvedSlug,
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
    // are what the storefront actually charges; nothing here is derived or
    // auto-calculated the way the admin editor's cost-per-case markup is --
    // CSV rows are trusted as typed.
    price_tier1  : parseMoneyCell(r.price_tier1).empty ? null : parseMoneyCell(r.price_tier1).value,
    price_tier2  : parseMoneyCell(r.price_tier2).empty ? null : parseMoneyCell(r.price_tier2).value,
    price_tier3  : parseMoneyCell(r.price_tier3).empty ? null : parseMoneyCell(r.price_tier3).value,

    // The quantity each tier starts at. Per-product rather than a fixed
    // 6/30 (20260923b) because distributors set their own breakpoints.
    // Null means that tier does not exist for this product -- a tier price
    // without a threshold is never applied, so the two must travel
    // together.
    tier1_min_qty: parseNumCell(r.tier1_min_qty).empty ? null : Math.round(parseNumCell(r.tier1_min_qty).value),
    tier2_min_qty: parseNumCell(r.tier2_min_qty).empty ? null : Math.round(parseNumCell(r.tier2_min_qty).value),
    tier3_min_qty: parseNumCell(r.tier3_min_qty).empty ? null : Math.round(parseNumCell(r.tier3_min_qty).value),

    // Staff-only margin data -- excluded from products_public, so these
    // never reach a customer.
    cost_per_case: parseMoneyCell(r.cost_per_case).empty ? null : parseMoneyCell(r.cost_per_case).value,
    tier1_cost   : parseMoneyCell(r.tier1_cost).empty ? null : parseMoneyCell(r.tier1_cost).value,
    tier2_cost   : parseMoneyCell(r.tier2_cost).empty ? null : parseMoneyCell(r.tier2_cost).value,
    tier3_cost   : parseMoneyCell(r.tier3_cost).empty ? null : parseMoneyCell(r.tier3_cost).value,

    // Which distributor dropships this. Internal.
    distributor  : (r.distributor || "").trim().toLowerCase() || null,

    // Defaults TRUE when the column is absent or unrecognised: a feed that
    // carries no stock data must leave products sellable rather than
    // silently pulling them off the storefront.
    in_stock     : (r.in_stock || "").trim().toLowerCase() !== "false",
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
    // Size/variant grouping. Rows sharing a product_family collapse into one
    // storefront card with a size dropdown (renderVariantCard in script.js),
    // and variant_label is what that dropdown shows for each row. Both are
    // required for grouping to happen -- a family with no label would render
    // a dropdown of blank options -- so, like moq_group above, it's
    // all-or-nothing rather than half-applied.
    product_family: (r.product_family || "").trim() && (r.variant_label || "").trim() ? r.product_family.trim() : null,
    variant_label : (r.product_family || "").trim() && (r.variant_label || "").trim() ? r.variant_label.trim()  : null,
    product_tier  : normalizeProductTier(r.product_tier),
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
  let q = window.sb.from("orders").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (filter) q = q.or(`order_number.ilike.%${filter}%,customer_name.ilike.%${filter}%,business_name.ilike.%${filter}%`);
  const statusFilter = document.getElementById("orderStatusFilter")?.value;
  if (statusFilter) q = q.eq("status", statusFilter);
  const paymentFilter = document.getElementById("orderPaymentFilter")?.value;
  if (paymentFilter) q = q.eq("payment_status", paymentFilter);
  const { data: orders } = await q;

  tbody.innerHTML = (orders || []).map(o => {
    const items = Array.isArray(o.items) ? o.items : (typeof o.items === "string" ? JSON.parse(o.items || "[]") : []);
    const totalDollars = o.total ? Number(o.total).toFixed(2) : "0.00";
    const rowFreightQuote = o.freight_quote ? (typeof o.freight_quote === "string" ? JSON.parse(o.freight_quote) : o.freight_quote) : null;
    const rowIsEstes = rowFreightQuote?.carrier_name === "Estes Express";
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
        ${o.pro_number && rowIsEstes ? `<a href="https://www.estes-express.com/myestes/tracking/details?proNumber=${encodeURIComponent(o.pro_number)}" target="_blank" rel="noopener" class="a-btn-sm" style="background:#1d4ed8;color:#fff;text-decoration:none;">&#128666; BOL</a>` : ""}
        ${o.pro_number && !rowIsEstes ? `<span class="a-btn-sm" style="background:#1d4ed8;color:#fff;cursor:default;" title="Warp tracking #${escHtml(o.pro_number)}">&#128666; ${escHtml(o.pro_number)}</span>` : ""}
        <button class="a-btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="openDeleteOrderModal('${o.id}', '${escHtml(o.order_number).replace(/'/g, "\\'")}')" title="Delete order">Delete</button>
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

// Deleting an order used to be a real DELETE with no way back -- an order
// got permanently lost that way (see
// supabase/migrations/20260918_orders_soft_delete.sql for the incident
// this was written in response to). It now soft-deletes: the row and its
// order_items stay on disk, hidden from every listing, and can be
// restored from the Deleted Orders view. A plain confirm() is still too
// easy to click through on muscle memory even though it is recoverable
// now, so this keeps requiring the exact order number to be typed before
// the Delete button enables -- same friction level as GitHub's "type the
// repo name to delete it" pattern.
let _deleteOrderId = null;
let _deleteOrderNumber = null;

function openDeleteOrderModal(orderId, orderNumber) {
  _deleteOrderId = orderId;
  _deleteOrderNumber = orderNumber;
  const modal = document.getElementById("deleteOrderModal");
  if (!modal) return;
  document.getElementById("deleteOrderNumberLabel").textContent = orderNumber;
  document.getElementById("deleteOrderConfirmInput").value = "";
  document.getElementById("deleteOrderConfirmBtn").disabled = true;
  modal.style.display = "flex";
  document.getElementById("deleteOrderConfirmInput").focus();
}

function closeDeleteOrderModal() {
  const modal = document.getElementById("deleteOrderModal");
  if (modal) modal.style.display = "none";
  _deleteOrderId = null;
  _deleteOrderNumber = null;
}

function onDeleteOrderConfirmInput(value) {
  const btn = document.getElementById("deleteOrderConfirmBtn");
  if (btn) btn.disabled = value.trim() !== _deleteOrderNumber;
}

async function confirmDeleteOrder() {
  if (!_deleteOrderId) return;
  const btn = document.getElementById("deleteOrderConfirmBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }

  // soft_delete_order() re-checks is_owner() itself (see the migration),
  // so a non-owner gets a clear "Only an owner can delete an order."
  // error from Postgres rather than a silent RLS no-op.
  const { error } = await window.sb.rpc("soft_delete_order", { p_order_id: _deleteOrderId });

  if (error) {
    showToast("Couldn't delete order: " + friendlyDbError(error));
    if (btn) { btn.disabled = false; btn.textContent = "Delete Order"; }
    return;
  }

  showToast(`Order ${_deleteOrderNumber} moved to Deleted Orders.`);
  closeDeleteOrderModal();
  if (btn) btn.textContent = "Delete Order";
  renderOrdersTable(document.getElementById("orderSearch")?.value.trim() || "");
}

/* ── Deleted Orders (trash) ───────────────────────────────────── */

function showDeletedOrdersBtnIfOwner() {
  const btn = document.getElementById("showDeletedOrdersBtn");
  if (btn) btn.style.display = window._adminRole === "owner" ? "" : "none";
}

async function openDeletedOrdersModal() {
  const modal = document.getElementById("deletedOrdersModal");
  if (!modal) return;
  modal.style.display = "flex";
  await renderDeletedOrdersTable();
}

// 3 days, matching purge_expired_deleted_orders()' `now() - interval '3
// days'` cutoff (20260919b_orders_auto_purge.sql) -- kept in sync by
// hand since the two live in different systems (this is a display-only
// estimate; the database's own interval is the real deadline).
const ORDER_TRASH_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

function deletedOrderCountdownLabel(deletedAtIso) {
  const deletedAt = new Date(deletedAtIso).getTime();
  if (isNaN(deletedAt)) return "—";
  const remainingMs = deletedAt + ORDER_TRASH_RETENTION_MS - Date.now();
  if (remainingMs <= 0) return `<span style="color:#dc2626;font-weight:700;">Due any time</span>`;

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days  = Math.floor(hours / 24);
  const remHours = hours % 24;

  const text = days >= 1
    ? `${days}d ${remHours}h left`
    : `${hours}h left`;
  // Red once under 24h so a soon-to-purge row is visually distinct
  // without staff having to read the exact number.
  const color = hours < 24 ? "#dc2626" : "#64748b";
  return `<span style="color:${color};font-weight:${hours < 24 ? 700 : 600};">${text}</span>`;
}

async function renderDeletedOrdersTable() {
  const tbody = document.getElementById("deletedOrdersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Loading…</td></tr>`;

  const { data: orders, error } = await window.sb
    .from("orders")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="a-empty">Couldn't load deleted orders: ${escHtml(friendlyDbError(error))}</td></tr>`;
    return;
  }

  tbody.innerHTML = (orders || []).map(o => `
    <tr>
      <td><strong>${escHtml(o.order_number)}</strong></td>
      <td>${escHtml(o.customer_name || "—")}</td>
      <td>${escHtml(o.business_name || "—")}</td>
      <td>$${o.total ? Number(o.total).toFixed(2) : "0.00"}</td>
      <td>${fmt(o.deleted_at)}</td>
      <td>${deletedOrderCountdownLabel(o.deleted_at)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="a-btn-sm" style="background:#dcfce7;color:#15803d;" onclick="restoreDeletedOrder('${o.id}')">Restore</button>
        <button class="a-btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="purgeDeletedOrder('${o.id}', '${escHtml(o.order_number).replace(/'/g, "\\'")}')" title="Permanently delete">Delete Forever</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="7" class="a-empty">No deleted orders.</td></tr>`;
}

async function restoreDeletedOrder(orderId) {
  const { error } = await window.sb.rpc("restore_order", { p_order_id: orderId });
  if (error) {
    showToast("Couldn't restore order: " + friendlyDbError(error));
    return;
  }
  showToast("Order restored.");
  await renderDeletedOrdersTable();
  // The Orders tab may be showing behind this modal; refresh it too so the
  // restored order reappears without needing a second manual refresh.
  renderOrdersTable(document.getElementById("orderSearch")?.value.trim() || "");
}

async function purgeDeletedOrder(orderId, orderNumber) {
  if (!confirm(`Permanently delete order ${orderNumber}? This cannot be undone -- there is no further recovery after this.`)) return;
  const { error } = await window.sb.rpc("purge_deleted_order", { p_order_id: orderId });
  if (error) {
    showToast("Couldn't permanently delete order: " + friendlyDbError(error));
    return;
  }
  showToast(`Order ${orderNumber} permanently deleted.`);
  await renderDeletedOrdersTable();
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
    in_house: "Order switched to in-house delivery. Warp/Shippo skipped.",
    ship:     "Order switched to carrier shipping.",
  }[method] || "Order updated.";
  showToast(label);
  openOrderModal(orderId);
}

// Manual business-name correction on an order (requested directly): not
// every customer checks her account or uses the checkout picker -- some
// just call in and say what business this order is under. No lock on this
// one regardless of payment_status -- unlike the delivery fee, this never
// affects money owed, it's purely a label so staff can find the order
// later by the name she actually recognizes it by.
//
// If the order belongs to a logged-in account with saved businesses
// (RRS-19), staff pick from HER real list instead of retyping a name that
// then has to match hers exactly for the "Orders" jump-link on the Users
// tab to find it -- with a manual "Other" fallback for a guest order, an
// account with no saved businesses, or a business she genuinely hasn't
// saved yet. Loaded once per order (cached), not re-fetched on every toggle.
const _orderBizOptionsCache = {};

async function toggleOrderBizEdit(orderId) {
  const view = document.getElementById("orderBizView-" + orderId);
  const edit = document.getElementById("orderBizEdit-" + orderId);
  if (!view || !edit) return;
  const opening = edit.style.display === "none";
  view.style.display = opening ? "none" : "flex";
  edit.style.display = opening ? "flex" : "none";
  if (!opening) return;

  if (!(orderId in _orderBizOptionsCache)) {
    const userId = currentOrderData?.id === orderId ? currentOrderData.user_id : null;
    _orderBizOptionsCache[orderId] = userId
      ? (await window.sb.from("businesses").select("business_name").eq("user_id", userId).order("is_default", { ascending: false })).data || []
      : [];
  }
  const businesses = _orderBizOptionsCache[orderId];
  const currentName = (currentOrderData?.id === orderId ? currentOrderData.business_name : "") || "";
  const selectWrap = document.getElementById("orderBizSelectWrap-" + orderId);
  const inputWrap  = document.getElementById("orderBizInputWrap-" + orderId);
  const select     = document.getElementById("orderBizSelect-" + orderId);
  const input      = document.getElementById("orderBizNameInput-" + orderId);

  if (businesses.length) {
    const matchesSaved = businesses.some(b => b.business_name.trim().toLowerCase() === currentName.trim().toLowerCase());
    select.innerHTML = businesses.map(b =>
      `<option value="${escHtml(b.business_name)}"${matchesSaved && b.business_name === currentName ? " selected" : ""}>${escHtml(b.business_name)}</option>`
    ).join("") + `<option value="__other__"${matchesSaved ? "" : " selected"}>Other (type manually)</option>`;
    selectWrap.style.display = "flex";
    inputWrap.style.display  = matchesSaved ? "none" : "flex";
    (matchesSaved ? select : input)?.focus();
  } else {
    // No saved businesses on this account (or a guest order) -- same plain
    // text field as before, nothing to choose from.
    selectWrap.style.display = "none";
    inputWrap.style.display  = "flex";
    input?.focus();
  }
}

function onOrderBizSelectChange(orderId) {
  const select = document.getElementById("orderBizSelect-" + orderId);
  const inputWrap = document.getElementById("orderBizInputWrap-" + orderId);
  const input = document.getElementById("orderBizNameInput-" + orderId);
  if (select.value === "__other__") {
    inputWrap.style.display = "flex";
    input.value = "";
    input.focus();
  } else {
    inputWrap.style.display = "none";
  }
}

async function saveOrderBusinessName(orderId) {
  const select     = document.getElementById("orderBizSelect-" + orderId);
  const input      = document.getElementById("orderBizNameInput-" + orderId);
  const selectWrap = document.getElementById("orderBizSelectWrap-" + orderId);
  // The dropdown is authoritative only while it's actually shown AND not
  // set to "Other" -- otherwise whatever's in the free-text field wins
  // (that's the field visibly in front of the user in every other case).
  const usingSelect = selectWrap && selectWrap.style.display !== "none" && select && select.value !== "__other__";
  const name = (usingSelect ? select.value : input?.value || "").trim();
  if (!name) { showToast("Business name can't be empty."); return; }

  const { error } = await window.sb.from("orders").update({ business_name: name }).eq("id", orderId);
  if (error) { showToast("Couldn't save business name: " + error.message); return; }

  document.getElementById("orderBizNameText-" + orderId).textContent = name;
  if (currentOrderData && currentOrderData.id === orderId) currentOrderData.business_name = name;

  // Staff can now add a business to HER account on her behalf -- she called
  // in and said the name, staff is entering it for her, same as any other
  // detail staff takes down over the phone. Only for a genuinely new name
  // (not already one of her saved ones, which is what usingSelect means)
  // and only when this order actually belongs to a real account.
  let savedToAccount = false;
  const userId = currentOrderData?.id === orderId ? currentOrderData.user_id : null;
  if (!usingSelect && userId) {
    const { error: bizErr } = await window.sb.from("businesses").insert({
      user_id: userId,
      business_name: name,
      is_default: !(_orderBizOptionsCache[orderId]?.length),
    });
    if (!bizErr) {
      savedToAccount = true;
      (_orderBizOptionsCache[orderId] ||= []).push({ business_name: name });
    } else {
      console.error("[order biz] could not save to customer's account:", bizErr.message);
    }
  }

  toggleOrderBizEdit(orderId);
  showToast(savedToAccount ? "Business name updated and added to her account." : "Business name updated.");
  // Refresh the table underneath so the column matches without needing to
  // close and reopen the modal first.
  const search = document.getElementById("orderSearch");
  renderOrdersTable(search ? search.value.trim() : "");
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

// Freight is no longer shown live to the customer at checkout -- staff
// pull a Warp quote (or decide a flat rate) and set what actually bills
// on the invoice here. Mirrors saveInHouseDeliveryFee() exactly, just for
// the freight_fee column instead (see 20260831b_orders_freight_fee.sql).
async function saveFreightFee(orderId) {
  const input = document.getElementById("freightFeeInput");
  if (!input) return;
  const newFee = Math.max(0, parseFloat(input.value) || 0);

  const { data: o, error: readErr } = await window.sb
    .from("orders").select("total, freight_fee, payment_status").eq("id", orderId).single();
  if (readErr || !o) {
    alert(readErr?.code === "42703"
      ? "Freight billing isn't set up on the database yet — run the migration 20260831b_orders_freight_fee.sql in Supabase, then try again."
      : "Could not load the order: " + (readErr?.message || "not found"));
    return;
  }
  if (o.payment_status === "paid") {
    alert("This order has already been paid — the freight fee can't be changed anymore.");
    openOrderModal(orderId);
    return;
  }

  const currentFee = Number(o.freight_fee || 0);
  const newTotal = Math.max(0, Number(o.total || 0) - currentFee + newFee);

  const { error } = await window.sb.from("orders")
    .update({ freight_fee: newFee, total: newTotal, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    // PGRST204 is the code for a missing column in an INSERT/UPDATE body;
    // 42703 is what a SELECT naming one returns. Both are checked because
    // this is the same "column not migrated yet" case either way, and
    // checking only 42703 here would drop staff back to a raw error
    // message that doesn't name the migration to run.
    alert(error.code === "PGRST204" || error.code === "42703"
      ? "Freight billing isn't set up on the database yet — run the migration 20260831b_orders_freight_fee.sql in Supabase, then try again."
      : "Could not save the freight fee: " + error.message);
    return;
  }

  showToast(`Freight fee set to $${newFee.toFixed(2)} — will show on the invoice.`);
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
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/lookup-payment-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
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
  // estes_bol_number is a legacy field -- only ever written by the old
  // Estes manual-book flow, kept around purely to still display those old
  // bookings correctly. New bookings (any carrier) write to the neutral
  // bol_number/pro_number columns instead (see 20260725_orders_bol_columns.sql),
  // with the carrier identified from freight_quote.carrier_name at display time.
  const estesBookedLegacy = !!o.estes_bol_number;
  const freightBooked = estesBookedLegacy || !!o.bol_number;
  const freightQuote = o.freight_quote ? (typeof o.freight_quote === "string" ? JSON.parse(o.freight_quote) : o.freight_quote) : null;
  const freightCarrier = freightQuote?.carrier_name || "";
  const isWarpQuote  = freightCarrier === "Warp";
  const freightQuoted = !!freightCarrier;
  // Reported live: an invoice-created order for a customer picking up in
  // person got routed through the Warp rate flow purely because every
  // order implicitly assumed shipping. fulfillment_method (default
  // 'ship') lets staff mark an order as warehouse pickup instead, which
  // skips freight entirely -- see the pickup branch below.
  const isPickup     = o.fulfillment_method === "pickup";
  // In-house delivery: we drive it out ourselves for a fee set on the
  // quote. Like pickup, it deliberately hides the Warp/Shippo buttons --
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
    const quotePanel = freightQuoted ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 14px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div><span style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em;display:block">Freight Cost</span>
          <strong style="color:#0c4a6e;font-size:16px;">$${Number(freightQuote.total_charge).toFixed(2)}</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em;display:block">Transit</span>
          <strong style="color:#0c4a6e;font-size:16px;">${freightQuote.transit_days ?? "—"} days</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em;display:block">Est. Delivery</span>
          <strong style="color:#0c4a6e;font-size:13px;">${freightQuote.delivery_date ?? "—"}</strong></div>
      </div>
      ${freightQuote.test_mode ? `<div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11.5px;color:#92400e;font-weight:600;">🧪 TEST MODE — Quote is from Warp staging. No real charges until credentials switch to production.</div>` : ""}` : "";

    actionBar = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <span style="font-size:20px;">📋</span>
          <div>
            <strong style="font-size:14px;color:#15803d;display:block;">Order Pending Review</strong>
            <span style="font-size:12px;color:#166534;">Place this order with the distributor, then confirm it here. Enter their tracking number below once they send it.</span>
          </div>
        </div>
        ${quotePanel}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <!-- Confirming used to mean "book with Warp". RRS dropships now,
               so this just marks the order confirmed; the shipment itself
               is recorded in the Shipment Tracking panel below once the
               distributor emails a tracking number. -->
          <button onclick="updateOrderStatus('${o.id}', 'confirmed')"
            style="flex:2;min-width:180px;background:#0b2d52;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
            ✓ Confirm Order
          </button>
          <button onclick="cancelOrderFromModal('${o.id}')"
            style="flex:1;min-width:120px;background:#fff;color:#dc2626;border:1.5px solid #fca5a5;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:600;cursor:pointer;">
            ✕ Cancel Order
          </button>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px dashed #bbf7d0;">
          <span style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px;">
            Freight Fee &mdash; Billed on Invoice
          </span>
          <p style="font-size:11.5px;color:#166534;margin:0 0 8px;">
            Checkout already charged a delivery allowance based on the order's weight &mdash; this is what appears on the invoice. Adjust it only if the distributor's actual shipping cost differs, or set $0 if it's already covered.
          </p>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <label style="font-size:12px;font-weight:700;color:#166534;white-space:nowrap;">Freight $</label>
            <input id="freightFeeInput" type="number" min="0" step="0.01"
              value="${Number(o.freight_fee) > 0 ? Number(o.freight_fee).toFixed(2) : (freightQuoted ? Number(freightQuote.total_charge).toFixed(2) : "")}"
              placeholder="0.00"
              style="width:110px;padding:7px 10px;border:1.5px solid #86efac;border-radius:8px;font-size:13px;outline:none;">
            <button onclick="saveFreightFee('${o.id}')"
              style="background:#0b2d52;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;">
              Save Freight Fee
            </button>
            ${Number(o.freight_fee) > 0 ? `<span style="font-size:11.5px;color:#15803d;font-weight:700;">✓ $${Number(o.freight_fee).toFixed(2)} will show on the next invoice</span>` : ""}
          </div>
        </div>
      </div>`;
  } else if (isConfirmed && estesBookedLegacy) {
    actionBar = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">✅</span>
        <div>
          <strong style="color:#15803d;font-size:13px;display:block;">Booked with Estes Express <span style="font-weight:500;color:#94a3b8">(legacy — Estes is no longer our carrier)</span></strong>
          <span style="color:#166534;font-size:12px;">BOL: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${escHtml(o.estes_bol_number)}</code>
          ${o.estes_pro_number ? ` &nbsp;·&nbsp; PRO: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${escHtml(o.estes_pro_number)}</code>` : ""}</span>
        </div>
      </div>`;
  // Legacy display only -- nothing books with a carrier any more. This
  // still renders so orders booked before the dropship switch keep showing
  // the BOL/tracking they were actually shipped under.
  } else if (isConfirmed && freightBooked) {
    actionBar = `
      <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">✅</span>
        <div>
          <strong style="color:#15803d;font-size:13px;display:block;">Booked with ${isWarpQuote ? "Warp" : "carrier"} <span style="font-weight:500;color:#94a3b8">(legacy)</span></strong>
          <span style="color:#166534;font-size:12px;">Order #: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${escHtml(o.bol_number)}</code>
          ${o.pro_number ? ` &nbsp;·&nbsp; Tracking #: <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${escHtml(o.pro_number)}</code>` : ""}</span>
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
      <div>
        <span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Business</span><br>
        <div id="orderBizView-${o.id}" style="display:flex;align-items:center;gap:6px">
          <span id="orderBizNameText-${o.id}">${escHtml(o.business_name || "—")}</span>
          <button onclick="toggleOrderBizEdit('${o.id}')" title="A customer who calls in without checking her account may not know/use the exact saved name -- correct or set it here so it labels the order the way she'd recognize it."
            style="border:none;background:none;color:#94a3b8;cursor:pointer;font-size:12px;padding:0">&#9998;</button>
        </div>
        <div id="orderBizEdit-${o.id}" style="display:none;flex-direction:column;gap:6px;margin-top:4px">
          <div id="orderBizSelectWrap-${o.id}" style="display:none;align-items:center;gap:6px">
            <select id="orderBizSelect-${o.id}" onchange="onOrderBizSelectChange('${o.id}')"
              style="padding:6px 9px;border:1.5px solid #d0d7e0;border-radius:7px;font-size:13px;width:180px"></select>
          </div>
          <div id="orderBizInputWrap-${o.id}" style="display:flex;align-items:center;gap:6px">
            <input id="orderBizNameInput-${o.id}" type="text" value="${escHtml(o.business_name || "")}" placeholder="Business name"
              style="padding:6px 9px;border:1.5px solid #d0d7e0;border-radius:7px;font-size:13px;width:170px">
            <button onclick="saveOrderBusinessName('${o.id}')" style="background:#0b2d52;color:#fff;border:none;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer">Save</button>
            <button onclick="toggleOrderBizEdit('${o.id}')" style="background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer">Cancel</button>
          </div>
        </div>
      </div>
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
      ${freightQuote ? `<div style="grid-column:span 2"><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Freight Quote</span><br>${escHtml(freightQuote.carrier_name || "—")} — $${Number(freightQuote.total_charge || 0).toFixed(2)}${freightQuote.transit_days ? ` (${freightQuote.transit_days} days)` : ""} <span style="color:#94a3b8">(customer never sees this)</span></div>` : ""}
      ${Number(o.freight_fee) > 0 ? `<div style="grid-column:span 2"><span style="color:#64748b;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Freight Fee (billed)</span><br><strong style="color:#15803d">$${Number(o.freight_fee).toFixed(2)}</strong> — appears on the invoice sent to the customer</div>` : ""}
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
    <div id="orderVendorPoPanel-${o.id}"></div>
    <div id="orderShipmentsPanel-${o.id}"></div>
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
      ${o.bol_number ? `<span style="font-size:13px;color:#334155;">${isWarpQuote ? "Warp Order #" : "BOL"}: <strong>${escHtml(o.bol_number)}</strong></span>` : ""}
      ${o.pro_number && !isWarpQuote ? `<a href="https://www.estes-express.com/myestes/tracking/details?proNumber=${encodeURIComponent(o.pro_number)}" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:7px;background:#1d4ed8;color:#fff;border:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;">
        &#128666; Track on Estes &rarr;
      </a>
      <span style="font-size:13px;color:#334155;">PRO: <strong>${escHtml(o.pro_number)}</strong></span>` : ""}
      ${o.pro_number && isWarpQuote ? `<span style="font-size:13px;color:#334155;">Tracking #: <strong>${escHtml(o.pro_number)}</strong></span>` : ""}
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
  renderOrderVendorPoPanel(o);
  renderOrderShipmentsPanel(o);
}

// Dropship shipment tracking. Distributors (InnStyle, Sasso, OfficeCrave)
// ship straight to the customer and email a tracking number back; staff
// enter it here by hand. There is no rate quoting and no carrier booking
// in this flow -- see supabase/migrations/20260923_dropship_shipments.sql.
//
// One row per package, because a single order can contain items from more
// than one distributor and those ship separately. Whatever is saved here
// is what the customer sees on /account -- the distributor name is the one
// field that deliberately stays internal.
const RRS_DISTRIBUTORS = [
  { value: "innstyle",    label: "InnStyle" },
  { value: "sasso",       label: "Sasso" },
  { value: "officecrave", label: "OfficeCrave" },
  { value: "other",       label: "Other" },
];

const SHIPMENT_STATUS_LABEL = {
  processing: "Processing",
  shipped:    "Shipped",
  delivered:  "Delivered",
};

async function renderOrderShipmentsPanel(o) {
  const panel = document.getElementById(`orderShipmentsPanel-${o.id}`);
  if (!panel) return;

  // A warehouse pickup is never shipped, so there is nothing to track.
  if (o.fulfillment_method === "pickup") return;

  const { data: shipments, error } = await window.sb
    .from("order_shipments")
    .select("*")
    .eq("order_id", o.id)
    .order("created_at", { ascending: true });

  // 42P01 = table missing (migration not run yet). Say so plainly rather
  // than rendering an editor whose every save would fail.
  if (error) {
    panel.innerHTML = `
      <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
      <p style="font-size:12.5px;color:#b45309;margin:0">
        ${error.code === "42P01"
          ? "Shipment tracking isn't set up on the database yet — run the migration 20260923_dropship_shipments.sql in Supabase."
          : `Could not load shipments: ${escHtml(error.message || "unknown error")}`}
      </p>`;
    return;
  }

  const rows = (shipments || []).map(s => `
    <tr style="border-top:1px solid #f0f4fa">
      <td style="padding:8px 10px;font-size:12.5px;">${escHtml(RRS_DISTRIBUTORS.find(d => d.value === s.distributor)?.label || s.distributor)}</td>
      <td style="padding:8px 10px;font-size:12.5px;">${escHtml(SHIPMENT_STATUS_LABEL[s.status] || s.status)}</td>
      <td style="padding:8px 10px;font-size:12.5px;">
        ${s.tracking_number
          ? (s.tracking_url
              ? `<a href="${escHtml(s.tracking_url)}" target="_blank" rel="noopener" style="font-weight:700;color:#0B1F38;">${escHtml(s.tracking_number)}</a>`
              : `<strong>${escHtml(s.tracking_number)}</strong>`)
          : '<span style="color:#94a3b8">—</span>'}
        ${s.carrier ? `<span style="color:#94a3b8;font-size:11px;"> (${escHtml(s.carrier)})</span>` : ""}
      </td>
      <td style="padding:8px 10px;text-align:right;">
        <button onclick="deleteOrderShipment('${s.id}', '${o.id}')"
          style="border:1px solid #fca5a5;background:#fff;color:#dc2626;border-radius:7px;padding:4px 10px;font-size:11.5px;font-weight:700;cursor:pointer">
          Remove
        </button>
      </td>
    </tr>`).join("");

  panel.innerHTML = `
    <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:6px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Shipment Tracking</h4>
    <p style="font-size:12.5px;color:#64748b;margin:0 0 12px;">
      Enter what the distributor emailed you. The status and tracking link show on the customer's Orders tab — the distributor name does not.
    </p>

    ${rows ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;">Distributor</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;">Status</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;">Tracking</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : `<p style="font-size:12.5px;color:#94a3b8;margin:0 0 14px;">No shipments recorded yet.</p>`}

    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <select id="shipDistributor-${o.id}" class="a-select" style="height:34px;border-radius:8px;font-size:12.5px;padding:0 8px;width:auto">
        ${RRS_DISTRIBUTORS.map(d => `<option value="${d.value}">${d.label}</option>`).join("")}
      </select>
      <select id="shipStatus-${o.id}" class="a-select" style="height:34px;border-radius:8px;font-size:12.5px;padding:0 8px;width:auto">
        <option value="processing">Processing</option>
        <option value="shipped" selected>Shipped</option>
        <option value="delivered">Delivered</option>
      </select>
      <input id="shipTracking-${o.id}" placeholder="Tracking number"
        style="height:34px;border:1.5px solid #d0d7e0;border-radius:8px;font-size:12.5px;padding:0 10px;width:190px">
      <input id="shipCarrier-${o.id}" placeholder="Carrier (optional)"
        style="height:34px;border:1.5px solid #d0d7e0;border-radius:8px;font-size:12.5px;padding:0 10px;width:150px">
      <input id="shipUrl-${o.id}" placeholder="Tracking URL"
        style="height:34px;border:1.5px solid #d0d7e0;border-radius:8px;font-size:12.5px;padding:0 10px;width:260px">
      <button onclick="saveOrderShipment('${o.id}')"
        style="height:34px;background:#ED7226;color:#fff;border:none;border-radius:8px;padding:0 16px;font-size:12.5px;font-weight:700;cursor:pointer">
        Save Shipment
      </button>
    </div>`;
}

// Adds one shipment row. Deliberately insert-only rather than an
// edit-in-place grid: a distributor sends one tracking email per package,
// so the common action is "add what just arrived", and a wrong entry is
// removed and re-added rather than silently rewritten.
async function saveOrderShipment(orderId) {
  const distributor = document.getElementById(`shipDistributor-${orderId}`)?.value || "";
  const status      = document.getElementById(`shipStatus-${orderId}`)?.value || "processing";
  const tracking    = (document.getElementById(`shipTracking-${orderId}`)?.value || "").trim();
  const carrier     = (document.getElementById(`shipCarrier-${orderId}`)?.value || "").trim();
  const url         = (document.getElementById(`shipUrl-${orderId}`)?.value || "").trim();

  if (!distributor) { alert("Pick which distributor shipped this."); return; }
  // A 'shipped' or 'delivered' row with no tracking number tells the
  // customer their order moved but gives them nothing to look up.
  if (status !== "processing" && !tracking) {
    alert("Enter the tracking number before marking this shipped or delivered.");
    return;
  }
  // Guard against a pasted value that isn't a link -- href="innstyle.com"
  // resolves relative to the site and 404s for the customer.
  if (url && !/^https?:\/\//i.test(url)) {
    alert("The tracking URL must start with http:// or https://");
    return;
  }

  const { error } = await window.sb.from("order_shipments").insert({
    order_id:        orderId,
    distributor,
    status,
    tracking_number: tracking || null,
    tracking_url:    url || null,
    carrier:         carrier || null,
    shipped_at:      status === "shipped"   ? new Date().toISOString() : null,
    delivered_at:    status === "delivered" ? new Date().toISOString() : null,
  });

  if (error) {
    alert(error.code === "42P01"
      ? "Shipment tracking isn't set up on the database yet — run the migration 20260923_dropship_shipments.sql in Supabase."
      : "Could not save the shipment: " + (error.message || "unknown error"));
    return;
  }
  openOrderModal(orderId);
}

async function deleteOrderShipment(shipmentId, orderId) {
  if (!confirm("Remove this shipment? The customer will no longer see its tracking.")) return;
  const { error } = await window.sb.from("order_shipments").delete().eq("id", shipmentId);
  if (error) { alert("Could not remove the shipment: " + (error.message || "unknown error")); return; }
  openOrderModal(orderId);
}

// Groups this order's line items by vendor (via products.vendor_id) and
// offers a one-click "Send Purchase Order" per vendor -- builds the
// neutral no-pricing PDF client-side via /api/quote-pdf (hide_pricing)
// then emails it via /api/send-invoice's send_vendor_po action. Only
// products explicitly tagged to a vendor show here; everything else is
// RRS-fulfilled as today, no panel shown if nothing is vendor-tagged.
async function renderOrderVendorPoPanel(o) {
  const panel = document.getElementById(`orderVendorPoPanel-${o.id}`);
  if (!panel || !o.order_items?.length) return;

  const productIds = [...new Set(o.order_items.map(i => i.product_id).filter(Boolean))];
  if (!productIds.length) return;

  const { data: products } = await window.sb
    .from("products").select("id, sku, vendor_id, vendors(id, name, contact_email)")
    .in("id", productIds).not("vendor_id", "is", null);
  if (!products?.length) return;

  const vendorByProductId = Object.fromEntries(products.map(p => [p.id, p.vendors]));
  const skuByProductId = Object.fromEntries(products.map(p => [p.id, p.sku]));
  const { data: alreadySent } = await window.sb
    .from("vendor_purchase_orders").select("vendor_id, po_number").eq("order_id", o.id);
  const sentVendorIds = new Set((alreadySent || []).map(x => x.vendor_id));

  const groups = {};
  o.order_items.forEach(i => {
    const v = vendorByProductId[i.product_id];
    if (!v) return;
    if (!groups[v.id]) groups[v.id] = { vendor: v, items: [] };
    groups[v.id].items.push({ ...i, sku: skuByProductId[i.product_id] });
  });
  const vendorIds = Object.keys(groups);
  if (!vendorIds.length) return;

  panel.innerHTML = `
    <hr style="margin:18px 0;border:none;border-top:1px solid #f0f4fa">
    <h4 style="margin-bottom:10px;font-size:13px;font-weight:700;color:#0d1f38;text-transform:uppercase;letter-spacing:.04em">Vendor Fulfillment</h4>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${vendorIds.map(vid => {
        const g = groups[vid];
        const sent = sentVendorIds.has(vid);
        return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <strong style="font-size:13px;color:#0d1f38">${escHtml(g.vendor.name)}</strong>
            <span style="font-size:12px;color:#64748b"> &middot; ${g.items.length} item${g.items.length === 1 ? "" : "s"}</span>
            <div style="font-size:11.5px;color:#94a3b8;margin-top:2px">${g.items.map(i => escHtml(i.name || i.product_name || "Product") + " &times;" + (i.quantity ?? 1)).join(", ")}</div>
          </div>
          ${sent
            ? `<span style="font-size:12px;color:#15803d;font-weight:700">&#10003; PO Sent</span>`
            : `<button onclick='sendVendorPo(${JSON.stringify(o.id)}, ${JSON.stringify(vid)})' style="background:#0b2d52;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Send Purchase Order</button>`}
        </div>`;
      }).join("")}
    </div>`;
}

async function sendVendorPo(orderId, vendorId) {
  const { data: o } = await window.sb.from("orders").select("order_number, order_items(*)").eq("id", orderId).single();
  if (!o) { showToast("Couldn't load order."); return; }

  const { data: products } = await window.sb
    .from("products").select("id, sku").eq("vendor_id", vendorId);
  const skuByProductId = Object.fromEntries((products || []).map(p => [p.id, p.sku]));
  const items = (o.order_items || [])
    .filter(i => skuByProductId[i.product_id])
    .map(i => ({ name: i.name || i.product_name || "Product", sku: skuByProductId[i.product_id], quantity: i.quantity ?? 1 }));
  if (!items.length) { showToast("No line items for this vendor."); return; }

  const poNumber = `${o.order_number}-${vendorId.slice(0, 4).toUpperCase()}`;

  const pdfRes = await fetch("/api/quote-pdf", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quote_number: poNumber, doc_label: "Purchase Order", hide_pricing: true,
      quote_items: items.map(i => ({ name: i.name, sku: i.sku, quantity: i.quantity, unit_price: 0 })),
    }),
  });
  if (!pdfRes.ok) { showToast("Couldn't build PO PDF."); return; }
  const pdfBuf = await pdfRes.arrayBuffer();
  const pdfBase64 = btoa(new Uint8Array(pdfBuf).reduce((s, b) => s + String.fromCharCode(b), ""));

  const { data: { session } } = await window.sb.auth.getSession();
  const sendRes = await fetch("/api/send-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify({
      action: "send_vendor_po", order_id: orderId, vendor_id: vendorId,
      po_number: poNumber, line_items: items, pdf_base64: pdfBase64,
    }),
  });
  const result = await sendRes.json();
  if (!sendRes.ok) { showToast("Couldn't send PO: " + (result.error || "unknown error")); return; }

  showToast(`Purchase order sent to ${result.sent_to}.`);
  openOrderModal(orderId);
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
    // Undefined column -- the tax_rate/tax_amount columns this needs
    // (20260820_order_sales_tax.sql) haven't been added live yet.
    // PGRST204 is the code an UPDATE body gets for a missing column;
    // 42703 is the SELECT equivalent. Checking both so this keeps naming
    // the migration to run instead of falling through to a raw error.
    alert(error.code === "PGRST204" || error.code === "42703"
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

// The Warp freight integration (WARP_FN_URL, callWarpFunction,
// getFreightQuote, bookWithWarp, showFreightConfirmDialog) used to live
// here. RRS dropships now: InnStyle, Sasso and OfficeCrave ship direct to
// the customer and email a tracking number, which staff enter by hand in
// the order modal's Shipment Tracking panel (renderOrderShipmentsPanel).
// There is no rate to quote and no carrier to book, so all of it is gone,
// along with the warp-freight.js checkout script it mirrored.

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
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${r.business_name ? `<button class="a-btn-sm" onclick="viewOrdersForBusiness('${escHtml(r.business_name).replace(/'/g, "\\'")}')" title="See orders placed under this business name">Orders</button>` : ""}
        <button class="a-btn-sm a-btn-danger" onclick="${r.bizId ? `removeBusinessRow('${r.bizId}')` : `deleteUser('${r.profileId}')`}">Remove</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="7" class="a-empty">No customers yet.</td></tr>`;
}

// Lets staff jump from a customer's business record straight to every order
// placed under that exact business name -- e.g. when she calls in and says
// "this is under my ABC Hotel account," instead of scrolling the whole
// Orders tab hunting for it by hand. Sets the search box BEFORE switching
// tabs so switchTab's own render call (which reads the search box's
// current value) already comes back filtered -- avoids a race between two
// separate renderOrdersTable() calls landing in an unpredictable order.
function viewOrdersForBusiness(businessName) {
  const search = document.getElementById("orderSearch");
  if (search) { search.value = businessName; }
  switchTab("orders");
}

document.getElementById("userSearch")?.addEventListener("input", e => renderUsersTable(e.target.value.trim()));

async function deleteUser(id) {
  if (!confirm("Remove this user? This cannot be undone.")) return;
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/create-dev-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (session?.access_token || ""),
      },
      body: JSON.stringify({ action: "delete_user", user_id: id }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "Request failed");
    showToast("User removed.");
    renderUsersTable();
  } catch (err) {
    showToast("Couldn't remove user: " + err.message);
  }
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
const CRM_SOURCES = ["Seamless","Landing Page","Facebook","Website Checkout","Referral","Cold Call","Trade Show","Other"];
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
    window.sb.from("profiles").select("id,email,full_name,role").in("role", ["owner","marketing"]),
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
   <div class="crm-page">
    ${isCrmCampaignsReadOnly() ? `<div class="crm-readonly-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      View only — only Marketing accounts can make changes here.
    </div>` : ""}
    <div class="crm-header">
      <div>
        <h1 class="crm-title">CRM &amp; Leads</h1>
        <p class="crm-subtitle">Every quotation request, tracked from first contact through repeat business.</p>
      </div>
      <div class="crm-header-actions">
        <button class="crm-btn crm-btn-ghost" onclick="exportCrmLeadsCsv()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3M7 10l5 5 5-5M4 21h16"/></svg>
          Export CSV
        </button>
        <button class="crm-btn crm-btn-ghost" onclick="openCrmImportModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M4 21h16"/></svg>
          Import CSV
        </button>
        ${tktIsAdmin() ? `<button class="crm-btn crm-btn-ghost" onclick="openDevTeamModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          Staff Accounts
        </button>` : ""}
      </div>
    </div>

    <div class="crm-statstrip" id="crmStats"></div>

    <div class="crm-filterbar">
      <div class="crm-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="crmSearch" type="text" placeholder="Search business or contact…" value="${escHtml(_crm.filters.q)}" oninput="setCrmFilter('q', this.value)">
      </div>
      <select class="crm-select crm-filtersel" onchange="setCrmFilter('source', this.value)">
        <option value="all">All sources</option>
        ${CRM_SOURCES.map(s => `<option value="${escHtml(s)}"${_crm.filters.source===s?" selected":""}>${escHtml(s)}</option>`).join("")}
      </select>
      <select class="crm-select crm-filtersel" onchange="setCrmFilter('rep', this.value)">
        <option value="all">All reps</option>
        <option value="unassigned"${_crm.filters.rep==="unassigned"?" selected":""}>Unassigned</option>
        ${_crm.reps.map(r => `<option value="${r.id}"${_crm.filters.rep===r.id?" selected":""}>${escHtml(r.full_name || r.email)}</option>`).join("")}
      </select>
    </div>

    <div id="crmBoardWrap"></div>
   </div>
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
    return `<div class="crm-stat crm-stat-${col.key}"><span class="crm-stat-n">${n}</span><span class="crm-stat-l">${escHtml(col.label)}</span></div>`;
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
    wrap.innerHTML = `<div class="crm-empty">
      <div class="crm-empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      </div>
      <h3>No leads yet</h3>
      <p>Quotation requests submitted from the site will show up here automatically.</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `<div class="crm-board">${CRM_STATUS.map(col => {
    const items = visible.filter(l => l.status === col.key);
    return `
      <section class="crm-col" data-status="${col.key}"
        ondragover="crmDragOver(event)" ondragleave="crmDragLeave(event)" ondrop="crmDrop(event,'${col.key}')">
        <header class="crm-col-head">
          <span class="crm-col-title">${escHtml(col.label)}</span>
          <span class="crm-col-count">${items.length}</span>
        </header>
        <div class="crm-col-body">
          ${items.map(crmCard).join("") || `<div class="crm-col-empty">Nothing here</div>`}
        </div>
      </section>`;
  }).join("")}</div>`;
}

function crmCard(l) {
  const rep = _crm.reps.find(r => r.id === l.assigned_to);
  const aCount = _crm.activityCounts[l.id] || 0;
  return `
    <article class="crm-card" data-status="${l.status}" draggable="true"
      ondragstart="crmDragStart(event,'${l.id}')" ondragend="crmDragEnd(event)"
      onclick="openCrmDrawer('${l.id}')">
      <div class="crm-card-top">
        <span class="crm-type-chip">${escHtml(l.customer_type || "General")}</span>
        <div class="crm-card-top-actions">
          ${l.lead_source ? `<span class="crm-source-chip">${escHtml(l.lead_source)}</span>` : ""}
          <button class="crm-card-del" onclick="event.stopPropagation(); deleteCrmLead('${l.id}')" title="Delete lead">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <p class="crm-card-title">${escHtml(l.business_name || l.contact_name || "Unnamed lead")}</p>
      ${l.contact_name || l.email ? `<p class="crm-card-sub">${escHtml(l.contact_name || "")}${l.contact_name && l.email ? " · " : ""}${escHtml(l.email || "")}</p>` : ""}
      <div class="crm-card-foot">
        <div class="crm-card-meta">
          ${aCount ? `<span class="crm-activity-chip" title="${aCount} activity entr${aCount>1?"ies":"y"}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${aCount}</span>` : ""}
        </div>
        ${tktAvatar(rep?.email, 24)}
      </div>
    </article>`;
}

/* Drag & drop between columns -- moving a card updates status immediately
   and logs a status_change activity entry, same as a manual status edit in
   the drawer would. */
let _crmDragId = null;
function crmDragStart(e, id) { _crmDragId = id; e.dataTransfer.effectAllowed = "move"; e.currentTarget.classList.add("dragging"); }
function crmDragEnd(e)       { _crmDragId = null; e.currentTarget.classList.remove("dragging"); document.querySelectorAll(".crm-col.over").forEach(c => c.classList.remove("over")); }
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
  if (blockIfCrmReadOnly()) return;
  const lead = _crm.leads.find(x => x.id === id);
  if (!lead || lead.status === status) return;
  const from = lead.status;
  const { error } = await window.sb.from("quote_requests").update({ status }).eq("id", id);
  if (error) { showToast("Couldn't update lead: " + friendlyDbError(error)); return; }
  lead.status = status;
  await logCrmActivity(id, "status_change", `Moved from "${CRM_STATUS_LABEL[from] || from}" to "${CRM_STATUS_LABEL[status] || status}"`, true);
  renderCrmStats();
  renderCrmBoard();
}

// Deletes the underlying quote_requests row -- this IS the lead record (see
// the note at the top of 20260828_marketing_crm.sql), so removing it also
// cascades to crm_activity_log. Callable either from a card's quick-delete
// button (drawer isn't open yet) or from inside the open drawer.
async function deleteCrmLead(id) {
  if (blockIfCrmReadOnly()) return;
  const l = _crm.leads.find(x => x.id === id);
  if (!l) return;
  if (!confirm(`Delete the lead "${l.business_name || l.contact_name || "Unnamed lead"}"? This also removes its activity log and can't be undone.`)) return;
  const { error } = await window.sb.from("quote_requests").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  _crm.leads = _crm.leads.filter(x => x.id !== id);
  const overlay = document.getElementById("crmDrawerOverlay");
  if (overlay && overlay.classList.contains("open")) closeCrmDrawer(true);
  renderCrmStats();
  renderCrmBoard();
  showToast("Lead deleted.");
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
  if (error) { if (!silent) showToast("Couldn't log activity: " + friendlyDbError(error)); return; }
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
   <div class="crm-dr">
    <header class="crm-dr-head">
      <div class="crm-dr-headtop">
        <span class="crm-dr-eyebrow">Lead</span>
        <div class="crm-dr-headbtns">
          <button class="crm-iconbtn crm-iconbtn-danger" title="Delete lead" onclick="deleteCrmLead('${l.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
          <button class="crm-iconbtn" title="Close" onclick="closeCrmDrawer(true)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <h2 class="crm-dr-title">${escHtml(l.business_name || l.contact_name || "Unnamed lead")}</h2>
      <div class="crm-dr-badges">
        <span class="crm-type-tag">${escHtml(l.customer_type || "—")}</span>
        <span class="crm-status-pill crm-status-${l.status}">${escHtml(CRM_STATUS_LABEL[l.status] || l.status)}</span>
      </div>
    </header>

    <div class="crm-dr-controls">
      <label class="crm-field">
        <span class="crm-field-label">Status</span>
        <select class="crm-select" onchange="setCrmLeadStatus('${l.id}', this.value)">
          ${CRM_STATUS.map(s => `<option value="${s.key}"${l.status===s.key?" selected":""}>${escHtml(s.label)}</option>`).join("")}
        </select>
      </label>
      <label class="crm-field">
        <span class="crm-field-label">Lead Source</span>
        <select class="crm-select" onchange="setCrmField('${l.id}','lead_source', this.value)">
          <option value=""${!l.lead_source?" selected":""}>— Not set —</option>
          ${CRM_SOURCES.map(s => `<option value="${escHtml(s)}"${l.lead_source===s?" selected":""}>${escHtml(s)}</option>`).join("")}
        </select>
      </label>
      <label class="crm-field">
        <span class="crm-field-label">Assigned Rep</span>
        <select class="crm-select" onchange="setCrmField('${l.id}','assigned_to', this.value || null)">
          <option value=""${!l.assigned_to?" selected":""}>Unassigned</option>
          ${_crm.reps.map(r => `<option value="${r.id}"${l.assigned_to===r.id?" selected":""}>${escHtml(r.full_name || r.email)}</option>`).join("")}
        </select>
      </label>
    </div>

    <div class="crm-dr-section">
      <h4 class="crm-dr-h4"><span class="crm-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/></svg></span>Contact</h4>
      <p class="crm-dr-desc">${escHtml(l.contact_name || "—")}${l.email ? ` &middot; <a href="mailto:${escHtml(l.email)}">${escHtml(l.email)}</a>` : ""}${(l.phone_number || l.phone) ? ` &middot; ${escHtml(l.phone_number || l.phone)}` : ""}</p>
      ${items.length ? `<p class="crm-dr-hint">Requested items: ${items.map(i => escHtml(`${i.name || ""} ×${i.quantity || 1}`)).join(", ")}</p>` : ""}
      ${l.notes ? `<p class="crm-dr-hint">Notes: ${escHtml(l.notes)}</p>` : ""}
      <div class="crm-consent-row">
        <span>Marketing emails</span>
        <span class="crm-consent-pill ${l.consent_marketing === false ? "is-out" : "is-in"}">${l.consent_marketing === false ? "Opted out" : "Opted in"}</span>
        <button class="crm-btn-sm" onclick="toggleCrmConsent('${l.id}', ${l.consent_marketing === false})">${l.consent_marketing === false ? "Re-enable" : "Opt out"}</button>
      </div>
    </div>

    <div class="crm-dr-section">
      <h4 class="crm-dr-h4"><span class="crm-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24L4 3a1 1 0 00-1 1l.24 5.59a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.82 0l4.36-4.36a2 2 0 000-2.81z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg></span>Tags</h4>
      <div id="crmTagPills-${l.id}" class="crm-tagpills">
        ${(l.tags || []).map(t => `<span class="crm-tag-pill">${escHtml(t)}<button onclick="removeCrmTag('${l.id}','${escHtml(t).replace(/'/g,"&#39;")}')">&times;</button></span>`).join("") || `<span class="crm-dr-hint">No tags yet.</span>`}
      </div>
      <div class="crm-tag-addrow">
        <input id="crmTagInput-${l.id}" class="crm-input" placeholder="e.g. vip, trade-show" onkeydown="if(event.key==='Enter'){event.preventDefault();addCrmTag('${l.id}')}">
        <button class="crm-btn crm-btn-ghost" onclick="addCrmTag('${l.id}')">Add</button>
      </div>
    </div>

    <div class="crm-dr-facts">
      <span>Created</span><strong>${fmt(l.created_at)}</strong>
    </div>

    <div class="crm-dr-section">
      <h4 class="crm-dr-h4"><span class="crm-dr-h4-icon crm-dr-h4-icon-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></span>Activity<span class="crm-count-tag">${(activity||[]).length}</span></h4>
      <div class="crm-thread">
        ${(activity||[]).length ? activity.map(a => `
          <div class="crm-activity-item">
            ${tktAvatar(a.author_name || "?", 30)}
            <div class="crm-activity-body">
              <div class="crm-activity-head">
                <strong>${escHtml(a.author_name || "Staff")}</strong>
                <span class="crm-activity-type">${escHtml((CRM_ACTIVITY_TYPES.find(t=>t.key===a.activity_type)||{}).label || a.activity_type)}</span>
                <span class="crm-activity-time">${timeAgo(a.created_at)}</span>
                <button class="crm-activity-delete" type="button" onclick="deleteCrmActivity('${a.id}','${l.id}')" title="Delete">Delete</button>
              </div>
              <p>${escHtml(a.body)}</p>
            </div>
          </div>`).join("") : `<p class="crm-dr-hint" style="margin:0">No activity logged yet.</p>`}
      </div>
      <div class="crm-composer">
        <textarea id="crmActivityBody" class="crm-composer-input" rows="2" placeholder="Log a call, email, note, or follow-up…"></textarea>
        <div class="crm-composer-foot">
          <select id="crmActivityType" class="crm-select crm-composer-type">
            ${CRM_ACTIVITY_TYPES.map(t => `<option value="${t.key}">${escHtml(t.label)}</option>`).join("")}
          </select>
          <button class="crm-btn crm-btn-primary" onclick="submitCrmActivity('${l.id}')">Log Activity</button>
        </div>
      </div>
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
  if (blockIfCrmReadOnly()) return;
  const lead = _crm.leads.find(x => x.id === id);
  const { error } = await window.sb.from("quote_requests").update({ [field]: value }).eq("id", id);
  if (error) { showToast("Couldn't update: " + friendlyDbError(error)); return; }
  if (lead) lead[field] = value;
  renderCrmBoard();
}

async function addCrmTag(id) {
  if (blockIfCrmReadOnly()) return;
  const input = document.getElementById(`crmTagInput-${id}`);
  const tag = (input?.value || "").trim();
  if (!tag) return;
  const lead = _crm.leads.find(x => x.id === id);
  const tags = [...new Set([...(lead?.tags || []), tag])];
  const { error } = await window.sb.from("quote_requests").update({ tags }).eq("id", id);
  if (error) { showToast("Couldn't add tag: " + friendlyDbError(error)); return; }
  if (lead) lead.tags = tags;
  openCrmDrawer(id);
}

async function removeCrmTag(id, tag) {
  if (blockIfCrmReadOnly()) return;
  const lead = _crm.leads.find(x => x.id === id);
  const tags = (lead?.tags || []).filter(t => t !== tag);
  const { error } = await window.sb.from("quote_requests").update({ tags }).eq("id", id);
  if (error) { showToast("Couldn't remove tag: " + friendlyDbError(error)); return; }
  if (lead) lead.tags = tags;
  openCrmDrawer(id);
}

async function toggleCrmConsent(id, reEnable) {
  if (blockIfCrmReadOnly()) return;
  const consent = reEnable ? true : false;
  if (!reEnable && !confirm("Opt this lead out of marketing emails? They'll be excluded from every campaign and automation send going forward.")) return;
  const { error } = await window.sb.from("quote_requests")
    .update({ consent_marketing: consent, consent_recorded_at: new Date().toISOString() }).eq("id", id);
  if (error) { showToast("Couldn't update: " + friendlyDbError(error)); return; }
  const lead = _crm.leads.find(x => x.id === id);
  if (lead) lead.consent_marketing = consent;
  showToast(consent ? "Re-enabled marketing emails." : "Opted out of marketing emails.");
  openCrmDrawer(id);
}

async function submitCrmActivity(id) {
  if (blockIfCrmReadOnly()) return;
  const typeEl = document.getElementById("crmActivityType");
  const bodyEl = document.getElementById("crmActivityBody");
  const body = (bodyEl?.value || "").trim();
  if (!body) return;
  await logCrmActivity(id, typeEl?.value || "note", body);
  bodyEl.value = "";
  openCrmDrawer(id); // re-render the thread with the new entry
}

async function deleteCrmActivity(activityId, leadId) {
  if (blockIfCrmReadOnly()) return;
  if (!confirm("Delete this activity entry? This cannot be undone.")) return;
  const { error } = await window.sb.from("crm_activity_log").delete().eq("id", activityId);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  showToast("Activity entry deleted.");
  openCrmDrawer(leadId); // re-render the thread without it
}

/* ── CRM CSV import/export ─────────────────────────────────────
   Reuses parseCsvRows()/stripBom() (admin.js, built for the product CSV
   importer) for the tokenizer -- the header/column mapping here is
   lead-specific, so it's not routed through the product-only parseCsv(). */

function crmCsvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCrmLeadsCsv() {
  const leads = _crm.leads || [];
  if (!leads.length) { showToast("No leads to export."); return; }

  const headers = ["business_name","contact_name","email","phone_number","customer_type","lead_source","status","tags","notes","created_at"];
  const lines = [headers.join(",")];
  leads.forEach(l => {
    lines.push(headers.map(h => {
      if (h === "tags") return crmCsvCell((l.tags || []).join(";"));
      return crmCsvCell(l[h] ?? "");
    }).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rrs-leads-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseCrmCsv(text) {
  const rawRows = parseCsvRows(stripBom(text));
  if (rawRows.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = rawRows[0].map(h => h.trim().toLowerCase());
  // Only email or business_name is required -- a lead can arrive with just
  // a company name and no email yet (e.g. a trade-show business-card
  // batch), matching how a lead can already be created manually in the UI
  // with either field blank.
  const rows = [];
  const skipped = [];
  for (let i = 1; i < rawRows.length; i++) {
    const vals = rawRows[i];
    if (vals.length === 1 && vals[0].trim() === "") continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] ?? "").trim(); });
    if (!obj.email && !obj.business_name && !obj.contact_name) { skipped.push(i + 1); continue; }
    rows.push(obj);
  }
  rows.skipped = skipped;
  return rows;
}

let _crmImportRows = [];

function openCrmImportModal() {
  _crmImportRows = [];
  document.getElementById("crmImportFile").value = "";
  document.getElementById("crmImportPreview").innerHTML = "";
  document.getElementById("crmImportSummary").style.display = "none";
  document.getElementById("crmImportSaveBtn").disabled = true;
  openModal("crmImportModal");
}

function handleCrmImportFile(file) {
  if (!file) return;
  const label = document.getElementById("crmFilePickerText");
  if (label) label.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    let rows;
    try {
      rows = parseCrmCsv(String(reader.result));
    } catch (e) {
      document.getElementById("crmImportPreview").innerHTML = `<p class="crm-formerror">${escHtml(e.message)}</p>`;
      return;
    }
    _crmImportRows = rows;
    const skippedNote = rows.skipped?.length
      ? `<p class="crm-import-skipped">Skipped ${rows.skipped.length} row${rows.skipped.length===1?"":"s"} with no email, business name, or contact name (line${rows.skipped.length===1?"":"s"} ${rows.skipped.join(", ")}).</p>`
      : "";
    document.getElementById("crmImportPreview").innerHTML = `
      <div class="crm-import-tablewrap">
        <table class="crm-import-table">
          <thead><tr>
            <th>Business</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Source</th>
          </tr></thead>
          <tbody>
            ${rows.slice(0, 5).map(r => `<tr>
              <td>${escHtml(r.business_name || "—")}</td>
              <td>${escHtml(r.contact_name || "—")}</td>
              <td>${escHtml(r.email || "—")}</td>
              <td>${escHtml(r.lead_source || "—")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${rows.length > 5 ? `<p class="crm-import-more">…and ${rows.length - 5} more.</p>` : ""}
      ${skippedNote}
    `;
    const summary = document.getElementById("crmImportSummary");
    summary.textContent = `${rows.length} lead${rows.length === 1 ? "" : "s"} ready to import.`;
    summary.style.display = rows.length ? "block" : "none";
    document.getElementById("crmImportSaveBtn").disabled = !rows.length;
  };
  reader.readAsText(file);
}

async function saveCrmImport() {
  if (blockIfCrmReadOnly()) return;
  if (!_crmImportRows.length) return;
  const btn = document.getElementById("crmImportSaveBtn");
  btn.disabled = true; btn.textContent = "Importing…";

  const payload = _crmImportRows.map(r => ({
    business_name: r.business_name || null,
    contact_name: r.contact_name || null,
    email: r.email || null,
    phone_number: r.phone_number || r.phone || null,
    customer_type: r.customer_type || null,
    lead_source: r.lead_source || "Other",
    status: CRM_STATUS_LABEL[r.status] ? r.status : "new",
    tags: r.tags ? r.tags.split(";").map(t => t.trim()).filter(Boolean) : [],
    notes: r.notes || null,
  }));

  const { error, data } = await window.sb.from("quote_requests").insert(payload).select("id");
  btn.disabled = false; btn.textContent = "Import Leads";
  if (error) { showToast("Import failed: " + error.message); return; }

  closeModal("crmImportModal");
  showToast(`Imported ${data.length} lead${data.length === 1 ? "" : "s"}.`);
  renderCrmTab();
}

/* ── Campaigns (Marketing Account, Phase 2/3) ─────────────────
   Campaign tracking + content calendar + email template library + segmented
   one-off email sends. Reuses the exact board/drawer shell as CRM/Dev
   Tickets. True automated drip funnels are NOT built here -- that needs a
   scheduled trigger system, a separate and meaningfully bigger piece of
   work; this covers planning, scheduling, and manual sends. */

const CAMP_STATUS = [
  { key:"draft",     label:"Draft" },
  { key:"scheduled", label:"Scheduled" },
  { key:"active",    label:"Active" },
  { key:"completed", label:"Completed" },
  { key:"archived",  label:"Archived" },
];
const CAMP_STATUS_LABEL = Object.fromEntries(CAMP_STATUS.map(s => [s.key, s.label]));
const CAMP_TYPES = [
  { key:"email",         label:"Email" },
  { key:"social",        label:"Social" },
  { key:"landing_page",  label:"Landing Page" },
  { key:"product_promo", label:"Product Promo" },
  { key:"other",         label:"Other" },
];
const CAMP_CONTENT_TYPES = [
  { key:"email",       label:"Email" },
  { key:"social_post", label:"Social Post" },
  { key:"other",       label:"Other" },
];

const _camp = { campaigns: [], filters: { status: "all", q: "" } };

async function renderCampaignsTab() {
  const panel = document.getElementById("tab-campaigns");
  if (!panel) return;
  panel.innerHTML = `<div class="a-empty" style="padding:50px">Loading campaigns…</div>`;

  const { data, error } = await window.sb.from("campaigns").select("*").order("created_at", { ascending:false });
  if (error) {
    panel.innerHTML = `<div class="a-empty" style="padding:50px">Couldn't load campaigns: ${escHtml(error.message)}<br><span style="font-size:12px;color:#94a3b8">If this says a table is missing, run the 20260829_marketing_campaigns.sql migration.</span></div>`;
    return;
  }
  _camp.campaigns = data || [];

  panel.innerHTML = `
   <div class="camp-page">
    ${isCrmCampaignsReadOnly() ? `<div class="crm-readonly-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      View only — only Marketing accounts can make changes here.
    </div>` : ""}
    <div class="camp-header">
      <div>
        <h1 class="camp-title">Campaigns</h1>
        <p class="camp-subtitle">Plan, schedule, and send marketing campaigns — linked to real products and promotions.</p>
      </div>
      <div class="camp-header-actions">
        <button class="camp-btn camp-btn-ghost" onclick="openAutomationsModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg>
          Automations
        </button>
        <button class="camp-btn camp-btn-ghost" onclick="openEmailTemplatesModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
          Email Templates
        </button>
        <button class="camp-btn camp-btn-primary" onclick="createNewCampaign()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
          New Campaign
        </button>
      </div>
    </div>

    <div id="campDeliverability"></div>

    <div class="camp-statstrip" id="campStats"></div>

    <div class="camp-filterbar">
      <div class="camp-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="campSearch" type="text" placeholder="Search campaigns…" value="${escHtml(_camp.filters.q)}" oninput="setCampFilter('q', this.value)">
      </div>
    </div>

    <div id="campBoardWrap"></div>
   </div>
  `;

  renderCampStats();
  renderCampBoard();
  renderCampDeliverability();
}

// Site-wide deliverability health, across EVERY send in the last 30 days
// (campaigns + automations together, not per-campaign) -- a reputation
// problem shows up as a rising bounce/complaint rate across the whole
// sending domain before it's visible on any single campaign's own
// metrics tile. Same campaign_email_events table renderCampMetrics
// already reads, just aggregated without a campaign_id filter.
async function renderCampDeliverability() {
  const el = document.getElementById("campDeliverability");
  if (!el) return;

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: events, error } = await window.sb
    .from("campaign_email_events").select("event_type, recipient").gte("occurred_at", since);
  if (error || !events || !events.length) { el.innerHTML = ""; return; }

  const distinctBy = type => new Set(events.filter(e => e.event_type === type).map(e => e.recipient)).size;
  const sent = distinctBy("sent") || new Set(events.map(e => e.recipient)).size;
  if (!sent) { el.innerHTML = ""; return; }

  const bounced = distinctBy("bounced");
  const complained = distinctBy("complained");
  const unsubscribed = distinctBy("unsubscribed");
  const bounceRate = (bounced / sent) * 100;
  const complaintRate = (complained / sent) * 100;

  // Thresholds from Gmail/Yahoo's own bulk-sender guidance: keep bounce
  // rate under 10% and spam-complaint rate under 0.3% (0.1% is their
  // "good" bar) to avoid inbox-placement penalties.
  const bounceWarn = bounceRate >= 10;
  const complaintWarn = complaintRate >= 0.3;
  const healthy = !bounceWarn && !complaintWarn;

  el.innerHTML = `
    <div class="camp-deliverability ${healthy ? "is-healthy" : "is-warn"}">
      <div class="camp-dh-head">
        <span class="camp-dh-title">${healthy ? "Deliverability looks healthy" : "Deliverability needs attention"}</span>
        <span class="camp-dh-window">Last 30 days, all sends</span>
      </div>
      <div class="camp-dh-stats">
        <div class="camp-dh-stat"><span class="camp-dh-n">${sent}</span><span class="camp-dh-l">Sent</span></div>
        <div class="camp-dh-stat${bounceWarn ? " is-bad" : ""}"><span class="camp-dh-n">${bounceRate.toFixed(1)}%</span><span class="camp-dh-l">Bounce rate</span></div>
        <div class="camp-dh-stat${complaintWarn ? " is-bad" : ""}"><span class="camp-dh-n">${complaintRate.toFixed(2)}%</span><span class="camp-dh-l">Complaint rate</span></div>
        <div class="camp-dh-stat"><span class="camp-dh-n">${unsubscribed}</span><span class="camp-dh-l">Unsubscribed</span></div>
      </div>
      ${healthy ? "" : `<p class="camp-dh-hint">${bounceWarn ? "Bounce rate is above the 10% threshold Gmail/Yahoo flag for bulk senders. " : ""}${complaintWarn ? "Spam-complaint rate is above 0.3% -- this is the strongest signal inbox providers use to junk future mail. " : ""}Consider pausing sends to this segment until it's cleaned up.</p>`}
    </div>`;
}

function renderCampStats() {
  const el = document.getElementById("campStats");
  if (!el) return;
  el.innerHTML = CAMP_STATUS.map(col => {
    const n = _camp.campaigns.filter(c => c.status === col.key).length;
    return `<div class="camp-stat camp-stat-${col.key}"><span class="camp-stat-n">${n}</span><span class="camp-stat-l">${escHtml(col.label)}</span></div>`;
  }).join("");
}

function setCampFilter(key, value) {
  _camp.filters[key] = value;
  renderCampBoard();
}

function campVisible() {
  const q = _camp.filters.q.trim().toLowerCase();
  if (!q) return _camp.campaigns;
  return _camp.campaigns.filter(c => (c.name || "").toLowerCase().includes(q));
}

function renderCampBoard() {
  const wrap = document.getElementById("campBoardWrap");
  if (!wrap) return;
  const visible = campVisible();

  if (!_camp.campaigns.length) {
    wrap.innerHTML = `<div class="camp-empty">
      <div class="camp-empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>
      </div>
      <h3>No campaigns yet</h3>
      <p>Create your first campaign to start planning and tracking marketing activity.</p>
      <button class="camp-btn camp-btn-primary" onclick="createNewCampaign()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        New Campaign
      </button>
    </div>`;
    return;
  }

  wrap.innerHTML = `<div class="camp-board">${CAMP_STATUS.map(col => {
    const items = visible.filter(c => c.status === col.key);
    return `
      <section class="camp-col" data-status="${col.key}"
        ondragover="campDragOver(event)" ondragleave="campDragLeave(event)" ondrop="campDrop(event,'${col.key}')">
        <header class="camp-col-head">
          <span class="camp-col-title">${escHtml(col.label)}</span>
          <span class="camp-col-count">${items.length}</span>
        </header>
        <div class="camp-col-body">
          ${items.map(campCard).join("") || `<div class="camp-col-empty">Nothing here</div>`}
        </div>
      </section>`;
  }).join("")}</div>`;
}

const CAMP_TYPE_ICON = {
  email:         `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  social:        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9"/></svg>`,
  landing_page:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  product_promo: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.6 12.9 12.9 20.6a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1 0-2.8l7.7-7.7a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.4 1.3Z"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  other:         `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/></svg>`,
};

function campCard(c) {
  const type = CAMP_TYPES.find(t => t.key === c.campaign_type) || CAMP_TYPES[0];
  const dateRange = [c.start_date, c.end_date].filter(Boolean).map(d => new Date(d + "T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})).join(" – ");
  return `
    <article class="camp-card" data-status="${c.status}" draggable="true"
      ondragstart="campDragStart(event,'${c.id}')" ondragend="campDragEnd(event)"
      onclick="openCampDrawer('${c.id}')">
      <div class="camp-card-top">
        <span class="camp-type-chip">${CAMP_TYPE_ICON[c.campaign_type] || CAMP_TYPE_ICON.other}${escHtml(type.label)}</span>
        ${c.emails_sent ? `<span class="camp-sent-chip">${c.emails_sent} sent</span>` : ""}
      </div>
      <p class="camp-card-title">${escHtml(c.name)}</p>
      ${c.audience_segment ? `<p class="camp-card-sub">${escHtml(c.audience_segment)}</p>` : ""}
      <div class="camp-card-foot">
        <span class="camp-date-chip">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>
          ${dateRange ? escHtml(dateRange) : "No dates set"}
        </span>
      </div>
    </article>`;
}

let _campDragId = null;
function campDragStart(e, id) { _campDragId = id; e.dataTransfer.effectAllowed = "move"; e.currentTarget.classList.add("dragging"); }
function campDragEnd(e)       { _campDragId = null; e.currentTarget.classList.remove("dragging"); document.querySelectorAll(".camp-col.over").forEach(c => c.classList.remove("over")); }
function campDragOver(e)      { e.preventDefault(); e.currentTarget.classList.add("over"); }
function campDragLeave(e)     { e.currentTarget.classList.remove("over"); }
async function campDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove("over");
  if (!_campDragId) return;
  const id = _campDragId; _campDragId = null;
  await setCampField(id, "status", status);
  renderCampStats();
  renderCampBoard();
}

async function createNewCampaign() {
  if (blockIfCrmReadOnly()) return;
  const { data, error } = await window.sb.from("campaigns").insert({ name: "Untitled Campaign", campaign_type: "email", status: "draft" }).select().single();
  if (error) { showToast("Couldn't create campaign: " + friendlyDbError(error)); return; }
  _camp.campaigns.unshift(data);
  renderCampStats();
  renderCampBoard();
  openCampDrawer(data.id);
}

async function setCampField(id, field, value) {
  if (blockIfCrmReadOnly()) return;
  const c = _camp.campaigns.find(x => x.id === id);
  const { error } = await window.sb.from("campaigns").update({ [field]: value }).eq("id", id);
  if (error) { showToast("Couldn't update: " + friendlyDbError(error)); return; }
  if (c) c[field] = value;
}

/* ── Campaign detail drawer ───────────────────────────────────── */

async function openCampDrawer(id) {
  const overlay = document.getElementById("campDrawerOverlay");
  const body    = document.getElementById("campDrawerBody");
  overlay.style.display = "flex";
  requestAnimationFrame(() => overlay.classList.add("open"));

  const c = _camp.campaigns.find(x => x.id === id);
  if (!c) { body.innerHTML = `<div class="a-empty" style="padding:60px">Campaign not found.</div>`; return; }

  const [{ data: content }, { data: products }, { data: deals }, { data: templates }] = await Promise.all([
    window.sb.from("campaign_content").select("*").eq("campaign_id", id).order("scheduled_date"),
    window.sb.from("products").select("sku,name").eq("is_active", true).order("name").limit(500),
    window.sb.from("best_deals").select("id,hook_title").eq("is_active", true),
    window.sb.from("email_templates").select("id,name,subject,body_html").order("name"),
  ]);
  _camp._products = products || [];
  _camp._deals = deals || [];
  _camp._templates = templates || [];

  body.innerHTML = `
   <div class="camp-dr">
    <header class="camp-dr-head">
      <div class="camp-dr-headtop">
        <span class="camp-dr-eyebrow">Campaign</span>
        <div class="camp-dr-headbtns">
          <button class="camp-iconbtn camp-iconbtn-danger" title="Delete campaign" onclick="deleteCampaign('${c.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
          <button class="camp-iconbtn" title="Close" onclick="closeCampDrawer(true)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <input id="campNameInput" class="camp-dr-nameinput" value="${escHtml(c.name)}" onchange="setCampField('${c.id}','name',this.value); document.getElementById('campNameHeading').textContent=this.value;"
        id="campNameHeading">
      <div class="camp-dr-badges">
        <span class="camp-status-pill camp-status-${c.status}">${escHtml(CAMP_STATUS_LABEL[c.status] || c.status)}</span>
      </div>
    </header>

    <div class="camp-dr-controls">
      <label class="camp-field">
        <span class="camp-field-label">Status</span>
        <select class="camp-select" onchange="setCampField('${c.id}','status',this.value); renderCampStats(); renderCampBoard();">
          ${CAMP_STATUS.map(s => `<option value="${s.key}"${c.status===s.key?" selected":""}>${escHtml(s.label)}</option>`).join("")}
        </select>
      </label>
      <label class="camp-field">
        <span class="camp-field-label">Type</span>
        <select class="camp-select" onchange="setCampField('${c.id}','campaign_type',this.value)">
          ${CAMP_TYPES.map(t => `<option value="${t.key}"${c.campaign_type===t.key?" selected":""}>${escHtml(t.label)}</option>`).join("")}
        </select>
      </label>
      <label class="camp-field">
        <span class="camp-field-label">Start Date</span>
        <input class="camp-input" type="date" value="${c.start_date || ""}" onchange="setCampField('${c.id}','start_date',this.value || null); renderCampBoard();">
      </label>
      <label class="camp-field">
        <span class="camp-field-label">End Date</span>
        <input class="camp-input" type="date" value="${c.end_date || ""}" onchange="setCampField('${c.id}','end_date',this.value || null); renderCampBoard();">
      </label>
    </div>

    <div class="camp-dr-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg></span>Audience Segment</h4>
      <p class="camp-dr-hint">Who this campaign targets — used to build the live recipient list when you send an email below. Leave a filter blank to not narrow by it.</p>
      <div class="camp-fieldgrid">
        <label class="camp-field">
          <span class="camp-field-label">Customer Type</span>
          <select class="camp-select" id="segCustomerType-${c.id}" onchange="setCampField('${c.id}','segment_customer_type',this.value || null); updateRecipientPreview('${c.id}')">
            <option value=""${!c.segment_customer_type?" selected":""}>Any</option>
            ${["Hotel","Motel","Short-Term Rental","Cleaning Company","Restaurant","Campground","RV Park","Facility Manager","Property Manager","Apartment Complex","Student Housing","Senior Living","Other"].map(t => `<option value="${escHtml(t)}"${c.segment_customer_type===t?" selected":""}>${escHtml(t)}</option>`).join("")}
          </select>
        </label>
        <label class="camp-field">
          <span class="camp-field-label">Lead Stage</span>
          <select class="camp-select" id="segLeadStatus-${c.id}" onchange="setCampField('${c.id}','segment_lead_status',this.value || null); updateRecipientPreview('${c.id}')">
            <option value=""${!c.segment_lead_status?" selected":""}>Any</option>
            ${CRM_STATUS.map(s => `<option value="${s.key}"${c.segment_lead_status===s.key?" selected":""}>${escHtml(s.label)}</option>`).join("")}
          </select>
        </label>
        <label class="camp-field">
          <span class="camp-field-label">Lead Source</span>
          <select class="camp-select" id="segLeadSource-${c.id}" onchange="setCampField('${c.id}','segment_lead_source',this.value || null); updateRecipientPreview('${c.id}')">
            <option value=""${!c.segment_lead_source?" selected":""}>Any</option>
            ${CRM_SOURCES.map(s => `<option value="${escHtml(s)}"${c.segment_lead_source===s?" selected":""}>${escHtml(s)}</option>`).join("")}
          </select>
        </label>
        <label class="camp-field">
          <span class="camp-field-label">Tag</span>
          <input class="camp-input" id="segTag-${c.id}" list="crmTagOptions" value="${escHtml(c.segment_tag || "")}" placeholder="Any"
            onchange="setCampField('${c.id}','segment_tag',this.value.trim() || null); updateRecipientPreview('${c.id}')">
          <datalist id="crmTagOptions">${[...new Set((_crm.leads || []).flatMap(l => l.tags || []))].map(t => `<option value="${escHtml(t)}">`).join("")}</datalist>
        </label>
      </div>
      <div class="camp-field" style="margin-top:12px">
        <span class="camp-field-label">Note <span class="camp-field-hint">shown on the card</span></span>
        <input class="camp-input" value="${escHtml(c.audience_segment || "")}" placeholder="e.g. Hotels, New Leads, from Trade Show"
          onchange="setCampField('${c.id}','audience_segment',this.value || null); renderCampBoard();">
      </div>
      <span id="recipientPreview-${c.id}" class="camp-recipient-pill is-loading">Calculating…</span>
    </div>

    <div class="camp-dr-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24L4 3a1 1 0 00-1 1l.24 5.59a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.82 0l4.36-4.36a2 2 0 000-2.81z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg></span>Linked Product / Promotion</h4>
      <div class="camp-fieldgrid">
        <label class="camp-field">
          <span class="camp-field-label">Product</span>
          <select class="camp-select" onchange="setCampField('${c.id}','linked_product_sku',this.value || null)">
            <option value="">None</option>
            ${_camp._products.map(p => `<option value="${escHtml(p.sku)}"${c.linked_product_sku===p.sku?" selected":""}>${escHtml(p.name)}</option>`).join("")}
          </select>
        </label>
        <label class="camp-field">
          <span class="camp-field-label">Best Deal</span>
          <select class="camp-select" onchange="setCampField('${c.id}','linked_best_deal_id',this.value || null)">
            <option value="">None</option>
            ${_camp._deals.map(d => `<option value="${d.id}"${c.linked_best_deal_id===d.id?" selected":""}>${escHtml(d.hook_title)}</option>`).join("")}
          </select>
        </label>
        <label class="camp-field">
          <span class="camp-field-label">Mix &amp; Match Group</span>
          <input class="camp-input" value="${escHtml(c.linked_moq_group || "")}" placeholder="e.g. 5GAL-CHEMICALS" onchange="setCampField('${c.id}','linked_moq_group',this.value || null)">
        </label>
      </div>
    </div>

    <div class="camp-dr-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg></span>Content Calendar</h4>
      <div id="campContentList-${c.id}">${renderCampContentListHtml(content || [])}</div>
      <div class="camp-cc-add">
        <input type="date" id="ccDate-${c.id}" class="camp-input">
        <select id="ccType-${c.id}" class="camp-select">
          ${CAMP_CONTENT_TYPES.map(t => `<option value="${t.key}">${escHtml(t.label)}</option>`).join("")}
        </select>
        <input type="text" id="ccTitle-${c.id}" class="camp-input" placeholder="What's scheduled…" onkeydown="if(event.key==='Enter'){event.preventDefault();addCampContentItem('${c.id}');}">
        <button class="camp-btn camp-btn-primary" onclick="addCampContentItem('${c.id}')">Add</button>
      </div>
    </div>

    <div class="camp-dr-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2v6L4.5 17a2 2 0 001.8 3h11.4a2 2 0 001.8-3L15 8V2M9 2h6M8 15h8"/></svg></span>A/B Testing &amp; Notes</h4>
      <textarea class="camp-input camp-textarea" rows="3" placeholder="Subject lines tried, offers tested, what won…" onchange="setCampField('${c.id}','notes',this.value || null)">${escHtml(c.notes || "")}</textarea>
    </div>

    <div class="camp-dr-section camp-send-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon camp-dr-h4-icon-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span>Send Campaign Email</h4>
      <div class="camp-field">
        <span class="camp-field-label">Template</span>
        <select class="camp-select" id="sendTplSelect-${c.id}" onchange="onSendTemplateChange('${c.id}')">
          <option value="">— Write inline —</option>
          ${_camp._templates.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join("")}
        </select>
      </div>
      <div class="camp-field">
        <span class="camp-field-label">Subject</span>
        <input class="camp-input" id="sendSubject-${c.id}" placeholder="Subject line">
      </div>
      <div class="camp-field">
        <span class="camp-field-label">Body (HTML)</span>
        <textarea class="camp-input camp-textarea camp-mono" id="sendBody-${c.id}" rows="6" placeholder="<p>Hi there,</p>..."></textarea>
      </div>
      <div class="camp-testrow">
        <input type="email" class="camp-input" id="testEmailInput-${c.id}" placeholder="you@roomreadysupply.com">
        <button class="camp-btn camp-btn-ghost" onclick="sendCampaignTestEmail('${c.id}')" id="testCampBtn-${c.id}">Send Test</button>
      </div>
      <p id="sendError-${c.id}" class="camp-formerror" style="display:none"></p>
      <div class="camp-sendrow">
        <button class="camp-btn camp-btn-primary camp-btn-lg" onclick="sendCampaignEmail('${c.id}')" id="sendCampBtn-${c.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Send to Segment Now
        </button>
        <button class="camp-btn camp-btn-ghost" onclick="openScheduleSendModal('${c.id}')" id="scheduleCampBtn-${c.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>
          Schedule for Later
        </button>
      </div>
      <div id="scheduledSendStatus-${c.id}" style="margin-top:10px"></div>
      ${c.emails_sent ? `<p class="camp-dr-hint" style="margin-top:10px">Last sent ${fmt(c.last_sent_at)} — ${c.emails_sent} email${c.emails_sent===1?"":"s"} total.</p>` : ""}
    </div>

    <div class="camp-dr-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></span>Email Performance</h4>
      <div id="campMetrics-${c.id}"><p class="camp-dr-hint">Loading…</p></div>
    </div>

    <div class="camp-dr-facts">
      <span>Created</span><strong>${fmt(c.created_at)}</strong>
    </div>
   </div>
  `;
  renderCampMetrics(c.id);
  renderScheduledSendStatus(c.id);
  updateRecipientPreview(id);
}

function closeCampDrawer(force) {
  if (force !== true && force && force.target && force.target.id !== "campDrawerOverlay") return;
  const overlay = document.getElementById("campDrawerOverlay");
  overlay.classList.remove("open");
  setTimeout(() => { overlay.style.display = "none"; }, 180);
  renderCampBoard();
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("campDrawerOverlay")?.style.display === "flex") closeCampDrawer(true);
});

async function deleteCampaign(id) {
  if (blockIfCrmReadOnly()) return;
  if (!confirm("Delete this campaign? Its content calendar entries go with it.")) return;
  const { error } = await window.sb.from("campaigns").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  _camp.campaigns = _camp.campaigns.filter(c => c.id !== id);
  closeCampDrawer(true);
  renderCampStats();
  renderCampBoard();
  showToast("Campaign deleted.");
}

/* ── Content calendar ─────────────────────────────────────────── */

function renderCampContentListHtml(items) {
  if (!items.length) return `<p class="camp-dr-hint" style="margin:0 0 10px">Nothing scheduled yet.</p>`;
  return `<div class="camp-cc-list">${items.map(i => `
    <div class="camp-cc-row">
      <span class="camp-cc-date">${new Date(i.scheduled_date + "T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
      <span class="camp-cc-type camp-cc-type-${i.content_type}">${escHtml((CAMP_CONTENT_TYPES.find(t=>t.key===i.content_type)||{}).label || i.content_type)}</span>
      <span class="camp-cc-title">${escHtml(i.title)}</span>
      <button class="camp-cc-remove" onclick="deleteCampContentItem('${i.campaign_id}','${i.id}')" title="Remove">&times;</button>
    </div>`).join("")}</div>`;
}

async function addCampContentItem(campaignId) {
  if (blockIfCrmReadOnly()) return;
  const date = document.getElementById("ccDate-" + campaignId).value;
  const type = document.getElementById("ccType-" + campaignId).value;
  const title = document.getElementById("ccTitle-" + campaignId).value.trim();
  if (!date || !title) { showToast("Pick a date and enter what's scheduled."); return; }

  const { data, error } = await window.sb.from("campaign_content").insert({
    campaign_id: campaignId, scheduled_date: date, content_type: type, title,
  }).select().single();
  if (error) { showToast("Couldn't add: " + friendlyDbError(error)); return; }

  const { data: content } = await window.sb.from("campaign_content").select("*").eq("campaign_id", campaignId).order("scheduled_date");
  document.getElementById("campContentList-" + campaignId).innerHTML = renderCampContentListHtml(content || []);
  document.getElementById("ccTitle-" + campaignId).value = "";
}

async function deleteCampContentItem(campaignId, itemId) {
  if (blockIfCrmReadOnly()) return;
  const { error } = await window.sb.from("campaign_content").delete().eq("id", itemId);
  if (error) { showToast("Couldn't remove: " + friendlyDbError(error)); return; }
  const { data: content } = await window.sb.from("campaign_content").select("*").eq("campaign_id", campaignId).order("scheduled_date");
  document.getElementById("campContentList-" + campaignId).innerHTML = renderCampContentListHtml(content || []);
}

/* ── Segmented recipient list + send ──────────────────────────── */

// Builds the live recipient list from quote_requests (the same table CRM
// leads live in -- see 20260828_marketing_crm.sql) using whichever of the
// three segment filters are set. Distinct emails only -- a lead can have
// multiple quote_requests rows over time.
async function computeSegmentRecipients(c) {
  let q = window.sb.from("quote_requests").select("email")
    .not("email", "is", null)
    .neq("consent_marketing", false); // opted-out leads never enter any recipient list, regardless of segment match
  if (c.segment_customer_type) q = q.eq("customer_type", c.segment_customer_type);
  if (c.segment_lead_status)   q = q.eq("status", c.segment_lead_status);
  if (c.segment_lead_source)   q = q.eq("lead_source", c.segment_lead_source);
  if (c.segment_tag)           q = q.contains("tags", [c.segment_tag]);
  const { data, error } = await q;
  if (error) return { emails: [], error };
  const emails = [...new Set((data || []).map(r => (r.email || "").trim().toLowerCase()).filter(Boolean))];
  return { emails, error: null };
}

const _campPersonIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

async function updateRecipientPreview(campaignId) {
  const el = document.getElementById("recipientPreview-" + campaignId);
  if (!el) return;
  el.className = "camp-recipient-pill is-loading";
  el.textContent = "Calculating recipients…";
  const c = _camp.campaigns.find(x => x.id === campaignId);
  if (!c) return;
  const { emails, error } = await computeSegmentRecipients(c);
  if (error) {
    el.className = "camp-recipient-pill is-empty";
    el.textContent = "Couldn't calculate: " + error.message;
    return;
  }
  el.className = "camp-recipient-pill" + (emails.length ? "" : " is-empty");
  el.innerHTML = `${_campPersonIcon} ${emails.length} recipient${emails.length===1?"":"s"} match this segment right now.`;
}

function onSendTemplateChange(campaignId) {
  const tplId = document.getElementById("sendTplSelect-" + campaignId).value;
  const tpl = _camp._templates.find(t => t.id === tplId);
  document.getElementById("sendSubject-" + campaignId).value = tpl ? tpl.subject : "";
  document.getElementById("sendBody-" + campaignId).value = tpl ? tpl.body_html : "";
}

// Real delivery/open/click/bounce numbers, fed by Resend's webhook
// (api/stripe-webhook.js's handleResendWebhook writes campaign_email_events)
// -- distinct counts of recipients per event type, not raw row counts, so
// three opens from the same person still reads as "1 opened".
async function renderCampMetrics(campaignId) {
  const el = document.getElementById(`campMetrics-${campaignId}`);
  if (!el) return;

  const { data: events, error } = await window.sb
    .from("campaign_email_events").select("event_type, recipient").eq("campaign_id", campaignId);
  if (error) { el.innerHTML = `<p class="camp-dr-hint">Couldn't load: ${escHtml(error.message)}</p>`; return; }
  if (!events || !events.length) { el.innerHTML = `<p class="camp-dr-hint">No email activity yet.</p>`; return; }

  const distinctBy = type => new Set(events.filter(e => e.event_type === type).map(e => e.recipient)).size;
  const sent = distinctBy("sent") || new Set(events.map(e => e.recipient)).size;
  const stats = [
    { label: "Delivered",    n: distinctBy("delivered") },
    { label: "Opened",       n: distinctBy("opened") },
    { label: "Clicked",      n: distinctBy("clicked") },
    { label: "Bounced",      n: distinctBy("bounced") },
    { label: "Complained",   n: distinctBy("complained"), warn: true },
    { label: "Unsubscribed", n: distinctBy("unsubscribed") },
  ];

  el.innerHTML = `<div class="camp-metrics-grid">
    ${stats.map(s => `
      <div class="camp-metric-tile${s.warn && s.n > 0 ? " camp-metric-tile-warn" : ""}">
        <div class="camp-metric-n">${s.n}</div>
        <div class="camp-metric-l">${s.label}</div>
        <div class="camp-metric-pct">${sent ? Math.round((s.n / sent) * 100) : 0}%</div>
      </div>`).join("")}
  </div>`;
}

async function sendCampaignEmail(campaignId) {
  if (blockIfCrmReadOnly()) return;
  const errEl = document.getElementById("sendError-" + campaignId);
  errEl.style.display = "none";
  const c = _camp.campaigns.find(x => x.id === campaignId);
  if (!c) return;
  const subject = document.getElementById("sendSubject-" + campaignId).value.trim();
  const body_html = document.getElementById("sendBody-" + campaignId).value.trim();
  if (!subject || !body_html) { errEl.textContent = "Subject and body are required."; errEl.style.display = "block"; return; }

  const { emails, error: segErr } = await computeSegmentRecipients(c);
  if (segErr) { errEl.textContent = "Couldn't calculate recipients: " + segErr.message; errEl.style.display = "block"; return; }
  if (!emails.length) { errEl.textContent = "No recipients match this segment right now."; errEl.style.display = "block"; return; }
  if (!confirm(`Send this email to ${emails.length} recipient${emails.length===1?"":"s"}? This cannot be undone.`)) return;

  const btn = document.getElementById("sendCampBtn-" + campaignId);
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
      body: JSON.stringify({ action: "send_campaign", campaign_id: campaignId, subject, body_html, recipients: emails }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "Request failed");

    showToast(`Sent to ${out.sent} recipient${out.sent===1?"":"s"}${out.failed ? ` (${out.failed} failed)` : ""}.`);
    c.emails_sent = (c.emails_sent || 0) + out.sent;
    c.last_sent_at = new Date().toISOString();
    openCampDrawer(campaignId); // re-render with the updated send count
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = "block";
  } finally {
    btn.disabled = false; btn.textContent = "Send to Segment Now";
  }
}

// Sends the exact subject/body currently in the compose form to one
// address, bypassing segment targeting and campaign send-count tracking
// entirely -- a real preview in a real inbox before committing to the
// full segment, the "test email before sending" spec item.
async function sendCampaignTestEmail(campaignId) {
  if (blockIfCrmReadOnly()) return;
  const errEl = document.getElementById("sendError-" + campaignId);
  errEl.style.display = "none";
  const testEmail = document.getElementById("testEmailInput-" + campaignId).value.trim();
  const subject = document.getElementById("sendSubject-" + campaignId).value.trim();
  const body_html = document.getElementById("sendBody-" + campaignId).value.trim();
  if (!testEmail) { errEl.textContent = "Enter an email address to send the test to."; errEl.style.display = "block"; return; }
  if (!subject || !body_html) { errEl.textContent = "Subject and body are required."; errEl.style.display = "block"; return; }

  const btn = document.getElementById("testCampBtn-" + campaignId);
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
      body: JSON.stringify({ action: "send_campaign", subject: "[TEST] " + subject, body_html, recipients: [testEmail] }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || "Request failed");
    showToast(`Test sent to ${testEmail}.`);
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = "block";
  } finally {
    btn.disabled = false; btn.textContent = "Send Test";
  }
}

/* ── Scheduled ("send later") campaign sends ──────────────────────
   One pending row per campaign (enforced by a partial unique index),
   picked up and sent by the same daily cron sweep that already runs
   reorders and automations (api/create-order.js). */

async function openScheduleSendModal(campaignId) {
  const subject = document.getElementById("sendSubject-" + campaignId).value.trim();
  const body_html = document.getElementById("sendBody-" + campaignId).value.trim();
  if (!subject || !body_html) { showToast("Fill in the subject and body first."); return; }

  document.getElementById("schedSendCampId").value = campaignId;
  document.getElementById("schedSendSubject").value = subject;
  document.getElementById("schedSendBody").value = body_html;
  const tomorrow = new Date(Date.now() + 86400000);
  document.getElementById("schedSendAt").value = tomorrow.toISOString().slice(0, 16);
  openModal("scheduleSendModal");
}

async function confirmScheduleSend() {
  if (blockIfCrmReadOnly()) return;
  const campaignId = document.getElementById("schedSendCampId").value;
  const subject = document.getElementById("schedSendSubject").value.trim();
  const body_html = document.getElementById("schedSendBody").value.trim();
  const sendAtLocal = document.getElementById("schedSendAt").value;
  if (!sendAtLocal) { showToast("Pick a date and time."); return; }
  const sendAt = new Date(sendAtLocal);
  if (sendAt.getTime() <= Date.now()) { showToast("Pick a time in the future."); return; }

  const { data: { session } } = await window.sb.auth.getSession();
  // Replaces any existing pending scheduled send for this campaign
  // (the unique index only allows one) rather than stacking a second.
  await window.sb.from("campaign_scheduled_sends").delete().eq("campaign_id", campaignId).is("sent_at", null);
  const { error } = await window.sb.from("campaign_scheduled_sends").insert({
    campaign_id: campaignId, subject, body_html, send_at: sendAt.toISOString(),
    created_by: session?.user?.id || null,
  });
  if (error) { showToast("Couldn't schedule: " + friendlyDbError(error)); return; }

  closeModal("scheduleSendModal");
  showToast("Send scheduled.");
  renderScheduledSendStatus(campaignId);
}

async function renderScheduledSendStatus(campaignId) {
  const el = document.getElementById("scheduledSendStatus-" + campaignId);
  if (!el) return;
  const { data } = await window.sb.from("campaign_scheduled_sends")
    .select("*").eq("campaign_id", campaignId).is("sent_at", null).maybeSingle();
  if (!data) { el.innerHTML = ""; return; }
  el.innerHTML = `<span class="camp-recipient-pill camp-scheduled-pill">${_campPersonIcon} Scheduled to send ${fmt(data.send_at)}
    <button class="camp-pill-cancel" onclick="cancelScheduledSend('${data.id}','${campaignId}')">Cancel</button></span>`;
}

async function cancelScheduledSend(id, campaignId) {
  if (blockIfCrmReadOnly()) return;
  const { error } = await window.sb.from("campaign_scheduled_sends").delete().eq("id", id);
  if (error) { showToast("Couldn't cancel: " + friendlyDbError(error)); return; }
  showToast("Scheduled send cancelled.");
  renderScheduledSendStatus(campaignId);
}

/* ── Email template library ───────────────────────────────────── */

async function openEmailTemplatesModal() {
  resetTemplateForm();
  await renderEmailTemplateList();
  openModal("emailTemplatesModal");
}

async function renderEmailTemplateList() {
  const el = document.getElementById("emailTemplateList");
  const { data, error } = await window.sb.from("email_templates").select("*").order("name");
  if (error) { el.innerHTML = `<p class="camp-dr-hint">Couldn't load templates: ${escHtml(error.message)}</p>`; return; }
  el.innerHTML = (data && data.length) ? data.map(t => `
    <div class="camp-listrow">
      <div class="camp-listrow-body">
        <strong>${escHtml(t.name)}</strong>
        <span>${escHtml(t.subject)}</span>
      </div>
      <div class="camp-listrow-actions">
        <button class="camp-btn-sm" onclick='editEmailTemplate(${JSON.stringify(t).replace(/'/g, "&#39;")})'>Edit</button>
        <button class="camp-btn-sm camp-btn-sm-danger" onclick="deleteEmailTemplate('${t.id}')">Delete</button>
      </div>
    </div>`).join("") : `<p class="camp-listbox-empty">No templates yet — create one below.</p>`;
}

function resetTemplateForm() {
  document.getElementById("tplEditId").value = "";
  document.getElementById("tplName").value = "";
  document.getElementById("tplSubject").value = "";
  document.getElementById("tplBody").value = "";
  document.getElementById("tplFormTitle").textContent = "New Template";
  document.getElementById("tplCancelBtn").style.display = "none";
  document.getElementById("tplError").style.display = "none";
}

function editEmailTemplate(t) {
  document.getElementById("tplEditId").value = t.id;
  document.getElementById("tplName").value = t.name;
  document.getElementById("tplSubject").value = t.subject;
  document.getElementById("tplBody").value = t.body_html;
  document.getElementById("tplFormTitle").textContent = "Editing: " + t.name;
  document.getElementById("tplCancelBtn").style.display = "inline-block";
}

async function saveEmailTemplate() {
  if (blockIfCrmReadOnly()) return;
  const errEl = document.getElementById("tplError");
  errEl.style.display = "none";
  const id = document.getElementById("tplEditId").value;
  const name = document.getElementById("tplName").value.trim();
  const subject = document.getElementById("tplSubject").value.trim();
  const body_html = document.getElementById("tplBody").value.trim();
  if (!name || !subject || !body_html) { errEl.textContent = "Name, subject, and body are all required."; errEl.style.display = "block"; return; }

  const { data: { session } } = await window.sb.auth.getSession();
  const payload = { name, subject, body_html, created_by: session?.user?.id || null };
  const { error } = id
    ? await window.sb.from("email_templates").update(payload).eq("id", id)
    : await window.sb.from("email_templates").insert(payload);
  if (error) { errEl.textContent = friendlyDbError(error); errEl.style.display = "block"; return; }

  resetTemplateForm();
  await renderEmailTemplateList();
  showToast("Template saved.");
}

async function deleteEmailTemplate(id) {
  if (blockIfCrmReadOnly()) return;
  if (!confirm("Delete this template?")) return;
  const { error } = await window.sb.from("email_templates").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  await renderEmailTemplateList();
}

/* ── Automations (trigger -> delay -> email) ───────────────────
   A small, real slice of the "email funnel" spec review -- not a visual
   drag-and-drop builder. Evaluated by the same daily cron sweep that
   already runs reorders (api/create-order.js's runDueAutomations). */

const AUTO_TRIGGER_LABEL = {
  crm_lead_created: "New lead created",
  quote_stale: "Quote sent, no order yet",
  order_delivered: "Order marked delivered",
};

async function openAutomationsModal() {
  resetAutomationForm();
  await renderAutomationList();
  openModal("automationsModal");
}

async function renderAutomationList() {
  const el = document.getElementById("automationList");
  const { data, error } = await window.sb.from("automations").select("*").order("name");
  if (error) { el.innerHTML = `<p class="camp-dr-hint">Couldn't load: ${escHtml(error.message)}<br><span style="font-size:11px">If this says a table is missing, run the 20260901f migration.</span></p>`; return; }
  el.innerHTML = (data && data.length) ? data.map(a => `
    <div class="camp-listrow${a.is_active ? "" : " is-paused"}">
      <div class="camp-listrow-body">
        <strong>${escHtml(a.name)}</strong>
        <span>${escHtml(AUTO_TRIGGER_LABEL[a.trigger_type] || a.trigger_type)} &middot; ${a.delay_days} day${a.delay_days === 1 ? "" : "s"} delay${a.is_active ? "" : ` &middot; <span class="camp-paused-tag">Paused</span>`}</span>
      </div>
      <div class="camp-listrow-actions">
        <button class="camp-btn-sm" onclick='editAutomation(${JSON.stringify(a).replace(/'/g, "&#39;")})'>Edit</button>
        <button class="camp-btn-sm" onclick="toggleAutomationActive('${a.id}', ${!a.is_active})">${a.is_active ? "Pause" : "Resume"}</button>
        <button class="camp-btn-sm camp-btn-sm-danger" onclick="deleteAutomation('${a.id}')">Delete</button>
      </div>
    </div>`).join("") : `<p class="camp-listbox-empty">No automations yet — create one below.</p>`;
}

function toggleAutoStaleField() {
  const isStale = document.getElementById("autoTriggerType")?.value === "quote_stale";
  const wrap = document.getElementById("autoStaleWrap");
  if (wrap) wrap.style.display = isStale ? "" : "none";
}

function resetAutomationForm() {
  document.getElementById("autoEditId").value = "";
  document.getElementById("autoName").value = "";
  document.getElementById("autoTriggerType").value = "crm_lead_created";
  document.getElementById("autoStaleAfterDays").value = "5";
  document.getElementById("autoDelayDays").value = "0";
  document.getElementById("autoSubject").value = "";
  document.getElementById("autoBodyHtml").value = "";
  document.getElementById("autoFormTitle").textContent = "New Automation";
  document.getElementById("autoCancelBtn").style.display = "none";
  document.getElementById("autoError").style.display = "none";
  toggleAutoStaleField();
}

function editAutomation(a) {
  document.getElementById("autoEditId").value = a.id;
  document.getElementById("autoName").value = a.name;
  document.getElementById("autoTriggerType").value = a.trigger_type;
  document.getElementById("autoStaleAfterDays").value = a.stale_after_days || 5;
  document.getElementById("autoDelayDays").value = a.delay_days;
  document.getElementById("autoSubject").value = a.subject;
  document.getElementById("autoBodyHtml").value = a.body_html;
  document.getElementById("autoFormTitle").textContent = "Editing: " + a.name;
  document.getElementById("autoCancelBtn").style.display = "inline-block";
  toggleAutoStaleField();
}

async function saveAutomation() {
  if (blockIfCrmReadOnly()) return;
  const errEl = document.getElementById("autoError");
  errEl.style.display = "none";
  const id = document.getElementById("autoEditId").value;
  const name = document.getElementById("autoName").value.trim();
  const triggerType = document.getElementById("autoTriggerType").value;
  const subject = document.getElementById("autoSubject").value.trim();
  const body_html = document.getElementById("autoBodyHtml").value.trim();
  if (!name || !subject || !body_html) { errEl.textContent = "Name, subject, and body are all required."; errEl.style.display = "block"; return; }

  const { data: { session } } = await window.sb.auth.getSession();
  const payload = {
    name,
    trigger_type: triggerType,
    stale_after_days: triggerType === "quote_stale" ? (parseInt(document.getElementById("autoStaleAfterDays").value) || 5) : null,
    delay_days: parseInt(document.getElementById("autoDelayDays").value) || 0,
    subject, body_html,
    created_by: session?.user?.id || null,
  };
  const { error } = id
    ? await window.sb.from("automations").update(payload).eq("id", id)
    : await window.sb.from("automations").insert(payload);
  if (error) { errEl.textContent = friendlyDbError(error); errEl.style.display = "block"; return; }

  resetAutomationForm();
  await renderAutomationList();
  showToast("Automation saved.");
}

async function toggleAutomationActive(id, active) {
  if (blockIfCrmReadOnly()) return;
  const { error } = await window.sb.from("automations").update({ is_active: active }).eq("id", id);
  if (error) { showToast("Couldn't update: " + friendlyDbError(error)); return; }
  await renderAutomationList();
}

async function deleteAutomation(id) {
  if (blockIfCrmReadOnly()) return;
  if (!confirm("Delete this automation? Any queued-but-unsent emails for it will also be cancelled.")) return;
  const { error } = await window.sb.from("automations").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  await renderAutomationList();
}

/* ============================================================
   BLOG (SEO Roadmap Day 17) -- content infrastructure to close the
   single biggest structural SEO gap: zero backlink-attracting,
   long-tail-keyword-targeting content existed anywhere on the site.
   Real articles table (not the single-row site_content jsonb pattern
   Hero/About use -- wrong shape for many posts with drafts/publish
   dates/slugs). Reuses the camp-* visual system since Blog sits in the
   same Marketing nav group as Campaigns.
============================================================ */

const _blog = { articles: [] };

async function renderBlogTab() {
  const panel = document.getElementById("tab-blog");
  if (!panel) return;
  panel.innerHTML = `<div class="a-empty" style="padding:50px">Loading articles…</div>`;

  const { data, error } = await window.sb.from("articles").select("*").order("created_at", { ascending: false });
  if (error) {
    panel.innerHTML = `<div class="a-empty" style="padding:50px">Couldn't load articles: ${escHtml(error.message)}<br><span style="font-size:12px;color:#94a3b8">If this says a table is missing, run the 20260902c_blog_foundation.sql migration.</span></div>`;
    return;
  }
  _blog.articles = data || [];

  panel.innerHTML = `
   <div class="camp-page">
    <div class="camp-header">
      <div>
        <h1 class="camp-title">Blog</h1>
        <p class="camp-subtitle">Long-form articles published at <a href="/blog" target="_blank" rel="noopener">roomreadysupply.com/blog</a> &mdash; real content search engines can actually rank.</p>
      </div>
      <div class="camp-header-actions">
        <button class="camp-btn camp-btn-primary" onclick="openAddArticle()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
          New Article
        </button>
      </div>
    </div>

    <div id="blogList" style="display:flex;flex-direction:column;gap:10px"></div>
   </div>
  `;

  renderBlogList();
}

function renderBlogList() {
  const el = document.getElementById("blogList");
  if (!el) return;
  if (!_blog.articles.length) {
    el.innerHTML = `<div class="camp-empty">
      <div class="camp-empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      </div>
      <h3>No articles yet</h3>
      <p>Write the first post to start building organic search traffic.</p>
      <button class="camp-btn camp-btn-primary" onclick="openAddArticle()">New Article</button>
    </div>`;
    return;
  }

  el.innerHTML = _blog.articles.map(a => `
    <div class="camp-listrow" style="padding:14px 16px;cursor:pointer" onclick="openArticleDrawer('${a.id}')">
      <div class="camp-listrow-body" style="gap:4px">
        <strong style="font-size:14px">${escHtml(a.title || "Untitled")}</strong>
        <span>${a.status === "published" ? `Published ${a.published_at ? fmt(a.published_at) : ""}` : "Draft"} &middot; /blog/post?slug=${escHtml(a.slug)}</span>
      </div>
      <div class="camp-listrow-actions">
        <span class="crm-status-pill ${a.status === "published" ? "crm-status-customer" : "crm-status-new"}">${a.status === "published" ? "Published" : "Draft"}</span>
        <button class="camp-btn-sm camp-btn-sm-danger" onclick="event.stopPropagation(); deleteArticle('${a.id}')">Delete</button>
      </div>
    </div>`).join("");
}

function slugifyArticleTitle(title) {
  return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function openAddArticle() {
  openArticleDrawer(null);
}

async function openArticleDrawer(id) {
  const overlay = document.getElementById("articleDrawerOverlay");
  const body = document.getElementById("articleDrawerBody");
  overlay.style.display = "flex";
  requestAnimationFrame(() => overlay.classList.add("open"));

  const a = id ? _blog.articles.find(x => x.id === id) : {
    id: null, title: "", slug: "", excerpt: "", body_html: "", cover_image_url: "",
    meta_title: "", meta_description: "", status: "draft",
  };
  if (!a) { body.innerHTML = `<div class="a-empty" style="padding:60px">Article not found.</div>`; return; }

  body.innerHTML = `
   <div class="camp-dr">
    <header class="camp-dr-head">
      <div class="camp-dr-headtop">
        <span class="camp-dr-eyebrow">${a.id ? "Article" : "New Article"}</span>
        <div class="camp-dr-headbtns">
          ${a.id ? `<button class="camp-iconbtn camp-iconbtn-danger" title="Delete article" onclick="deleteArticle('${a.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>` : ""}
          <button class="camp-iconbtn" title="Close" onclick="closeArticleDrawer(true)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </header>

    <div class="camp-dr-section">
      <div class="camp-field">
        <span class="camp-field-label">Title</span>
        <input id="artTitle" class="camp-input" value="${escHtml(a.title)}" placeholder="e.g. How Much Toilet Paper Should a 50-Room Hotel Stock?" oninput="onArticleTitleInput()">
      </div>
      <div class="camp-field">
        <span class="camp-field-label">URL Slug <span class="camp-field-hint">roomreadysupply.com/blog/post?slug=&hellip;</span></span>
        <input id="artSlug" class="camp-input camp-mono" value="${escHtml(a.slug)}" placeholder="how-much-toilet-paper-50-room-hotel">
      </div>
      <div class="camp-field">
        <span class="camp-field-label">Excerpt <span class="camp-field-hint">shown on the /blog index card, also the SEO description fallback</span></span>
        <textarea id="artExcerpt" class="camp-input camp-textarea" rows="2">${escHtml(a.excerpt || "")}</textarea>
      </div>
      <div class="camp-field">
        <span class="camp-field-label">Cover Image URL <span class="camp-field-hint">optional</span></span>
        <input id="artCover" class="camp-input" value="${escHtml(a.cover_image_url || "")}" placeholder="https://...">
      </div>
      <div class="camp-field" style="margin-bottom:0">
        <span class="camp-field-label">Body (HTML) <span class="camp-field-hint">use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt; &mdash; matches the article page's own styling</span></span>
        <textarea id="artBody" class="camp-input camp-textarea camp-mono" rows="14" placeholder="<p>Start writing&hellip;</p>">${escHtml(a.body_html || "")}</textarea>
      </div>
    </div>

    <div class="camp-dr-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>SEO Overrides <span class="camp-field-hint">optional &mdash; blank falls back to the title/excerpt above</span></h4>
      <div class="camp-field">
        <span class="camp-field-label">SEO Title</span>
        <input id="artMetaTitle" class="camp-input" value="${escHtml(a.meta_title || "")}" placeholder="Auto-generated from the title if left blank">
      </div>
      <div class="camp-field" style="margin-bottom:0">
        <span class="camp-field-label">SEO Description</span>
        <textarea id="artMetaDesc" class="camp-input camp-textarea" rows="2" placeholder="Auto-generated from the excerpt if left blank">${escHtml(a.meta_description || "")}</textarea>
      </div>
    </div>

    <div class="camp-dr-section camp-send-section">
      <h4 class="camp-dr-h4"><span class="camp-dr-h4-icon camp-dr-h4-icon-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></span>Status</h4>
      <div class="camp-field" style="margin-bottom:0">
        <select id="artStatus" class="camp-select">
          <option value="draft"${a.status === "draft" ? " selected" : ""}>Draft &mdash; hidden from /blog</option>
          <option value="published"${a.status === "published" ? " selected" : ""}>Published &mdash; live on the site</option>
        </select>
      </div>
      <p id="artError" class="camp-formerror" style="display:none"></p>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="camp-btn camp-btn-primary camp-btn-lg" id="artSaveBtn" onclick="saveArticle('${a.id || ""}')">Save Article</button>
        ${a.status === "published" ? `<a class="camp-btn camp-btn-ghost" href="/blog/post?slug=${encodeURIComponent(a.slug)}" target="_blank" rel="noopener">View Live &rarr;</a>` : ""}
      </div>
    </div>
   </div>
  `;
}

// Only auto-fills the slug while staff haven't hand-edited it yet --
// tracked by whether the slug field still equals what slugifying the
// title would produce. Once someone deliberately types a different slug,
// further title edits stop overwriting it.
function onArticleTitleInput() {
  const slugEl = document.getElementById("artSlug");
  const titleEl = document.getElementById("artTitle");
  if (!slugEl || !titleEl) return;
  const prevAuto = slugifyArticleTitle(titleEl.dataset.prevValue || "");
  if (slugEl.value === "" || slugEl.value === prevAuto) {
    slugEl.value = slugifyArticleTitle(titleEl.value);
  }
  titleEl.dataset.prevValue = titleEl.value;
}

function closeArticleDrawer(force) {
  if (force !== true && force && force.target && force.target.id !== "articleDrawerOverlay") return;
  const overlay = document.getElementById("articleDrawerOverlay");
  overlay.classList.remove("open");
  setTimeout(() => { overlay.style.display = "none"; }, 180);
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("articleDrawerOverlay")?.style.display === "flex") closeArticleDrawer(true);
});

async function saveArticle(id) {
  const errEl = document.getElementById("artError");
  errEl.style.display = "none";

  const title = document.getElementById("artTitle").value.trim();
  const slug = document.getElementById("artSlug").value.trim();
  if (!title) { errEl.textContent = "Title is required."; errEl.style.display = "block"; return; }
  if (!slug) { errEl.textContent = "URL slug is required."; errEl.style.display = "block"; return; }

  const btn = document.getElementById("artSaveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const { data: { session } } = await window.sb.auth.getSession();
  const payload = {
    title, slug,
    excerpt: document.getElementById("artExcerpt").value.trim() || null,
    cover_image_url: document.getElementById("artCover").value.trim() || null,
    body_html: document.getElementById("artBody").value,
    meta_title: document.getElementById("artMetaTitle").value.trim() || null,
    meta_description: document.getElementById("artMetaDesc").value.trim() || null,
    status: document.getElementById("artStatus").value,
  };
  if (!id) payload.author_id = session?.user?.id || null;

  const { data, error } = id
    ? await window.sb.from("articles").update(payload).eq("id", id).select().single()
    : await window.sb.from("articles").insert(payload).select().single();

  btn.disabled = false; btn.textContent = "Save Article";
  if (error) {
    // 23505 = unique_violation on the slug column
    errEl.textContent = error.code === "23505" ? "That URL slug is already used by another article." : error.message;
    errEl.style.display = "block";
    return;
  }

  if (id) {
    const idx = _blog.articles.findIndex(x => x.id === id);
    if (idx > -1) _blog.articles[idx] = data;
  } else {
    _blog.articles.unshift(data);
  }
  showToast("Article saved.");
  renderBlogList();
  openArticleDrawer(data.id);
}

async function deleteArticle(id) {
  if (!confirm("Delete this article? This cannot be undone.")) return;
  const { error } = await window.sb.from("articles").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  _blog.articles = _blog.articles.filter(x => x.id !== id);
  const overlay = document.getElementById("articleDrawerOverlay");
  if (overlay && overlay.classList.contains("open")) closeArticleDrawer(true);
  renderBlogList();
  showToast("Article deleted.");
}

/* ── Reports ───────────────────────────────────────────────── */

async function renderReportsTab() {
  const panel = document.getElementById("tab-reports");
  if (!panel) return;
  panel.innerHTML = `<div style="text-align:center;padding:40px;color:#888">Loading analytics…</div>`;

  const [
    { data: orders },
    { count: customerCount },
    { count: productCount },
    { data: campaigns },
    { data: emailEvents },
    { data: leadDates },
  ] = await Promise.all([
    window.sb.from("orders").select("status, total, created_at").is("deleted_at", null),
    window.sb.from("profiles").select("*", { count:"exact", head:true }).eq("role","customer"),
    window.sb.from("products").select("*", { count:"exact", head:true }).eq("is_active", true),
    window.sb.from("campaigns").select("id, name, emails_sent").gt("emails_sent", 0),
    window.sb.from("campaign_email_events").select("campaign_id, event_type, recipient, link_url"),
    window.sb.from("quote_requests").select("created_at"),
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

  // ── Marketing: campaign comparison, top links, lead growth ──────
  const events = emailEvents || [];
  const distinctBy = (campaignId, type) =>
    new Set(events.filter(e => e.campaign_id === campaignId && e.event_type === type).map(e => e.recipient)).size;
  const campaignRows = (campaigns || []).map(c => {
    const sent = distinctBy(c.id, "sent") || c.emails_sent || 0;
    const opened = distinctBy(c.id, "opened");
    const clicked = distinctBy(c.id, "clicked");
    return { name: c.name, sent, opened, clicked,
      openRate: sent ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent ? Math.round((clicked / sent) * 100) : 0 };
  }).sort((a, b) => b.openRate - a.openRate);

  const linkCounts = {};
  events.filter(e => e.event_type === "clicked" && e.link_url).forEach(e => {
    linkCounts[e.link_url] = (linkCounts[e.link_url] || 0) + 1;
  });
  const topLinks = Object.entries(linkCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const leadsByMonth = {};
  (leadDates || []).forEach(l => {
    const key = (l.created_at || "").slice(0, 7);
    if (key) leadsByMonth[key] = (leadsByMonth[key] || 0) + 1;
  });
  const leadMonths = Object.entries(leadsByMonth).sort();
  const maxLeadsInMonth = Math.max(1, ...leadMonths.map(([, n]) => n));

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
    </div>

    <h2 style="font-size:22px;color:#0b2d52;margin:40px 0 24px">Marketing</h2>
    <div class="a-card" style="margin-bottom:24px">
      <div class="a-card-header"><h3>Campaign Comparison</h3></div>
      <div style="padding:0;overflow-x:auto">
        ${campaignRows.length ? `
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <thead><tr style="background:#f8fafc">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Campaign</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Sent</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Open Rate</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase">Click Rate</th>
          </tr></thead>
          <tbody>
            ${campaignRows.map(r => `<tr style="border-top:1px solid #f1f5f9">
              <td style="padding:10px 16px;font-weight:600">${escHtml(r.name)}</td>
              <td style="padding:10px 12px;text-align:right">${r.sent}</td>
              <td style="padding:10px 12px;text-align:right"><strong style="color:#0d1f38">${r.openRate}%</strong></td>
              <td style="padding:10px 16px;text-align:right"><strong style="color:#0d1f38">${r.clickRate}%</strong></td>
            </tr>`).join("")}
          </tbody>
        </table>` : "<p style='color:#aaa;font-size:13px;padding:16px'>No campaigns sent yet.</p>"}
      </div>
    </div>

    <div class="a-reports-grid">
      <div class="a-card">
        <div class="a-card-header"><h3>Top-Performing Links</h3></div>
        <div style="padding:16px">
          ${topLinks.length ? topLinks.map(([url, n]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;font-size:12.5px">
              <a href="${escHtml(url)}" target="_blank" rel="noopener" style="color:#0b2d52;text-decoration:underline;word-break:break-all">${escHtml(url)}</a>
              <strong style="white-space:nowrap">${n} click${n===1?"":"s"}</strong>
            </div>`).join("") : "<p style='color:#aaa;font-size:13px'>No link clicks tracked yet.</p>"}
        </div>
      </div>
      <div class="a-card">
        <div class="a-card-header"><h3>Lead Growth by Month</h3></div>
        <div style="padding:16px">
          ${leadMonths.length ? leadMonths.map(([m, n]) => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12.5px">
              <span style="width:56px;flex:none;color:#64748b">${m}</span>
              <div style="flex:1;background:#f1f5f9;border-radius:4px;height:14px;overflow:hidden">
                <div style="width:${Math.round((n / maxLeadsInMonth) * 100)}%;background:#ED7226;height:100%"></div>
              </div>
              <strong style="width:24px;text-align:right">${n}</strong>
            </div>`).join("") : "<p style='color:#aaa;font-size:13px'>No leads yet.</p>"}
        </div>
      </div>
    </div>

    <div class="a-card" style="margin-top:24px">
      <div class="a-card-header"><h3>Export</h3></div>
      <div style="padding:16px">
        <button class="a-btn-secondary" onclick="exportCampaignReportCsv()">Export Campaign Report (CSV)</button>
      </div>
    </div>`;

  window._reportsCampaignRows = campaignRows;
}

function exportCampaignReportCsv() {
  const rows = window._reportsCampaignRows || [];
  if (!rows.length) { showToast("No campaign data to export."); return; }
  const headers = ["Campaign", "Sent", "Open Rate %", "Click Rate %"];
  const lines = [headers.join(",")];
  rows.forEach(r => lines.push([r.name.replace(/,/g, ";"), r.sent, r.openRate, r.clickRate].join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `rrs-campaign-report-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
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

function tktIsAdmin()    { return window._adminRole === "admin" || window._adminRole === "owner"; }
// Per direct CEO instruction: Owner, Admin, and Marketing can file/view/
// comment on tickets, but only a Developer decides who's working one and
// whether it's done -- Status and Assignee are gated to this, everything
// else (Priority, comments) keeps its existing tktIsAdmin() gate.
// Enforced server-side too (guard_dev_ticket_triage_fields trigger,
// 20260901_dev_ticket_triage_gate.sql) -- this disables the UI control,
// the trigger is what actually stops a bypass.
function tktCanTriage()  { return window._adminRole === "developer"; }
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

  // The assignee list was only ever fetched for tktIsAdmin() (owner/admin)
  // -- backwards now that a Developer is the one actually setting the
  // Assignee field (tktCanTriage()). Marketing can view Dev Tickets too
  // now, so it gets the list as well, purely so the assigned person's name
  // resolves in their (disabled) dropdown instead of showing blank.
  const [ticketsRes, commentsRes, devsRes] = await Promise.all([
    window.sb.from("dev_tickets").select("*").order("created_at", { ascending:false }),
    window.sb.from("dev_ticket_comments").select("ticket_id"),
    (tktIsAdmin() || tktCanTriage() || window._adminRole === "marketing")
      ? window.sb.from("profiles").select("id,email,full_name,role").in("role", ["developer","admin","owner"])
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
    <article class="tkt-card ${pr.cls}" draggable="${tktCanTriage()}"
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
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
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
        <select class="a-input" onchange="setTicketStatus('${t.id}', this.value)" ${tktCanTriage()?"":"disabled"}>
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
        <select class="a-input" onchange="setTicketAssignee('${t.id}', this)" ${tktCanTriage()?"":"disabled"}>
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
  if (error) { showToast("Couldn't update: " + friendlyDbError(error)); return; }
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
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
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
  developer: "They sign in at this same admin address, but only ever see the ticket board and SEO — no products, orders, customers, or revenue.",
  marketing: "They sign in at this same admin address, with full day-to-day operations access: CRM, products, inventory, orders, quote requests, affiliates, content, best deals, SEO, and reports. No access to Users, Settings, or the dev ticket board.",
  admin: "They sign in at this same admin address, scoped to account management: Users (including creating/removing staff), Dev Tickets, Hero Section, and About Section only — no products, orders, pricing, or revenue.",
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
  const { data: staff } = await window.sb.from("profiles").select("id,email,full_name,role").in("role", ["developer","marketing","admin"]).order("created_at");
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
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
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

// Turns a raw Supabase/Postgres error into something a non-technical
// staff member can actually act on, instead of "new row for relation
// quote_requests violates check constraint quote_requests_status_check"
// or "permission denied for table quote_requests". Falls back to the
// original message for anything not recognized, so an unexpected error
// is never silently swallowed.
function friendlyDbError(error) {
  const msg = error?.message || String(error || "");
  if (/permission denied|row-level security|violates row-level/i.test(msg)) {
    return "You don't have permission to make this change.";
  }
  if (/violates check constraint|violates foreign key|violates unique constraint|violates not-null/i.test(msg)) {
    return "That change isn't allowed — please try a different value or contact support if this keeps happening.";
  }
  return msg;
}

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
    // ACH sits here from checkout until the bank debit actually clears,
    // days later (api/stripe-webhook.js flips it to 'paid' at that point) --
    // distinct blue from the yellow "awaiting payment" states above, since
    // this already has a real payment attempt in flight, not an unpaid invoice.
    processing: "a-badge-blue",
    failed: "a-badge-red",
    refunded: "a-badge-gray",
  };
  return m[paymentStatus] || "a-badge-gray";
}
function paymentBadgeLabel(paymentStatus) {
  const m = {
    paid: "Paid", captured: "Paid",
    pending_invoice: "Awaiting Payment", pending: "Awaiting Payment", requires_capture: "Awaiting Payment",
    processing: "Bank Processing",
    failed: "Failed", refunded: "Refunded",
  };
  return m[paymentStatus] || (paymentStatus || "—");
}


/* ═══════════════════════════════════════════════════════════
   HERO SECTION MANAGEMENT
═══════════════════════════════════════════════════════════ */

async function loadHeroSection() {
  const { data } = await window.sb.from("site_content").select("*").eq("section", "hero").single();
  if (!data) { updateHeroPreview(); return; }
  const c = data.content || {};
  setVal("heroHeading",      c.heading      || "Keep Your|Rooms Ready|Without Chasing Supplies");
  setVal("heroHighlight",    c.highlight    || "Without Chasing Supplies");
  setVal("heroDescription",  c.description  || "");
  setVal("heroBtnPrimary",   c.btnPrimary   || "Shop Catalog");
  setVal("heroBtnSecondary", c.btnSecondary || "Request Business Pricing");
  setVal("heroBannerUrl",    c.bannerUrl    || "assets/img/banner1.jpg");
  const img = document.getElementById("heroBannerImg");
  if (img && c.bannerUrl) img.src = c.bannerUrl;
  updateHeroPreview();
}

// Mirrors the same heading/highlight-splitting logic the live homepage
// uses (heading text split on "|" into separate lines, the segment
// matching heroHighlight rendered in orange) so what staff sees here
// matches what ships, not an approximation of it.
function updateHeroPreview() {
  const heading   = document.getElementById("heroHeading")?.value || "";
  const highlight = document.getElementById("heroHighlight")?.value || "";
  const desc      = document.getElementById("heroDescription")?.value || "";
  const btn1      = document.getElementById("heroBtnPrimary")?.value || "";
  const btn2      = document.getElementById("heroBtnSecondary")?.value || "";
  const bannerUrl = document.getElementById("heroBannerUrl")?.value || "assets/img/banner1.jpg";

  const headingEl = document.getElementById("heroPreviewHeading");
  if (headingEl) {
    headingEl.innerHTML = heading.split("|").map(line => {
      const isHighlight = highlight && line.trim() === highlight.trim();
      return isHighlight ? `<span class="cms-preview-highlight">${escHtml(line)}</span>` : escHtml(line);
    }).join("<br>");
  }
  const descEl = document.getElementById("heroPreviewDesc");
  if (descEl) descEl.textContent = desc;
  const btn1El = document.getElementById("heroPreviewBtn1");
  if (btn1El) btn1El.textContent = btn1 || "Shop Catalog";
  const btn2El = document.getElementById("heroPreviewBtn2");
  if (btn2El) btn2El.textContent = btn2 || "Request Business Pricing";
  const bg = document.getElementById("heroPreviewBg");
  if (bg) bg.style.backgroundImage = bannerUrl ? `url("${bannerUrl}")` : "";
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

// Was a local-only FileReader preview that wrote the bare filename (e.g.
// "photo.jpg") into heroBannerUrl -- looked like it worked because the
// <img> briefly showed the local file, but Save Changes would persist a
// path that resolves nowhere on the live site. Now uploads to the same
// "product-images" Storage bucket admin's other image pickers already
// use, and writes the real public URL.
async function previewHeroBanner(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = ""; // allow picking the same filename again later
  const img = document.getElementById("heroBannerImg");
  const zone = img?.closest(".cms-image-frame");
  zone?.classList.add("is-uploading");
  showToast("Uploading…");
  try {
    const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `site-content/hero-${Date.now()}.${ext}`;
    const { error } = await window.sb.storage.from("product-images").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = window.sb.storage.from("product-images").getPublicUrl(path);
    img.src = publicUrl;
    document.getElementById("heroBannerUrl").value = publicUrl;
    showToast("Image uploaded — Save Changes to apply");
  } catch (err) {
    showToast("Upload failed: " + err.message);
  } finally {
    zone?.classList.remove("is-uploading");
  }
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
  updateAboutPreview();
}

function updateAboutPreview() {
  const tag   = document.getElementById("aboutTag")?.value || "ABOUT US";
  const title = document.getElementById("aboutTitle")?.value || "";
  const p1    = document.getElementById("aboutP1")?.value || "";
  const bannerUrl = document.getElementById("aboutBannerUrl")?.value || "assets/img/banner3.jpg";

  const tagEl = document.getElementById("aboutPreviewTag");
  if (tagEl) tagEl.textContent = tag;
  const titleEl = document.getElementById("aboutPreviewTitle");
  if (titleEl) titleEl.textContent = title;
  const p1El = document.getElementById("aboutPreviewP1");
  if (p1El) p1El.textContent = p1;
  const imgEl = document.getElementById("aboutPreviewImg");
  if (imgEl) imgEl.style.backgroundImage = bannerUrl ? `url("${bannerUrl}")` : "";
}

let _aboutFeatureDragIndex = null;

function renderAboutFeatures() {
  const container = document.getElementById("aboutFeatures");
  if (!container) return;
  container.innerHTML = _aboutFeatures.map((f, i) => `
    <div class="cms-feature-row" draggable="true"
      ondragstart="_aboutFeatureDragIndex=${i};this.classList.add('is-dragging')"
      ondragend="this.classList.remove('is-dragging')"
      ondragover="event.preventDefault();this.classList.add('is-dragover')"
      ondragleave="this.classList.remove('is-dragover')"
      ondrop="event.preventDefault();this.classList.remove('is-dragover');reorderAboutFeature(_aboutFeatureDragIndex,${i})">
      <span class="cms-feature-handle" title="Drag to reorder">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
      </span>
      <div class="cms-feature-fields">
        <input class="a-input cms-input" placeholder="Feature title" value="${escHtml(f.title)}"
          oninput="_aboutFeatures[${i}].title=this.value">
        <input class="a-input cms-input" placeholder="Short description" value="${escHtml(f.desc)}"
          oninput="_aboutFeatures[${i}].desc=this.value">
      </div>
      <button class="cms-feature-remove" title="Remove feature" onclick="_aboutFeatures.splice(${i},1);renderAboutFeatures()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join("") + `
    <button class="cms-feature-add" onclick="_aboutFeatures.push({icon:'assets/icons/au1.svg',title:'',desc:''});renderAboutFeatures()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Add Feature
    </button>
  `;
}

function reorderAboutFeature(from, to) {
  if (from === null || from === to || from === undefined) return;
  const [moved] = _aboutFeatures.splice(from, 1);
  _aboutFeatures.splice(to, 0, moved);
  _aboutFeatureDragIndex = null;
  renderAboutFeatures();
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

// See previewHeroBanner's comment -- same real-upload fix, same bucket.
async function previewAboutBanner(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = "";
  const img = document.getElementById("aboutBannerImg");
  const zone = img?.closest(".cms-image-frame");
  zone?.classList.add("is-uploading");
  showToast("Uploading…");
  try {
    const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `site-content/about-${Date.now()}.${ext}`;
    const { error } = await window.sb.storage.from("product-images").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = window.sb.storage.from("product-images").getPublicUrl(path);
    img.src = publicUrl;
    document.getElementById("aboutBannerUrl").value = publicUrl;
    showToast("Image uploaded — Save Changes to apply");
  } catch (err) {
    showToast("Upload failed: " + err.message);
  } finally {
    zone?.classList.remove("is-uploading");
  }
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
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  showToast("Deal removed.");
  renderBestDealsTab();
}

/* ============================================================
   VENDORS TAB
============================================================ */

async function renderVendorsTab() {
  const list = document.getElementById("vendorsList");
  if (!list) return;
  list.innerHTML = `<div class="a-empty" style="padding:40px">Loading…</div>`;

  const { data: vendors, error } = await window.sb
    .from("vendors")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    list.innerHTML = `<div class="a-empty" style="padding:40px">Couldn't load: ${escHtml(error.message)}</div>`;
    return;
  }
  if (!vendors || !vendors.length) {
    list.innerHTML = `<div class="a-empty" style="padding:40px">No vendors yet. Click "+ Add Vendor" to onboard the first one.</div>`;
    return;
  }

  list.innerHTML = vendors.map(v => `
    <div class="a-card" style="padding:16px 18px;display:flex;gap:14px;align-items:flex-start;${v.is_active ? "" : "opacity:.55"}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
          <strong style="font-size:14px;color:#0d1f38">${escHtml(v.name)}</strong>
          <span class="a-badge ${v.is_active ? "a-badge-green" : "a-badge-yellow"}">${v.is_active ? "Active" : "Inactive"}</span>
          ${v.category ? `<span class="a-badge">${escHtml(v.category)}</span>` : ""}
        </div>
        <div style="font-size:12.5px;color:#64748b">${escHtml(v.contact_name || "—")} &middot; ${escHtml(v.contact_email)}${v.contact_phone ? " &middot; " + escHtml(v.contact_phone) : ""}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px">Estimated ship time: ${v.estimated_ship_days} day${v.estimated_ship_days === 1 ? "" : "s"}${v.notes ? " &middot; " + escHtml(v.notes) : ""}</div>
      </div>
      <div style="display:flex;gap:8px;flex:none">
        <button class="a-btn-secondary" style="font-size:12px;padding:6px 12px" onclick="editVendor('${v.id}')">Edit</button>
        <button class="a-btn-secondary" style="font-size:12px;padding:6px 12px;color:#dc2626" onclick="deleteVendor('${v.id}')">Delete</button>
      </div>
    </div>`).join("");
}

function openAddVendor() {
  document.getElementById("vendorModalTitle").textContent = "Add Vendor";
  document.getElementById("vndId").value = "";
  document.getElementById("vndName").value = "";
  document.getElementById("vndCategory").value = "";
  document.getElementById("vndContactName").value = "";
  document.getElementById("vndContactPhone").value = "";
  document.getElementById("vndContactEmail").value = "";
  document.getElementById("vndShipDays").value = "3";
  document.getElementById("vndNotes").value = "";
  document.getElementById("vndActive").value = "true";
  openModal("vendorModal");
}

async function editVendor(id) {
  const { data: v } = await window.sb.from("vendors").select("*").eq("id", id).single();
  if (!v) return;
  document.getElementById("vendorModalTitle").textContent = "Edit Vendor";
  document.getElementById("vndId").value = v.id;
  document.getElementById("vndName").value = v.name;
  document.getElementById("vndCategory").value = v.category || "";
  document.getElementById("vndContactName").value = v.contact_name || "";
  document.getElementById("vndContactPhone").value = v.contact_phone || "";
  document.getElementById("vndContactEmail").value = v.contact_email;
  document.getElementById("vndShipDays").value = v.estimated_ship_days;
  document.getElementById("vndNotes").value = v.notes || "";
  document.getElementById("vndActive").value = String(v.is_active);
  openModal("vendorModal");
}

async function saveVendor() {
  const name = document.getElementById("vndName").value.trim();
  const contactEmail = document.getElementById("vndContactEmail").value.trim();
  const id = document.getElementById("vndId").value;

  if (!name) { showToast("Vendor name is required."); return; }
  if (!contactEmail) { showToast("Contact email is required — purchase orders send here."); return; }

  const btn = document.getElementById("vndSaveBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  const payload = {
    name,
    category: document.getElementById("vndCategory").value.trim() || null,
    contact_name: document.getElementById("vndContactName").value.trim() || null,
    contact_phone: document.getElementById("vndContactPhone").value.trim() || null,
    contact_email: contactEmail,
    estimated_ship_days: parseInt(document.getElementById("vndShipDays").value) || 3,
    notes: document.getElementById("vndNotes").value.trim() || null,
    is_active: document.getElementById("vndActive").value === "true",
  };
  const { error } = id
    ? await window.sb.from("vendors").update(payload).eq("id", id)
    : await window.sb.from("vendors").insert(payload);

  btn.disabled = false; btn.textContent = "Save Vendor";
  if (error) { showToast("Couldn't save: " + error.message); return; }

  closeModal("vendorModal");
  showToast("Vendor saved.");
  renderVendorsTab();
}

async function deleteVendor(id) {
  if (!confirm("Remove this vendor? Products tagged to it will revert to RRS-fulfilled.")) return;
  const { error } = await window.sb.from("vendors").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  showToast("Vendor removed.");
  renderVendorsTab();
}

/* ============================================================
   ORDER EXCEPTIONS TAB
============================================================ */

async function renderExceptionsTab() {
  const list = document.getElementById("exceptionsList");
  if (!list) return;
  list.innerHTML = `<div class="a-empty" style="padding:40px">Loading…</div>`;

  const { data: exceptions, error } = await window.sb
    .from("order_exceptions")
    .select("*, orders(order_number, customer_name, business_name)")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<div class="a-empty" style="padding:40px">Couldn't load: ${escHtml(error.message)}</div>`;
    return;
  }
  if (!exceptions || !exceptions.length) {
    list.innerHTML = `<div class="a-empty" style="padding:40px">No exceptions. Everything's flowing through fulfillment normally.</div>`;
    return;
  }

  const reasonLabel = {
    possible_stockout: "Possible Stockout",
    supplier_stockout: "Supplier Stockout",
    vendor_unresponsive: "Vendor Unresponsive",
    address_issue: "Address Issue",
    other: "Other",
  };

  list.innerHTML = exceptions.map(x => `
    <div class="a-card" style="padding:16px 18px;display:flex;gap:14px;align-items:flex-start;${x.status === "resolved" ? "opacity:.55" : ""}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
          <strong style="font-size:14px;color:#0d1f38">${escHtml(x.orders?.order_number || "Order not found")}</strong>
          <span class="a-badge a-badge-red">${escHtml(reasonLabel[x.reason_code] || x.reason_code)}</span>
          <span class="a-badge ${x.status === "resolved" ? "a-badge-green" : "a-badge-yellow"}">${x.status === "resolved" ? "Resolved" : "Open"}</span>
        </div>
        <div style="font-size:12.5px;color:#64748b">${escHtml(x.orders?.customer_name || x.orders?.business_name || "—")}</div>
        ${x.note ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px">${escHtml(x.note)}</div>` : ""}
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">Flagged ${fmt(x.created_at)}${x.resolved_at ? " &middot; resolved " + fmt(x.resolved_at) : ""}</div>
      </div>
      <div style="display:flex;gap:8px;flex:none">
        ${x.orders?.order_number ? `<button class="a-btn-secondary" style="font-size:12px;padding:6px 12px" onclick="switchTab('orders');document.getElementById('orderSearch').value='${escHtml(x.orders.order_number)}';renderOrdersTable('${escHtml(x.orders.order_number)}')">View Order</button>` : ""}
        ${x.status !== "resolved" ? `<button class="a-btn-primary" style="font-size:12px;padding:6px 12px" onclick="resolveException('${x.id}')">Resolve</button>` : ""}
      </div>
    </div>`).join("");
}

async function resolveException(id) {
  const { data: { user } } = await window.sb.auth.getUser();
  const { error } = await window.sb.from("order_exceptions")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: user?.id || null })
    .eq("id", id);
  if (error) { showToast("Couldn't resolve: " + error.message); return; }
  showToast("Exception resolved.");
  renderExceptionsTab();
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
   the first $5,000 and 15% on the rest. Company-wide, and now the single
   source of truth: sub_distributors.commission_pct is no longer consulted
   for payouts (see affiliateReferredRevenue below).

   Brackets as confirmed by the CEO, 2026-09-15: $1-$5,000 is 10%,
   $5,001-$10,000 is 15%, $10,001 and up is 20%. Each boundary sits in the
   LOWER bracket ("up to 5k is 10%"), so these are <= comparisons.

   Revenue basis is the items subtotal -- NOT orders.total. Tax is money
   collected for the state and freight is a pass-through cost; neither is
   RRS margin, so neither earns commission. */
const AFFILIATE_COMMISSION_TIERS = [
  { max: 5000,      rate: 0.10 },
  { max: 10000,     rate: 0.15 },
  { max: Infinity,  rate: 0.20 },
];

function affiliateCommissionRate(revenue) {
  const tier = AFFILIATE_COMMISSION_TIERS.find(t => revenue <= t.max) || AFFILIATE_COMMISSION_TIERS[AFFILIATE_COMMISSION_TIERS.length - 1];
  return tier.rate;
}

/* Commissionable value of one referred order: items only.

   orders.subtotal is items-only by the convention established across the
   composer, send-quote and invoice paths. Older orders pre-date the
   column and carry only `total`; for those, back out tax and freight
   rather than paying commission on them. */
function affiliateOrderRevenue(o) {
  if (!o) return 0;
  const sub = parseFloat(o.subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  const total   = parseFloat(o.total) || 0;
  const tax     = parseFloat(o.tax_amount) || 0;
  const freight = parseFloat(o.freight_fee) || 0;
  return Math.max(0, total - tax - freight);
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
    window.sb.from('order_referrals').select('sub_distributor_id,orders(total,subtotal,tax_amount,freight_fee,created_at)'),
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
    revenueByAffiliate[r.sub_distributor_id] = (revenueByAffiliate[r.sub_distributor_id] || 0) + affiliateOrderRevenue(r.orders);
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
    .select('orders(total,subtotal,tax_amount,freight_fee,created_at)')
    .eq('sub_distributor_id', subDistributorId);

  const revenue = (referrals || []).reduce((s, r) => {
    const created = r.orders?.created_at;
    if (!created || created < periodStart || created >= periodEnd.toISOString()) return s;
    return s + affiliateOrderRevenue(r.orders);
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
      window.sb.from('order_referrals').select('orders(total,subtotal,tax_amount,freight_fee)'),
    ]);

    const total    = totalRes.count   || 0;
    const active   = activeRes.count  || 0;
    const referrals = referralsRes.data || [];
    // The tile is labelled "Referred Revenue", but this summed
    // commission_amount -- showing commission under a revenue heading.
    // Same commissionable basis as everywhere else: items, no tax/freight.
    const revenue   = referrals.reduce((s, r) => s + affiliateOrderRevenue(r.orders), 0);

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
    window.sb.from('order_referrals').select('sub_distributor_id,commission_amount,orders(total,subtotal,tax_amount,freight_fee)').in('sub_distributor_id', ids),
  ]);

  const customerCount = {};
  (links || []).forEach(l => { customerCount[l.sub_distributor_id] = (customerCount[l.sub_distributor_id] || 0) + 1; });
  const orderCount = {};
  const revenueMap = {};
  (referrals || []).forEach(r => {
    orderCount[r.sub_distributor_id] = (orderCount[r.sub_distributor_id] || 0) + 1;
    revenueMap[r.sub_distributor_id] = (revenueMap[r.sub_distributor_id] || 0) + affiliateOrderRevenue(r.orders);
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
      <td><span title="Tiered company-wide on monthly referred sales: $1-$5,000 = 10%, $5,001-$10,000 = 15%, $10,001+ = 20%">Tiered</span></td>
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
  document.getElementById('sdSubdomain').value = sd ? (sd.subdomain || '') : '';
  // Commission is tiered company-wide now; the field is a disabled label.
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
    // Must send the signed-in staff member's own access token, not the
    // publishable anon key -- the function verifies the caller holds a
    // staff role before it will create an account.
    const { data: { session } } = await window.sb.auth.getSession();
    var res = await fetch('https://giprkvlyouwfzjlaibkq.supabase.co/functions/v1/create-subdist-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session?.access_token || '') },
      body: JSON.stringify({ email, password, name, sub_distributor_id: id }),
    });
    var data = await res.json();
    if (data.error) return showErr('Error: ' + data.error);
    if (data.warning) return showErr(data.warning);
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
  var subdomain  = document.getElementById('sdSubdomain').value.trim().toLowerCase();
  var errEl      = document.getElementById('sdModalError');

  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  if (!name) return showErr('Name is required.');
  if (!code) return showErr('Referral code is required.');
  // Matches the unique index (20260911_sub_distributors_subdomain.sql) so a
  // typo surfaces here instead of as an opaque 23505 from the insert.
  if (subdomain && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
    return showErr('Subdomain can only contain lowercase letters, numbers, and hyphens (not at the start or end).');
  }

  var payload = {
    name: name,
    contact_person: document.getElementById('sdContact').value.trim(),
    email:          document.getElementById('sdEmail').value.trim(),
    phone:          document.getElementById('sdPhone').value.trim(),
    referral_code:  code,
    // Empty string would still be a value the unique index dedupes on
    // (only NULLs are exempt from a unique constraint), so a second
    // affiliate left blank would collide with the first. Null instead.
    subdomain:      subdomain || null,
    // commission_pct is deliberately NOT written: commission is tiered
    // company-wide on monthly referred sales (AFFILIATE_COMMISSION_TIERS),
    // so there is no per-affiliate rate to save. The column keeps its
    // existing value for historical reference. On insert it falls back to
    // the schema default of 0.
    status:         document.getElementById('sdStatus').value,
    notes:          document.getElementById('sdNotes').value.trim(),
  };

  var result;
  if (id) {
    result = await window.sb.from('sub_distributors').update(payload).eq('id', id);
  } else {
    result = await window.sb.from('sub_distributors').insert(payload);
  }
  if (result.error) {
    if (result.error.code === '23505') {
      var msg = /subdomain/i.test(result.error.message || '') ? 'That subdomain is already in use by another affiliate.' : 'Referral code already exists.';
      return showErr(msg);
    }
    return showErr(result.error.message);
  }

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
          : window.sb.from("orders").select("id,created_at,status,shipping_name,total").gte("created_at", since).is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
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
    isDev ? Promise.resolve({ data: [] }) : window.sb.from("orders").select("id,created_at").gte("created_at", since).is("deleted_at", null),
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
    // requested_items is what the customer submitted through the public
    // form, so it's legitimately empty on a staff-created quote -- nobody
    // submitted anything. Once such a quote has been priced and sent,
    // fall back to quote_items (what we actually quoted them) rather than
    // showing "No products listed" next to a quote that plainly has
    // products on it.
    const items    = r.requested_items?.length ? r.requested_items : r.quote_items;
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
      <td>
        <button class="a-btn a-btn-sm" onclick="openQuoteDetail('${r.id}')">View</button>
        <button class="a-btn a-btn-sm" onclick="deleteQuoteRequest('${r.id}')" style="color:#dc2626;border-color:#fecaca;margin-left:4px">Delete</button>
      </td>
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

// Deletes the underlying quote_requests row -- same table deleteCrmLead()
// removes from the CRM board, just reachable from this table's own
// "Delete" button so test/junk entries can be cleared without switching
// views. Re-runs the table's own fetch afterward rather than patching
// allQuoteRequests locally, so search/filter state and the row count stay
// consistent with whatever's actually in the database.
async function deleteQuoteRequest(id) {
  const r = allQuoteRequests.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Delete the quote request from "${r.business_name || r.contact_name || "this customer"}"? This can't be undone.`)) return;
  const { error } = await window.sb.from("quote_requests").delete().eq("id", id);
  if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
  showToast("Quote request deleted.");
  renderQuoteRequestsTable();
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
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/admin-create-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
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

  // requested_items = what the customer asked for through the public
  // form; quote_items = what we actually priced and sent them. A
  // staff-created quote has no requested_items (nobody submitted a form),
  // so fall back to the priced items rather than claiming there are no
  // products on a quote that clearly has some. Labelled so it stays
  // clear which of the two is being shown.
  const usingQuoted = !r.requested_items?.length && r.quote_items?.length;
  const items = usingQuoted ? r.quote_items : r.requested_items;
  const itemsHtml = items?.length
    ? `${usingQuoted ? `<p style="margin:8px 0 0;font-size:11.5px;color:#94a3b8">Items you quoted (the customer didn't submit a product list).</p>` : ""}
       <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-top:8px">
        <div style="display:grid;grid-template-columns:1fr 90px;background:#f8fafc;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b">
          <span>Product</span><span style="text-align:center">Qty</span>
        </div>
        ${items.map((i, idx) => `
          <div style="display:grid;grid-template-columns:1fr 90px;padding:10px 14px;border-top:1px solid #f1f5f9;background:${idx%2===0?'#fff':'#fafbfc'};font-size:13px;align-items:center">
            <span style="color:#1e293b;font-weight:500">${esc(i.name)}</span>
            <span style="text-align:center;font-weight:700;color:#0d2c50">${i.quantity}</span>
          </div>`).join("")}
      </div>`
    : `<div style="padding:14px;background:#f8fafc;border-radius:10px;font-size:13px;color:#94a3b8;text-align:center;margin-top:8px">
        No specific products requested by the customer.${r.status !== "quoted" ? ` Use <strong style="color:#0d2c50">Add Products &amp; Send</strong> below to price this quote.` : ""}
      </div>`;

  const fileHtml = r.file_url
    ? `<a href="${r.file_url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:8px 14px;background:#fff7f0;border:1px solid #fed7aa;border-radius:8px;color:#e8621a;font-size:13px;font-weight:600;text-decoration:none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        ${esc(r.file_name || "View attached file")}
      </a>`
    : "";

  const termsBadge = termsStatusBadge(r);
  const creditHtml = buildQuoteCreditHtml(r);

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

    ${creditHtml}

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

/* ── Quote credit (owner only) ──────────────────────────────── */

// A flat dollar credit deducted from the invoice total, applied after tax
// so the tax figure the customer already saw on their quote doesn't move.
//
// Only an owner account may set it. The real enforcement is in the
// database (is_owner() RLS policy + the credit trigger added in
// 20260912b) -- this read-only rendering for everyone else is a UX
// affordance so sales/marketing can still SEE an applied credit, not a
// security boundary on its own.
function buildQuoteCreditHtml(r) {
  const isOwner = window._adminRole === "owner";
  const amount  = Number(r.credit_amount) || 0;
  const note    = r.credit_note || "";

  const issuedLine = amount > 0 && r.credit_issued_at
    ? `<p style="font-size:11px;color:#94a3b8;margin:8px 0 0">Issued ${new Date(r.credit_issued_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>`
    : "";

  if (!isOwner) {
    // Greyed-out, non-interactive view for every non-owner role.
    return `
    <div style="margin-bottom:20px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;opacity:.75">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <p style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0">Invoice Credit</p>
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#64748b;background:#e2e8f0;border-radius:20px;padding:2px 8px">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Owner only
        </span>
      </div>
      ${amount > 0
        ? `<p style="font-size:15px;font-weight:800;color:#0d2c50;margin:0">&minus;$${amount.toFixed(2)}</p>
           ${note ? `<p style="font-size:12.5px;color:#64748b;margin:6px 0 0">${esc(note)}</p>` : ""}
           ${issuedLine}`
        : `<p style="font-size:13px;color:#94a3b8;margin:0">No credit applied to this quote.</p>`}
    </div>`;
  }

  return `
    <div style="margin-bottom:20px;padding:14px 16px;border:1px solid #fed7aa;border-radius:10px;background:#fffdfa">
      <p style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;margin:0 0 10px">Invoice Credit</p>
      <div style="display:grid;grid-template-columns:150px 1fr;gap:8px;margin-bottom:10px">
        <input id="quoteCreditAmount" class="a-input" type="number" min="0" step="0.01" placeholder="0.00"
               style="height:34px;font-size:12.5px" value="${amount > 0 ? amount.toFixed(2) : ""}">
        <input id="quoteCreditNote" class="a-input" placeholder="Reason (shown on the invoice)"
               style="height:34px;font-size:12.5px" value="${esc(note)}">
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="a-btn-primary" style="height:34px;padding:0 14px;font-size:12.5px;white-space:nowrap" onclick="saveQuoteCredit()">Save Credit</button>
        <span id="quoteCreditNoteMsg" style="font-size:11.5px;color:#64748b">Deducted from the invoice total after tax.</span>
      </div>
      ${issuedLine}
    </div>`;
}

async function saveQuoteCredit() {
  if (!currentQuoteId) return;
  const amtEl  = document.getElementById("quoteCreditAmount");
  const noteEl = document.getElementById("quoteCreditNote");
  const msgEl  = document.getElementById("quoteCreditNoteMsg");
  const btn    = document.querySelector('[onclick="saveQuoteCredit()"]');
  if (!amtEl) return;

  const amount = Math.round((parseFloat(amtEl.value) || 0) * 100) / 100;
  if (amount < 0) {
    if (msgEl) { msgEl.textContent = "A credit can't be negative."; msgEl.style.color = "#dc2626"; }
    return;
  }

  const r = allQuoteRequests.find(x => x.id === currentQuoteId);
  const total = r ? (Number(r.grand_total) || quoteItemsTotal(r) || 0) : 0;
  if (total > 0 && amount > total) {
    if (!confirm(`That credit ($${amount.toFixed(2)}) is larger than the quote total ($${total.toFixed(2)}). Apply it anyway?`)) return;
  }

  if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }

  // credit_issued_by / credit_issued_at are stamped by the database
  // trigger from auth.uid(), never sent from here -- a client-supplied
  // "who issued this" on a money field can't be trusted.
  const { error } = await window.sb.from("quote_requests").update({
    credit_amount: amount,
    credit_note: noteEl?.value.trim() || null,
  }).eq("id", currentQuoteId);

  if (btn) { btn.textContent = "Save Credit"; btn.disabled = false; }

  if (error) {
    if (msgEl) {
      // 42501 is the trigger's own "owner only" rejection; anything else
      // is a genuine failure worth showing verbatim.
      msgEl.textContent = error.code === "42501" || /owner account/i.test(error.message || "")
        ? "Only an owner account can set a credit."
        : `Couldn't save: ${error.message}`;
      msgEl.style.color = "#dc2626";
    }
    return;
  }

  if (r) {
    r.credit_amount = amount;
    r.credit_note = noteEl?.value.trim() || null;
    r.credit_issued_at = amount > 0 ? new Date().toISOString() : null;
  }
  if (msgEl) {
    msgEl.textContent = amount > 0
      ? `Credit of $${amount.toFixed(2)} saved.`
      : "Credit removed.";
    msgEl.style.color = "#16a34a";
  }
  renderQuoteRequestsTable?.();
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
  // Net 30 is owner-only (send-quote's edge function drops it silently for
  // anyone else, and the database trigger trg_net30_owner_only rejects a
  // direct write). Disabling the checkbox here for other roles matches
  // that instead of letting them tick it and have nothing happen.
  const net30Checkbox = document.getElementById("quoteNet30");
  const net30Label = net30Checkbox?.closest("label");
  const isOwner = window._adminRole === "owner";
  net30Checkbox.checked = false;
  net30Checkbox.disabled = !isOwner;
  if (net30Label) {
    net30Label.style.opacity = isOwner ? "" : ".5";
    net30Label.style.cursor = isOwner ? "pointer" : "not-allowed";
    net30Label.title = isOwner ? "" : "Only an owner account can grant Net 30 terms.";
  }
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
            oninput="onQuoteLineQtyInput(${idx}, this.value, false)"
            onchange="onQuoteLineQtyInput(${idx}, this.value, true)"
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
//
// Same minimum-order rule the live checkout enforces (enforceCartMinimums()
// in script.js): quantity can't go below the product's MOQ, and must land
// on a whole multiple of it. onQuoteLineNameInput() already sets that floor
// the moment a product is matched, but did nothing once the qty field was
// edited afterward -- so staff could type "1" into a 50-dozen-minimum
// product's line and the quote would promise a quantity checkout would
// actually reject. line.moq stays 1 for anything not sold with a real
// minimum (regular case-sold products), so the clamp is a no-op for those.
//
// The clamp itself only runs on `commit` (onchange -- the field lost focus
// or Enter was pressed), not on every keystroke (oninput): correcting mid-
// typing would fight the admin's own typing (e.g. typing "50" into a
// moq-50 field would snap to 50 after just the "5"). oninput still drives
// the live price/total recompute below so those feel responsive typing.
function onQuoteLineQtyInput(idx, value, commit) {
  const line = _quoteComposerLines[idx];
  if (!line) return;
  let qty = parseInt(value) || 1;

  if (commit) {
    const moq = line.moq || 1;
    if (qty < moq) qty = moq;
    else if (qty % moq !== 0) qty = Math.round(qty / moq) * moq || moq;
    const qtyEl = document.getElementById(`ql-qty-${idx}`);
    if (qtyEl && Number(qtyEl.value) !== qty) qtyEl.value = qty;
  }
  line.quantity = qty;

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

// Same idea as quoteInHouseFee() -- not gated behind a checkbox since
// staff can just leave it at $0 for an in-house or free-freight quote.
function quoteFreightFee() {
  return Math.max(0, parseFloat(document.getElementById("quoteFreightFee")?.value) || 0);
}

// The quote composer's "Get Warp Quote" button used to live here
// (getComposerWarpQuote). RRS dropships, so there is no carrier rate to
// pull -- staff type the distributor's freight figure into quoteFreightFee
// directly.

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
  subtotal += quoteFreightFee();

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
    freight_fee: quoteFreightFee(),
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
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch(SEND_QUOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + (session?.access_token || ""),
      },
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
    // Freight is an internal cost, never billed: it is excluded from both
    // the taxable base and the grand total so the quoted figure is what the
    // customer actually pays.
    const freightFee = 0;
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
        freight_fee: freightFee,
        shipping_state: payload.shipping_state,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        grand_total: itemsTotal + deliveryFee + freightFee + taxAmount,
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
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch(SEND_QUOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + (session?.access_token || ""),
      },
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
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/send-terms-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
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
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/api/send-terms-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
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

/* ── Sales Tax ──────────────────────────────────────────────────
   What we owe each state, and how much of it we actually collected.

   Only PAID orders count. Tax becomes a liability when money changes
   hands, not when an order is placed -- counting pending_invoice or
   failed orders would overstate what is owed, the expensive direction
   to be wrong in.

   Two kinds of tax, kept apart on purpose:

     COLLECTED  tax_amount recorded on the order. The customer paid it;
                we are holding it and remit it.

     UNCOLLECTED  a paid order shipped to a taxable state with no tax on
                it. The rate is applied to the order total (the total was
                the pre-tax price -- the customer was simply never charged
                tax), so this is owed out of pocket rather than out of
                money already received. Merging it into one "tax" number
                would hide a real cost, so it is always shown separately.

   Read-only: it reports what the orders table recorded plus what the
   state rate table implies. Editing figures here would let the report
   disagree with the payments behind it. */

const SALES_TAX_PAID_STATUSES = ["paid"];

function stSafeJson(s) { try { return JSON.parse(s); } catch { return null; } }

// shipping_address is jsonb, but older rows were written as a JSON string.
function stOrderState(o) {
  const a = o.shipping_address;
  if (!a) return "";
  const raw = typeof a === "string" ? stSafeJson(a) : a;
  return String((raw && raw.state) || "").trim().toUpperCase();
}

// Rate for an order: what was recorded, else the state's published rate.
// Falls back to the shared table in tax-rates.js rather than a second copy.
function stRateFor(o) {
  const recorded = Number(o.tax_rate) || 0;
  if (recorded > 0) return recorded;
  const st = stOrderState(o);
  return st && typeof getTaxRate === "function" ? getTaxRate(st) : 0;
}

// Splits an order into what was collected vs. what is owed but was not.
function stTaxFor(o) {
  const collected = Number(o.tax_amount) || 0;
  if (collected > 0) return { collected, uncollected: 0, taxable: (Number(o.total) || 0) - collected };

  // Never charged: the total was the pre-tax price, so tax is on top of it.
  const rate = stRateFor(o);
  const taxable = Number(o.total) || 0;
  return { collected: 0, uncollected: round2(taxable * rate), taxable };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function stMoney(n) {
  return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Start of the current quarter -- the period a sales tax return covers.
function stQuarterStart(d = new Date()) {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

// Formats a Date as YYYY-MM-DD in LOCAL time. toISOString() converts to UTC
// first, which east of Greenwich rolls local midnight back a day: at UTC+8,
// local midnight Jul 1 is 16:00 Jun 30 UTC, so the default filter would
// silently start in the prior quarter.
function stLocalDate(d) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

let _stOrders = [];

async function renderSalesTaxTab() {
  const wrap = document.getElementById("tab-sales-tax");
  if (!wrap) return;
  wrap.innerHTML = `<div class="a-empty" style="padding:40px">Loading&hellip;</div>`;

  const { data, error } = await window.sb
    .from("orders")
    .select("order_number, customer_name, business_name, total, subtotal, tax_amount, tax_rate, shipping_address, payment_status, created_at")
    .in("payment_status", SALES_TAX_PAID_STATUSES)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    wrap.innerHTML = `<div class="a-empty" style="padding:40px">Could not load orders: ${escHtml(error.message)}</div>`;
    return;
  }

  _stOrders = data || [];
  stRender();
}

function stFilteredRows() {
  const from = document.getElementById("stFrom")?.value || "";
  const to   = document.getElementById("stTo")?.value   || "";
  const stateFilter = document.getElementById("stState")?.value || "";

  const fromDate = from ? new Date(from + "T00:00:00") : stQuarterStart();
  const toDate   = to   ? new Date(to   + "T23:59:59") : null;

  return _stOrders.filter(o => {
    const d = new Date(o.created_at);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    if (stateFilter && stOrderState(o) !== stateFilter) return false;
    return true;
  });
}

function stRender() {
  const wrap = document.getElementById("tab-sales-tax");
  if (!wrap) return;

  const from = document.getElementById("stFrom")?.value || "";
  const to   = document.getElementById("stTo")?.value   || "";
  const stateFilter = document.getElementById("stState")?.value || "";

  const rows = stFilteredRows();

  let collected = 0, uncollected = 0, gross = 0, taxableTotal = 0;
  const byState = {};
  const gaps = [];

  for (const o of rows) {
    const t = stTaxFor(o);
    const st = stOrderState(o) || "—";
    collected += t.collected;
    uncollected += t.uncollected;
    gross += Number(o.total) || 0;
    taxableTotal += t.taxable;

    if (!byState[st]) byState[st] = { state: st, orders: 0, taxable: 0, collected: 0, uncollected: 0, rate: 0 };
    const b = byState[st];
    b.orders += 1;
    b.taxable += t.taxable;
    b.collected += t.collected;
    b.uncollected += t.uncollected;
    b.rate = stRateFor(o) || b.rate;

    if (t.uncollected > 0) gaps.push({ order: o, tax: t.uncollected });
  }

  const states = Object.values(byState).sort((a, b) => (b.collected + b.uncollected) - (a.collected + a.uncollected));
  const owed = round2(collected + uncollected);
  const allStates = [...new Set(_stOrders.map(stOrderState).filter(Boolean))].sort();

  wrap.innerHTML = `
    <div class="st-head">
      <div>
        <h2 class="st-title">Sales Tax</h2>
        <p class="st-sub">Paid orders only. Tax is a liability once payment clears &mdash; pending and failed orders are excluded.</p>
      </div>
      <button class="st-btn-primary" onclick="stExportCsv()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export CSV
      </button>
    </div>

    <div class="st-filters">
      <div class="st-field">
        <label for="stFrom">From</label>
        <input type="date" id="stFrom" value="${escHtml(from || stLocalDate(stQuarterStart()))}" onchange="stRender()">
      </div>
      <div class="st-field">
        <label for="stTo">To</label>
        <input type="date" id="stTo" value="${escHtml(to)}" onchange="stRender()">
      </div>
      <div class="st-field">
        <label for="stState">State</label>
        <select id="stState" onchange="stRender()">
          <option value="">All states</option>
          ${allStates.map(s => `<option value="${escHtml(s)}"${s === stateFilter ? " selected" : ""}>${escHtml(s)}</option>`).join("")}
        </select>
      </div>
      <button class="st-btn-ghost" onclick="stResetFilters()">Reset</button>
      <span class="st-rowcount">${rows.length} paid order${rows.length === 1 ? "" : "s"}</span>
    </div>

    <div class="st-stats">
      <div class="st-stat st-stat--total">
        <p class="st-stat-label">Total owed</p>
        <p class="st-stat-value">${stMoney(owed)}</p>
        <p class="st-stat-sub">Across ${states.length} state${states.length === 1 ? "" : "s"}</p>
      </div>
      <div class="st-stat">
        <p class="st-stat-label">Collected</p>
        <p class="st-stat-value">${stMoney(collected)}</p>
        <p class="st-stat-sub">Charged to customers &mdash; held, not ours</p>
      </div>
      <div class="st-stat ${uncollected > 0 ? "st-stat--warn" : ""}">
        <p class="st-stat-label">Not collected</p>
        <p class="st-stat-value">${stMoney(uncollected)}</p>
        <p class="st-stat-sub">${uncollected > 0 ? "Owed, paid out of pocket" : "Nothing missed"}</p>
      </div>
      <div class="st-stat">
        <p class="st-stat-label">Taxable sales</p>
        <p class="st-stat-value">${stMoney(taxableTotal)}</p>
        <p class="st-stat-sub">Gross ${stMoney(gross)}</p>
      </div>
    </div>

    ${gaps.length ? `
    <div class="st-alert">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <p class="st-alert-title">${stMoney(uncollected)} of tax was never charged to the customer</p>
        <p class="st-alert-body">${gaps.length} paid order${gaps.length === 1 ? "" : "s"} shipped to a taxable state without tax applied. The state is still owed it, so it comes out of margin. ${gaps.slice(0, 4).map(g => `<strong>${escHtml(g.order.order_number)}</strong>`).join(", ")}${gaps.length > 4 ? ` and ${gaps.length - 4} more` : ""}.</p>
      </div>
    </div>` : ""}

    <div class="st-card">
      <div class="st-card-head"><h3>By state</h3><span>Rates from the site's tax table</span></div>
      ${states.length ? `
      <table class="st-table">
        <thead><tr>
          <th>State</th><th class="num">Orders</th><th class="num">Rate</th>
          <th class="num">Taxable sales</th><th class="num">Collected</th>
          <th class="num">Not collected</th><th class="num">Owed</th>
        </tr></thead>
        <tbody>
          ${states.map(s => `
            <tr>
              <td><span class="st-state">${escHtml(s.state)}</span></td>
              <td class="num">${s.orders}</td>
              <td class="num">${s.rate ? (s.rate * 100).toFixed(2) + "%" : "&mdash;"}</td>
              <td class="num">${stMoney(s.taxable)}</td>
              <td class="num">${stMoney(s.collected)}</td>
              <td class="num ${s.uncollected > 0 ? "st-warn-cell" : "st-muted"}">${s.uncollected > 0 ? stMoney(s.uncollected) : "&mdash;"}</td>
              <td class="num st-strong">${stMoney(s.collected + s.uncollected)}</td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="4" class="num">Total</td>
          <td class="num">${stMoney(collected)}</td>
          <td class="num ${uncollected > 0 ? "st-warn-cell" : "st-muted"}">${uncollected > 0 ? stMoney(uncollected) : "&mdash;"}</td>
          <td class="num st-strong">${stMoney(owed)}</td>
        </tr></tfoot>
      </table>` : `<div class="st-empty">No paid orders in this period.</div>`}
    </div>

    ${rows.length ? `
    <div class="st-card">
      <div class="st-card-head"><h3>Orders</h3><span>${rows.length} in this period</span></div>
      <table class="st-table">
        <thead><tr>
          <th>Date</th><th>Order</th><th>Customer</th><th>State</th>
          <th class="num">Total</th><th class="num">Rate</th><th class="num">Tax</th>
        </tr></thead>
        <tbody>
          ${rows.map(o => {
            const t = stTaxFor(o);
            const rate = stRateFor(o);
            return `
            <tr>
              <td class="st-muted">${fmt(o.created_at)}</td>
              <td class="st-strong">${escHtml(o.order_number || "—")}</td>
              <td>${escHtml(o.business_name || o.customer_name || "—")}</td>
              <td><span class="st-state">${escHtml(stOrderState(o) || "—")}</span></td>
              <td class="num">${stMoney(o.total)}</td>
              <td class="num st-muted">${rate ? (rate * 100).toFixed(2) + "%" : "&mdash;"}</td>
              <td class="num">${
                t.collected > 0
                  ? `<span class="st-strong">${stMoney(t.collected)}</span>`
                  : t.uncollected > 0
                    ? `<span class="st-pill-warn">${stMoney(t.uncollected)} not charged</span>`
                    : `<span class="st-muted">&mdash;</span>`
              }</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>` : ""}
  `;
}

function stResetFilters() {
  const f = document.getElementById("stFrom");
  const t = document.getElementById("stTo");
  const s = document.getElementById("stState");
  if (f) f.value = stLocalDate(stQuarterStart());
  if (t) t.value = "";
  if (s) s.value = "";
  stRender();
}

// One row per order, matching what is on screen -- a filing needs the
// detail behind the total, and the collected/not-collected split has to
// survive the export or the spreadsheet overstates what was received.
function stExportCsv() {
  const rows = stFilteredRows();
  if (!rows.length) { showToast("Nothing to export for this period."); return; }

  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Date", "Order", "Customer", "State", "Rate", "Order total", "Taxable", "Tax collected", "Tax not collected", "Tax owed"].map(cell).join(",")];
  for (const o of rows) {
    const t = stTaxFor(o);
    const rate = stRateFor(o);
    lines.push([
      new Date(o.created_at).toISOString().slice(0, 10),
      o.order_number || "",
      o.business_name || o.customer_name || "",
      stOrderState(o),
      rate ? (rate * 100).toFixed(2) + "%" : "",
      (Number(o.total) || 0).toFixed(2),
      t.taxable.toFixed(2),
      t.collected.toFixed(2),
      t.uncollected.toFixed(2),
      (t.collected + t.uncollected).toFixed(2),
    ].map(cell).join(","));
  }

  const from = document.getElementById("stFrom")?.value || stLocalDate(stQuarterStart());
  const to   = document.getElementById("stTo")?.value   || stLocalDate(new Date());
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales-tax_${from}_to_${to}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Exported ${rows.length} order${rows.length === 1 ? "" : "s"}`);
}

/* ── Partner (affiliate self-service) ──────────────────────────
   What a role='sub_distributor' login sees: their own referral code,
   commission rate, total sales and commission earned, and the list of
   orders attributed to them.

   Real security boundary, not a UI hide: 20260916_affiliate_self_service_
   RLS.sql scopes sub_distributors/order_referrals/orders to rows linked
   through sub_distributors.user_id = auth.uid(). This code queries the
   same way staff code does (plain select, no extra WHERE) and simply gets
   back only what RLS allows -- there is no client-side filter standing in
   for the real one, so a bug here cannot leak another affiliate's data.

   Commission is computed from AFFILIATE_COMMISSION_TIERS on this month's
   referred subtotal -- deliberately NOT a sum of the stored per-order
   order_referrals.commission_amount. Those amounts are written at checkout
   from the old flat sub_distributors.commission_pct and are per-order, so
   they can neither see the monthly bracket nor reflect the tier the
   affiliate actually earned. The payout tab (renderAffiliatePayouts) uses
   the same function on the same basis, so what a partner sees here is what
   they are paid. */

async function renderPartnerTab() {
  const wrap = document.getElementById("tab-partner");
  if (!wrap) return;
  wrap.innerHTML = `<div class="a-empty" style="padding:40px">Loading&hellip;</div>`;

  const { data: me, error: meErr } = await window.sb
    .from("sub_distributors")
    .select("*")
    .maybeSingle();

  if (meErr) {
    // "multiple (or no) rows returned" is what .maybeSingle() throws when
    // RLS hands back more than one sub_distributors row for this login --
    // it should never happen (one affiliate = one row), but has been seen
    // on an owner/staff account that still has an old affiliate row from
    // before a role change. That is a real data problem worth reporting,
    // but the raw Postgres message means nothing to a non-technical
    // reader, and an owner landing here at all (full nav access means the
    // Partner tab is still clickable, even though owner never lands here
    // automatically -- see landingTabFor()) is not the same situation as
    // an affiliate whose own dashboard is broken. Route each to a message
    // that actually explains what's going on.
    if (window._adminRole !== "sub_distributor") {
      wrap.innerHTML = `
        <div class="a-empty" style="padding:50px 20px;text-align:center">
          <p style="font-size:14px;font-weight:700;color:#0f2b50;margin:0 0 6px">This tab is for affiliate accounts</p>
          <p style="font-size:13px;color:#94a3b8;margin:0 0 10px">Your account is not a partner/affiliate login, so there's nothing to show here.</p>
          <p style="font-size:12px;color:#cbd5e1;margin:0">(Technical: ${escHtml(meErr.message)})</p>
        </div>`;
    } else {
      wrap.innerHTML = `
        <div class="a-empty" style="padding:50px 20px;text-align:center">
          <p style="font-size:14px;font-weight:700;color:#0f2b50;margin:0 0 6px">Your affiliate profile couldn't be loaded</p>
          <p style="font-size:13px;color:#94a3b8;margin:0">Your login is linked to more than one affiliate record, which shouldn't happen. Contact Room Ready Supply so we can fix the duplicate.</p>
        </div>`;
    }
    return;
  }
  if (!me) {
    // A real, visible-to-the-user state: RLS returned zero rows, meaning
    // this login has no sub_distributors.user_id pointing back to it yet
    // (the create-subdist-user link, per 20260910a). Blank screen with no
    // explanation would look like a bug rather than "not linked up".
    wrap.innerHTML = `
      <div class="a-empty" style="padding:50px 20px;text-align:center">
        <p style="font-size:14px;font-weight:700;color:#0f2b50;margin:0 0 6px">Your account isn't linked to an affiliate profile yet</p>
        <p style="font-size:13px;color:#94a3b8;margin:0">Contact Room Ready Supply and we'll connect your login to your referral code.</p>
      </div>`;
    return;
  }

  const { data: referrals, error: refErr } = await window.sb
    .from("order_referrals")
    .select("commission_amount, created_at, orders(order_number, total, subtotal, tax_amount, freight_fee, payment_status, created_at)")
    .eq("sub_distributor_id", me.id)
    .order("created_at", { ascending: false });

  if (refErr) {
    wrap.innerHTML = `<div class="a-empty" style="padding:40px">Could not load your orders: ${escHtml(refErr.message)}</div>`;
    return;
  }

  const rows = referrals || [];
  const totalSales = rows.reduce((s, r) => s + affiliateOrderRevenue(r.orders), 0);

  // Commission brackets are monthly, so the rate has to be found per
  // month and applied to that month's referred subtotal. Summing a year
  // of revenue and bracketing it once would hand every affiliate 20%.
  const revenueByMonth = {};
  rows.forEach(r => {
    const created = (r.orders && r.orders.created_at) || r.created_at;
    if (!created) return;
    const key = String(created).slice(0, 7); // YYYY-MM
    revenueByMonth[key] = (revenueByMonth[key] || 0) + affiliateOrderRevenue(r.orders);
  });
  const totalCommission = Object.values(revenueByMonth)
    .reduce((s, rev) => s + rev * affiliateCommissionRate(rev), 0);

  // This month's standing, so a partner can see the bracket they're in
  // and what the next one is worth.
  const thisMonthKey = stLocalDate(new Date()).slice(0, 7);
  const thisMonthRevenue = revenueByMonth[thisMonthKey] || 0;
  const thisMonthRate = affiliateCommissionRate(thisMonthRevenue);
  // Tax on their referred orders, for their own bookkeeping. Only paid
  // orders: tax is a liability once money clears, the same rule the staff
  // Sales Tax tab uses -- two screens must not disagree on this number.
  const totalTax = rows.reduce((s, r) => {
    const o = r.orders || {};
    return o.payment_status === "paid" ? s + (parseFloat(o.tax_amount) || 0) : s;
  }, 0);

  // Their quotes. RLS (20260916b) returns only rows carrying their
  // sub_distributor_id, so this needs no client-side filter.
  const { data: quoteRows } = await window.sb
    .from("quote_requests")
    .select("id, business_name, contact_name, status, grand_total, created_at")
    .order("created_at", { ascending: false });
  const quotes = quoteRows || [];

  const origin = window.location.origin.replace(/^https?:\/\//, "");
  const rootDomain = origin.replace(/^[^.]+\./, ""); // best-effort: strip one leading label
  const storefrontUrl = me.subdomain ? `https://${me.subdomain}.${rootDomain || "roomreadysupply.com"}` : "";

  wrap.innerHTML = `
    <div class="pt-head">
      <div>
        <h2 class="pt-title">Welcome, ${escHtml(me.name)}</h2>
        <p class="pt-sub">Your referral activity with Room Ready Supply.</p>
      </div>
    </div>

    <div class="pt-stats">
      <div class="pt-stat pt-stat--accent">
        <p class="pt-stat-label">Commission earned</p>
        <p class="pt-stat-value">${stMoney(totalCommission)}</p>
        <p class="pt-stat-sub">${(thisMonthRate * 100).toFixed(0)}% this month &middot; tiered on monthly volume</p>
      </div>
      <div class="pt-stat">
        <p class="pt-stat-label">Total sales referred</p>
        <p class="pt-stat-value">${stMoney(totalSales)}</p>
        <p class="pt-stat-sub">${rows.length} order${rows.length === 1 ? "" : "s"}</p>
      </div>
      <div class="pt-stat">
        <p class="pt-stat-label">Sales tax collected</p>
        <p class="pt-stat-value">${stMoney(totalTax)}</p>
        <p class="pt-stat-sub">On paid orders &mdash; remitted by Room Ready Supply</p>
      </div>
      <div class="pt-stat">
        <p class="pt-stat-label">Your referral code</p>
        <p class="pt-stat-value pt-code">${escHtml(me.referral_code || "—")}</p>
        <p class="pt-stat-sub">Customers enter this at checkout</p>
      </div>
    </div>

    ${me.subdomain ? `
    <div class="pt-link-card">
      <div>
        <p class="pt-link-label">Your storefront link</p>
        <p class="pt-link-url">${escHtml(storefrontUrl)}</p>
        <p class="pt-link-note">Orders placed after visiting this link are attributed to you automatically &mdash; no code needed.</p>
      </div>
      <button class="pt-btn-copy" onclick="ptCopyLink('${escHtml(storefrontUrl)}')">Copy Link</button>
    </div>` : ""}

    <div class="pt-card">
      <div class="pt-card-head"><h3>Your quote requests</h3><span>${quotes.length} total</span></div>
      ${quotes.length ? `
      <table class="pt-table">
        <thead><tr>
          <th>Date</th><th>Business</th><th>Contact</th><th>Status</th><th class="num">Quoted total</th>
        </tr></thead>
        <tbody>
          ${quotes.map(q => `
            <tr>
              <td class="pt-muted">${fmt(q.created_at)}</td>
              <td class="pt-strong">${escHtml(q.business_name || "—")}</td>
              <td>${escHtml(q.contact_name || "—")}</td>
              <td>${ptQuoteBadge(q.status)}</td>
              <td class="num">${Number(q.grand_total) > 0 ? stMoney(q.grand_total) : '<span class="pt-muted">&mdash;</span>'}</td>
            </tr>`).join("")}
        </tbody>
      </table>` : `<div class="pt-empty">No quote requests yet. Customers who request volume pricing from your storefront link will appear here.</div>`}
    </div>

    <div class="pt-card">
      <div class="pt-card-head"><h3>Commission by month</h3><span>10% / 15% / 20%</span></div>
      <p class="pt-link-note" style="padding:0 18px 4px">
        Your rate is set by each month's referred sales (product total, before sales tax and freight):
        $1&ndash;$5,000 earns 10%, $5,001&ndash;$10,000 earns 15%, and $10,001 or more earns 20%.
        The rate applies to the whole month's sales, not just the amount above a threshold.
      </p>
      ${Object.keys(revenueByMonth).length ? `
      <table class="pt-table">
        <thead><tr>
          <th>Month</th><th class="num">Referred sales</th><th class="num">Rate</th><th class="num">Commission</th>
        </tr></thead>
        <tbody>
          ${Object.keys(revenueByMonth).sort().reverse().map(k => {
            const rev  = revenueByMonth[k];
            const rate = affiliateCommissionRate(rev);
            return `
            <tr>
              <td class="pt-strong">${fmt(k + "-01")}</td>
              <td class="num">${stMoney(rev)}</td>
              <td class="num">${(rate * 100).toFixed(0)}%</td>
              <td class="num pt-strong">${stMoney(rev * rate)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>` : `<div class="pt-empty">No referred sales yet.</div>`}
    </div>

    <div class="pt-card">
      <div class="pt-card-head"><h3>Your referred orders</h3><span>${rows.length} total</span></div>
      ${rows.length ? `
      <table class="pt-table">
        <thead><tr>
          <th>Date</th><th>Order</th><th>Status</th>
          <th class="num">Order total</th><th class="num">Commissionable</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const o = r.orders || {};
            const paid = o.payment_status === "paid";
            return `
            <tr>
              <td class="pt-muted">${fmt(r.created_at || o.created_at)}</td>
              <td class="pt-strong">${escHtml(o.order_number || "—")}</td>
              <td>${paid ? '<span class="pt-badge-paid">Paid</span>' : `<span class="pt-badge-pending">${escHtml(o.payment_status || "pending")}</span>`}</td>
              <td class="num">${stMoney(o.total)}</td>
              <td class="num pt-strong">${stMoney(affiliateOrderRevenue(o))}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>` : `<div class="pt-empty">No referred orders yet. Share your link or referral code to get started.</div>`}
    </div>
  `;
}

/* ── Partner products (affiliate, read-only catalog) ─────────────
   What role='sub_distributor' sees under Products: our selling price on
   every active item, nothing they can edit, and -- deliberately -- no
   cost, no landed cost, no margin. Staff's renderProductsTable() selects
   "*", which is fine there because RLS + is_admin() already gate who can
   even reach that screen; this is a different audience, so the query
   itself only names public-safe columns rather than relying on hiding
   fields in the render step. products.cost_per_case/landed_cost/
   vendor_id are simply never requested.

   No new RLS policy needed: public_read_active_products (schema.sql)
   already lets any authenticated (or anonymous) caller read active
   products -- the same policy the storefront itself runs on. This tab
   is a read-only window onto data that was already public; it adds no
   new access, only a column list scoped to what an affiliate should
   see and a UI with no write controls at all. */
async function renderPartnerProductsTab() {
  const wrap = document.getElementById("tab-partner-products");
  if (!wrap) return;
  wrap.innerHTML = `<div class="a-empty" style="padding:40px">Loading&hellip;</div>`;

  // products_public (20260916f) excludes cost_per_case/landed_cost/
  // truckload_qty/vendor_id at the view definition itself -- belt and
  // suspenders alongside the already-explicit column list below, and
  // keeps this tab on the same safe source the storefront now uses.
  const { data: products, error } = await window.sb
    .from("products_public")
    .select(`
      id, name, sku, description, overview, image_url, category_name,
      price, sale_price, is_on_sale, case_qty, pack_size, unit,
      price_tier1, price_tier2, price_tier3, product_tier,
      product_family, variant_label, moq
    `)
    .order("category_name")
    .order("name");

  if (error) {
    wrap.innerHTML = `<div class="a-empty" style="padding:40px">Could not load products: ${escHtml(error.message)}</div>`;
    return;
  }

  const rows = products || [];

  // Same grouping key the public catalog uses to collapse size/variant
  // rows into one card (script.js renderProductGrid): product_family.
  // Flat here means "grouped into families," not "one row per SKU" --
  // 312 rows of "200 Hospitality Full Flat Sheet -- 81x102 / 81x104 /
  // 81x109..." is exactly the redundancy Eric flagged. A product with no
  // family (or the only member of one) stays its own single-row group.
  const groups = ptGroupProducts(rows);
  const categories = [...new Set(rows.map(p => p.category_name).filter(Boolean))].sort();

  wrap.innerHTML = `
    <div class="pt-head">
      <div>
        <h2 class="pt-title">Product catalog</h2>
        <p class="pt-sub">Our current selling price on every active product &mdash; for your reference when quoting customers. Read-only.</p>
      </div>
    </div>

    <div class="pt-card" style="padding:14px 18px">
      <input type="text" id="ptProdSearch" placeholder="Search products&hellip;"
        class="a-input" style="max-width:320px;display:inline-block;margin-right:10px"
        oninput="ptFilterProducts()">
      <select id="ptProdCategory" class="a-input" style="max-width:220px;display:inline-block"
        onchange="ptFilterProducts()">
        <option value="">All categories</option>
        ${categories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("")}
      </select>
    </div>

    <div class="pt-card" style="padding:0">
      <div class="pt-card-head" style="padding:16px 18px"><h3>Products</h3><span id="ptProdCount">${groups.length} product${groups.length === 1 ? "" : "s"} &middot; ${rows.length} option${rows.length === 1 ? "" : "s"}</span></div>
      ${groups.length ? `
      <div id="ptProdList">
        ${groups.map((g, i) => ptGroupRow(g, i)).join("")}
      </div>` : `<div class="pt-empty">No active products found.</div>`}
    </div>
  `;

  window._ptProducts = rows;
  window._ptGroups = groups;
}

// Collapses flat product rows into one entry per product_family (the
// same key script.js's public-facing renderProductGrid groups by), so a
// product sold in many sizes/colors appears once with its variants
// tucked behind a toggle instead of as N separate rows. A row with no
// family, or the only member of one, is its own single-variant group --
// mirrors renderProductGrid's soloIdx fallback.
function ptGroupProducts(rows) {
  const byFamily = new Map();
  const order = [];
  let soloIdx = 0;

  rows.forEach(p => {
    const key = p.product_family ? "f:" + p.product_family : "solo:" + soloIdx++;
    if (!byFamily.has(key)) { byFamily.set(key, []); order.push(key); }
    byFamily.get(key).push(p);
  });

  return order.map(key => {
    const variants = byFamily.get(key);
    const first = variants[0];
    const prices = variants.flatMap(v => [v.price, v.price_tier1, v.price_tier2, v.price_tier3, v.is_on_sale ? v.sale_price : null])
      .map(Number).filter(n => n > 0);
    return {
      key,
      family: first.product_family || null,
      name: first.product_family || first.name,
      image: first.image_url,
      category: first.category_name,
      variants,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
    };
  });
}

// One collapsed product row. A single-variant group renders its real
// price the same way the old flat row did; a multi-variant family shows
// a price range and a chevron that expands to one row per variant, each
// with its own size/label and exact price -- never a fake pooled price
// standing in for N real ones. Never cost, never margin, either level.
function ptGroupRow(g, idx) {
  const img = escHtml(g.image || "assets/img/product-placeholder.svg");
  const hasVariants = g.variants.length > 1;
  const tiers = [...new Set(g.variants.map(v => v.product_tier).filter(Boolean))];
  const tierBadges = tiers.map(t => `<span class="a-badge a-badge-gray" style="margin-left:6px">${escHtml(t)}</span>`).join("");
  const rowId = "ptGroup" + idx;

  const priceCell = g.minPrice === g.maxPrice
    ? stMoney(g.minPrice)
    : `${stMoney(g.minPrice)}&ndash;${stMoney(g.maxPrice)}`;

  const chevron = hasVariants ? `
    <svg class="pt-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform .15s">
      <polyline points="9 6 15 12 9 18"/>
    </svg>` : `<span style="width:14px;flex-shrink:0"></span>`;

  const parentRow = `
    <div class="pt-prow${hasVariants ? " pt-prow--clickable" : ""}" data-name="${escHtml(g.name.toLowerCase())}" data-category="${escHtml(g.category || "")}"
      ${hasVariants ? `onclick="ptToggleGroup('${rowId}', this)"` : ""}>
      ${chevron}
      <img src="${img}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.src='assets/img/product-placeholder.svg'">
      <div class="pt-prow-name">
        <span class="pt-strong">${escHtml(g.name)}</span>${tierBadges}
        ${hasVariants ? `<br><small class="pt-muted">${g.variants.length} options</small>` : ""}
      </div>
      <div class="pt-prow-cat">${escHtml(g.category || "&mdash;")}</div>
      <div class="pt-prow-price num pt-strong">${priceCell}</div>
    </div>`;

  if (!hasVariants) return parentRow;

  const childRows = g.variants.map(v => {
    const label = v.variant_label || v.name;
    const tierPrices = [v.price_tier1, v.price_tier2, v.price_tier3].map(Number).filter(n => n > 0);
    let vPrice;
    if (tierPrices.length) {
      const min = Math.min(...tierPrices), max = Math.max(...tierPrices);
      vPrice = min === max ? stMoney(min) : `${stMoney(min)}&ndash;${stMoney(max)}`;
    } else if (v.is_on_sale && v.sale_price) {
      vPrice = `<span class="pt-muted" style="text-decoration:line-through">${stMoney(v.price)}</span> ${stMoney(v.sale_price)}`;
    } else {
      vPrice = stMoney(v.price);
    }
    return `
      <div class="pt-vrow">
        <span class="pt-vrow-label">${escHtml(label)}</span>
        <span class="pt-vrow-case">${v.case_qty || 1} / ${v.pack_size || 1} ${escHtml(v.unit || "Case")}</span>
        <span class="pt-vrow-price num">${vPrice}</span>
      </div>`;
  }).join("");

  return `${parentRow}<div id="${rowId}" class="pt-vlist" hidden>${childRows}</div>`;
}

function ptToggleGroup(rowId, headerEl) {
  const el = document.getElementById(rowId);
  if (!el) return;
  el.hidden = !el.hidden;
  headerEl.querySelector(".pt-chevron")?.style.setProperty("transform", el.hidden ? "" : "rotate(90deg)");
}

function ptFilterProducts() {
  const q = (document.getElementById("ptProdSearch")?.value || "").toLowerCase().trim();
  const cat = document.getElementById("ptProdCategory")?.value || "";
  const items = document.querySelectorAll("#ptProdList > .pt-prow");
  let visible = 0;
  items.forEach(row => {
    const matchesQ = !q || row.dataset.name.includes(q);
    const matchesCat = !cat || row.dataset.category === cat;
    const show = matchesQ && matchesCat;
    row.style.display = show ? "" : "none";
    // The variant list sits right after its parent row in the DOM
    // (ptGroupRow's return). A filtered-out row must force its variant
    // list closed too, but a filtered-BACK-in row must not force it
    // open -- that would override the user's own collapse/expand state,
    // stored on the same element as its `hidden` attribute (ptToggleGroup).
    // Only ever override toward hidden, never toward visible.
    const next = row.nextElementSibling;
    if (next && next.classList.contains("pt-vlist") && !show) next.style.display = "none";
    else if (next && next.classList.contains("pt-vlist")) next.style.removeProperty("display");
    if (show) visible++;
  });
  const countEl = document.getElementById("ptProdCount");
  if (countEl) countEl.textContent = `${visible} of ${(window._ptGroups || []).length} products`;
}

// Quote status as the affiliate should read it. Deliberately plain words
// rather than the raw DB status -- "pending"/"quoted"/"accepted" are our
// internal pipeline names, not something a partner should have to decode.
function ptQuoteBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "accepted")  return '<span class="pt-badge-paid">Accepted</span>';
  if (s === "quoted")    return '<span class="pt-badge-quoted">Quote sent</span>';
  if (s === "declined" || s === "lost") return '<span class="pt-badge-muted">Closed</span>';
  return '<span class="pt-badge-pending">Awaiting pricing</span>';
}

function ptCopyLink(url) {
  navigator.clipboard?.writeText(url).then(
    () => showToast("Link copied"),
    () => showToast("Could not copy &mdash; select and copy manually.")
  );
}
