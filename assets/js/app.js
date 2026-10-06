/* =========================================================
   Tally Suite — shared app shell
   Session, layout (sidebar + topbar), icons, toasts, modals,
   formatting and small helpers used by every page.
   ========================================================= */
var App = (function () {
  var SESSION_KEY = "tally_session";

  /* ---------------- Icons (inline SVG paths) ---------------- */
  var ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    invoice: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h7M9 17h5"/>',
    ledger: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>',
    sales: '<path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.2a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>',
    payment: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    contra: '<path d="M7 7h13l-4-4"/><path d="M17 17H4l4 4"/>',
    einvoice: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/>',
    ewaybill: '<path d="M1 7h13v10H1z"/><path d="M14 10h4l4 4v3h-8z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>',
    ecommerce: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    building: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1M9 13h1M14 9h1M14 13h1"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/>',
    trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    trendDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    importIcon: '<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 20h14"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
  };

  function icon(name, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra ? " " + extra : "") + ">" + (ICONS[name] || "") + "</svg>";
  }

  /* ---------------- Navigation (matches the 9 modules) ---------------- */
  var NAV = [
    { section: "Overview" },
    { key: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "dashboard" },
    { section: "Masters & Documents" },
    { key: "statement", label: "Import Statement", href: "import.html", icon: "importIcon" },
    { key: "ledger", label: "Ledgers", href: "ledgers.html", icon: "list" },
    { key: "invoice", label: "Invoice / Quotation", href: "invoice.html", icon: "invoice" },
    { section: "Transactions" },
    { key: "salespurchase", label: "Sales & Purchase", href: "sales-purchase.html", icon: "sales" },
    { key: "paymentreceipt", label: "Payment & Receipt", href: "payment-receipt.html", icon: "payment" },
    { key: "contrajournal", label: "Contra & Journal", href: "contra-journal.html", icon: "contra" },
    { section: "GST Compliance" },
    { key: "einvoice", label: "e-Invoice", href: "e-invoice.html", icon: "einvoice" },
    { key: "ewaybill", label: "e-Way Bill", href: "e-way-bill.html", icon: "ewaybill" },
    { section: "Integrations" },
    { key: "ecommerce", label: "e-Commerce Import", href: "ecommerce-import.html", icon: "ecommerce" },
    { section: "Administration" },
    { key: "settings", label: "Settings", href: "settings.html", icon: "settings" },
    { key: "users", label: "Users", href: "users.html", icon: "users" },
    { key: "roles", label: "Roles & Permissions", href: "roles.html", icon: "shield" }
  ];

  /* ---------------- Theme ---------------- */
  function applyStoredTheme() {
    try {
      var t = localStorage.getItem("tally_theme");
      if (t) document.documentElement.setAttribute("data-theme", t);
    } catch (e) { /* ignore */ }
  }
  function isDark() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function toggleTheme() {
    var next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tally_theme", next); } catch (e) { /* ignore */ }
    var btn = document.getElementById("themeToggle");
    if (btn) btn.innerHTML = icon(isDark() ? "sun" : "moon");
  }
  /* mode: "light" | "dark" | "system" (follow the device). */
  function setTheme(mode) {
    try {
      if (mode === "system") { document.documentElement.removeAttribute("data-theme"); localStorage.removeItem("tally_theme"); }
      else { document.documentElement.setAttribute("data-theme", mode); localStorage.setItem("tally_theme", mode); }
    } catch (e) { /* ignore */ }
    var btn = document.getElementById("themeToggle");
    if (btn) btn.innerHTML = icon(isDark() ? "sun" : "moon");
  }
  function themeMode() {
    try { return localStorage.getItem("tally_theme") || "system"; } catch (e) { return "system"; }
  }
  applyStoredTheme();

  /* ---------------- Session ---------------- */
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  }
  function login(tenant, user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ tenantId: tenant.tenantId, userId: user.id }));
    Data.useTenant(tenant.tenantId);
    Data.update("users", user.id, { previousLogin: user.lastLogin || null, lastLogin: new Date().toISOString() });
  }
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = "index.html";
  }
  function isLoggedIn() { return !!getSession(); }

  var currentUserRec = null;

  // Auth guards throw this to stop the page script mid-redirect; it isn't a real error.
  var REDIRECT = "tally:redirecting";
  window.addEventListener("error", function (e) { if (e.message && e.message.indexOf(REDIRECT) !== -1) e.preventDefault(); });

  /* Call on every in-app page: bounces to login if signed out (or the user was deactivated),
     and scopes Data to this tenant. */
  function requireAuth() {
    var s = getSession();
    var tenant = s && Data.findTenant(s.tenantId);
    if (tenant && tenant.status === "Active") {
      Data.useTenant(tenant.tenantId);
      currentUserRec = Data.get("users", s.userId);
    }
    if (!tenant || tenant.status !== "Active" || !currentUserRec || currentUserRec.status !== "Active") {
      sessionStorage.removeItem(SESSION_KEY);
      window.location.replace("index.html");
      throw new Error(REDIRECT);
    }
    return tenant;
  }
  function currentUser() { return currentUserRec; }
  function can(moduleKey, action) { return Data.can(currentUserRec, moduleKey, action || "view"); }

  /* ---------------- Layout ---------------- */
  function renderShell(opts) {
    var tenant = requireAuth();
    var user = currentUserRec, role = Data.roleById(user.roleId);

    // No view permission for this page → back to the dashboard with a message.
    var openToAll = opts.active === "dashboard" || opts.active === "profile";
    if (!openToAll && !can(opts.active, "view")) {
      sessionStorage.setItem("tally_flash", "Your role doesn't have access to that page.");
      window.location.replace("dashboard.html");
      throw new Error(REDIRECT);
    }
    // Hide create / edit / delete controls the role isn't allowed to use (see [data-perm] in CSS).
    ["create", "edit", "delete"].forEach(function (a) {
      if (!can(opts.active, a)) document.body.classList.add("no-" + a);
    });
    var viewOnly = !openToAll && ["create", "edit", "delete"].every(function (a) { return !can(opts.active, a); });

    // Only show modules this role can open; drop section headings left empty.
    var visible = NAV.filter(function (n) { return n.section || n.key === "dashboard" || can(n.key, "view"); })
      .filter(function (n, i, arr) { return !n.section || (arr[i + 1] && !arr[i + 1].section); });
    var nav = visible.map(function (n) {
      if (n.section) return '<div class="nav-section">' + n.section + "</div>";
      return '<a class="nav-item' + (n.key === opts.active ? " active" : "") + '" href="' + n.href + '">' + icon(n.icon) + "<span>" + n.label + "</span>" + "</a>";
    }).join("");

    var sidebar = document.getElementById("sidebar");
    sidebar.className = "sidebar";
    sidebar.innerHTML =
      '<div class="brand"><span class="brand-mark">F</span><div class="brand-text"><strong>FebiTally</strong><span>Bank statements → Tally Prime</span></div></div>' +
      '<div class="tenant-chip">' + icon("building") + "<div><strong>" + esc(tenant.companyName) + "</strong><span>" + tenant.tenantId + "</span></div></div>" +
      '<nav class="nav">' + nav + "</nav>" +
      '<div class="sidebar-foot">' +
        '<a class="tally-status" href="' + (can("settings", "view") ? "settings.html" : "#") + '" title="Tally Prime connection"><span id="tally-dot" class="dot"></span><span id="tally-label">Checking Tally…</span></a>' +
        '<div class="sidebar-user"><a class="who-link' + (opts.active === "profile" ? " active" : "") + '" href="profile.html" title="My profile"><div class="avatar">' + esc(initials(user.name)) + '</div><div class="who"><strong>' + esc(user.name) + "</strong><span>" + esc(role ? role.name : "No role") + " · My profile</span></div></a>" +
        '<button class="logout-btn" id="themeToggle" title="Toggle theme">' + icon(isDark() ? "sun" : "moon") + "</button>" +
        '<button class="logout-btn" id="logoutBtn" title="Sign out">' + icon("logout") + "</button></div>" +
      "</div>";

    var backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    backdrop.addEventListener("click", function () { document.body.classList.remove("nav-open"); });
    document.body.appendChild(backdrop);

    // Desktop pages start straight with their heading (as in base.html); phones get a slim bar for the menu.
    var topbar = document.getElementById("topbar");
    topbar.className = "mobile-bar";
    topbar.innerHTML =
      '<button class="icon-btn" id="menuToggle" aria-label="Menu">' + icon("menu") + "</button>" +
      '<span class="mobile-brand"><span class="brand-mark">F</span>FebiTally</span>' +
      '<a class="top-avatar" href="profile.html" title="My profile · ' + esc(user.name) + '">' + esc(initials(user.name)) + "</a>";

    if (viewOnly) {
      var head = document.querySelector(".page-head");
      if (head) {
        var actions = head.querySelector(".page-actions");
        if (!actions) { actions = document.createElement("div"); actions.className = "page-actions"; head.appendChild(actions); }
        actions.insertAdjacentHTML("afterbegin", '<span class="badge badge-warn plain view-only">' + icon("lock") + "View only</span>");
      }
    }

    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("menuToggle").addEventListener("click", function () { document.body.classList.toggle("nav-open"); });

    injectDialogs();
    if (window.Tally) { Tally.ensureSeed(); refreshTallyStatus(); }

    var flash = sessionStorage.getItem("tally_flash");
    if (flash) { sessionStorage.removeItem("tally_flash"); setTimeout(function () { toast(flash, "info"); }, 200); }

    wireStackTables();

    // Hydrate data-icon placeholders anywhere on the page.
    document.querySelectorAll("[data-icon]").forEach(function (el) { el.innerHTML = icon(el.getAttribute("data-icon")); });
    return tenant;
  }

  /* ---------------- Tally status (sidebar foot) ---------------- */
  function refreshTallyStatus() {
    var dot = document.getElementById("tally-dot"), label = document.getElementById("tally-label");
    if (!dot || !window.Tally) return Promise.resolve(null);
    dot.className = "dot"; label.textContent = "Checking Tally…";
    return Tally.status().then(function (st) {
      dot.className = "dot " + (st.ok ? "ok" : "bad");
      label.textContent = st.ok ? "Tally Prime · " + st.host + ":" + st.port : "Tally not reachable";
      document.dispatchEvent(new CustomEvent("tally:status", { detail: st }));
      return st;
    });
  }

  /* ---------------- Shared dialogs (base.html) ---------------- */
  function injectDialogs() {
    if (document.getElementById("confirm-modal")) return;
    document.body.insertAdjacentHTML("beforeend",
      '<div class="modal-overlay" id="response-modal"><div class="modal lg">' +
        '<div class="modal-head"><div><h3 id="response-title">Tally response</h3><div class="muted small" id="response-sub"></div></div><button class="icon-btn" data-close="response-modal" aria-label="Close">' + icon("x") + "</button></div>" +
        '<div class="modal-body"><pre class="console" id="response-body"></pre></div>' +
        '<div class="modal-foot"><button class="btn btn-ghost" id="response-copy">' + icon("copy") + 'Copy</button><button class="btn btn-primary" data-close="response-modal">Close</button></div>' +
      "</div></div>" +
      '<div class="modal-overlay" id="confirm-modal"><div class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">' +
        '<div class="modal-body confirm-body"><div class="confirm-icon" id="confirm-icon" aria-hidden="true">!</div><div><h3 id="confirm-title">Are you sure?</h3><p id="confirm-message"></p><p class="muted small" id="confirm-detail"></p></div></div>' +
        '<div class="modal-foot"><button type="button" class="btn btn-ghost" id="confirm-cancel">Cancel</button><button type="button" class="btn btn-primary" id="confirm-ok">OK</button></div>' +
      "</div></div>");
    document.getElementById("response-copy").addEventListener("click", function () {
      var text = document.getElementById("response-body").textContent;
      var done = function () { toast("Response copied."); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
    });
  }

  function showResponse(title, sub, body) {
    injectDialogs();
    document.getElementById("response-title").textContent = title || "Tally response";
    document.getElementById("response-sub").textContent = sub || "";
    document.getElementById("response-body").textContent = body || "";
    openModal("response-modal");
  }

  /* Styled replacement for window.confirm. Resolves true / false.
     opts: a message string, or { title, message, detail, ok, danger } */
  function confirmDialog(opts) {
    injectDialogs();
    if (typeof opts === "string") opts = { message: opts };
    var modal = document.getElementById("confirm-modal");
    document.getElementById("confirm-title").textContent = opts.title || "Are you sure?";
    document.getElementById("confirm-message").textContent = opts.message || "";
    document.getElementById("confirm-detail").textContent = opts.detail || "";
    var okBtn = document.getElementById("confirm-ok"), cancelBtn = document.getElementById("confirm-cancel");
    okBtn.textContent = opts.ok || "OK";
    okBtn.className = "btn " + (opts.danger ? "btn-danger-solid" : "btn-primary");
    document.getElementById("confirm-icon").className = "confirm-icon" + (opts.danger ? " danger" : "");
    modal.classList.add("open");
    setTimeout(function () { okBtn.focus(); }, 30);
    return new Promise(function (resolve) {
      function finish(v) {
        modal.classList.remove("open");
        okBtn.removeEventListener("click", yes); cancelBtn.removeEventListener("click", no);
        modal.removeEventListener("click", outside); document.removeEventListener("keydown", key, true);
        resolve(v);
      }
      function yes() { finish(true); }
      function no() { finish(false); }
      function outside(e) { if (e.target === modal) finish(false); }
      function key(e) { if (e.key === "Escape") { e.stopPropagation(); finish(false); } }
      okBtn.addEventListener("click", yes); cancelBtn.addEventListener("click", no);
      modal.addEventListener("click", outside); document.addEventListener("keydown", key, true);
    });
  }

  /* On phones, .stack-sm tables render each row as a card. Each cell needs its column
     heading as data-label; this keeps that in sync as tables re-render. */
  function labelTable(table) {
    var heads = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) {
      return th.textContent.replace(/all \/ none/i, "").trim();
    });
    table.querySelectorAll("tbody tr, tfoot tr").forEach(function (tr) {
      var col = 0;
      Array.prototype.forEach.call(tr.children, function (td) {
        var span = Number(td.getAttribute("colspan")) || 1;
        td.setAttribute("data-label", span > 1 ? "" : heads[col] || "");
        col += span;
      });
    });
  }
  function wireStackTables() {
    document.querySelectorAll("table.stack-sm").forEach(function (table) {
      labelTable(table);
      new MutationObserver(function () { labelTable(table); }).observe(table, { childList: true, subtree: true });
    });
  }

  function initials(name) {
    return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase();
  }


  /* ---------------- Toasts ---------------- */
  function toast(message, type) {
    type = type || "good";
    var stack = document.querySelector(".toast-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; document.body.appendChild(stack); }
    var el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = icon(type === "bad" ? "alert" : type === "info" ? "alert" : "checkCircle") + "<span>" + esc(message) + "</span>";
    stack.appendChild(el);
    setTimeout(function () { el.style.transition = "opacity .3s"; el.style.opacity = "0"; }, 2800);
    setTimeout(function () { el.remove(); }, 3200);
  }

  /* ---------------- Modals ---------------- */
  function openModal(id) { document.getElementById(id).classList.add("open"); }
  function closeModal(id) { document.getElementById(id).classList.remove("open"); }
  document.addEventListener("click", function (e) {
    var closer = e.target.closest("[data-close]");
    if (closer) closeModal(closer.getAttribute("data-close"));
    if (e.target.classList && e.target.classList.contains("modal-overlay")) e.target.classList.remove("open");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay.open").forEach(function (m) { m.classList.remove("open"); });
  });

  /* ---------------- Formatting ---------------- */
  var inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
  var inr0Fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  function inr(n) { return inrFmt.format(Number(n) || 0); }
  function inr0(n) { return inr0Fmt.format(Number(n) || 0); }
  function compactInr(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 10000000) return "₹" + (n / 10000000).toFixed(2) + " Cr";
    if (Math.abs(n) >= 100000) return "₹" + (n / 100000).toFixed(2) + " L";
    return inr0(n);
  }
  function date(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  function dateTime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function ago(iso) {
    if (!iso) return "Never";
    var mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + " min ago";
    if (mins < 1440) return Math.round(mins / 60) + " h ago";
    if (mins < 2880) return "Yesterday";
    return date(iso);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* Amount in Indian words, e.g. "Rupees Twelve Thousand Five Hundred Only". */
  function amountInWords(num) {
    num = Math.round(Number(num) || 0);
    if (num === 0) return "Rupees Zero Only";
    var a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    var b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function two(n) { return n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""); }
    function three(n) { return (n >= 100 ? a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? two(n % 100) : ""); }
    var parts = [];
    var crore = Math.floor(num / 10000000); num %= 10000000;
    var lakh = Math.floor(num / 100000); num %= 100000;
    var thousand = Math.floor(num / 1000); num %= 1000;
    if (crore) parts.push(three(crore) + " Crore");
    if (lakh) parts.push(two(lakh) + " Lakh");
    if (thousand) parts.push(two(thousand) + " Thousand");
    if (num) parts.push(three(num));
    return "Rupees " + parts.join(" ") + " Only";
  }

  /* ---------------- Ledger helpers ---------------- */

  /* Every group name that sits under `root` (inclusive), walking the group tree. */
  function groupsUnder(root) {
    var groups = Data.list("groups"), out = [root], changed = true;
    while (changed) {
      changed = false;
      groups.forEach(function (g) {
        if (g.parent && out.indexOf(g.parent) !== -1 && out.indexOf(g.name) === -1) { out.push(g.name); changed = true; }
      });
    }
    return out;
  }
  function ledgersIn(roots) {
    var names = [];
    roots.forEach(function (r) { names = names.concat(groupsUnder(r)); });
    return Data.list("ledgers").filter(function (l) { return names.indexOf(l.group) !== -1; });
  }
  function ledgerOptions(ledgers, selected, placeholder) {
    var html = placeholder ? '<option value="">' + esc(placeholder) + "</option>" : "";
    ledgers.slice().sort(function (x, y) { return x.name.localeCompare(y.name); }).forEach(function (l) {
      html += '<option value="' + esc(l.name) + '"' + (l.name === selected ? " selected" : "") + ">" + esc(l.name) + "</option>";
    });
    return html;
  }
  function findLedger(name) { return Data.list("ledgers").filter(function (l) { return l.name === name; })[0] || null; }

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
    if (!rows.length) return [];
    var header = rows.shift().map(function (h) { return h.trim(); });
    return rows.map(function (r) {
      var o = {};
      header.forEach(function (h, i) { o[h] = (r[i] || "").trim(); });
      return o;
    });
  }
  function downloadFile(name, content, mime) {
    var blob = new Blob([content], { type: mime || "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  /* Wire a .dropzone: click-to-browse, drag & drop, then hand the file text to onText. */
  function wireDropzone(zone, onText) {
    var input = zone.querySelector("input[type=file]");
    zone.addEventListener("click", function () { input.click(); });
    ["dragenter", "dragover"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("drag"); }); });
    ["dragleave", "drop"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("drag"); }); });
    zone.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); });
    input.addEventListener("change", function () { if (input.files[0]) readFile(input.files[0]); input.value = ""; });
    function readFile(file) {
      var r = new FileReader();
      r.onload = function () { onText(String(r.result), file.name); };
      r.readAsText(file);
    }
  }

  /* Pixel pattern derived from a string — a visual stand-in for the signed QR on e-invoices. */
  function drawQr(canvas, seed) {
    var n = 25, ctx = canvas.getContext("2d");
    canvas.width = n; canvas.height = n;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = "#111827";
    var h = Data.fakeHash(seed) + Data.fakeHash(seed + "x") + Data.fakeHash(seed + "y");
    var bit = 0;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var v = parseInt(h[bit % h.length], 16); bit++;
      if (v % 2) ctx.fillRect(x, y, 1, 1);
    }
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
      ctx.fillStyle = "#fff"; ctx.fillRect(p[0] - 1, p[1] - 1, 9, 9);
      ctx.fillStyle = "#111827"; ctx.fillRect(p[0], p[1], 7, 7);
      ctx.fillStyle = "#fff"; ctx.fillRect(p[0] + 1, p[1] + 1, 5, 5);
      ctx.fillStyle = "#111827"; ctx.fillRect(p[0] + 2, p[1] + 2, 3, 3);
    });
  }


  /* ---------------- Pagination ----------------
     var pg = App.pager("hostId", render, { size: 10, resetOn: ["#tabs"] });
     In render(): var pageRows = pg.slice(filteredRows);
     Filters in the same card's header (and any resetOn elements) send it back to page 1. */
  var PAGE_SIZES = [10, 25, 50, 100];
  function pager(hostId, rerender, opts) {
    opts = opts || {};
    var host = document.getElementById(hostId);
    var state = { page: 1, size: opts.size || 10 };
    host.classList.add("pager");

    function reset() { state.page = 1; }
    var card = host.closest(".card");
    var head = card && card.querySelector(".card-head");
    var triggers = (head ? [head] : []).concat((opts.resetOn || []).map(function (sel) { return document.querySelector(sel); }).filter(Boolean));
    triggers.forEach(function (el) {
      ["input", "change", "click"].forEach(function (ev) {
        el.addEventListener(ev, function (e) {
          if (ev === "click" && !e.target.closest("button, .platform")) return;
          reset();
        }, true);
      });
    });

    function pageList(cur, total) {
      if (total <= 7) return Array.from({ length: total }, function (_, i) { return i + 1; });
      var out = [1];
      var from = Math.max(2, cur - 1), to = Math.min(total - 1, cur + 1);
      if (cur <= 3) { from = 2; to = 4; }
      if (cur >= total - 2) { from = total - 3; to = total - 1; }
      if (from > 2) out.push("…");
      for (var i = from; i <= to; i++) out.push(i);
      if (to < total - 1) out.push("…");
      out.push(total);
      return out;
    }

    function draw(total, pages) {
      if (!total) { host.innerHTML = ""; host.style.display = "none"; return; }
      host.style.display = "";
      var start = (state.page - 1) * state.size;
      var info = '<div class="pager-info">Showing <b>' + (start + 1) + "–" + Math.min(total, start + state.size) + "</b> of <b>" + total + "</b></div>";
      if (total <= PAGE_SIZES[0]) { host.innerHTML = info; return; }
      var nums = pageList(state.page, pages).map(function (n) {
        return n === "…" ? '<span class="pager-gap">…</span>' : '<button type="button" class="pager-btn' + (n === state.page ? " active" : "") + '" data-page="' + n + '"' + (n === state.page ? ' aria-current="page"' : "") + ">" + n + "</button>";
      }).join("");
      host.innerHTML = info +
        '<div class="pager-ctrl"><label class="pager-size"><select aria-label="Rows per page">' + PAGE_SIZES.map(function (n) { return "<option" + (n === state.size ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select> per page</label>" +
        '<div class="pager-pages"><button type="button" class="pager-btn" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? " disabled" : "") + ' aria-label="Previous page">' + icon("arrowRight", 'style="transform:rotate(180deg)"') + "</button>" + nums +
        '<button type="button" class="pager-btn" data-page="' + (state.page + 1) + '"' + (state.page === pages ? " disabled" : "") + ' aria-label="Next page">' + icon("arrowRight") + "</button></div></div>";
    }

    host.addEventListener("click", function (e) {
      var b = e.target.closest("[data-page]");
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page);
      rerender();
      var top = (card || host).getBoundingClientRect().top;
      if (top < 0) (card || host).scrollIntoView({ behavior: "smooth", block: "start" });
    });
    host.addEventListener("change", function (e) {
      if (e.target.tagName !== "SELECT") return;
      state.size = Number(e.target.value);
      state.page = 1;
      rerender();
    });

    return {
      slice: function (rows) {
        var pages = Math.max(1, Math.ceil(rows.length / state.size));
        if (state.page > pages) state.page = pages;
        draw(rows.length, pages);
        var start = (state.page - 1) * state.size;
        return rows.slice(start, start + state.size);
      },
      reset: reset
    };
  }

  function emptyRow(cols, title, sub) {
    return '<tr><td colspan="' + cols + '"><div class="empty-state">' + icon("folder") + "<strong>" + esc(title) + "</strong>" + esc(sub || "") + "</div></td></tr>";
  }

  return {
    icon: icon, NAV: NAV,
    getSession: getSession, login: login, currentUser: currentUser, can: can, initials: initials, logout: logout, isLoggedIn: isLoggedIn, requireAuth: requireAuth,
    renderShell: renderShell, toggleTheme: toggleTheme, refreshTallyStatus: refreshTallyStatus, showResponse: showResponse, confirm: confirmDialog, setTheme: setTheme, themeMode: themeMode,
    toast: toast, openModal: openModal, closeModal: closeModal,
    inr: inr, inr0: inr0, ago: ago, compactInr: compactInr, date: date, dateTime: dateTime, today: today, esc: esc, amountInWords: amountInWords,
    groupsUnder: groupsUnder, ledgersIn: ledgersIn, ledgerOptions: ledgerOptions, findLedger: findLedger,
    parseCSV: parseCSV, downloadFile: downloadFile, wireDropzone: wireDropzone, drawQr: drawQr, emptyRow: emptyRow, pager: pager
  };
})();
