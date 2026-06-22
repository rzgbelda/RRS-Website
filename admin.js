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
  document.getElementById("openCsvImport")?.addEventListener("click", openCsvImport);
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

/* ── CSV Bulk Import ─────────────────────────────────────────── */

let _csvRows    = [];
let _csvRunning = false;

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

  const BATCH   = 100;
  const total   = _csvRows.length;
  let inserted  = 0;
  let updated   = 0;
  const errLines = [];

  const setProgress = (done) => {
    const pct = Math.round((done / total) * 100);
    document.getElementById("csvProgressBar").style.width = pct + "%";
    document.getElementById("csvProgressSub").textContent = `${done.toLocaleString()} / ${total.toLocaleString()} processed`;
  };
  setProgress(0);

  /* Process in chunks */
  for (let start = 0; start < total; start += BATCH) {
    const chunk  = _csvRows.slice(start, start + BATCH);
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

