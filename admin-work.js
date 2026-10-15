/* ============================================================
   Room Ready Supply — Work Board
   ------------------------------------------------------------
   The company-wide task board: every department's tickets (Web Dev,
   Marketing, Supply Chain, Operations), who is doing what, and what each
   person finished on a given day.

   Same dev_tickets table the old Developer Tickets board used, extended by
   20261015_work_board_departments.sql. Who may change what is enforced
   there (guard_work_ticket_write); the can*() helpers below only mirror it
   so the UI doesn't offer buttons that would be refused.

   Views
     board  — Kanban columns by status, drag to move
     table  — monday-style grouped list with inline status / priority / due
     mine   — "My Work": one person's day, plus their end-of-day note
     report — Team Report: per-person daily accomplishments (Owner + Ops)

   Loaded after admin.js and uses its globals: window.sb, escHtml,
   showToast, friendlyDbError, openModal/closeModal, openDevTeamModal.
   ============================================================ */

const WB = (() => {

  /* ── Vocabulary ─────────────────────────────────────────────── */

  const DEPTS = {
    web_dev:      { label: "Web Dev",      color: "#6366f1", blurb: "Website bugs, changes and new features" },
    marketing:    { label: "Marketing",    color: "#db2777", blurb: "Campaigns, content, SEO and leads" },
    supply_chain: { label: "Supply Chain", color: "#0d9488", blurb: "Vendors, stock, orders and shipping" },
    operations:   { label: "Operations",   color: "#ea580c", blurb: "Processes, admin and everything else" },
  };
  const DEPT_ICON = {
    web_dev:      `<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>`,
    marketing:    `<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>`,
    supply_chain: `<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>`,
    operations:   `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  };
  const STATUSES = [
    { key: "open",         label: "To Do" },
    { key: "in_progress",  label: "In Progress" },
    { key: "done",         label: "Done" },
    { key: "not_possible", label: "Not Possible" },
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.key, s.label]));
  const CLOSED = ["done", "not_possible"];
  const PRIORITIES = {
    critical: { label: "Critical", rank: 0, hint: "Stop and fix now" },
    high:     { label: "High",     rank: 1, hint: "Today or tomorrow" },
    medium:   { label: "Medium",   rank: 2, hint: "This week" },
    low:      { label: "Low",      rank: 3, hint: "When there's time" },
  };
  const TYPES = {
    task:    { label: "Task" },
    request: { label: "Request" },
    bug:     { label: "Bug",   dev: true },
    error:   { label: "Error", dev: true },
    idea:    { label: "Idea",  dev: true },
  };
  const ROLE_DEPT = { developer: "web_dev", marketing: "marketing", supply_chain: "supply_chain", operations: "operations" };
  const ROLE_LABEL = {
    owner: "Owner", operations: "Head of Operations", developer: "Web Developer",
    marketing: "Head of Marketing", supply_chain: "Supply Chain Manager", admin: "Admin",
  };
  const REPORT_TZ = {
    local: { label: "My time",            tz: undefined },
    et:    { label: "Eastern (NC)",       tz: "America/New_York" },
    ph:    { label: "Philippines",        tz: "Asia/Manila" },
  };
  const DONE_WINDOW_DAYS = 14;     // board hides older closed tickets until asked
  const ATTACH_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"];
  const BUCKET = "dev-note-screenshots";

  /* ── State ──────────────────────────────────────────────────── */

  const S = {
    tickets: [],
    comments: {},              // ticket_id -> count
    team: [], teamById: {}, teamByEmail: {},
    view: pref("view", "board"),
    dept: pref("dept", null),
    filters: { q: "", person: "all", priority: "all", due: "all" },
    showOldClosed: false,
    report: { date: null, tz: pref("tz", "local") },
    drawer: null,              // { id, comments, events, tab }
    migrationMissing: false,
    channel: null,
    reloadTimer: null,
    composer: { shot: null, file: null },
    commentShot: null,
  };

  function pref(k, fallback) {
    try { return localStorage.getItem("wb." + k) || fallback; } catch { return fallback; }
  }
  function savePref(k, v) {
    try { localStorage.setItem("wb." + k, v); } catch { /* private mode */ }
  }

  /* ── Who am I, and what may I do? (mirrors guard_work_ticket_write) ── */

  function me() {
    const role = window._adminRole;
    return { id: window._adminUserId, email: window._adminUserEmail, role, dept: ROLE_DEPT[role] || null };
  }
  const canDispatch = () => ["owner", "operations"].includes(window._adminRole);
  const canSeeReport = () => canDispatch();
  const canDelete = () => ["owner", "operations", "admin"].includes(window._adminRole);
  function canMove(t) {
    const m = me();
    return canDispatch() || (m.dept && t.department === m.dept) || t.assignee_id === m.id;
  }
  const canEdit = t => canMove(t) || t.reporter_id === me().id;
  const canTake = t => !canDispatch() && !t.assignee_id && me().dept && t.department === me().dept;
  const canRelease = t => !canDispatch() && t.assignee_id === me().id;

  /* ── Small helpers ──────────────────────────────────────────── */

  const $ = id => document.getElementById(id);
  const byId = id => S.tickets.find(t => t.id === id);
  const pad = n => String(n).padStart(2, "0");
  const isClosed = t => CLOSED.includes(t.status);

  function dateKey(d = new Date(), tz) {
    if (!tz) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function addDays(key, n) {
    const [y, m, d] = key.split("-").map(Number);
    return dateKey(new Date(y, m - 1, d + n));
  }
  function keyToDate(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
  const today = () => dateKey();

  function fmtDay(key, { long } = {}) {
    if (!key) return "";
    const t = today();
    if (key === t) return "Today";
    if (key === addDays(t, 1)) return "Tomorrow";
    if (key === addDays(t, -1)) return "Yesterday";
    const d = keyToDate(key);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-US", {
      weekday: long ? "long" : "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }),
    });
  }
  function fmtTime(iso, tz) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) });
  }
  function ago(iso) {
    if (!iso) return "";
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // overdue | today | soon (within 2 days) | "" — closed tickets are never late
  function dueState(t) {
    if (!t.due_date || isClosed(t)) return "";
    const k = today();
    if (t.due_date < k) return "overdue";
    if (t.due_date === k) return "today";
    if (t.due_date <= addDays(k, 2)) return "soon";
    return "";
  }

  function personName(idOrEmail) {
    if (!idOrEmail) return "";
    const p = S.teamById[idOrEmail] || S.teamByEmail[String(idOrEmail).toLowerCase()];
    if (p) return p.full_name || p.email;
    return String(idOrEmail).includes("@") ? String(idOrEmail).split("@")[0] : "Someone";
  }
  const firstName = x => personName(x).split(/\s+/)[0];

  function avatar(idOrEmail, size = 26) {
    if (!idOrEmail) {
      return `<span class="wb-av wb-av-empty" style="width:${size}px;height:${size}px" title="Unassigned">
        <svg width="${Math.round(size * .5)}" height="${Math.round(size * .5)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg></span>`;
    }
    const p = S.teamById[idOrEmail] || S.teamByEmail[String(idOrEmail).toLowerCase()];
    const key = (p?.email || String(idOrEmail)).toLowerCase();
    const name = personName(idOrEmail);
    const initials = name.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
    let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
    return `<span class="wb-av" style="width:${size}px;height:${size}px;font-size:${Math.max(9, Math.round(size * .38))}px;background:hsl(${h} 55% 42%)" title="${escHtml(name)}">${escHtml(initials)}</span>`;
  }

  function deptChip(dept, { small } = {}) {
    const d = DEPTS[dept];
    if (!d) return "";
    return `<span class="wb-dept${small ? " wb-dept-sm" : ""}" style="--c:${d.color}"><i></i>${d.label}</span>`;
  }
  const priBadge = p => `<span class="wb-pri wb-pri-${p}">${(PRIORITIES[p] || PRIORITIES.medium).label}</span>`;
  const statusPill = s => `<span class="wb-st wb-st-${s}">${STATUS_LABEL[s] || s}</span>`;
  function dueChip(t, { always } = {}) {
    if (!t.due_date) return always ? `<span class="wb-due wb-due-none">No due date</span>` : "";
    const st = dueState(t);
    return `<span class="wb-due${st ? " wb-due-" + st : ""}" title="Due ${escHtml(t.due_date)}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      ${st === "overdue" ? "Overdue · " : ""}${fmtDay(t.due_date)}</span>`;
  }
  const icon = (paths, size = 15) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const I = {
    board:  `<rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/>`,
    table:  `<path d="M3 6h18M3 12h18M3 18h18"/>`,
    mine:   `<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/><path d="M17 11l2 2 4-4"/>`,
    report: `<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>`,
    plus:   `<path d="M12 5v14M5 12h14"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>`,
    x:      `<path d="M18 6L6 18M6 6l12 12"/>`,
    trash:  `<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>`,
    link:   `<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>`,
    chat:   `<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 8 8v.5z"/>`,
    image:  `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>`,
    file:   `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>`,
    check:  `<path d="M20 6L9 17l-5-5"/>`,
    play:   `<path d="M6 4l14 8-14 8z"/>`,
    chevL:  `<path d="M15 18l-6-6 6-6"/>`,
    chevR:  `<path d="M9 18l6-6-6-6"/>`,
    copy:   `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
    alert:  `<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>`,
    users:  `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>`,
    hand:   `<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.3 16.8a2 2 0 0 1 2.8-2.8L8 16"/>`,
  };

  /* ── Data ───────────────────────────────────────────────────── */

  async function load() {
    const [tRes, cRes, teamRes] = await Promise.all([
      window.sb.from("dev_tickets").select("*").order("created_at", { ascending: false }),
      window.sb.from("dev_ticket_comments").select("ticket_id"),
      window.sb.rpc("work_team_members"),
    ]);
    if (tRes.error) throw tRes.error;

    S.tickets = (tRes.data || []).map(t => ({ ...t, department: t.department || "web_dev" }));
    S.comments = {};
    (cRes.data || []).forEach(c => { S.comments[c.ticket_id] = (S.comments[c.ticket_id] || 0) + 1; });

    // Before the migration runs, the directory function doesn't exist yet.
    S.migrationMissing = !!teamRes.error;
    S.team = teamRes.data || [];
    S.teamById = {}; S.teamByEmail = {};
    S.team.forEach(p => { S.teamById[p.id] = p; if (p.email) S.teamByEmail[p.email.toLowerCase()] = p; });
  }

  // Someone else moved a ticket: refresh quietly. Debounced because one
  // save can fire several change events (ticket + its log row).
  function subscribe() {
    if (S.channel || !window.sb?.channel) return;
    try {
      S.channel = window.sb.channel("wb-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "dev_tickets" }, queueReload)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dev_ticket_comments" }, queueReload)
        .subscribe();
    } catch { S.channel = null; }
  }
  function queueReload() {
    clearTimeout(S.reloadTimer);
    S.reloadTimer = setTimeout(async () => {
      if (!$("wbRoot")) return;              // board not open; next visit loads fresh
      // Don't repaint under someone mid-sentence; try again shortly.
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest("#wbRoot, #wbDrawer, #wbComposer")) { queueReload(); return; }
      try { await load(); } catch { return; }
      paint();
      if (S.drawer && byId(S.drawer.id)) refreshDrawer({ refetch: true });
    }, 600);
  }

  // quiet: the drawer already shows the new value (title/description typed
  // in place), so don't rebuild it -- a rebuild on blur would swallow the
  // click that caused the blur.
  async function patchTicket(id, patch, { quiet } = {}) {
    const t = byId(id);
    if (!t) return null;
    const prev = {};
    Object.keys(patch).forEach(k => { prev[k] = t[k]; });
    Object.assign(t, patch);                 // optimistic: the board repaints now
    paint();
    if (S.drawer?.id === id && !quiet) refreshDrawer();

    const { data, error } = await window.sb.from("dev_tickets").update(patch).eq("id", id).select().single();
    if (error) {
      Object.assign(t, prev);
      paint();
      if (S.drawer?.id === id) refreshDrawer();
      showToast(friendlyDbError(error));
      return null;
    }
    Object.assign(t, data);                  // server-derived fields (emails, timestamps)
    paint();
    if (S.drawer?.id === id && !quiet) refreshDrawer({ refetch: true });
    return t;
  }

  async function notify(ticket, event, message) {
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      await fetch("/api/notify-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (session?.access_token || "") },
        body: JSON.stringify({ event, message, ticket: { id: ticket.id } }),
      });
    } catch { /* email is best-effort; the board already saved */ }
  }

  async function upload(file, folder) {
    const ext = ((file.name || "").split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await window.sb.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  /* ── Filtering ──────────────────────────────────────────────── */

  function inDept(t) { return !S.dept || S.dept === "all" || t.department === S.dept; }

  function visible() {
    const f = S.filters, q = f.q.trim().toLowerCase(), m = me(), k = today();
    return S.tickets.filter(t => {
      if (!inDept(t)) return false;
      if (f.priority !== "all" && t.priority !== f.priority) return false;
      if (f.person === "me" && t.assignee_id !== m.id) return false;
      else if (f.person === "none" && t.assignee_id) return false;
      else if (!["all", "me", "none"].includes(f.person) && t.assignee_id !== f.person) return false;
      if (f.due === "overdue" && dueState(t) !== "overdue") return false;
      if (f.due === "today" && !(t.due_date === k && !isClosed(t))) return false;
      if (f.due === "week" && !(t.due_date && t.due_date >= k && t.due_date <= addDays(k, 7) && !isClosed(t))) return false;
      if (f.due === "none" && t.due_date) return false;
      if (q) {
        const hay = `${t.ticket_number} ${t.title} ${t.description || ""} ${personName(t.assignee_id || t.assignee_email)} ${DEPTS[t.department]?.label || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // Most urgent first: overdue, then priority, then due date, then newest.
  function urgencySort(a, b) {
    const ao = dueState(a) === "overdue" ? 0 : 1, bo = dueState(b) === "overdue" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const pr = (PRIORITIES[a.priority]?.rank ?? 2) - (PRIORITIES[b.priority]?.rank ?? 2);
    if (pr) return pr;
    if (a.due_date !== b.due_date) return (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  }

  function recentlyClosed(t) {
    if (!isClosed(t) || S.showOldClosed) return true;
    const when = new Date(t.resolved_at || t.updated_at || t.created_at).getTime();
    return Date.now() - when < DONE_WINDOW_DAYS * 864e5;
  }

  /* ── Shell ──────────────────────────────────────────────────── */

  async function render() {
    const panel = $("tab-dev-tickets");
    if (!panel) return;
    ensureChrome();

    if (!S.dept) S.dept = canDispatch() || !me().dept ? "all" : me().dept;
    if (S.view === "report" && !canSeeReport()) S.view = "board";

    panel.innerHTML = `<div id="wbRoot" class="wb"><div class="wb-loading">${icon(I.board, 22)}<span>Loading the Work Board…</span></div></div>`;
    try {
      await load();
    } catch (err) {
      $("wbRoot").innerHTML = `<div class="wb-empty"><h3>Couldn't load tickets</h3><p>${escHtml(err.message || String(err))}</p></div>`;
      return;
    }
    subscribe();

    const root = $("wbRoot");
    root.innerHTML = `
      ${S.migrationMissing ? `<div class="wb-banner">${icon(I.alert)} Database update pending: run <code>20261015_work_board_departments.sql</code> in Supabase to turn on departments, the activity log and the team report.</div>` : ""}
      <header class="wb-head">
        <div class="wb-head-text">
          <h1 class="a-page-title">Work Board</h1>
          <p class="a-page-sub">${canDispatch()
            ? "Hand out work to each team and see what gets done every day."
            : "Your team's tasks, and anything you need from another team."}</p>
        </div>
        <div class="wb-head-actions">
          <div class="wb-views" role="tablist" aria-label="View">
            ${viewBtn("board", "Board", I.board)}
            ${viewBtn("table", "Table", I.table)}
            ${viewBtn("mine", "My Work", I.mine)}
            ${canSeeReport() ? viewBtn("report", "Team Report", I.report) : ""}
          </div>
          ${["owner", "admin"].includes(window._adminRole) && typeof openDevTeamModal === "function"
            ? `<button class="a-btn-secondary wb-btn-staff" onclick="openDevTeamModal()">${icon(I.users, 14)} Staff</button>` : ""}
          <button class="a-btn-primary wb-btn-new" onclick="WB.compose()">${icon(I.plus, 15)} New Task</button>
        </div>
      </header>
      <nav class="wb-depts" id="wbDepts" aria-label="Team"></nav>
      <div id="wbBody"></div>`;

    paint();
    openFromHash();
  }

  function viewBtn(key, label, ic) {
    return `<button role="tab" aria-selected="${S.view === key}" aria-label="${label}" title="${label}" class="wb-view${S.view === key ? " active" : ""}" onclick="WB.setView('${key}')">${icon(ic, 14)}<span>${label}</span></button>`;
  }

  // Everything below the header. Called after any change.
  function paint() {
    if (!$("wbRoot")) return;
    updateNavCount();
    paintDepts();
    const body = $("wbBody");
    if (!body) return;
    if (S.view === "report") return paintReportShell(body);
    if (S.view === "mine") return paintMine(body);
    body.innerHTML = `
      <div class="wb-stats" id="wbStats"></div>
      ${filterBar()}
      <div id="wbView"></div>`;
    paintStats();
    paintView();
  }

  function paintDepts() {
    const el = $("wbDepts");
    if (!el) return;
    const hide = S.view === "mine" || S.view === "report";
    el.style.display = hide ? "none" : "";
    if (hide) return;
    const open = d => S.tickets.filter(t => !isClosed(t) && (d === "all" || t.department === d)).length;
    const tab = (key, label, color) => `
      <button class="wb-depttab${S.dept === key ? " active" : ""}" style="--c:${color}" onclick="WB.setDept('${key}')">
        ${key === "all" ? icon(I.users, 14) : icon(DEPT_ICON[key], 14)}
        <span>${label}</span><em>${open(key)}</em>
        ${key !== "all" && key === me().dept ? `<small>My team</small>` : ""}
      </button>`;
    el.innerHTML = tab("all", "All teams", "#0B2F63") + Object.entries(DEPTS).map(([k, d]) => tab(k, d.label, d.color)).join("");
  }

  function paintStats() {
    const el = $("wbStats");
    if (!el) return;
    const scope = S.tickets.filter(inDept);
    const k = today();
    const n = {
      open: scope.filter(t => t.status === "open").length,
      prog: scope.filter(t => t.status === "in_progress").length,
      late: scope.filter(t => dueState(t) === "overdue").length,
      unas: scope.filter(t => !isClosed(t) && !t.assignee_id).length,
      done: scope.filter(t => t.status === "done" && t.resolved_at && dateKey(new Date(t.resolved_at)) === k).length,
    };
    const stat = (num, label, cls, onclick, hint) => `
      <button class="wb-stat ${cls}${onclick ? " clickable" : ""}" ${onclick ? `onclick="${onclick}"` : "tabindex=-1"} title="${hint || ""}">
        <strong>${num}</strong><span>${label}</span>
      </button>`;
    el.innerHTML =
      stat(n.open, "To do", "s-open") +
      stat(n.prog, "In progress", "s-prog") +
      stat(n.late, "Overdue", "s-late" + (n.late ? " hot" : ""), n.late ? "WB.quickFilter('overdue')" : "", "Show overdue tasks") +
      stat(n.unas, "Needs an owner", "s-unas" + (n.unas && canDispatch() ? " hot" : ""), n.unas ? "WB.quickFilter('unassigned')" : "", "Show unassigned tasks") +
      stat(n.done, "Done today", "s-done");
  }

  function filterBar() {
    const f = S.filters;
    const people = S.team.filter(p => p.role !== "admin");
    const anyFilter = f.q || f.person !== "all" || f.priority !== "all" || f.due !== "all";
    return `
      <div class="wb-filters">
        <label class="wb-search">${icon(I.search, 14)}
          <input id="wbSearch" type="search" placeholder="Search tasks, people, numbers…" value="${escHtml(f.q)}" oninput="WB.setFilter('q', this.value)" aria-label="Search tasks">
        </label>
        <select class="wb-sel" onchange="WB.setFilter('person', this.value)" aria-label="Person">
          <option value="all">Everyone</option>
          <option value="me"${f.person === "me" ? " selected" : ""}>Assigned to me</option>
          <option value="none"${f.person === "none" ? " selected" : ""}>Needs an owner</option>
          ${people.length ? `<optgroup label="People">${people.map(p => `<option value="${p.id}"${f.person === p.id ? " selected" : ""}>${escHtml(p.full_name || p.email)}</option>`).join("")}</optgroup>` : ""}
        </select>
        <select class="wb-sel" onchange="WB.setFilter('priority', this.value)" aria-label="Priority">
          <option value="all">Any priority</option>
          ${Object.entries(PRIORITIES).map(([k, v]) => `<option value="${k}"${f.priority === k ? " selected" : ""}>${v.label}</option>`).join("")}
        </select>
        <select class="wb-sel" onchange="WB.setFilter('due', this.value)" aria-label="Due date">
          <option value="all">Any due date</option>
          <option value="overdue"${f.due === "overdue" ? " selected" : ""}>Overdue</option>
          <option value="today"${f.due === "today" ? " selected" : ""}>Due today</option>
          <option value="week"${f.due === "week" ? " selected" : ""}>Due in 7 days</option>
          <option value="none"${f.due === "none" ? " selected" : ""}>No due date</option>
        </select>
        ${anyFilter ? `<button class="wb-clear" onclick="WB.clearFilters()">${icon(I.x, 12)} Clear</button>` : ""}
      </div>`;
  }

  function paintView() {
    const wrap = $("wbView");
    if (!wrap) return;
    const list = visible();
    if (!S.tickets.filter(inDept).length) {
      wrap.innerHTML = `<div class="wb-empty">
        <div class="wb-empty-ic">${icon(I.board, 26)}</div>
        <h3>Nothing on this board yet</h3>
        <p>Add the first task for ${S.dept && S.dept !== "all" ? DEPTS[S.dept].label : "the team"}.</p>
        <button class="a-btn-primary" onclick="WB.compose()">${icon(I.plus, 14)} New Task</button>
      </div>`;
      return;
    }
    if (S.view === "table") paintTable(wrap, list);
    else paintBoard(wrap, list);
  }

  /* ── Board view ─────────────────────────────────────────────── */

  function paintBoard(wrap, list) {
    const hidden = list.filter(t => !recentlyClosed(t)).length;
    wrap.innerHTML = `<div class="wb-board">${STATUSES.map(col => {
      const items = list.filter(t => t.status === col.key && recentlyClosed(t)).sort(
        CLOSED.includes(col.key)
          ? (a, b) => new Date(b.resolved_at || b.updated_at) - new Date(a.resolved_at || a.updated_at)
          : urgencySort);
      const older = CLOSED.includes(col.key) ? list.filter(t => t.status === col.key && !recentlyClosed(t)).length : 0;
      return `
        <section class="wb-col wb-col-${col.key}" data-status="${col.key}"
          ondragover="WB.dragOver(event)" ondragleave="WB.dragLeave(event)" ondrop="WB.drop(event,'${col.key}')">
          <header class="wb-col-head">
            <span class="wb-col-dot"></span><h3>${col.label}</h3><em>${items.length}</em>
          </header>
          <div class="wb-col-body">
            ${items.map(card).join("") || `<div class="wb-col-empty">${col.key === "open" ? "Nothing waiting" : col.key === "in_progress" ? "Drag a task here to start it" : "Nothing yet"}</div>`}
            ${older ? `<button class="wb-older" onclick="WB.toggleOld()">Show ${older} older</button>` : ""}
          </div>
          ${col.key === "open" ? quickAddHtml() : ""}
        </section>`;
    }).join("")}</div>
    ${S.showOldClosed && hidden === 0 && list.some(t => isClosed(t)) ? `<button class="wb-older wb-older-wide" onclick="WB.toggleOld()">Hide older finished tasks</button>` : ""}`;
  }

  function quickAddHtml() {
    return `<form class="wb-quick" onsubmit="event.preventDefault();WB.quickAdd(this)">
      ${icon(I.plus, 14)}<input name="title" placeholder="Add a task…" aria-label="Quick add a task" maxlength="200" autocomplete="off">
    </form>`;
  }

  function card(t) {
    const d = DEPTS[t.department] || DEPTS.web_dev;
    const cc = S.comments[t.id] || 0;
    const movable = canMove(t);
    return `
      <article class="wb-card${movable ? "" : " locked"}" style="--c:${d.color}" draggable="${movable}" tabindex="0"
        ondragstart="WB.dragStart(event,'${t.id}')" ondragend="WB.dragEnd(event)"
        onclick="WB.open('${t.id}')" onkeydown="if(event.key==='Enter')WB.open('${t.id}')">
        <div class="wb-card-top">
          <span class="wb-num">${escHtml(t.ticket_number || "")}</span>
          ${S.dept === "all" ? deptChip(t.department, { small: true }) : ""}
          <span class="wb-grow"></span>
          ${t.priority !== "low" ? priBadge(t.priority) : ""}
        </div>
        <p class="wb-card-title">${escHtml(t.title)}</p>
        <div class="wb-card-foot">
          ${dueChip(t)}
          ${t.ticket_type && t.ticket_type !== "task" ? `<span class="wb-type">${(TYPES[t.ticket_type] || TYPES.task).label}</span>` : ""}
          <span class="wb-grow"></span>
          ${t.screenshot_url ? `<span class="wb-ic" title="Has screenshot">${icon(I.image, 12)}</span>` : ""}
          ${t.attachment_url ? `<span class="wb-ic" title="Has file">${icon(I.file, 12)}</span>` : ""}
          ${cc ? `<span class="wb-ic" title="${cc} comment${cc > 1 ? "s" : ""}">${icon(I.chat, 12)}${cc}</span>` : ""}
          ${avatar(t.assignee_id || t.assignee_email, 24)}
        </div>
      </article>`;
  }

  let dragId = null;
  function dragStart(e, id) {
    const t = byId(id);
    if (!t || !canMove(t)) { e.preventDefault(); return; }
    dragId = id; e.dataTransfer.effectAllowed = "move";
    e.currentTarget.classList.add("dragging");
  }
  function dragEnd(e) { dragId = null; e.currentTarget.classList.remove("dragging"); document.querySelectorAll(".wb-col.over").forEach(c => c.classList.remove("over")); }
  function dragOver(e) { if (!dragId) return; e.preventDefault(); e.currentTarget.classList.add("over"); }
  function dragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove("over"); }
  function drop(e, status) {
    e.preventDefault();
    e.currentTarget.classList.remove("over");
    const id = dragId; dragId = null;
    if (id) setStatus(id, status);
  }

  /* ── Table view (monday-style) ──────────────────────────────── */

  function paintTable(wrap, list) {
    const groups = STATUSES.map(s => ({ ...s, items: list.filter(t => t.status === s.key && recentlyClosed(t)).sort(urgencySort) }));
    const hidden = list.filter(t => !recentlyClosed(t)).length;
    wrap.innerHTML = groups.map(g => `
      <section class="wb-group wb-group-${g.key}">
        <header class="wb-group-head"><span class="wb-col-dot"></span><h3>${g.label}</h3><em>${g.items.length} task${g.items.length === 1 ? "" : "s"}</em></header>
        ${g.items.length ? `
        <div class="wb-tablewrap"><table class="wb-table">
          <thead><tr><th class="c-task">Task</th>${S.dept === "all" ? `<th class="c-team">Team</th>` : ""}<th class="c-own">Owner</th><th class="c-st">Status</th><th class="c-pri">Priority</th><th class="c-due">Due</th><th class="c-upd">Updated</th></tr></thead>
          <tbody>${g.items.map(row).join("")}</tbody>
        </table></div>` : `<div class="wb-group-empty">No tasks</div>`}
      </section>`).join("") +
      (hidden ? `<button class="wb-older wb-older-wide" onclick="WB.toggleOld()">Show ${hidden} older finished task${hidden === 1 ? "" : "s"}</button>`
              : S.showOldClosed ? `<button class="wb-older wb-older-wide" onclick="WB.toggleOld()">Hide older finished tasks</button>` : "");
  }

  function row(t) {
    const d = DEPTS[t.department] || DEPTS.web_dev;
    const mv = canMove(t), ed = canEdit(t);
    return `<tr style="--c:${d.color}">
      <td class="c-task" onclick="WB.open('${t.id}')">
        <span class="wb-num">${escHtml(t.ticket_number || "")}</span>
        <span class="wb-row-title">${escHtml(t.title)}</span>
        ${S.comments[t.id] ? `<span class="wb-ic">${icon(I.chat, 12)}${S.comments[t.id]}</span>` : ""}
      </td>
      ${S.dept === "all" ? `<td>${deptChip(t.department, { small: true })}</td>` : ""}
      <td><span class="wb-owner">${avatar(t.assignee_id || t.assignee_email, 22)}<span>${t.assignee_id ? escHtml(firstName(t.assignee_id)) : `<i>Nobody yet</i>`}</span></span></td>
      <td><select class="wb-pillsel wb-st-${t.status}" onchange="WB.setStatus('${t.id}', this.value)" ${mv ? "" : "disabled"} aria-label="Status">
        ${STATUSES.map(s => `<option value="${s.key}"${t.status === s.key ? " selected" : ""}>${s.label}</option>`).join("")}
      </select></td>
      <td><select class="wb-pillsel wb-pri-${t.priority}" onchange="WB.setField('${t.id}','priority',this.value)" ${ed ? "" : "disabled"} aria-label="Priority">
        ${Object.entries(PRIORITIES).map(([k, v]) => `<option value="${k}"${t.priority === k ? " selected" : ""}>${v.label}</option>`).join("")}
      </select></td>
      <td><input type="date" class="wb-dateinp${dueState(t) ? " wb-due-" + dueState(t) : ""}" value="${t.due_date || ""}" onchange="WB.setField('${t.id}','due_date',this.value||null)" ${ed ? "" : "disabled"} aria-label="Due date"></td>
      <td class="c-upd">${ago(t.updated_at || t.created_at)}</td>
    </tr>`;
  }

  /* ── My Work ────────────────────────────────────────────────── */

  async function paintMine(body) {
    const m = me(), k = today();
    const eodDraft = $("wbEodBody") ? { body: $("wbEodBody").value, blockers: $("wbEodBlockers").value } : null;
    const mine = S.tickets.filter(t => t.assignee_id === m.id);
    const doing = mine.filter(t => t.status === "in_progress").sort(urgencySort);
    const next = mine.filter(t => t.status === "open").sort(urgencySort);
    const doneToday = mine.filter(t => t.status === "done" && t.resolved_at && dateKey(new Date(t.resolved_at)) === k)
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at));
    const late = mine.filter(t => dueState(t) === "overdue");
    const waiting = S.tickets.filter(t => !isClosed(t) && !t.assignee_id && (canDispatch() || t.department === m.dept)).sort(urgencySort);
    const filedByMe = S.tickets.filter(t => t.reporter_id === m.id && t.assignee_id !== m.id && !isClosed(t)).sort(urgencySort);

    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    body.innerHTML = `
      <section class="wb-hello">
        <div>
          <h2>${greet}, ${escHtml(firstName(m.id) || "there")}</h2>
          <p>${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${m.dept ? ` · ${DEPTS[m.dept].label}` : ""}</p>
        </div>
        <div class="wb-hello-stats">
          <span><strong>${doing.length}</strong> doing</span>
          <span><strong>${next.length}</strong> up next</span>
          <span class="${late.length ? "hot" : ""}"><strong>${late.length}</strong> overdue</span>
          <span class="ok"><strong>${doneToday.length}</strong> done today</span>
        </div>
      </section>

      ${late.length ? `<div class="wb-callout">${icon(I.alert, 16)}<div><strong>${late.length} task${late.length > 1 ? "s are" : " is"} past due.</strong> Finish ${late.length > 1 ? "them" : "it"} first, or ask Head of Operations to move the date.</div></div>` : ""}

      <div class="wb-mine-grid">
        ${minePanel("Doing now", "in_progress", doing, t => canMove(t) ? `<button class="wb-act wb-act-done" onclick="event.stopPropagation();WB.setStatus('${t.id}','done')">${icon(I.check, 13)} Done</button>` : "",
          "Nothing in progress. Start something from Up next.")}
        ${minePanel("Up next", "open", next, t => canMove(t) ? `<button class="wb-act" onclick="event.stopPropagation();WB.setStatus('${t.id}','in_progress')">${icon(I.play, 11)} Start</button>` : "",
          "You're all caught up.")}
        <section class="wb-panel wb-panel-done">
          <header><span class="wb-col-dot"></span><h3>Done today</h3><em>${doneToday.length}</em></header>
          <div class="wb-panel-body">
            ${doneToday.map(t => mineRow(t, () => `<span class="wb-time">${fmtTime(t.resolved_at)}</span>`)).join("") || `<p class="wb-muted">Finished tasks show up here.</p>`}
          </div>
          ${m.dept ? `<form class="wb-quick wb-quick-log" onsubmit="event.preventDefault();WB.logDone(this)">
            ${icon(I.check, 14)}<input name="title" placeholder="Log something you already finished…" maxlength="200" autocomplete="off" aria-label="Log a finished task">
          </form>` : ""}
        </section>
      </div>

      <div class="wb-mine-grid wb-mine-grid-2">
        <section class="wb-panel">
          <header>${icon(I.hand, 15)}<h3>${canDispatch() ? "Needs an owner" : `Unassigned in ${m.dept ? DEPTS[m.dept].label : "your team"}`}</h3><em>${waiting.length}</em></header>
          <div class="wb-panel-body">
            ${waiting.slice(0, 12).map(t => mineRow(t, () => canDispatch()
                ? assignSelect(t, "wb-act-sel")
                : canTake(t) ? `<button class="wb-act" onclick="event.stopPropagation();WB.take('${t.id}')">Take it</button>` : "",
                { dept: true })).join("")
              || `<p class="wb-muted">${canDispatch() ? "Every open task has someone on it." : "Nothing waiting for your team."}</p>`}
            ${waiting.length > 12 ? `<button class="wb-older" onclick="WB.setView('board');WB.quickFilter('unassigned')">See all ${waiting.length}</button>` : ""}
          </div>
        </section>
        <section class="wb-panel wb-eod" id="wbEod">
          <header>${icon(I.report, 15)}<h3>End-of-day update</h3><em class="wb-opt">optional</em></header>
          <div class="wb-panel-body"><p class="wb-muted">Loading…</p></div>
        </section>
      </div>

      ${filedByMe.length ? `
      <section class="wb-panel wb-panel-wide">
        <header>${icon(I.users, 15)}<h3>Requests you filed</h3><em>${filedByMe.length}</em></header>
        <div class="wb-panel-body">${filedByMe.map(t => mineRow(t, () => statusPill(t.status) + avatar(t.assignee_id, 22), { dept: true })).join("")}</div>
      </section>` : ""}`;

    paintEod(eodDraft);
  }

  function minePanel(title, key, items, action, empty) {
    return `<section class="wb-panel wb-panel-${key}">
      <header><span class="wb-col-dot"></span><h3>${title}</h3><em>${items.length}</em></header>
      <div class="wb-panel-body">${items.map(t => mineRow(t, action)).join("") || `<p class="wb-muted">${empty}</p>`}</div>
    </section>`;
  }

  function mineRow(t, action, { dept } = {}) {
    const d = DEPTS[t.department] || DEPTS.web_dev;
    return `<div class="wb-mrow" style="--c:${d.color}" tabindex="0" onclick="WB.open('${t.id}')" onkeydown="if(event.key==='Enter')WB.open('${t.id}')">
      <span class="wb-mrow-bar"></span>
      <div class="wb-mrow-main">
        <span class="wb-mrow-title">${escHtml(t.title)}</span>
        <span class="wb-mrow-meta"><span class="wb-num">${escHtml(t.ticket_number || "")}</span>${dept ? deptChip(t.department, { small: true }) : ""}${t.priority === "critical" || t.priority === "high" ? priBadge(t.priority) : ""}${dueChip(t)}</span>
      </div>
      <div class="wb-mrow-act">${action ? action(t) : ""}</div>
    </div>`;
  }

  function assignSelect(t, cls) {
    const people = S.team.filter(p => ROLE_DEPT[p.role] || p.role === "owner");
    const own = people.filter(p => p.department === t.department);
    const rest = people.filter(p => p.department !== t.department);
    const opt = p => `<option value="${p.id}"${t.assignee_id === p.id ? " selected" : ""}>${escHtml(p.full_name || p.email)}</option>`;
    return `<select class="${cls || "a-input"}" onclick="event.stopPropagation()" onchange="WB.assign('${t.id}', this.value)" aria-label="Assign to">
      <option value="">${t.assignee_id ? "Unassign" : "Assign to…"}</option>
      ${own.length ? `<optgroup label="${DEPTS[t.department]?.label || "Team"}">${own.map(opt).join("")}</optgroup>` : ""}
      ${rest.length ? `<optgroup label="Others">${rest.map(opt).join("")}</optgroup>` : ""}
    </select>`;
  }

  async function paintEod(draft) {
    const box = document.querySelector("#wbEod .wb-panel-body");
    if (!box) return;
    if (S.migrationMissing) { box.innerHTML = `<p class="wb-muted">Available once the database update is run.</p>`; return; }
    const k = today();
    const { data } = await window.sb.from("work_daily_notes").select("body,blockers,updated_at").eq("user_id", me().id).eq("note_date", k).maybeSingle();
    if (!document.querySelector("#wbEod .wb-panel-body")) return;
    const v = draft || { body: data?.body || "", blockers: data?.blockers || "" };
    box.innerHTML = `
      <label class="wb-lbl" for="wbEodBody">What did you get done today? Anything not on the board counts too.</label>
      <textarea id="wbEodBody" class="a-input wb-ta" rows="4" placeholder="e.g. Called 3 vendors about the towel restock, fixed the checkout bug, updated the price list…">${escHtml(v.body)}</textarea>
      <label class="wb-lbl" for="wbEodBlockers">Anything blocking you? <span class="wb-muted">(optional)</span></label>
      <input id="wbEodBlockers" class="a-input" placeholder="e.g. Waiting on the supplier's price list" value="${escHtml(v.blockers)}">
      <div class="wb-eod-foot">
        <span class="wb-muted" id="wbEodSaved">${data?.updated_at ? "Saved " + fmtTime(data.updated_at) : "Your CEO and Head of Operations see this in the Team Report."}</span>
        <button class="a-btn-primary" id="wbEodBtn" onclick="WB.saveEod()">Save update</button>
      </div>`;
  }

  async function saveEod() {
    const body = $("wbEodBody")?.value.trim() || "";
    const blockers = $("wbEodBlockers")?.value.trim() || null;
    const btn = $("wbEodBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    const { data, error } = await window.sb.from("work_daily_notes")
      .upsert({ user_id: me().id, note_date: today(), body, blockers }, { onConflict: "user_id,note_date" })
      .select("updated_at").single();
    btn.disabled = false; btn.textContent = "Save update";
    if (error) { showToast("Couldn't save: " + friendlyDbError(error)); return; }
    $("wbEodSaved").textContent = "Saved " + fmtTime(data.updated_at);
    showToast("End-of-day update saved.");
  }

  /* ── Team Report (CEO / Head of Ops) ────────────────────────── */

  function paintReportShell(body) {
    const tzKey = REPORT_TZ[S.report.tz] ? S.report.tz : "local";
    const tz = REPORT_TZ[tzKey].tz;
    if (!S.report.date) S.report.date = dateKey(new Date(), tz);
    const d = S.report.date;
    const isToday = d === dateKey(new Date(), tz);
    body.innerHTML = `
      <div class="wb-rep-bar">
        <div class="wb-rep-date">
          <button class="wb-iconbtn" onclick="WB.reportShift(-1)" title="Previous day" aria-label="Previous day">${icon(I.chevL)}</button>
          <input type="date" class="a-input" value="${d}" max="${dateKey(new Date(), tz)}" onchange="WB.reportDate(this.value)" aria-label="Report date">
          <button class="wb-iconbtn" onclick="WB.reportShift(1)" ${isToday ? "disabled" : ""} title="Next day" aria-label="Next day">${icon(I.chevR)}</button>
          ${isToday ? "" : `<button class="wb-linkbtn" onclick="WB.reportDate(null)">Today</button>`}
        </div>
        <h2 class="wb-rep-title">${keyToDate(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
        <div class="wb-rep-tools">
          <select class="wb-sel" onchange="WB.reportTz(this.value)" aria-label="Time zone">
            ${Object.entries(REPORT_TZ).map(([k, v]) => `<option value="${k}"${k === tzKey ? " selected" : ""}>${v.label}</option>`).join("")}
          </select>
          <button class="a-btn-secondary" onclick="WB.copyReport()">${icon(I.copy, 14)} Copy summary</button>
        </div>
      </div>
      <div id="wbReport"><div class="wb-loading">${icon(I.report, 20)}<span>Building the report…</span></div></div>`;
    paintReport();
  }

  async function paintReport() {
    const out = $("wbReport");
    if (!out) return;
    if (S.migrationMissing) { out.innerHTML = `<div class="wb-empty"><h3>Not available yet</h3><p>Run the 20261015 database update to start logging daily activity.</p></div>`; return; }

    const tz = REPORT_TZ[S.report.tz]?.tz;
    const day = S.report.date;
    // Fetch a padded UTC window and bucket by the chosen time zone client-side.
    const from = new Date(keyToDate(addDays(day, -7)).getTime() - 864e5).toISOString();
    const to = new Date(keyToDate(addDays(day, 1)).getTime() + 2 * 864e5).toISOString();
    const [evRes, notesRes] = await Promise.all([
      window.sb.from("dev_ticket_events").select("*").gte("created_at", from).lt("created_at", to).order("created_at", { ascending: true }).limit(5000),
      window.sb.from("work_daily_notes").select("user_id,body,blockers,updated_at").eq("note_date", day),
    ]);
    if (!$("wbReport")) return;
    if (evRes.error) { out.innerHTML = `<div class="wb-empty"><h3>Couldn't load activity</h3><p>${escHtml(evRes.error.message)}</p></div>`; return; }

    const weekStart = addDays(day, -6);
    const events = (evRes.data || []).map(e => ({ ...e, day: dateKey(new Date(e.created_at), tz) }));
    const dayEv = events.filter(e => e.day === day);
    const weekEv = events.filter(e => e.day >= weekStart && e.day <= day);
    const notes = {}; (notesRes.data || []).forEach(n => { notes[n.user_id] = n; });

    // Credit finished/started work to the assignee (the person who did it),
    // falling back to whoever clicked.
    const who = e => e.assignee_id || e.actor_id;
    const isDone = e => e.event_type === "status" && e.to_value === "done";
    const isStart = e => e.event_type === "status" && e.to_value === "in_progress";

    const people = S.team.filter(p => ROLE_DEPT[p.role] || p.role === "owner" || dayEv.some(e => e.actor_id === p.id));
    const rows = people.map(p => {
      const done = uniqTickets(dayEv.filter(e => isDone(e) && who(e) === p.id));
      const started = uniqTickets(dayEv.filter(e => isStart(e) && who(e) === p.id))
        .filter(e => !done.some(x => x.ticket_id === e.ticket_id));
      const comments = dayEv.filter(e => e.event_type === "comment" && e.actor_id === p.id).length;
      const filed = dayEv.filter(e => e.event_type === "created" && e.actor_id === p.id).length;
      const touches = dayEv.filter(e => e.actor_id === p.id).length;
      const week = uniqTickets(weekEv.filter(e => isDone(e) && who(e) === p.id)).length;
      const doing = S.tickets.filter(t => t.assignee_id === p.id && t.status === "in_progress");
      const late = S.tickets.filter(t => t.assignee_id === p.id && dueState(t) === "overdue");
      return { p, done, started, comments, filed, touches, week, doing, late, note: notes[p.id] };
    })
    // Owner shows up only if they did something that day.
    .filter(r => r.p.role !== "owner" || r.touches || r.note)
    .sort((a, b) => b.done.length - a.done.length || b.touches - a.touches);

    const tot = {
      done: rows.reduce((s, r) => s + r.done.length, 0),
      started: rows.reduce((s, r) => s + r.started.length, 0),
      updates: dayEv.length,
      doing: S.tickets.filter(t => t.status === "in_progress").length,
      late: S.tickets.filter(t => dueState(t) === "overdue").length,
      notes: rows.filter(r => r.note?.body).length,
      people: rows.filter(r => r.p.role !== "owner").length,
    };
    const byDept = Object.keys(DEPTS).map(k => ({ k, n: uniqTickets(dayEv.filter(e => isDone(e) && e.department === k)).length }));
    const maxDept = Math.max(1, ...byDept.map(x => x.n));

    S.report.rows = rows; S.report.tot = tot;

    out.innerHTML = `
      <div class="wb-rep-tiles">
        <div class="wb-tile t-done"><strong>${tot.done}</strong><span>Tasks finished</span></div>
        <div class="wb-tile t-prog"><strong>${tot.started}</strong><span>Started</span></div>
        <div class="wb-tile"><strong>${tot.updates}</strong><span>Updates logged</span></div>
        <div class="wb-tile"><strong>${tot.doing}</strong><span>In progress now</span></div>
        <div class="wb-tile${tot.late ? " t-late" : ""}"><strong>${tot.late}</strong><span>Overdue now</span></div>
        <div class="wb-tile"><strong>${tot.notes}<small>/${tot.people}</small></strong><span>EOD updates in</span></div>
      </div>

      <section class="wb-rep-depts" aria-label="Finished by team">
        <h3>Finished by team</h3>
        ${byDept.map(x => `<div class="wb-bar" style="--c:${DEPTS[x.k].color}">
          <span class="wb-bar-l">${DEPTS[x.k].label}</span>
          <span class="wb-bar-t"><i style="width:${(x.n / maxDept) * 100}%"></i></span>
          <strong>${x.n}</strong></div>`).join("")}
      </section>

      <div class="wb-rep-people">
        ${rows.map(personCard).join("") || `<div class="wb-empty"><h3>No team members yet</h3><p>Create staff accounts for each department from the Staff button.</p></div>`}
      </div>`;
  }

  function uniqTickets(evs) {
    const seen = new Set();
    return evs.filter(e => { const k = e.ticket_id || e.ticket_number; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function personCard(r) {
    const tz = REPORT_TZ[S.report.tz]?.tz;
    const dept = r.p.department ? DEPTS[r.p.department] : null;
    const quiet = !r.touches && !r.note?.body;
    const evLink = e => `<li onclick="WB.openEvent('${e.ticket_id || ""}')" class="${e.ticket_id ? "" : "gone"}">
      <span class="wb-time">${fmtTime(e.created_at, tz)}</span>
      <span class="wb-num">${escHtml(e.ticket_number || "")}</span> ${escHtml(e.ticket_title || "")}</li>`;
    return `<article class="wb-person${quiet ? " quiet" : ""}" style="--c:${dept?.color || "#0B2F63"}">
      <header>
        ${avatar(r.p.id, 38)}
        <div class="wb-person-id">
          <strong>${escHtml(r.p.full_name || r.p.email)}</strong>
          <span>${escHtml(ROLE_LABEL[r.p.role] || r.p.role)}${dept ? ` · ${dept.label}` : ""}</span>
        </div>
        <div class="wb-person-nums">
          <span class="n-done" title="Finished this day"><strong>${r.done.length}</strong>done</span>
          <span title="Finished in the 7 days ending this day"><strong>${r.week}</strong>this week</span>
        </div>
      </header>
      ${quiet ? `<p class="wb-muted wb-quiet">No activity logged this day.</p>` : ""}
      ${r.done.length ? `<h4>${icon(I.check, 13)} Finished</h4><ul class="wb-evlist">${r.done.map(evLink).join("")}</ul>` : ""}
      ${r.started.length ? `<h4>${icon(I.play, 11)} Started</h4><ul class="wb-evlist">${r.started.map(evLink).join("")}</ul>` : ""}
      ${r.doing.length ? `<h4>Working on now</h4><ul class="wb-evlist plain">${r.doing.map(t => `<li onclick="WB.open('${t.id}')"><span class="wb-num">${escHtml(t.ticket_number)}</span> ${escHtml(t.title)} ${dueChip(t)}</li>`).join("")}</ul>` : ""}
      ${r.late.length ? `<h4 class="hot">${icon(I.alert, 13)} Overdue</h4><ul class="wb-evlist plain">${r.late.map(t => `<li onclick="WB.open('${t.id}')"><span class="wb-num">${escHtml(t.ticket_number)}</span> ${escHtml(t.title)} ${dueChip(t)}</li>`).join("")}</ul>` : ""}
      ${r.comments || r.filed ? `<p class="wb-person-foot">${r.comments ? `${r.comments} comment${r.comments > 1 ? "s" : ""}` : ""}${r.comments && r.filed ? " · " : ""}${r.filed ? `${r.filed} task${r.filed > 1 ? "s" : ""} filed` : ""}</p>` : ""}
      ${r.note?.body ? `<blockquote class="wb-note"><span>End-of-day update · ${fmtTime(r.note.updated_at, tz)}</span>${escHtml(r.note.body)}</blockquote>` : ""}
      ${r.note?.blockers ? `<p class="wb-blocker">${icon(I.alert, 13)} <strong>Blocked:</strong> ${escHtml(r.note.blockers)}</p>` : ""}
    </article>`;
  }

  function copyReport() {
    const r = S.report;
    if (!r.rows) return;
    const tzLabel = REPORT_TZ[r.tz]?.label || "";
    const head = keyToDate(r.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const lines = [
      `Team report: ${head} (${tzLabel})`,
      `Finished: ${r.tot.done} · Started: ${r.tot.started} · In progress: ${r.tot.doing} · Overdue: ${r.tot.late}`,
      "",
    ];
    r.rows.forEach(x => {
      const dept = x.p.department ? DEPTS[x.p.department].label : (ROLE_LABEL[x.p.role] || "");
      lines.push(`${x.p.full_name || x.p.email} (${dept}): ${x.done.length} done`);
      x.done.forEach(e => lines.push(`  ✓ ${e.ticket_number || ""} ${e.ticket_title || ""}`));
      x.started.forEach(e => lines.push(`  ▸ started ${e.ticket_number || ""} ${e.ticket_title || ""}`));
      x.late.forEach(t => lines.push(`  ! overdue ${t.ticket_number} ${t.title}`));
      if (x.note?.body) lines.push(`  Note: ${x.note.body.replace(/\s+/g, " ")}`);
      if (x.note?.blockers) lines.push(`  Blocked: ${x.note.blockers}`);
      if (!x.touches && !x.note?.body) lines.push("  (no activity logged)");
      lines.push("");
    });
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => showToast("Report copied. Paste it into an email or chat."),
      () => showToast("Couldn't copy. Your browser blocked clipboard access."));
  }

  /* ── New task composer ──────────────────────────────────────── */

  function ensureChrome() {
    if ($("wbComposer")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="wbComposer" class="a-modal-overlay wb-modal" style="display:none" onclick="if(event.target===this)WB.closeCompose()">
        <div class="a-modal wb-composer" role="dialog" aria-modal="true" aria-labelledby="wbcTitleH">
          <div class="a-modal-header">
            <h3 id="wbcTitleH">New task</h3>
            <button class="a-modal-close" onclick="WB.closeCompose()" aria-label="Close">&times;</button>
          </div>
          <div class="a-modal-body" id="wbcBody"></div>
          <div class="a-modal-footer">
            <span class="wb-kbd-hint">Ctrl + Enter to create</span>
            <button class="a-btn-secondary" onclick="WB.closeCompose()">Cancel</button>
            <button class="a-btn-primary" id="wbcSave" onclick="WB.saveCompose()">Create task</button>
          </div>
        </div>
      </div>
      <div id="wbDrawer" class="wb-drawer-ov" style="display:none" onclick="if(event.target===this)WB.close()">
        <aside class="wb-drawer" role="dialog" aria-modal="true" aria-label="Task details"><div id="wbDrawerBody"></div></aside>
      </div>`;
    document.body.append(...wrap.children);

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if ($("wbComposer")?.style.display === "flex") { closeCompose(); return; }
        if ($("wbDrawer")?.style.display === "flex") { close(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && $("wbComposer")?.style.display === "flex") { e.preventDefault(); saveCompose(); }
    });
  }

  const C = { dept: null, assignee: "", priority: "medium", type: "task", due: null, dueChip: "none" };

  function compose(preset = {}) {
    ensureChrome();
    const m = me();
    Object.assign(C, {
      dept: preset.dept || (S.dept && S.dept !== "all" ? S.dept : (canDispatch() ? null : m.dept)),
      priority: "medium", type: "task", due: null, dueChip: "none",
    });
    C.assignee = defaultAssignee(C.dept);
    S.composer = { shot: null, file: null };
    const body = $("wbcBody");
    body.innerHTML = `
      <div class="wbc-field">
        <label class="wbc-lbl" for="wbcTitle">What needs to be done? <b>*</b></label>
        <input id="wbcTitle" class="a-input wbc-title" maxlength="200" placeholder="e.g. Update the towel prices on the website" value="${escHtml(preset.title || "")}">
      </div>

      <div class="wbc-field">
        <span class="wbc-lbl">Which team is this for? <b>*</b></span>
        <div class="wbc-depts" id="wbcDepts" role="radiogroup">
          ${Object.entries(DEPTS).map(([k, d]) => `
            <button type="button" role="radio" class="wbc-dept" data-v="${k}" style="--c:${d.color}" onclick="WB.cSet('dept','${k}')">
              <span class="wbc-dept-ic">${icon(DEPT_ICON[k], 16)}</span>
              <strong>${d.label}${k === m.dept ? ` <em>My team</em>` : ""}</strong>
              <small>${d.blurb}</small>
            </button>`).join("")}
        </div>
      </div>

      <div class="wbc-row">
        <div class="wbc-field">
          <label class="wbc-lbl" for="wbcAssignee">Who should do it?</label>
          <div id="wbcAssigneeWrap"></div>
        </div>
        <div class="wbc-field">
          <span class="wbc-lbl">When is it due?</span>
          <div class="wbc-chips" id="wbcDue">
            ${[["none", "No date"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["friday", "Friday"], ["nextweek", "Next week"]].map(([k, l]) =>
              `<button type="button" class="wbc-chip" data-v="${k}" onclick="WB.cDue('${k}')">${l}</button>`).join("")}
            <input type="date" id="wbcDueDate" class="wbc-date" min="${today()}" onchange="WB.cDue('pick', this.value)" aria-label="Pick a due date">
          </div>
        </div>
      </div>

      <div class="wbc-field">
        <span class="wbc-lbl">How urgent?</span>
        <div class="wbc-chips" id="wbcPri">
          ${Object.entries(PRIORITIES).reverse().map(([k, v]) =>
            `<button type="button" class="wbc-chip wbc-pri wbc-pri-${k}" data-v="${k}" onclick="WB.cSet('priority','${k}')"><strong>${v.label}</strong><small>${v.hint}</small></button>`).join("")}
        </div>
      </div>

      <div class="wbc-field">
        <label class="wbc-lbl" for="wbcDesc">Details <span class="wb-muted">(optional)</span></label>
        <textarea id="wbcDesc" class="a-input wb-ta" rows="4" placeholder="Anything that helps: links, steps, what &quot;done&quot; looks like…"></textarea>
      </div>

      <div class="wbc-row">
        <div class="wbc-field">
          <span class="wbc-lbl">Kind of task</span>
          <div class="wbc-chips" id="wbcType"></div>
        </div>
        <div class="wbc-field" id="wbcPageWrap">
          <label class="wbc-lbl" for="wbcPage">Page on the website <span class="wb-muted">(optional)</span></label>
          <input id="wbcPage" class="a-input" placeholder="/checkout or a full link">
        </div>
      </div>

      <div class="wbc-field">
        <span class="wbc-lbl">Screenshot or file <span class="wb-muted">(optional, you can also paste an image)</span></span>
        <label class="wbc-drop" id="wbcDrop">
          <input type="file" id="wbcFile" hidden accept="image/*,${ATTACH_EXTS.join(",")}" onchange="WB.cFile(this.files[0])">
          ${icon(I.image, 18)}<span>Drop a screenshot or PDF / Word / Excel file, or <u>browse</u></span>
        </label>
        <div class="wbc-files" id="wbcFiles"></div>
      </div>

      <p class="wbc-err" id="wbcErr" role="alert"></p>`;

    const drop = $("wbcDrop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) cFile(f); });
    body.onpaste = e => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (item) { e.preventDefault(); cFile(item.getAsFile()); }
    };

    syncComposer();
    openModal("wbComposer");
    setTimeout(() => $("wbcTitle")?.focus(), 30);
  }

  // Filing for your own team usually means "I'll do it"; a lead or a
  // request to another team starts unassigned.
  const defaultAssignee = dept => (!canDispatch() && dept && dept === me().dept ? me().id : "");

  function cSet(k, v) {
    C[k] = v;
    if (k === "dept") {
      C.assignee = defaultAssignee(v);
      if (TYPES[C.type]?.dev && v !== "web_dev") C.type = "task";
    }
    syncComposer();
  }

  function cDue(k, picked) {
    const t = today();
    C.dueChip = k;
    if (k === "none") C.due = null;
    else if (k === "today") C.due = t;
    else if (k === "tomorrow") C.due = addDays(t, 1);
    else if (k === "friday") { const d = new Date(); const add = (5 - d.getDay() + 7) % 7; C.due = addDays(t, add); }
    else if (k === "nextweek") { const d = new Date(); const add = ((8 - d.getDay()) % 7) || 7; C.due = addDays(t, add); }
    else if (k === "pick") C.due = picked || null;
    syncComposer();
  }

  function cFile(file) {
    if (!file) return;
    if (file.type?.startsWith("image/")) S.composer.shot = file;
    else {
      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      if (!ATTACH_EXTS.includes(ext)) { showToast("Attach an image, PDF, Word, Excel, CSV or text file."); return; }
      S.composer.file = file;
    }
    syncComposer();
  }
  function cRemove(which) { S.composer[which] = null; const f = $("wbcFile"); if (f) f.value = ""; syncComposer(); }

  // Repaint the composer's dependent parts: selected chips, the assignee
  // picker (which depends on team + permissions), web-dev-only fields.
  function syncComposer() {
    const m = me();
    document.querySelectorAll("#wbcDepts .wbc-dept").forEach(b => { const on = b.dataset.v === C.dept; b.classList.toggle("active", on); b.setAttribute("aria-checked", on); });
    document.querySelectorAll("#wbcPri .wbc-chip").forEach(b => b.classList.toggle("active", b.dataset.v === C.priority));
    document.querySelectorAll("#wbcDue .wbc-chip").forEach(b => b.classList.toggle("active", b.dataset.v === C.dueChip));
    const dd = $("wbcDueDate"); if (dd) { dd.value = C.due || ""; dd.classList.toggle("active", C.dueChip === "pick"); }

    const types = Object.entries(TYPES).filter(([, v]) => !v.dev || C.dept === "web_dev");
    $("wbcType").innerHTML = types.map(([k, v]) => `<button type="button" class="wbc-chip${C.type === k ? " active" : ""}" onclick="WB.cSet('type','${k}')">${v.label}</button>`).join("");
    $("wbcPageWrap").style.display = C.dept === "web_dev" ? "" : "none";

    const wrap = $("wbcAssigneeWrap");
    if (!C.dept) {
      wrap.innerHTML = `<p class="wbc-note">Pick a team first.</p>`;
    } else if (canDispatch()) {
      const people = S.team.filter(p => ROLE_DEPT[p.role] || p.role === "owner");
      const own = people.filter(p => p.department === C.dept), rest = people.filter(p => p.department !== C.dept);
      const opt = p => `<option value="${p.id}"${C.assignee === p.id ? " selected" : ""}>${escHtml(p.full_name || p.email)}${p.id === m.id ? " (me)" : ""}</option>`;
      wrap.innerHTML = `<select id="wbcAssignee" class="a-input" onchange="WB.cSet('assignee', this.value)">
        <option value="">Nobody yet. ${DEPTS[C.dept].label} picks it up</option>
        ${own.length ? `<optgroup label="${DEPTS[C.dept].label}">${own.map(opt).join("")}</optgroup>` : ""}
        ${rest.length ? `<optgroup label="Others">${rest.map(opt).join("")}</optgroup>` : ""}
      </select>`;
    } else if (C.dept === m.dept) {
      if (C.assignee !== "" && C.assignee !== m.id) C.assignee = m.id;
      wrap.innerHTML = `<div class="wbc-seg">
        <button type="button" class="${C.assignee === m.id ? "active" : ""}" onclick="WB.cSet('assignee','${m.id}')">${avatar(m.id, 20)} Me</button>
        <button type="button" class="${C.assignee === "" ? "active" : ""}" onclick="WB.cSet('assignee','')">Leave for the team</button>
      </div>`;
    } else {
      C.assignee = "";
      wrap.innerHTML = `<p class="wbc-note">${icon(I.users, 13)} Goes to ${DEPTS[C.dept].label}. Head of Operations or their team picks who does it.</p>`;
    }

    const files = [];
    if (S.composer.shot) files.push(`<span class="wbc-file">${icon(I.image, 13)} ${escHtml(S.composer.shot.name || "Pasted screenshot")}<button type="button" onclick="WB.cRemove('shot')" aria-label="Remove">${icon(I.x, 11)}</button></span>`);
    if (S.composer.file) files.push(`<span class="wbc-file">${icon(I.file, 13)} ${escHtml(S.composer.file.name)}<button type="button" onclick="WB.cRemove('file')" aria-label="Remove">${icon(I.x, 11)}</button></span>`);
    $("wbcFiles").innerHTML = files.join("");
  }

  function closeCompose() { closeModal("wbComposer"); }

  async function saveCompose() {
    const title = $("wbcTitle").value.trim();
    const err = $("wbcErr");
    err.textContent = "";
    if (!title) { err.textContent = "Write a short title for the task."; $("wbcTitle").focus(); return; }
    if (!C.dept) { err.textContent = "Pick which team this is for."; return; }

    const btn = $("wbcSave");
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      const payload = {
        title,
        description: $("wbcDesc").value.trim(),
        department: C.dept,
        priority: C.priority,
        ticket_type: C.type,
        due_date: C.due,
        page_url: C.dept === "web_dev" ? ($("wbcPage").value.trim() || null) : null,
        assignee_id: C.assignee || null,
      };
      if (S.composer.shot) payload.screenshot_url = await upload(S.composer.shot, "tickets");
      if (S.composer.file) {
        payload.attachment_url = await upload(S.composer.file, "tickets/attachments");
        payload.attachment_name = S.composer.file.name;
      }
      const created = await createTicket(payload);
      if (!created) return;
      closeCompose();
      showToast(`${created.ticket_number} created for ${DEPTS[created.department].label}.`);
    } catch (e) {
      err.textContent = friendlyDbError(e);
    } finally {
      btn.disabled = false; btn.textContent = "Create task";
    }
  }

  async function createTicket(payload) {
    const { data, error } = await window.sb.from("dev_tickets").insert(payload).select().single();
    if (error) { showToast(friendlyDbError(error)); return null; }
    S.tickets.unshift(data);
    paint();
    if (data.assignee_id && data.assignee_id !== me().id) notify(data, "assigned", "You have a new task.");
    else if (!data.assignee_id) notify(data, "created", data.description ? data.description.slice(0, 240) : "");
    return data;
  }

  async function quickAdd(form) {
    const input = form.title;
    const title = input.value.trim();
    if (!title) return;
    const m = me();
    const dept = S.dept && S.dept !== "all" ? S.dept : m.dept;
    if (!dept) { compose({ title }); input.value = ""; return; }
    input.disabled = true;
    const created = await createTicket({
      title, description: "", department: dept, priority: "medium", ticket_type: "task",
      assignee_id: !canDispatch() && dept === m.dept ? m.id : null,
    });
    input.disabled = false;
    if (created) { input.value = ""; document.querySelector(".wb-quick input")?.focus(); }
  }

  async function logDone(form) {
    const title = form.title.value.trim();
    const m = me();
    if (!title || !m.dept) return;
    form.title.disabled = true;
    const created = await createTicket({
      title, description: "", department: m.dept, priority: "low", ticket_type: "task",
      assignee_id: m.id, status: "done",
    });
    form.title.disabled = false;
    if (created) { showToast("Logged. It counts toward today's report."); paint(); }
  }

  /* ── Ticket drawer ──────────────────────────────────────────── */

  async function open(id) {
    ensureChrome();
    const t = byId(id);
    if (!t) { showToast("That task isn't on the board any more."); return; }
    S.drawer = { id, comments: null, events: null, tab: (S.drawer?.id === id && S.drawer.tab) || "comments" };
    S.commentShot = null;
    const ov = $("wbDrawer");
    ov.style.display = "flex";
    requestAnimationFrame(() => ov.classList.add("open"));
    try { history.replaceState(null, "", "#ticket=" + encodeURIComponent(t.ticket_number || "")); } catch { /* file:// */ }
    refreshDrawer({ refetch: true });
  }

  function openEvent(ticketId) {
    if (!ticketId) { showToast("That task was deleted."); return; }
    open(ticketId);
  }

  function openFromHash() {
    const m = /#ticket=([^&]+)/.exec(location.hash);
    if (!m) return;
    const num = decodeURIComponent(m[1]);
    const t = S.tickets.find(x => x.ticket_number === num);
    if (t) open(t.id);
  }

  function close() {
    const ov = $("wbDrawer");
    if (!ov) return;
    ov.classList.remove("open");
    setTimeout(() => { ov.style.display = "none"; }, 180);
    S.drawer = null;
    try { if (location.hash.startsWith("#ticket=")) history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
  }

  async function refreshDrawer({ refetch } = {}) {
    const dr = S.drawer;
    if (!dr) return;
    const t = byId(dr.id);
    if (!t) { close(); return; }
    if (refetch) {
      const [cRes, eRes] = await Promise.all([
        window.sb.from("dev_ticket_comments").select("*").eq("ticket_id", t.id).order("created_at", { ascending: true }),
        S.migrationMissing ? Promise.resolve({ data: [] })
          : window.sb.from("dev_ticket_events").select("*").eq("ticket_id", t.id).order("created_at", { ascending: true }),
      ]);
      if (S.drawer?.id !== t.id) return;
      dr.comments = cRes.data || [];
      dr.events = eRes.data || [];
      S.comments[t.id] = dr.comments.length;
    }
    paintDrawer(t);
  }

  function paintDrawer(t) {
    const body = $("wbDrawerBody");
    if (!body) return;
    // Keep whatever the person is typing across repaints.
    const draft = $("wbComment")?.value || "";
    const dr = S.drawer;
    const d = DEPTS[t.department] || DEPTS.web_dev;
    const mv = canMove(t), ed = canEdit(t), m = me();

    const primary =
      canTake(t) ? `<button class="a-btn-primary" onclick="WB.take('${t.id}')">${icon(I.hand, 14)} Assign to me</button>`
      : (t.assignee_id === m.id || (mv && t.assignee_id)) && t.status === "open" ? `<button class="a-btn-primary" onclick="WB.setStatus('${t.id}','in_progress')">${icon(I.play, 12)} Start working</button>`
      : mv && t.status === "in_progress" ? `<button class="a-btn-primary wb-btn-done" onclick="WB.setStatus('${t.id}','done')">${icon(I.check, 14)} Mark as done</button>`
      : mv && isClosed(t) ? `<button class="a-btn-secondary" onclick="WB.setStatus('${t.id}','open')">Reopen</button>`
      : "";

    body.innerHTML = `
      <header class="wbd-head" style="--c:${d.color}">
        <div class="wbd-top">
          <span class="wb-num wb-num-lg">${escHtml(t.ticket_number || "")}</span>
          ${deptChip(t.department)}
          <span class="wb-grow"></span>
          <button class="wb-iconbtn" title="Copy link" aria-label="Copy link" onclick="WB.copyLink('${t.id}')">${icon(I.link)}</button>
          ${canDelete() ? `<button class="wb-iconbtn danger" title="Delete task" aria-label="Delete task" onclick="WB.remove('${t.id}')">${icon(I.trash)}</button>` : ""}
          <button class="wb-iconbtn" title="Close (Esc)" aria-label="Close" onclick="WB.close()">${icon(I.x, 16)}</button>
        </div>
        ${ed ? `<textarea class="wbd-title" rows="1" maxlength="200" aria-label="Title"
                  oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                  onblur="WB.saveTitle('${t.id}', this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">${escHtml(t.title)}</textarea>`
             : `<h2 class="wbd-title ro">${escHtml(t.title)}</h2>`}

        <div class="wbd-status" role="group" aria-label="Status">
          ${STATUSES.map(s => `<button class="wbd-st wb-st-${s.key}${t.status === s.key ? " active" : ""}" ${mv ? `onclick="WB.setStatus('${t.id}','${s.key}')"` : "disabled"} aria-pressed="${t.status === s.key}">${s.label}</button>`).join("")}
        </div>
        <div class="wbd-primary">
          ${primary}
          ${!mv ? `<span class="wb-muted">${icon(I.users, 13)} Only ${t.assignee_id ? escHtml(firstName(t.assignee_id)) + " or " : ""}${d.label} can move this task.</span>` : ""}
        </div>
      </header>

      <div class="wbd-cols">
        <div class="wbd-main">
          <section class="wbd-sec">
            <h4>Details</h4>
            ${ed ? `<textarea id="wbdDesc" class="a-input wb-ta" rows="5" placeholder="Add details…" onblur="WB.saveDesc('${t.id}', this.value)">${escHtml(t.description || "")}</textarea>`
                 : `<p class="wbd-desc">${t.description ? escHtml(t.description) : `<span class="wb-muted">No details.</span>`}</p>`}
            ${t.page_url ? `<p class="wbd-meta">Page: <code>${escHtml(t.page_url)}</code></p>` : ""}
            ${t.screenshot_url ? `<div class="wbd-shot" id="wbdShot"><span class="wb-muted">Loading screenshot…</span></div>` : ""}
            ${t.attachment_url ? `<div id="wbdAttach" class="wbd-meta">Loading file…</div>` : ""}
          </section>

          <section class="wbd-sec">
            <div class="wbd-tabs" role="tablist">
              <button role="tab" class="${dr.tab === "comments" ? "active" : ""}" onclick="WB.drawerTab('comments')">Comments <em>${dr.comments ? dr.comments.length : ""}</em></button>
              <button role="tab" class="${dr.tab === "history" ? "active" : ""}" onclick="WB.drawerTab('history')">History <em>${dr.events ? dr.events.filter(e => e.event_type !== "comment").length : ""}</em></button>
            </div>
            ${dr.tab === "history" ? historyHtml(dr.events) : commentsHtml(t, dr.comments)}
          </section>
        </div>

        <aside class="wbd-side">
          ${sideField("Assigned to", canDispatch()
              ? assignSelect(t, "a-input")
              : `<div class="wbd-person">${avatar(t.assignee_id || t.assignee_email, 26)}<span>${t.assignee_id ? escHtml(personName(t.assignee_id || t.assignee_email)) : "Nobody yet"}</span></div>
                 ${canTake(t) ? `<button class="wb-linkbtn" onclick="WB.take('${t.id}')">Assign to me</button>` : ""}
                 ${canRelease(t) ? `<button class="wb-linkbtn" onclick="WB.release('${t.id}')">Unassign me</button>` : ""}`)}
          ${sideField("Team", canDispatch()
              ? `<select class="a-input" onchange="WB.setField('${t.id}','department',this.value)">${Object.entries(DEPTS).map(([k, v]) => `<option value="${k}"${t.department === k ? " selected" : ""}>${v.label}</option>`).join("")}</select>`
              : deptChip(t.department))}
          ${sideField("Due date", ed
              ? `<input type="date" class="a-input${dueState(t) ? " wb-due-" + dueState(t) : ""}" value="${t.due_date || ""}" onchange="WB.setField('${t.id}','due_date',this.value||null)">`
              : dueChip(t, { always: true }))}
          ${sideField("Priority", ed
              ? `<select class="a-input" onchange="WB.setField('${t.id}','priority',this.value)">${Object.entries(PRIORITIES).map(([k, v]) => `<option value="${k}"${t.priority === k ? " selected" : ""}>${v.label} · ${v.hint}</option>`).join("")}</select>`
              : priBadge(t.priority))}
          ${sideField("Kind", ed
              ? `<select class="a-input" onchange="WB.setField('${t.id}','ticket_type',this.value)">${Object.entries(TYPES).filter(([k, v]) => !v.dev || t.department === "web_dev" || t.ticket_type === k).map(([k, v]) => `<option value="${k}"${t.ticket_type === k ? " selected" : ""}>${v.label}</option>`).join("")}</select>`
              : `<span>${(TYPES[t.ticket_type] || TYPES.task).label}</span>`)}
          <dl class="wbd-facts">
            <dt>Filed by</dt><dd>${escHtml(personName(t.reporter_id || t.reporter_email) || "—")}</dd>
            <dt>Created</dt><dd>${new Date(t.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
            ${t.started_at ? `<dt>Started</dt><dd>${new Date(t.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd>` : ""}
            ${t.resolved_at ? `<dt>${t.status === "done" ? "Finished" : "Closed"}</dt><dd>${new Date(t.resolved_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd>` : ""}
          </dl>
        </aside>
      </div>`;

    const titleEl = body.querySelector("textarea.wbd-title");
    if (titleEl) { titleEl.style.height = "auto"; titleEl.style.height = titleEl.scrollHeight + "px"; }
    const box = $("wbComment");
    if (box) {
      box.value = draft;
      box.onpaste = e => {
        const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
        if (item) { e.preventDefault(); commentShot(item.getAsFile()); }
      };
      box.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); addComment(t.id); } };
    }
    if (S.commentShot) commentShot(S.commentShot);
    loadDrawerFiles(t);
  }

  function sideField(label, html) {
    return `<div class="wbd-field"><span class="wbd-flbl">${label}</span><div>${html}</div></div>`;
  }

  async function loadDrawerFiles(t) {
    if (t.screenshot_url) {
      const holder = $("wbdShot");
      // Sales reps stored a full public URL before; everyone else stores a path.
      const url = /^https?:/.test(t.screenshot_url) ? t.screenshot_url
        : (await window.sb.storage.from(BUCKET).createSignedUrl(t.screenshot_url, 3600)).data?.signedUrl;
      if (holder && $("wbdShot") === holder) holder.innerHTML = url
        ? `<a href="${escHtml(url)}" target="_blank" rel="noopener"><img src="${escHtml(url)}" alt="Screenshot for ${escHtml(t.ticket_number || "task")}"></a>`
        : `<span class="wb-muted">Screenshot unavailable.</span>`;
    }
    if (t.attachment_url) {
      const holder = $("wbdAttach");
      const { data } = await window.sb.storage.from(BUCKET).createSignedUrl(t.attachment_url, 3600, { download: t.attachment_name || true });
      if (holder) holder.innerHTML = data?.signedUrl
        ? `<a class="wbd-file" href="${escHtml(data.signedUrl)}" target="_blank" rel="noopener">${icon(I.file, 14)} ${escHtml(t.attachment_name || "Download file")}</a>`
        : `<span class="wb-muted">File unavailable.</span>`;
    }
    (S.drawer?.comments || []).filter(c => c.screenshot_url).forEach(async c => {
      const { data } = await window.sb.storage.from(BUCKET).createSignedUrl(c.screenshot_url, 3600);
      const h = $("wbcShot-" + c.id);
      if (h) h.innerHTML = data?.signedUrl ? `<a href="${escHtml(data.signedUrl)}" target="_blank" rel="noopener"><img src="${escHtml(data.signedUrl)}" alt="Screenshot in comment"></a>` : "";
    });
  }

  function commentsHtml(t, comments) {
    if (!comments) return `<p class="wb-muted">Loading…</p>`;
    const m = me();
    const lead = ["owner", "operations", "admin"].includes(m.role);
    return `
      <div class="wbd-thread">
        ${comments.map(c => {
          const mine = c.author_id === m.id || c.author_email === m.email;
          return `<div class="wbd-comment" data-id="${c.id}">
            ${avatar(c.author_id || c.author_email, 30)}
            <div class="wbd-cbody">
              <div class="wbd-chead">
                <strong>${escHtml(c.author_name || personName(c.author_id || c.author_email))}</strong>
                <span class="wb-muted">${ago(c.created_at)}${c.edited_at ? " · edited" : ""}</span>
                ${mine || lead ? `<span class="wbd-cact">
                  ${mine ? `<button onclick="WB.editComment('${c.id}')">Edit</button>` : ""}
                  <button onclick="WB.deleteComment('${c.id}')">Delete</button></span>` : ""}
              </div>
              <p class="wbd-ctext">${escHtml(c.body)}</p>
              ${c.screenshot_url ? `<div class="wbd-cshot" id="wbcShot-${c.id}"></div>` : ""}
            </div>
          </div>`;
        }).join("") || `<p class="wb-muted wbd-nocomments">No comments yet. Ask a question or post an update.</p>`}
      </div>
      <div class="wbd-composer">
        ${avatar(m.id || m.email, 30)}
        <div class="wbd-composer-main">
          <textarea id="wbComment" class="a-input wb-ta" rows="2" placeholder="Write a comment… (paste a screenshot, Ctrl + Enter to send)"></textarea>
          <div id="wbCommentShot" class="wbd-cshot-prev" style="display:none"></div>
          <div class="wbd-composer-foot">
            <label class="wb-linkbtn">${icon(I.image, 13)} Screenshot
              <input type="file" accept="image/*" hidden onchange="WB.commentShot(this.files[0])"></label>
            <button class="a-btn-primary" id="wbCommentBtn" onclick="WB.addComment('${t.id}')">Comment</button>
          </div>
        </div>
      </div>`;
  }

  function historyHtml(events) {
    if (!events) return `<p class="wb-muted">Loading…</p>`;
    const items = events.filter(e => e.event_type !== "comment");
    if (!items.length) return `<p class="wb-muted">No history yet.</p>`;
    const who = e => `<strong>${escHtml(e.actor_name || personName(e.actor_id || e.actor_email) || "System")}</strong>`;
    const describe = e => {
      switch (e.event_type) {
        case "created":    return `${who(e)} created this task`;
        case "status":     return `${who(e)} moved it ${e.from_value ? `from ${statusPill(e.from_value)} ` : ""}to ${statusPill(e.to_value)}`;
        case "assigned":   return e.to_value ? `${who(e)} assigned it to <strong>${escHtml(personName(e.to_value))}</strong>` : `${who(e)} unassigned <strong>${escHtml(personName(e.from_value))}</strong>`;
        case "department": return `${who(e)} moved it to ${deptChip(e.to_value, { small: true })}`;
        case "priority":   return `${who(e)} changed priority to ${priBadge(e.to_value)}`;
        case "due_date":   return e.to_value ? `${who(e)} set the due date to <strong>${escHtml(fmtDay(e.to_value))}</strong>` : `${who(e)} removed the due date`;
        default:           return `${who(e)} updated it`;
      }
    };
    return `<ol class="wbd-history">${items.slice().reverse().map(e => `<li><span class="wbd-hdot"></span><div>${describe(e)}<span class="wb-muted"> · ${ago(e.created_at)}</span></div></li>`).join("")}</ol>`;
  }

  function drawerTab(tab) { if (S.drawer) { S.drawer.tab = tab; const t = byId(S.drawer.id); if (t) paintDrawer(t); } }

  function commentShot(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    S.commentShot = file;
    const box = $("wbCommentShot");
    if (!box) return;
    box.style.display = "block";
    box.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Screenshot to attach"><button type="button" onclick="WB.clearCommentShot()" aria-label="Remove screenshot">${icon(I.x, 12)}</button>`;
  }
  function clearCommentShot() { S.commentShot = null; const b = $("wbCommentShot"); if (b) { b.style.display = "none"; b.innerHTML = ""; } }

  async function addComment(id) {
    const box = $("wbComment");
    let body = box.value.trim();
    if (!body && !S.commentShot) return;
    if (!body) body = "📎 Screenshot attached.";
    const btn = $("wbCommentBtn");
    btn.disabled = true; btn.textContent = "Posting…";
    try {
      const m = me();
      const payload = {
        ticket_id: id, author_id: m.id, author_email: m.email,
        author_name: S.teamById[m.id]?.full_name || null, author_role: m.role, body,
      };
      if (S.commentShot) payload.screenshot_url = await upload(S.commentShot, "comments");
      const { error } = await window.sb.from("dev_ticket_comments").insert(payload);
      if (error) throw error;
      box.value = "";
      S.commentShot = null;
      const t = byId(id);
      await refreshDrawer({ refetch: true });
      paint();
      if (t) notify(t, "comment", body.slice(0, 240));
    } catch (e) {
      showToast("Couldn't post: " + friendlyDbError(e));
      btn.disabled = false; btn.textContent = "Comment";
    }
  }

  function editComment(cid) {
    const el = document.querySelector(`.wbd-comment[data-id="${cid}"] .wbd-ctext`);
    if (!el || el.querySelector("textarea")) return;
    const original = el.textContent;
    el.innerHTML = `<textarea class="a-input wb-ta" rows="3">${escHtml(original)}</textarea>
      <span class="wbd-editbtns"><button class="a-btn-primary" onclick="WB.saveComment('${cid}')">Save</button>
      <button class="a-btn-secondary" onclick="WB.refresh()">Cancel</button></span>`;
    el.querySelector("textarea").focus();
  }
  async function saveComment(cid) {
    const body = document.querySelector(`.wbd-comment[data-id="${cid}"] textarea`)?.value.trim();
    if (!body) { showToast("A comment can't be empty."); return; }
    const { error } = await window.sb.from("dev_ticket_comments").update({ body, edited_at: new Date().toISOString() }).eq("id", cid);
    if (error) { showToast("Couldn't save: " + friendlyDbError(error)); return; }
    refreshDrawer({ refetch: true });
  }
  async function deleteComment(cid) {
    if (!confirm("Delete this comment?")) return;
    const { error } = await window.sb.from("dev_ticket_comments").delete().eq("id", cid);
    if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
    await refreshDrawer({ refetch: true });
    paint();
  }

  /* ── Actions ────────────────────────────────────────────────── */

  async function setStatus(id, status) {
    const t = byId(id);
    if (!t || t.status === status) return;
    if (!canMove(t)) { showToast(`Only ${DEPTS[t.department]?.label || "that team"} or the assigned person can move this.`); return; }
    const patch = { status };
    // Starting work on an unassigned task in your own team claims it.
    if (status === "in_progress" && !t.assignee_id && canTake(t)) patch.assignee_id = me().id;
    const saved = await patchTicket(id, patch);
    if (!saved) return;
    if (status === "done") showToast(`${saved.ticket_number} done. Nice work.`);
    notify(saved, "status", `Status changed to “${STATUS_LABEL[status]}”`);
  }

  async function setField(id, field, value) {
    const t = byId(id);
    if (!t || (t[field] ?? null) === (value ?? null)) return;
    const saved = await patchTicket(id, { [field]: value });
    if (saved && field === "department") showToast(`Moved to ${DEPTS[value].label}.`);
  }

  async function assign(id, userId) {
    const t = byId(id);
    if (!t || (t.assignee_id || "") === (userId || "")) return;
    const saved = await patchTicket(id, { assignee_id: userId || null });
    if (!saved) return;
    showToast(userId ? `Assigned to ${personName(userId)}.` : "Unassigned.");
    if (userId && userId !== me().id) notify(saved, "assigned", "You have a new task.");
  }
  async function take(id) {
    const saved = await patchTicket(id, { assignee_id: me().id });
    if (saved) showToast(`${saved.ticket_number} is yours.`);
  }
  async function release(id) {
    const saved = await patchTicket(id, { assignee_id: null });
    if (saved) showToast("Unassigned. It's back with the team.");
  }
  function saveTitle(id, v) {
    const title = v.trim();
    const t = byId(id);
    if (!t || !title || title === t.title) return;
    patchTicket(id, { title }, { quiet: true });
  }
  function saveDesc(id, v) {
    const t = byId(id);
    if (!t || v.trim() === (t.description || "").trim()) return;
    patchTicket(id, { description: v.trim() }, { quiet: true });
  }

  async function remove(id) {
    const t = byId(id);
    if (!t || !confirm(`Delete ${t.ticket_number}? Its comments go too, and this can't be undone.`)) return;
    const files = [t.screenshot_url, t.attachment_url].filter(p => p && !/^https?:/.test(p));
    const { error } = await window.sb.from("dev_tickets").delete().eq("id", id);
    if (error) { showToast("Couldn't delete: " + friendlyDbError(error)); return; }
    if (files.length) window.sb.storage.from(BUCKET).remove(files);
    S.tickets = S.tickets.filter(x => x.id !== id);
    close();
    paint();
    showToast(`${t.ticket_number} deleted.`);
  }

  function copyLink(id) {
    const t = byId(id);
    const url = `${location.origin}/admin#ticket=${encodeURIComponent(t?.ticket_number || "")}`;
    navigator.clipboard?.writeText(url).then(() => showToast("Link copied."), () => showToast(url));
  }

  /* ── View / filter controls ─────────────────────────────────── */

  function setView(v) {
    if (v === "report" && !canSeeReport()) return;
    S.view = v; savePref("view", v);
    document.querySelectorAll(".wb-view").forEach(b => {
      const on = b.getAttribute("onclick").includes(`'${v}'`);
      b.classList.toggle("active", on); b.setAttribute("aria-selected", on);
    });
    paint();
  }
  function setDept(d) { S.dept = d; savePref("dept", d); paint(); }
  function setFilter(k, v) {
    S.filters[k] = v;
    if (k === "q") { paintStats(); paintView(); return; }   // keep focus in the search box
    paint();
  }
  function clearFilters() { S.filters = { q: "", person: "all", priority: "all", due: "all" }; paint(); }
  function quickFilter(kind) {
    if (S.view === "mine" || S.view === "report") S.view = "board";
    S.filters = { q: "", person: kind === "unassigned" ? "none" : "all", priority: "all", due: kind === "overdue" ? "overdue" : "all" };
    paint();
  }
  function toggleOld() { S.showOldClosed = !S.showOldClosed; paintView(); }

  function reportShift(n) { S.report.date = addDays(S.report.date, n); paint(); }
  function reportDate(v) { S.report.date = v || null; paint(); }
  function reportTz(v) { S.report.tz = v; savePref("tz", v); S.report.date = null; paint(); }

  // Sidebar badge: my open tasks, or for leads, tasks nobody owns yet.
  function updateNavCount() {
    const el = $("devTicketNavCount");
    if (!el) return;
    const m = me();
    const n = canDispatch()
      ? S.tickets.filter(t => !isClosed(t) && !t.assignee_id).length
      : S.tickets.filter(t => !isClosed(t) && t.assignee_id === m.id).length;
    el.textContent = n;
    el.title = canDispatch() ? "Tasks that need an owner" : "Your open tasks";
    el.style.display = n ? "inline-flex" : "none";
  }

  // Open a ticket by number from elsewhere in the admin (notifications).
  async function openByNumber(num) {
    if (!S.tickets.length) { try { await load(); } catch { return; } }
    const t = S.tickets.find(x => x.ticket_number === num) || byId(num);
    if (t) open(t.id);
  }

  return {
    render, open, openEvent, openByNumber, close, refresh: () => refreshDrawer({ refetch: true }),
    compose, closeCompose, saveCompose, cSet, cDue, cFile, cRemove,
    quickAdd, logDone, saveEod,
    setStatus, setField, assign, take, release, saveTitle, saveDesc, remove, copyLink,
    addComment, editComment, saveComment, deleteComment, commentShot, clearCommentShot, drawerTab,
    setView, setDept, setFilter, clearFilters, quickFilter, toggleOld,
    reportShift, reportDate, reportTz, copyReport,
    dragStart, dragEnd, dragOver, dragLeave, drop,
    updateNavCount,
  };
})();

window.WB = WB;
function renderWorkBoard() { return WB.render(); }
