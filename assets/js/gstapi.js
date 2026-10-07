/* =========================================================
   GST API connection (simulated) for the e-Invoice (IRP) and
   e-Way Bill portals: API credentials per company, sandbox /
   production, and the 6-hour auth token the portals issue.
   Renders the "Configuration" and "Authentication" steps.
   Credentials stay in this browser's storage for the demo.
   ========================================================= */
var GstApi = (function () {
  var KINDS = {
    einv: { label: "IRP", portal: "e-Invoice (IRP)", hosts: { sandbox: "einv-apisandbox.nic.in", production: "api.einvoice1.gst.gov.in" } },
    ewb: { label: "EWB", portal: "e-Way Bill", hosts: { sandbox: "ewb-apisandbox.nic.in", production: "api.ewaybillgst.gov.in" } }
  };
  var TOKEN_HOURS = 6;

  function tenant() { var s = App.getSession(); return s && Data.findTenant(s.tenantId); }
  function config(kind) {
    var t = tenant() || {};
    return Object.assign({ gstin: t.gstin || "", username: "", clientId: "", clientSecret: "", env: "sandbox" }, Data.obj(kind + "Config", {}));
  }
  function saveConfig(kind, cfg) {
    Data.setObj(kind + "Config", { gstin: String(cfg.gstin || "").trim().toUpperCase(), username: String(cfg.username || "").trim(), clientId: String(cfg.clientId || "").trim(), clientSecret: String(cfg.clientSecret || ""), env: cfg.env === "production" ? "production" : "sandbox" });
    Data.setObj(kind + "Token", null);   // new credentials need a new token
  }
  function problems(kind, cfg) {
    cfg = cfg || config(kind);
    var t = tenant() || {}, out = [];
    if (!/^[0-9]{2}[0-9A-Z]{13}$/.test(cfg.gstin)) out.push(["gstin", "GSTIN is missing or invalid."]);
    else if (t.gstin && cfg.gstin !== String(t.gstin).toUpperCase()) out.push(["gstin", "GSTIN must be your company's GSTIN (" + t.gstin + ")."]);
    if (!/^[A-Za-z0-9_.@-]{4,30}$/.test(cfg.username)) out.push(["username", "API username: 4–30 letters, digits or _ . @ -"]);
    if (String(cfg.clientId).length < 6) out.push(["clientId", "Client ID is required (from your GSP / ASP)."]);
    if (String(cfg.clientSecret).length < 6) out.push(["clientSecret", "Client secret is required."]);
    return out;
  }
  function ready(kind) { return !problems(kind).length; }
  // Sandbox demo credentials, so the simulated flow works without a GSP account.
  function useDemo(kind) {
    var t = tenant() || {};
    saveConfig(kind, { gstin: t.gstin || "", username: "demo_" + (kind === "einv" ? "irp" : "ewb") + "_" + String(t.tenantId || "user").toLowerCase(), clientId: "SBX-" + kind.toUpperCase() + "-DEMO-" + String(t.gstin || "0000").slice(-4), clientSecret: "sandbox-demo-secret", env: "sandbox" });
    document.dispatchEvent(new CustomEvent("gstapi:config", { detail: kind }));
  }
  function token(kind) {
    var tk = Data.obj(kind + "Token", null);
    return tk && new Date(tk.expiresAt) > new Date() ? tk : null;
  }
  function authenticate(kind) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        var p = problems(kind);
        if (p.length) return reject(new Error("Complete the configuration first: " + p[0][1]));
        var now = new Date(), exp = new Date(now.getTime() + TOKEN_HOURS * 3600 * 1000);
        var tk = { token: Data.fakeHash(config(kind).clientId + now.toISOString()).slice(0, 32), issuedAt: now.toISOString(), expiresAt: exp.toISOString(), env: config(kind).env };
        Data.setObj(kind + "Token", tk);
        resolve(tk);
      }, 700);
    });
  }

  /* ---------------- Step UI ---------------- */
  function statusPill(ok, okText, badText, tone) {
    return '<span class="conn-status ' + (ok ? "ok" : tone || "bad") + '"><span class="conn-dot"></span>' + (ok ? okText : badText) + "</span>";
  }

  // Step 1 — Configuration. onChange() is called after a save.
  function mountConfig(host, kind, onChange) {
    var k = KINDS[kind], id = function (s) { return kind + "-" + s; };
    host.innerHTML =
      '<div class="flow-grid"><form class="flow-main" id="' + id("cfgForm") + '" novalidate><div class="field-grid">' +
        '<div class="field"><label for="' + id("gstin") + '">GSTIN</label><input type="text" id="' + id("gstin") + '" class="mono" maxlength="15" style="text-transform:uppercase"></div>' +
        '<div class="field"><label for="' + id("username") + '">API Username</label><input type="text" id="' + id("username") + '" autocomplete="off" placeholder="as registered on the portal"></div>' +
        '<div class="field"><label for="' + id("clientId") + '">API Client ID</label><input type="text" id="' + id("clientId") + '" autocomplete="off"></div>' +
        '<div class="field"><label for="' + id("clientSecret") + '">API Client Secret</label><div class="pw-wrap"><input type="password" id="' + id("clientSecret") + '" autocomplete="new-password"><button type="button" class="pw-toggle" id="' + id("showSecret") + '">Show</button></div></div>' +
        '<div class="field full"><label>Environment</label><div class="radio-row">' +
          '<label class="radio"><input type="radio" name="' + id("env") + '" value="sandbox"> Sandbox <span class="muted small">(testing)</span></label>' +
          '<label class="radio"><input type="radio" name="' + id("env") + '" value="production"> Production</label></div></div>' +
      '</div><div class="flow-actions"><button type="submit" class="btn btn-outline btn-sm" data-perm="edit">' + App.icon("check") + 'Save configuration</button><button type="button" class="btn btn-ghost btn-sm" id="' + id("demoBtn") + '">' + App.icon("zap") + 'Use demo credentials</button><span class="muted small" id="' + id("cfgHost") + '"></span></div></form>' +
      '<aside class="flow-side"><div class="flow-side-title">Connection status</div><div id="' + id("cfgStatus") + '"></div></aside></div>';
    var $ = function (s) { return document.getElementById(id(s)); };
    function fill() {
      var c = config(kind);
      $("gstin").value = c.gstin; $("username").value = c.username; $("clientId").value = c.clientId; $("clientSecret").value = c.clientSecret;
      host.querySelectorAll('input[name="' + id("env") + '"]').forEach(function (r) { r.checked = r.value === c.env; });
      paint();
    }
    function paint() {
      var c = config(kind), p = problems(kind);
      $("cfgHost").textContent = "Endpoint: " + k.hosts[c.env];
      $("cfgStatus").innerHTML = statusPill(!p.length, "Ready", "Not configured") +
        (p.length ? '<ul class="flow-miss">' + p.map(function (x) { return "<li>" + App.esc(x[1]) + "</li>"; }).join("") + "</ul>"
          : '<p class="muted small" style="margin:8px 0 0">' + (c.env === "production" ? "Production — live " + k.portal + " portal." : "Sandbox — test portal, nothing is filed.") + "</p>");
    }
    $("demoBtn").addEventListener("click", function () {
      useDemo(kind);
      App.toast(problems(kind).length ? "Demo credentials filled — " + problems(kind)[0][1] : "Sandbox demo credentials filled. Now generate the token.", problems(kind).length ? "info" : "good");
      if (onChange) onChange();
    });
    document.addEventListener("gstapi:config", function (e) { if (e.detail === kind) fill(); });
    $("showSecret").addEventListener("click", function () { var i = $("clientSecret"); i.type = i.type === "password" ? "text" : "password"; this.textContent = i.type === "password" ? "Show" : "Hide"; });
    $("cfgForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var env = (host.querySelector('input[name="' + id("env") + '"]:checked') || {}).value || "sandbox";
      var cfg = { gstin: $("gstin").value, username: $("username").value, clientId: $("clientId").value, clientSecret: $("clientSecret").value, env: env };
      saveConfig(kind, cfg);
      var p = problems(kind);
      App.toast(p.length ? "Saved — still needed: " + p.map(function (x) { return x[0]; }).join(", ") + "." : k.portal + " configuration saved.", p.length ? "info" : "good");
      paint();
      if (onChange) onChange();
    });
    fill();
    return { refresh: paint };
  }

  // Step 2 — Authentication (token). onChange() after a new token.
  function mountAuth(host, kind, onChange) {
    var id = function (s) { return kind + "-" + s; };
    host.innerHTML = '<div class="flow-grid"><div class="flow-main"><p class="muted small" style="margin:0 0 12px">The portal issues an auth token for ' + TOKEN_HOURS + ' hours. Every request in the next steps uses it.</p>' +
      '<button type="button" class="btn btn-primary" id="' + id("tokenBtn") + '" data-perm="create">' + App.icon("key") + "Generate token</button></div>" +
      '<aside class="flow-side"><div class="flow-side-title">Token status</div><div id="' + id("tokenStatus") + '"></div></aside></div>';
    var btn = document.getElementById(id("tokenBtn"));
    function sandbox() { return config(kind).env !== "production"; }
    function paint() {
      var tk = token(kind), r = ready(kind);
      btn.disabled = !r && !sandbox();
      btn.title = r ? "" : sandbox() ? "Uses sandbox demo credentials if none are saved" : "Production needs your real API credentials (above)";
      document.getElementById(id("tokenStatus")).innerHTML = tk
        ? statusPill(true, "Valid") + '<dl class="kv tight"><dt>Expires</dt><dd>' + App.dateTime(tk.expiresAt) + '</dd><dt>Token</dt><dd class="mono" style="font-size:11px">' + tk.token.slice(0, 12) + "…</dd></dl>"
        : statusPill(false, "", Data.obj(kind + "Token", null) ? "Expired" : "No token", Data.obj(kind + "Token", null) ? "warn" : "bad");
    }
    btn.addEventListener("click", function () {
      if (!ready(kind) && sandbox()) { useDemo(kind); if (ready(kind)) App.toast("No credentials saved — using sandbox demo credentials.", "info"); }
      btn.disabled = true; btn.lastChild.textContent = "Authenticating…";
      authenticate(kind).then(function () { App.toast("Token generated — valid for " + TOKEN_HOURS + " hours."); })
        .catch(function (e) { App.toast(e.message, "bad"); })
        .then(function () { btn.lastChild.textContent = "Generate token"; paint(); if (onChange) onChange(); });
    });
    paint();
    return { refresh: paint };
  }

  return { KINDS: KINDS, useDemo: useDemo, config: config, saveConfig: saveConfig, problems: problems, ready: ready, token: token, authenticate: authenticate, statusPill: statusPill, mountConfig: mountConfig, mountAuth: mountAuth };
})();
