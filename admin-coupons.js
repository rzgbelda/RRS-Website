/* ============================================================
   Room Ready Supply — Coupons
   ------------------------------------------------------------
   Admin > Coupons: create, generate and manage discount codes
   (public.coupons, 20261019_coupons.sql).

   Phase 1 is staff-side only. Checkout does not accept a code yet; phase 2
   applies them server-side in api/_lib/price-cart.js. The eligibility rule
   below (couponCovers) is the contract that phase 2 must mirror, the same
   way price-cart.js mirrors the tier rules in script.js.

   Best Deals items are excluded by default: they are already discounted.
   Each coupon can opt them back in with "Allow Best Deals items".

   Loaded after admin.js and uses its globals: window.sb, escHtml,
   showToast, friendlyDbError, openModal/closeModal.
   ============================================================ */

const CPN = (() => {

  // No 0/O or 1/I/L: codes get read out over the phone and typed from print.
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
  const PICKER_LIMIT = 250;   // rows rendered at once in the product picker
  const BULK_MAX = 200;

  let coupons = [];
  let products = [];          // active products: sku, name, image_url, category_name, price
  let dealSkus = new Set();   // SKUs with an active Best Deal
  let filter = { q: "", status: "all" };

  // Editor state, rebuilt each time the modal opens.
  let ed = null;

  /* ── Helpers ──────────────────────────────────────────────── */

  const money = n => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const normCode = s => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

  function randomPart(len) {
    const bytes = new Uint32Array(len);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return out;
  }

  // PREFIX-XXXXXX, unique against existing codes and `taken`.
  function generateCode(prefix, taken = new Set()) {
    const p = normCode(prefix).replace(/[^A-Z0-9_-]/g, "").replace(/-+$/, "").slice(0, 20);
    const existing = new Set(coupons.map(c => c.code));
    for (let i = 0; i < 50; i++) {
      const code = (p ? p + "-" : "") + randomPart(p ? 6 : 8);
      if (!existing.has(code) && !taken.has(code)) return code;
    }
    return (p ? p + "-" : "") + randomPart(10);
  }

  function statusOf(c, now = Date.now()) {
    if (!c.is_active) return { key: "disabled", label: "Disabled", cls: "a-badge-gray" };
    if (c.starts_at && new Date(c.starts_at).getTime() > now) return { key: "scheduled", label: "Scheduled", cls: "a-badge-blue" };
    if (c.expires_at && new Date(c.expires_at).getTime() <= now) return { key: "expired", label: "Expired", cls: "a-badge-red" };
    if (c.usage_limit && c.times_used >= c.usage_limit) return { key: "usedup", label: "Used up", cls: "a-badge-orange" };
    return { key: "active", label: "Active", cls: "a-badge-green" };
  }

  function discountLabel(c) {
    const v = Number(c.discount_value);
    if (c.discount_type === "percent") {
      return `${v % 1 ? v.toFixed(2) : v}% off` + (c.max_discount != null ? ` <span class="cpn-muted">(max ${money(c.max_discount)})</span>` : "");
    }
    return `${money(v)} off`;
  }

  function scopeLabel(c) {
    const ex = (c.exclude_skus || []).length;
    const exTxt = ex ? ` <span class="cpn-muted">· ${ex} excluded</span>` : "";
    if (c.applies_to === "products") {
      const n = (c.product_skus || []).length;
      return `${n} product${n === 1 ? "" : "s"}`;
    }
    if (c.applies_to === "categories") {
      const cats = c.category_names || [];
      const shown = cats.slice(0, 2).map(escHtml).join(", ");
      return `${shown}${cats.length > 2 ? ` +${cats.length - 2} more` : ""}${exTxt}`;
    }
    return `All products${exTxt}`;
  }

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  function validityLabel(c) {
    if (!c.starts_at && !c.expires_at) return `<span class="cpn-muted">No end date</span>`;
    if (c.starts_at && c.expires_at) return `${fmtDate(c.starts_at)} – ${fmtDate(c.expires_at)}`;
    if (c.expires_at) return `Until ${fmtDate(c.expires_at)}`;
    return `From ${fmtDate(c.starts_at)}`;
  }

  // ISO -> value for <input type="datetime-local"> in the viewer's timezone.
  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const fromLocalInput = v => v ? new Date(v).toISOString() : null;

  /* ── Eligibility (phase 2 mirrors this server-side) ───────── */

  // Does coupon `c` discount product `p`? `p` needs sku + category_name.
  function couponCovers(c, p, deals) {
    if (!c.include_best_deals && deals.has(p.sku)) return false;
    if (c.applies_to === "products") return (c.product_skus || []).includes(p.sku);
    if ((c.exclude_skus || []).includes(p.sku)) return false;
    if (c.applies_to === "categories") return (c.category_names || []).includes(p.category_name);
    return true;
  }

  /* ── Data ─────────────────────────────────────────────────── */

  async function loadCatalog() {
    if (products.length) return;
    const [{ data: prods }, { data: deals }] = await Promise.all([
      window.sb.from("products").select("sku,name,image_url,category_name,price").eq("is_active", true).order("name"),
      window.sb.from("best_deals").select("sku").eq("is_active", true),
    ]);
    products = prods || [];
    dealSkus = new Set((deals || []).map(d => d.sku));
  }

  async function loadCoupons() {
    const { data, error } = await window.sb.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    coupons = data || [];
  }

  /* ── List view ────────────────────────────────────────────── */

  async function render() {
    const root = document.getElementById("couponsRoot");
    if (!root) return;
    ensureModal();
    root.innerHTML = `<div class="a-empty" style="padding:40px">Loading…</div>`;
    try {
      await Promise.all([loadCoupons(), loadCatalog()]);
    } catch (error) {
      const msg = error.message || "";
      root.innerHTML = `<div class="a-empty" style="padding:40px">${
        /coupons/.test(msg) && /exist|schema cache/i.test(msg)
          ? "Coupons aren't set up on the database yet — run <code>20261019_coupons.sql</code> in Supabase."
          : "Couldn't load coupons: " + escHtml(msg)}</div>`;
      return;
    }
    root.innerHTML = `
      <div class="a-stats-grid cpn-stats" id="cpnStats"></div>
      <div class="a-card cpn-card">
        <div class="cpn-toolbar">
          <input class="a-input cpn-search" placeholder="Search code or note…" value="${escHtml(filter.q)}"
                 oninput="CPN.setFilter('q', this.value)">
          <select class="a-input cpn-status-filter" onchange="CPN.setFilter('status', this.value)">
            ${[["all","All statuses"],["active","Active"],["scheduled","Scheduled"],["expired","Expired"],["usedup","Used up"],["disabled","Disabled"]]
              .map(([v, l]) => `<option value="${v}"${filter.status === v ? " selected" : ""}>${l}</option>`).join("")}
          </select>
          <button class="a-btn-secondary cpn-btn" onclick="CPN.copyVisible()" title="Copy the codes in this list, one per line">Copy codes</button>
        </div>
        <div id="cpnList"></div>
      </div>`;
    renderStats();
    renderList();
  }

  function renderStats() {
    const el = document.getElementById("cpnStats");
    if (!el) return;
    const counts = { active: 0, scheduled: 0, ended: 0 };
    let uses = 0;
    for (const c of coupons) {
      const s = statusOf(c).key;
      if (s === "active") counts.active++;
      else if (s === "scheduled") counts.scheduled++;
      else counts.ended++;
      uses += c.times_used || 0;
    }
    const card = (label, value, sub) => `
      <div class="a-stat-card cpn-stat">
        <div><p class="a-stat-label">${label}</p><p class="a-stat-value">${value}</p>${sub ? `<p class="cpn-stat-sub">${sub}</p>` : ""}</div>
      </div>`;
    el.innerHTML =
      card("Active codes", counts.active) +
      card("Scheduled", counts.scheduled) +
      card("Ended / disabled", counts.ended) +
      card("Times redeemed", uses, "counts start once checkout accepts codes");
  }

  function setFilter(key, value) {
    filter[key] = value;
    renderList();
  }

  function renderList() {
    const el = document.getElementById("cpnList");
    if (!el) return;
    const q = filter.q.trim().toUpperCase();
    const rows = coupons.filter(c =>
      (filter.status === "all" || statusOf(c).key === filter.status) &&
      (!q || c.code.includes(q) || String(c.description || "").toUpperCase().includes(q)));

    if (!coupons.length) {
      el.innerHTML = `<div class="a-empty" style="padding:40px">No coupons yet. Click "+ New Coupon" to create one.</div>`;
      return;
    }
    if (!rows.length) {
      el.innerHTML = `<div class="a-empty" style="padding:32px">No coupons match.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="a-table-wrap">
        <table class="a-table cpn-table">
          <thead><tr>
            <th>Code</th><th>Discount</th><th>Applies to</th><th>Best Deals</th>
            <th>Valid</th><th>Uses</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows.map(rowHtml).join("")}</tbody>
        </table>
      </div>`;
  }

  function rowHtml(c) {
    const s = statusOf(c);
    const uses = `${c.times_used || 0}${c.usage_limit ? " / " + c.usage_limit : ""}`;
    return `
      <tr class="${s.key === "disabled" ? "cpn-row-off" : ""}">
        <td>
          <div class="cpn-code-cell">
            <code class="cpn-code">${escHtml(c.code)}</code>
            <button class="cpn-icon-btn" title="Copy code" onclick="CPN.copy('${escHtml(c.code)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          ${c.description ? `<div class="cpn-note">${escHtml(c.description)}</div>` : ""}
        </td>
        <td>${discountLabel(c)}${c.min_subtotal ? `<div class="cpn-muted">min order ${money(c.min_subtotal)}</div>` : ""}</td>
        <td>${scopeLabel(c)}</td>
        <td>${c.include_best_deals
              ? `<span class="a-badge a-badge-orange">Included</span>`
              : `<span class="a-badge a-badge-gray">Excluded</span>`}</td>
        <td class="cpn-nowrap">${validityLabel(c)}</td>
        <td class="cpn-nowrap">${uses}${c.per_customer_limit ? `<div class="cpn-muted">${c.per_customer_limit}/customer</div>` : ""}</td>
        <td><span class="a-badge ${s.cls}">${s.label}</span></td>
        <td>
          <div class="cpn-actions">
            <button class="a-btn-secondary cpn-btn" onclick="CPN.edit('${c.id}')">Edit</button>
            <button class="cpn-icon-btn" title="Duplicate with a new code" aria-label="Duplicate" onclick="CPN.duplicate('${c.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/><path d="M14.5 12v6M11.5 15h6"/></svg>
            </button>
            <button class="cpn-icon-btn" title="${c.is_active ? "Disable (pause) this code" : "Enable this code"}" aria-label="${c.is_active ? "Disable" : "Enable"}" onclick="CPN.toggleActive('${c.id}')">
              ${c.is_active
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4l13 8-13 8z"/></svg>`}
            </button>
            <button class="cpn-icon-btn cpn-btn-danger" title="Delete" aria-label="Delete" onclick="CPN.remove('${c.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }

  async function copy(code) {
    try { await navigator.clipboard.writeText(code); showToast(`Copied ${code}`); }
    catch (_) { showToast(code); }
  }

  async function toggleActive(id) {
    const c = coupons.find(x => x.id === id);
    if (!c) return;
    const { error } = await window.sb.from("coupons")
      .update({ is_active: !c.is_active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { showToast("Couldn't update: " + friendlyDbError(error)); return; }
    showToast(c.is_active ? `${c.code} disabled.` : `${c.code} enabled.`);
    render();
  }

  async function remove(id) {
    const c = coupons.find(x => x.id === id);
    if (!c) return;
    const msg = c.times_used > 0
      ? `${c.code} has been used ${c.times_used} time(s). Disabling keeps its history — delete it anyway?`
      : `Delete coupon ${c.code}? This can't be undone.`;
    if (!confirm(msg)) return;
    const { error } = await window.sb.from("coupons").delete().eq("id", id);
    if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
    showToast(`${c.code} deleted.`);
    render();
  }

  /* ── Editor modal ─────────────────────────────────────────── */

  function ensureModal() {
    if (document.getElementById("couponModal")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
    <div id="couponModal" class="a-modal-overlay" style="display:none">
      <div class="a-modal cpn-modal">
        <div class="a-modal-header">
          <h3 id="cpnModalTitle">New Coupon</h3>
          <button class="a-modal-close" onclick="closeModal('couponModal')">&times;</button>
        </div>
        <div class="a-modal-body" id="cpnModalBody"></div>
        <div class="a-modal-footer">
          <span class="cpn-eligible" id="cpnEligible"></span>
          <button class="a-btn-secondary" onclick="closeModal('couponModal')">Cancel</button>
          <button class="a-btn-primary" id="cpnSaveBtn" onclick="CPN.save()">Save Coupon</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  function blankCoupon() {
    return {
      id: null, code: generateCode("RRS"), description: "",
      discount_type: "percent", discount_value: "", max_discount: null, min_subtotal: null,
      applies_to: "all", product_skus: [], category_names: [], exclude_skus: [],
      include_best_deals: false, starts_at: null, expires_at: null,
      usage_limit: null, per_customer_limit: null, is_active: true,
    };
  }

  async function openNew() {
    ensureModal();
    await loadCatalog();
    openEditor(blankCoupon(), "New Coupon");
  }

  async function edit(id) {
    const c = coupons.find(x => x.id === id);
    if (!c) return;
    await loadCatalog();
    openEditor({ ...c }, `Edit ${c.code}`);
  }

  async function duplicate(id) {
    const c = coupons.find(x => x.id === id);
    if (!c) return;
    await loadCatalog();
    const prefix = c.code.includes("-") ? c.code.split("-")[0] : c.code.slice(0, 6);
    openEditor({ ...c, id: null, code: generateCode(prefix), times_used: 0, is_active: true }, "New Coupon (copy)");
  }

  function openEditor(c, title) {
    ed = {
      c,
      bulk: 1,
      prefix: c.code && c.code.includes("-") ? c.code.split("-")[0] : "RRS",
      pickQ: "",
      pickCat: "",
      pickSelectedOnly: false,
      selected: new Set(c.product_skus || []),
      excluded: new Set(c.exclude_skus || []),
      cats: new Set(c.category_names || []),
    };
    document.getElementById("cpnModalTitle").textContent = title;
    renderEditor();
    openModal("couponModal");
  }

  function categories() {
    const counts = new Map();
    for (const p of products) {
      const k = p.category_name || "";
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderEditor() {
    const c = ed.c;
    const isNew = !c.id;
    const body = document.getElementById("cpnModalBody");
    body.innerHTML = `
      <div class="cpn-section">
        <div class="cpn-section-title">Code</div>
        ${isNew ? `
        <div class="cpn-bulk-row">
          <label class="cpn-radio"><input type="radio" name="cpnMode" value="1" ${ed.bulk === 1 ? "checked" : ""} onchange="CPN.setBulk(1)"> One code</label>
          <label class="cpn-radio"><input type="radio" name="cpnMode" value="n" ${ed.bulk > 1 ? "checked" : ""} onchange="CPN.setBulk(10)"> Generate many unique codes</label>
        </div>` : ""}
        ${ed.bulk > 1 ? `
        <div class="tkt-form-row">
          <div class="cms-form-group">
            <label class="cms-label">Prefix <span class="cms-label-hint">e.g. FALL</span></label>
            <input id="cpnPrefix" class="a-input cpn-mono" maxlength="20" value="${escHtml(ed.prefix)}" oninput="CPN.onPrefix(this.value)">
          </div>
          <div class="cms-form-group">
            <label class="cms-label">How many <span class="cms-label-hint">up to ${BULK_MAX}</span></label>
            <input id="cpnBulkCount" type="number" min="2" max="${BULK_MAX}" class="a-input" value="${ed.bulk}" oninput="CPN.onBulkCount(this.value)">
          </div>
        </div>
        <p class="cpn-hint">Each code gets the same rules below. Example: <code class="cpn-code">${escHtml(generateCode(ed.prefix))}</code>. Single-use codes usually want “Total uses” = 1.</p>
        ` : `
        <div class="cms-form-group">
          <div class="cpn-code-input">
            <input id="cpnCode" class="a-input cpn-mono" maxlength="32" value="${escHtml(c.code)}" ${isNew ? "" : "readonly"}
                   oninput="this.value=this.value.toUpperCase().replace(/\\s+/g,'')" placeholder="e.g. WELCOME10">
            ${isNew ? `<button type="button" class="a-btn-secondary" onclick="CPN.regen()">Generate</button>` : ""}
          </div>
          <p class="cpn-hint">${isNew ? "Type your own (3–32 letters, numbers, - or _) or generate a random one." : "A code can't be renamed once created — duplicate it instead."}</p>
        </div>`}
        <div class="cms-form-group">
          <label class="cms-label">Internal note <span class="cms-label-hint">staff only, never shown to customers</span></label>
          <input id="cpnDesc" class="a-input" maxlength="200" value="${escHtml(c.description || "")}" placeholder="e.g. Fall email campaign, 10% off towels">
        </div>
      </div>

      <div class="cpn-section">
        <div class="cpn-section-title">Discount</div>
        <div class="tkt-form-row">
          <div class="cms-form-group">
            <label class="cms-label">Type</label>
            <select id="cpnType" class="a-input" onchange="CPN.onType(this.value)">
              <option value="percent"${c.discount_type === "percent" ? " selected" : ""}>Percent off</option>
              <option value="fixed"${c.discount_type === "fixed" ? " selected" : ""}>Fixed amount off ($)</option>
            </select>
          </div>
          <div class="cms-form-group">
            <label class="cms-label">${c.discount_type === "percent" ? "Percent" : "Amount"}</label>
            <div class="cpn-affix">
              ${c.discount_type === "fixed" ? `<span>$</span>` : ""}
              <input id="cpnValue" type="number" min="0" step="0.01" ${c.discount_type === "percent" ? 'max="100"' : ""} class="a-input" value="${c.discount_value ?? ""}" placeholder="${c.discount_type === "percent" ? "10" : "25.00"}">
              ${c.discount_type === "percent" ? `<span>%</span>` : ""}
            </div>
          </div>
        </div>
        <div class="tkt-form-row">
          ${c.discount_type === "percent" ? `
          <div class="cms-form-group">
            <label class="cms-label">Max discount <span class="cms-label-hint">optional cap</span></label>
            <div class="cpn-affix"><span>$</span><input id="cpnMax" type="number" min="0" step="0.01" class="a-input" value="${c.max_discount ?? ""}" placeholder="No cap"></div>
          </div>` : ""}
          <div class="cms-form-group">
            <label class="cms-label">Minimum order <span class="cms-label-hint">merchandise subtotal</span></label>
            <div class="cpn-affix"><span>$</span><input id="cpnMin" type="number" min="0" step="0.01" class="a-input" value="${c.min_subtotal ?? ""}" placeholder="None"></div>
          </div>
        </div>
        <p class="cpn-hint">The discount is taken off the eligible items only, before tax and shipping. A fixed amount never exceeds the eligible items' total.</p>
      </div>

      <div class="cpn-section">
        <div class="cpn-section-title">Eligible items</div>
        <div class="cpn-seg">
          ${[["all","All products"],["categories","Categories"],["products","Specific products"]].map(([v, l]) =>
            `<button type="button" class="cpn-seg-btn${c.applies_to === v ? " on" : ""}" onclick="CPN.onScope('${v}')">${l}</button>`).join("")}
        </div>

        <label class="cpn-switch">
          <input type="checkbox" id="cpnBD" ${c.include_best_deals ? "checked" : ""} onchange="CPN.onBestDeals(this.checked)">
          <span class="cpn-switch-track"></span>
          <span><strong>Allow Best Deals items</strong>
            <span class="cpn-muted">— off by default: ${dealSkus.size} product${dealSkus.size === 1 ? " is" : "s are"} already on Best Deals pricing.</span></span>
        </label>

        ${c.applies_to === "categories" ? categoryPickerHtml() : ""}
        <div id="cpnPicker"></div>
      </div>

      <div class="cpn-section">
        <div class="cpn-section-title">Limits &amp; schedule</div>
        <div class="tkt-form-row">
          <div class="cms-form-group">
            <label class="cms-label">Starts <span class="cms-label-hint">blank = now</span></label>
            <input id="cpnStart" type="datetime-local" class="a-input" value="${toLocalInput(c.starts_at)}">
          </div>
          <div class="cms-form-group">
            <label class="cms-label">Expires <span class="cms-label-hint">blank = never</span></label>
            <input id="cpnEnd" type="datetime-local" class="a-input" value="${toLocalInput(c.expires_at)}">
          </div>
        </div>
        <div class="tkt-form-row">
          <div class="cms-form-group">
            <label class="cms-label">Total uses <span class="cms-label-hint">blank = unlimited</span></label>
            <input id="cpnLimit" type="number" min="1" step="1" class="a-input" value="${c.usage_limit ?? ""}" placeholder="Unlimited">
          </div>
          <div class="cms-form-group">
            <label class="cms-label">Uses per customer <span class="cms-label-hint">by email</span></label>
            <input id="cpnPerCust" type="number" min="1" step="1" class="a-input" value="${c.per_customer_limit ?? ""}" placeholder="Unlimited">
          </div>
        </div>
        <label class="cpn-switch">
          <input type="checkbox" id="cpnActive" ${c.is_active ? "checked" : ""}>
          <span class="cpn-switch-track"></span>
          <span><strong>Active</strong> <span class="cpn-muted">— turn off to pause the code without deleting it</span></span>
        </label>
      </div>`;
    renderPicker();
  }

  // Keep typed values when the editor re-renders (type/scope/bulk switches).
  function captureForm() {
    const c = ed.c;
    const val = id => document.getElementById(id)?.value;
    if (val("cpnCode") != null) c.code = normCode(val("cpnCode"));
    if (val("cpnDesc") != null) c.description = val("cpnDesc");
    if (val("cpnValue") != null) c.discount_value = val("cpnValue");
    if (val("cpnMax") != null) c.max_discount = val("cpnMax") || null;
    if (val("cpnMin") != null) c.min_subtotal = val("cpnMin") || null;
    if (val("cpnStart") != null) c.starts_at = fromLocalInput(val("cpnStart"));
    if (val("cpnEnd") != null) c.expires_at = fromLocalInput(val("cpnEnd"));
    if (val("cpnLimit") != null) c.usage_limit = val("cpnLimit") || null;
    if (val("cpnPerCust") != null) c.per_customer_limit = val("cpnPerCust") || null;
    const active = document.getElementById("cpnActive");
    if (active) c.is_active = active.checked;
  }

  function rerender() { captureForm(); renderEditor(); }

  function setBulk(n) { ed.bulk = n; rerender(); }
  function onBulkCount(v) { ed.bulk = Math.max(2, Math.min(BULK_MAX, parseInt(v, 10) || 2)); }
  function onPrefix(v) { ed.prefix = normCode(v).replace(/[^A-Z0-9_-]/g, ""); }
  function regen() {
    const input = document.getElementById("cpnCode");
    const cur = normCode(input.value);
    input.value = generateCode(cur.includes("-") ? cur.split("-")[0] : "RRS");
  }
  function onType(v) {
    captureForm();
    ed.c.discount_type = v;
    if (v === "fixed") ed.c.max_discount = null;
    renderEditor();
  }
  function onScope(v) { captureForm(); ed.c.applies_to = v; renderEditor(); }

  function onBestDeals(on) {
    ed.c.include_best_deals = on;
    if (!on) for (const sku of dealSkus) ed.selected.delete(sku);
    renderPicker();
  }

  function categoryPickerHtml() {
    const cats = categories();
    return `
      <div class="cpn-cat-grid">
        ${cats.map(([name, n]) => `
          <label class="cpn-cat${ed.cats.has(name) ? " on" : ""}">
            <input type="checkbox" ${ed.cats.has(name) ? "checked" : ""} onchange="CPN.toggleCat(this, ${escHtml(JSON.stringify(name))})">
            <span>${escHtml(name)}</span><span class="cpn-muted">${n}</span>
          </label>`).join("")}
      </div>`;
  }

  function toggleCat(input, name) {
    if (input.checked) ed.cats.add(name); else ed.cats.delete(name);
    input.closest(".cpn-cat").classList.toggle("on", input.checked);
    renderPicker();
  }

  // Coupon as currently edited, for eligibility checks.
  function draft() {
    return {
      ...ed.c,
      product_skus: [...ed.selected],
      exclude_skus: [...ed.excluded],
      category_names: [...ed.cats],
    };
  }

  // Product list. "products" scope: tick to include. Other scopes: tick to
  // EXCLUDE (collapsed by default, it's the rarer need).
  function renderPicker() {
    const el = document.getElementById("cpnPicker");
    if (!el) return;
    const c = ed.c;
    const include = c.applies_to === "products";
    const d = draft();

    let pool = products;
    if (c.applies_to === "categories") pool = products.filter(p => ed.cats.has(p.category_name));

    const q = ed.pickQ.trim().toLowerCase();
    const set = include ? ed.selected : ed.excluded;
    const matches = pool.filter(p =>
      (!ed.pickCat || p.category_name === ed.pickCat) &&
      (!ed.pickSelectedOnly || set.has(p.sku)) &&
      (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));
    const shown = matches.slice(0, PICKER_LIMIT);

    const catOpts = (c.applies_to === "categories" ? categories().filter(([n]) => ed.cats.has(n)) : categories())
      .map(([n]) => `<option value="${escHtml(n)}"${ed.pickCat === n ? " selected" : ""}>${escHtml(n)}</option>`).join("");

    const head = include
      ? `<div class="cpn-picker-head"><strong>${ed.selected.size}</strong> product${ed.selected.size === 1 ? "" : "s"} selected</div>`
      : `<div class="cpn-picker-head">Exclude specific products <span class="cpn-muted">(optional${ed.excluded.size ? ` · ${ed.excluded.size} excluded` : ""})</span></div>`;

    const listOpen = include || ed.excludeOpen || ed.excluded.size > 0;
    el.innerHTML = `
      <div class="cpn-picker">
        ${head}
        ${!listOpen ? `<button type="button" class="a-btn-secondary cpn-btn" onclick="CPN.openExclude()">Choose products to exclude</button>` : `
        <div class="cpn-picker-tools">
          <input class="a-input" placeholder="Search name or item #" value="${escHtml(ed.pickQ)}" oninput="CPN.onPickQ(this.value)" id="cpnPickQ">
          <select class="a-input" onchange="CPN.onPickCat(this.value)"><option value="">All categories</option>${catOpts}</select>
          <label class="cpn-check-inline"><input type="checkbox" ${ed.pickSelectedOnly ? "checked" : ""} onchange="CPN.onPickSelectedOnly(this.checked)"> ${include ? "Selected" : "Excluded"} only</label>
        </div>
        <div class="cpn-picker-bulk">
          <button type="button" class="cpn-link" onclick="CPN.pickAllShown(true)">${include ? "Select" : "Exclude"} all shown</button>
          <button type="button" class="cpn-link" onclick="CPN.pickAllShown(false)">Clear shown</button>
          <span class="cpn-muted">${matches.length > shown.length ? `Showing ${shown.length} of ${matches.length} — refine the search to see more` : `${matches.length} shown`}</span>
        </div>
        <div class="cpn-plist">
          ${shown.length ? shown.map(p => {
            const isDeal = dealSkus.has(p.sku);
            const locked = isDeal && !c.include_best_deals && include;
            const checked = set.has(p.sku) && !locked;
            const eligible = couponCovers(d, p, dealSkus);
            return `
            <label class="cpn-prow${locked ? " locked" : ""}${checked ? " on" : ""}" title="${locked ? "Best Deals item — turn on “Allow Best Deals items” to include it" : ""}">
              <input type="checkbox" ${checked ? "checked" : ""} ${locked ? "disabled" : ""} onchange="CPN.togglePick(${escHtml(JSON.stringify(p.sku))}, this.checked)">
              <img src="${escHtml(p.image_url || "")}" alt="" loading="lazy">
              <span class="cpn-pname">${escHtml(p.name)}<span class="cpn-psku">${escHtml(p.sku)}${p.category_name ? " · " + escHtml(p.category_name) : ""}</span></span>
              ${isDeal ? `<span class="a-badge a-badge-orange">Best Deal</span>` : ""}
              ${!include ? `<span class="cpn-elig ${eligible ? "yes" : "no"}">${eligible ? "Eligible" : "Not eligible"}</span>` : ""}
              <span class="cpn-pprice">${money(p.price)}</span>
            </label>`;
          }).join("") : `<div class="a-empty" style="padding:20px">No products match.</div>`}
        </div>`}
      </div>`;
    updateEligible();
  }

  function openExclude() { ed.excludeOpen = true; renderPicker(); }
  function onPickQ(v) {
    ed.pickQ = v;
    renderPicker();
    const input = document.getElementById("cpnPickQ");
    if (input) { input.focus(); input.setSelectionRange(v.length, v.length); }
  }
  function onPickCat(v) { ed.pickCat = v; renderPicker(); }
  function onPickSelectedOnly(on) { ed.pickSelectedOnly = on; renderPicker(); }

  function togglePick(sku, on) {
    const set = ed.c.applies_to === "products" ? ed.selected : ed.excluded;
    if (on) set.add(sku); else set.delete(sku);
    renderPicker();
  }

  function pickAllShown(on) {
    const include = ed.c.applies_to === "products";
    const set = include ? ed.selected : ed.excluded;
    const q = ed.pickQ.trim().toLowerCase();
    let pool = ed.c.applies_to === "categories" ? products.filter(p => ed.cats.has(p.category_name)) : products;
    pool = pool.filter(p =>
      (!ed.pickCat || p.category_name === ed.pickCat) &&
      (!ed.pickSelectedOnly || set.has(p.sku)) &&
      (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))).slice(0, PICKER_LIMIT);
    for (const p of pool) {
      if (on && include && dealSkus.has(p.sku) && !ed.c.include_best_deals) continue;
      if (on) set.add(p.sku); else set.delete(p.sku);
    }
    renderPicker();
  }

  function updateEligible() {
    const el = document.getElementById("cpnEligible");
    if (!el) return;
    const d = draft();
    let n = 0, dealsBlocked = 0;
    for (const p of products) {
      if (couponCovers(d, p, dealSkus)) n++;
      else if (dealSkus.has(p.sku) && couponCovers({ ...d, include_best_deals: true }, p, dealSkus)) dealsBlocked++;
    }
    el.innerHTML = `<strong>${n}</strong> eligible product${n === 1 ? "" : "s"}` +
      (dealsBlocked ? ` <span class="cpn-muted">· ${dealsBlocked} Best Deal${dealsBlocked === 1 ? "" : "s"} excluded</span>` : "");
  }

  /* ── Save ─────────────────────────────────────────────────── */

  const numOrNull = v => (v === "" || v == null) ? null : Number(v);

  async function save() {
    captureForm();
    const c = ed.c;
    const isNew = !c.id;

    const value = Number(c.discount_value);
    if (!(value > 0)) return showToast("Enter a discount above 0.");
    if (c.discount_type === "percent" && value > 100) return showToast("A percent discount can't be over 100%.");
    const maxDiscount = c.discount_type === "percent" ? numOrNull(c.max_discount) : null;
    if (maxDiscount != null && !(maxDiscount > 0)) return showToast("Max discount must be above $0, or blank.");
    const minSubtotal = numOrNull(c.min_subtotal);
    if (minSubtotal != null && !(minSubtotal >= 0)) return showToast("Minimum order can't be negative.");
    if (c.discount_type === "fixed" && minSubtotal != null && minSubtotal > 0 && value > minSubtotal) {
      if (!confirm(`The discount (${money(value)}) is more than the minimum order (${money(minSubtotal)}). Save anyway?`)) return;
    }

    const usageLimit = numOrNull(c.usage_limit);
    const perCustomer = numOrNull(c.per_customer_limit);
    for (const [label, v] of [["Total uses", usageLimit], ["Uses per customer", perCustomer]]) {
      if (v != null && !(Number.isInteger(v) && v > 0)) return showToast(`${label} must be a whole number above 0, or blank.`);
    }
    if (c.starts_at && c.expires_at && new Date(c.expires_at) <= new Date(c.starts_at)) {
      return showToast("The expiry date must be after the start date.");
    }
    if (isNew && c.expires_at && new Date(c.expires_at) <= new Date()) {
      return showToast("The expiry date is already in the past.");
    }

    // Best Deals SKUs never get stored as included while the toggle is off.
    const productSkus = [...ed.selected].filter(s => c.include_best_deals || !dealSkus.has(s));
    if (c.applies_to === "products" && !productSkus.length) return showToast("Pick at least one product.");
    if (c.applies_to === "categories" && !ed.cats.size) return showToast("Pick at least one category.");

    const base = {
      description: String(c.description || "").trim() || null,
      discount_type: c.discount_type,
      discount_value: Math.round(value * 100) / 100,
      max_discount: maxDiscount != null ? Math.round(maxDiscount * 100) / 100 : null,
      min_subtotal: minSubtotal != null ? Math.round(minSubtotal * 100) / 100 : null,
      applies_to: c.applies_to,
      product_skus: c.applies_to === "products" ? productSkus : [],
      category_names: c.applies_to === "categories" ? [...ed.cats] : [],
      exclude_skus: c.applies_to === "products" ? [] : [...ed.excluded],
      include_best_deals: !!c.include_best_deals,
      starts_at: c.starts_at,
      expires_at: c.expires_at,
      usage_limit: usageLimit,
      per_customer_limit: perCustomer,
      is_active: !!c.is_active,
      updated_at: new Date().toISOString(),
    };

    let rows;
    if (isNew && ed.bulk > 1) {
      if (!ed.prefix) return showToast("Enter a prefix for the generated codes.");
      const taken = new Set();
      for (let i = 0; i < ed.bulk; i++) taken.add(generateCode(ed.prefix, taken));
      rows = [...taken];
    } else if (isNew) {
      if (!CODE_RE.test(c.code)) return showToast("Code: 3–32 letters or numbers (dashes and underscores allowed).");
      if (coupons.some(x => x.code === c.code)) return showToast(`${c.code} already exists.`);
      rows = [c.code];
    }

    const btn = document.getElementById("cpnSaveBtn");
    btn.disabled = true; btn.textContent = "Saving…";

    let error;
    if (isNew) {
      const { data: { user } = {} } = await window.sb.auth.getUser();
      const payload = rows.map(code => ({ ...base, code, created_by: user?.id || null }));
      ({ error } = await window.sb.from("coupons").insert(payload));
    } else {
      ({ error } = await window.sb.from("coupons").update(base).eq("id", c.id));
    }

    btn.disabled = false; btn.textContent = "Save Coupon";
    if (error) {
      showToast(error.code === "23505" ? "That code already exists — generate another." : "Couldn't save: " + friendlyDbError(error));
      return;
    }

    closeModal("couponModal");
    if (isNew && rows.length > 1) {
      try { await navigator.clipboard.writeText(rows.join("\n")); } catch (_) {}
      showToast(`${rows.length} codes created and copied to your clipboard.`);
      filter.q = ed.prefix;
    } else {
      showToast(isNew ? `${rows[0]} created.` : "Coupon saved.");
    }
    render();
  }

  // Codes of the visible list, one per line -- for pasting into an email
  // tool or spreadsheet.
  async function copyVisible() {
    const q = filter.q.trim().toUpperCase();
    const codes = coupons.filter(c =>
      (filter.status === "all" || statusOf(c).key === filter.status) &&
      (!q || c.code.includes(q) || String(c.description || "").toUpperCase().includes(q))).map(c => c.code);
    if (!codes.length) return showToast("No codes to copy.");
    try { await navigator.clipboard.writeText(codes.join("\n")); showToast(`Copied ${codes.length} code${codes.length === 1 ? "" : "s"}.`); }
    catch (_) { showToast("Couldn't access the clipboard."); }
  }

  return {
    render, setFilter, copy, copyVisible, toggleActive, remove,
    openNew, edit, duplicate, save, regen,
    setBulk, onBulkCount, onPrefix, onType, onScope, onBestDeals, toggleCat,
    openExclude, onPickQ, onPickCat, onPickSelectedOnly, togglePick, pickAllShown,
    couponCovers,
  };
})();

function renderCouponsTab() { CPN.render(); }
