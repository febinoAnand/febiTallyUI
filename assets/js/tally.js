/* =========================================================
   FebiTally — simulated Tally Prime connector (UI demo)

   Stands in for the Tally Prime HTTP server so every page can
   behave like the real product: connection status, companies,
   ledgers (fetch / create / alter / delete), pushing bank
   transactions as vouchers, a raw API console, and the last
   request/response in JSON or XML.

   The primary company's "Tally books" are this tenant's own
   ledgers and vouchers, so anything pushed here also shows up
   in Payment & Receipt, Contra & Journal and the ledger balances.
   ========================================================= */
var Tally = (function () {
  var VERSION = "TallyPrime 5.1";
  var DEFAULTS = { host: "localhost", port: 9000, format: "json" };
  var PRIMARY_BANK_HINTS = { "HDFC Bank A/c": ["HDFC"], "SBI Current A/c": ["SBI", "STATE BANK"], "ICICI Bank A/c": ["ICICI"] };

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function now() { return new Date().toISOString(); }
  function tenant() { var s = App.getSession(); return s && Data.findTenant(s.tenantId); }
  function primaryName() { var t = tenant(); return t ? t.companyName : ""; }

  /* ---------------- Settings & connection ---------------- */
  function settings() { return Object.assign({}, DEFAULTS, Data.obj("tallySettings", {})); }
  function saveSettings(s) { Data.setObj("tallySettings", { host: String(s.host).trim(), port: Number(s.port), format: s.format === "xml" ? "xml" : "json" }); }
  function format() { return settings().format; }
  function address(s) { s = s || settings(); return s.host + ":" + s.port; }

  // Tally listens on 9000 unless reconfigured; the simulated server "runs" on any valid host at port 9000.
  function reachable(s) {
    s = s || settings();
    var hostOk = /^(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(\.[a-z0-9-]+)*)$/i.test(String(s.host || ""));
    return hostOk && Number(s.port) === 9000;
  }
  function offlineError(s) { return new Error("Couldn't reach Tally Prime at " + address(s) + ". Make sure Tally is open with the HTTP server enabled (Settings → Connectivity)."); }

  function status(s) {
    s = s || settings();
    return delay(350).then(function () {
      if (!reachable(s)) return { ok: false, host: s.host, port: s.port, error: offlineError(s).message };
      return { ok: true, host: s.host, port: s.port, version: VERSION, companies: companies() };
    });
  }

  /* ---------------- Companies ---------------- */
  function companies() {
    var list = [primaryName()];
    Data.list("extCompanies").forEach(function (c) { list.push(c.name); });
    return list.filter(Boolean);
  }
  function isPrimary(company) { return company === primaryName(); }

  /* ---------------- Ledgers (live Tally side) ---------------- */
  // Tally convention: negative = Debit, positive = Credit.
  function liveLedgers(company) {
    if (isPrimary(company)) {
      return Data.list("ledgers").map(function (l) {
        return {
          name: l.name, parent: l.group,
          opening_balance: (l.balanceType === "Dr" ? -1 : 1) * (Number(l.openingBalance) || 0),
          closing_balance: -Data.ledgerBalance(l.name)
        };
      });
    }
    return Data.list("extLedgers").filter(function (l) { return l.company === company; }).map(function (l) {
      return { name: l.name, parent: l.parent, opening_balance: l.opening_balance, closing_balance: l.opening_balance };
    });
  }
  function groupsOf(company) {
    return Data.list("groups").map(function (g) { return g.name; });
  }
  function groupUnder(company, ledgerName) {
    var l = liveLedgers(company).filter(function (x) { return x.name === ledgerName; })[0];
    return l ? l.parent : null;
  }
  function isCashOrBankGroup(group) {
    return App.groupsUnder("Cash-in-Hand").concat(App.groupsUnder("Bank Accounts")).indexOf(group) !== -1;
  }

  /* ---------------- Ledger cache ---------------- */
  function cached(company) { return Data.list("ledgerCache").filter(function (c) { return c.company === company; })[0] || null; }
  function writeCache(company, ledgers, fetchedAt) {
    var all = Data.list("ledgerCache").filter(function (c) { return c.company !== company; });
    var stamp = fetchedAt || now();
    all.push({ company: company, fetchedAt: stamp, ledgers: ledgers.map(function (l) { return Object.assign({ fetchedAt: stamp }, l); }) });
    Data.save("ledgerCache", all);
    return cached(company);
  }
  function patchCache(company, fn) {
    var c = cached(company);
    if (!c) return;
    fn(c.ledgers);
    var all = Data.list("ledgerCache").filter(function (x) { return x.company !== company; });
    all.push(c);
    Data.save("ledgerCache", all);
  }

  function fetchLedgers(company) {
    var req = { version: 1, tallyrequest: "Export", type: "Collection", id: "List of Ledgers", svcurrentcompany: company };
    return delay(700).then(function () {
      if (!reachable()) { var err = offlineError(); record("Fetch ledgers", company, req, { status: "0", error: err.message }); throw err; }
      var ledgers = liveLedgers(company);
      record("Fetch ledgers", company + " · " + ledgers.length + " ledgers", req, { status: "1", company: company, ledgers: ledgers.map(tallyLedger) });
      return writeCache(company, ledgers);
    });
  }

  function tallyLedger(l) {
    return { name: l.name, parent: l.parent, openingbalance: l.opening_balance.toFixed(2), closingbalance: l.closing_balance.toFixed(2) };
  }

  function validateLedgerInput(company, input, existingName) {
    var name = String(input.name || "").trim(), parent = String(input.parent || "").trim();
    if (!name) return "Ledger name is required.";
    if (!parent) return "Choose the group this ledger comes under.";
    if (groupsOf(company).indexOf(parent) === -1) return "Group “" + parent + "” does not exist in Tally.";
    var clash = liveLedgers(company).some(function (l) { return l.name.toLowerCase() === name.toLowerCase() && l.name !== existingName; });
    if (clash) return "A ledger named “" + name + "” already exists in Tally.";
    return null;
  }

  function createLedger(company, input) {
    var req = { tallyrequest: "Import", type: "Data", id: "All Masters", svcurrentcompany: company, ledger: { name: input.name, parent: input.parent, openingbalance: Number(input.opening || 0).toFixed(2) } };
    return delay(500).then(function () {
      if (!reachable()) { var e0 = offlineError(); record("Create ledger", company, req, { status: "0", error: e0.message }); throw e0; }
      var err = validateLedgerInput(company, input);
      if (err) { record("Create ledger", company, req, importResult(0, 0, [err])); throw new Error(err); }
      var opening = Number(input.opening) || 0, name = input.name.trim(), parent = input.parent.trim();
      if (isPrimary(company)) Data.add("ledgers", { name: name, group: parent, openingBalance: Math.abs(opening), balanceType: opening < 0 ? "Dr" : "Cr", gstin: "", state: "" });
      else Data.add("extLedgers", { company: company, name: name, parent: parent, opening_balance: opening });
      patchCache(company, function (ls) { ls.push({ name: name, parent: parent, opening_balance: opening, closing_balance: opening, fetchedAt: now() }); });
      record("Create ledger", company + " · " + name, req, importResult(1, 0, []));
      return { name: name, parent: parent };
    });
  }

  function alterLedger(company, oldName, input) {
    var req = { tallyrequest: "Import", type: "Data", id: "All Masters", svcurrentcompany: company, ledger: { name: oldName, newname: input.name, parent: input.parent, openingbalance: Number(input.opening || 0).toFixed(2), action: "Alter" } };
    return delay(500).then(function () {
      if (!reachable()) { var e0 = offlineError(); record("Alter ledger", company, req, { status: "0", error: e0.message }); throw e0; }
      var err = validateLedgerInput(company, input, oldName);
      if (err) { record("Alter ledger", company, req, importResult(0, 0, [err])); throw new Error(err); }
      var opening = Number(input.opening) || 0, name = input.name.trim(), parent = input.parent.trim();
      if (isPrimary(company)) {
        var rec = App.findLedger(oldName);
        Data.update("ledgers", rec.id, { name: name, group: parent, openingBalance: Math.abs(opening), balanceType: opening < 0 ? "Dr" : "Cr" });
        Data.renameLedger(oldName, name);
      } else {
        var ext = Data.list("extLedgers").filter(function (l) { return l.company === company && l.name === oldName; })[0];
        Data.update("extLedgers", ext.id, { name: name, parent: parent, opening_balance: opening });
      }
      var live = liveLedgers(company).filter(function (l) { return l.name === name; })[0];
      patchCache(company, function (ls) {
        ls.forEach(function (l) { if (l.name === oldName) Object.assign(l, live, { fetchedAt: now() }); });
      });
      record("Alter ledger", company + " · " + name, req, importResult(0, 1, []));
      return live;
    });
  }

  function deleteLedger(company, name) {
    var req = { tallyrequest: "Import", type: "Data", id: "All Masters", svcurrentcompany: company, ledger: { name: name, action: "Delete" } };
    return delay(450).then(function () {
      if (!reachable()) { var e0 = offlineError(); record("Delete ledger", company, req, { status: "0", error: e0.message }); throw e0; }
      if (isPrimary(company)) {
        var used = Data.list("vouchers").some(function (v) { return Data.postings(v).some(function (p) { return p.ledger === name; }); });
        if (used) { var msg = "“" + name + "” has vouchers in Tally and cannot be deleted."; record("Delete ledger", company, req, importResult(0, 0, [msg])); throw new Error(msg); }
        Data.remove("ledgers", App.findLedger(name).id);
      } else {
        var ext = Data.list("extLedgers").filter(function (l) { return l.company === company && l.name === name; })[0];
        Data.remove("extLedgers", ext.id);
      }
      patchCache(company, function (ls) { for (var i = ls.length - 1; i >= 0; i--) if (ls[i].name === name) ls.splice(i, 1); });
      record("Delete ledger", company + " · " + name, req, { status: "1", deleted: 1 });
      return true;
    });
  }

  /* ---------------- Groups (shared by every company in this tenant) ----------------
     Tally rules: names are unique across groups and ledgers; a group sits under Primary or another
     group (never under itself or its own sub-groups); a primary group needs a nature, a sub-group
     takes its parent's; predefined groups can't be altered or deleted; a group with ledgers or
     sub-groups can't be deleted. */
  var NATURES = ["Assets", "Liabilities", "Income", "Expenses"];
  function groups() { return Data.list("groups"); }
  function groupByName(name) {
    var n = String(name || "").trim().toLowerCase();
    return groups().filter(function (g) { return g.name.toLowerCase() === n; })[0] || null;
  }
  function natureOf(name) {
    var g = groupByName(name), guard = 0;
    while (g && g.parent && guard++ < 50) g = groupByName(g.parent);
    return g ? g.nature || "" : "";
  }
  // Every ledger name in every company (group and ledger names share one namespace in Tally).
  function allLedgerNames() {
    return Data.list("ledgers").map(function (l) { return l.name; }).concat(Data.list("extLedgers").map(function (l) { return l.name; }));
  }
  function ledgersInGroup(name) {
    return Data.list("ledgers").filter(function (l) { return l.group === name; }).length + Data.list("extLedgers").filter(function (l) { return l.parent === name; }).length;
  }
  function validateGroupInput(input, existingName) {
    var name = String(input.name || "").trim(), parent = String(input.parent || "").trim() || "Primary";
    if (!name) return "Group name is required.";
    if (name.length > 100) return "Group name can be at most 100 characters.";
    if (/^primary$/i.test(name)) return "“Primary” is reserved in Tally.";
    var clash = groupByName(name);
    if (clash && clash.name !== existingName) return "A group named “" + clash.name + "” already exists in Tally.";
    if (allLedgerNames().some(function (n) { return n.toLowerCase() === name.toLowerCase(); })) return "A ledger is already named “" + name + "”. Groups and ledgers need different names.";
    if (parent !== "Primary") {
      if (!groupByName(parent)) return "Group “" + parent + "” does not exist in Tally.";
      if (existingName && App.groupsUnder(existingName).map(function (n) { return n.toLowerCase(); }).indexOf(parent.toLowerCase()) !== -1)
        return "A group can't be placed under itself or one of its own sub-groups.";
    } else if (NATURES.indexOf(input.nature) === -1) return "Choose the nature of a primary group (Assets, Liabilities, Income or Expenses).";
    return null;
  }
  function groupPayload(g, extra) {
    return Object.assign({ name: g.name, parent: g.parent || "Primary", nature: g.parent && g.parent !== "Primary" ? undefined : g.nature }, extra || {});
  }
  function failGroup(title, req, msg) { record(title, "Groups", req, importResult(0, 0, [msg])); throw new Error(msg); }

  function createGroup(input) {
    var parent = String(input.parent || "").trim() || "Primary";
    var req = { tallyrequest: "Import", type: "Data", id: "All Masters", group: groupPayload({ name: String(input.name || "").trim(), parent: parent, nature: input.nature }) };
    return delay(450).then(function () {
      if (!reachable()) { var e0 = offlineError(); record("Create group", "Groups", req, { status: "0", error: e0.message }); throw e0; }
      var err = validateGroupInput(input);
      if (err) failGroup("Create group", req, err);
      var name = input.name.trim(), p = parent === "Primary" ? null : groupByName(parent).name;
      var g = Data.add("groups", { name: name, parent: p, nature: p ? natureOf(p) : input.nature, predefined: false, createdAt: now() });
      record("Create group", "Groups · " + name, req, importResult(1, 0, []));
      return g;
    });
  }

  function alterGroup(oldName, input) {
    var parent = String(input.parent || "").trim() || "Primary";
    var req = { tallyrequest: "Import", type: "Data", id: "All Masters", group: groupPayload({ name: oldName, parent: parent, nature: input.nature }, { newname: String(input.name || "").trim(), action: "Alter" }) };
    return delay(450).then(function () {
      if (!reachable()) { var e0 = offlineError(); record("Alter group", "Groups", req, { status: "0", error: e0.message }); throw e0; }
      var g = groupByName(oldName);
      if (!g) failGroup("Alter group", req, "Group “" + oldName + "” no longer exists in Tally.");
      if (g.predefined) failGroup("Alter group", req, "“" + g.name + "” is a predefined Tally group and can't be altered.");
      var err = validateGroupInput(input, g.name);
      if (err) failGroup("Alter group", req, err);
      var name = input.name.trim(), p = parent === "Primary" ? null : groupByName(parent).name;
      // Rename everywhere the group is referenced, then re-derive the nature for the whole branch.
      var gs = groups();
      gs.forEach(function (x) {
        if (x.id === g.id) { x.name = name; x.parent = p; x.nature = p ? natureOf(p) : input.nature; }
        else if (x.parent === g.name) x.parent = name;
      });
      Data.save("groups", gs);
      if (name !== g.name) {
        var ls = Data.list("ledgers"); ls.forEach(function (l) { if (l.group === g.name) l.group = name; }); Data.save("ledgers", ls);
        var ex = Data.list("extLedgers"); ex.forEach(function (l) { if (l.parent === g.name) l.parent = name; }); Data.save("extLedgers", ex);
        var cache = Data.list("ledgerCache"); cache.forEach(function (c) { c.ledgers.forEach(function (l) { if (l.parent === g.name) l.parent = name; }); }); Data.save("ledgerCache", cache);
      }
      var branch = App.groupsUnder(name), nat = natureOf(name);
      gs = groups(); gs.forEach(function (x) { if (branch.indexOf(x.name) !== -1) x.nature = nat; }); Data.save("groups", gs);
      record("Alter group", "Groups · " + name, req, importResult(0, 1, []));
      return groupByName(name);
    });
  }

  function deleteGroup(name) {
    var req = { tallyrequest: "Import", type: "Data", id: "All Masters", group: { name: name, action: "Delete" } };
    return delay(400).then(function () {
      if (!reachable()) { var e0 = offlineError(); record("Delete group", "Groups", req, { status: "0", error: e0.message }); throw e0; }
      var g = groupByName(name);
      if (!g) failGroup("Delete group", req, "Group “" + name + "” no longer exists in Tally.");
      if (g.predefined) failGroup("Delete group", req, "“" + g.name + "” is a predefined Tally group and can't be deleted.");
      var subs = groups().filter(function (x) { return x.parent === g.name; }).length, n = ledgersInGroup(g.name);
      if (subs || n) failGroup("Delete group", req, "“" + g.name + "” has " + [n ? n + " ledger" + (n > 1 ? "s" : "") : "", subs ? subs + " sub-group" + (subs > 1 ? "s" : "") : ""].filter(Boolean).join(" and ") + ". Move or delete them first.");
      Data.remove("groups", g.id);
      record("Delete group", "Groups · " + g.name, req, { status: "1", deleted: 1 });
      return true;
    });
  }

  /* ---------------- Pushing bank entries as vouchers ---------------- */
  // Re-checks every entry against the live books, so a ledger deleted after validation fails cleanly.
  function push(company, bank, entries, onProgress) {
    var results = [], created = 0, errors = [];
    var reqVouchers = entries.map(function (e) { return voucherPayload(company, bank, e); });
    var req = { tallyrequest: "Import", type: "Data", id: "Vouchers", svcurrentcompany: company, vouchers: reqVouchers };
    if (!reachable()) {
      return delay(400).then(function () { var e0 = offlineError(); record("Push vouchers", company, req, { status: "0", error: e0.message }); throw e0; });
    }
    var names = liveLedgers(company).map(function (l) { return l.name; });
    var chain = Promise.resolve();
    entries.forEach(function (e, i) {
      chain = chain.then(function () { return delay(140); }).then(function () {
        var amount = e.debit || e.credit;
        var err = null;
        if (names.indexOf(bank) === -1) err = "Bank ledger “" + bank + "” does not exist in Tally.";
        else if (names.indexOf(e.ledger) === -1) err = "Ledger “" + e.ledger + "” does not exist in Tally.";
        if (err) { errors.push(err); results.push({ id: e.id, ok: false, error: err }); }
        else {
          var number;
          if (isPrimary(company)) {
            var base = { date: e.date, total: amount, ref: e.ref, narration: e.narration, source: "statement", mode: "NEFT" };
            var v;
            if (e.vtype === "Contra") {
              var from = e.debit ? bank : e.ledger, to = e.debit ? e.ledger : bank;
              v = Data.addVoucher(Object.assign(base, { type: "Contra", party: to, account: from, lines: [{ ledger: to, dr: amount, cr: 0 }, { ledger: from, dr: 0, cr: amount }] }));
            } else {
              v = Data.addVoucher(Object.assign(base, { type: e.vtype, party: e.ledger, account: bank }));
            }
            number = v.number;
          } else {
            var n = Data.list("extVouchers").filter(function (x) { return x.company === company; }).length + 1;
            number = e.vtype.slice(0, 3).toUpperCase() + "/" + String(n).padStart(4, "0");
            Data.add("extVouchers", { company: company, number: number, date: e.date, vtype: e.vtype, ledger: e.ledger, bank: bank, amount: amount, narration: e.narration });
          }
          created++;
          results.push({ id: e.id, ok: true, number: number });
        }
        if (onProgress) onProgress(i + 1, entries.length);
      });
    });
    return chain.then(function () {
      record("Push vouchers", company + " · " + created + " created" + (errors.length ? ", " + errors.length + " failed" : ""), req, importResult(created, 0, errors));
      return results;
    });
  }

  function voucherPayload(company, bank, e) {
    var amount = (e.debit || e.credit).toFixed(2);
    var bankDr = !!e.credit;
    return {
      vouchertypename: e.vtype, date: String(e.date).replace(/-/g, ""), narration: e.narration, reference: e.ref || "",
      allledgerentries: [
        { ledgername: e.ledger, isdeemedpositive: bankDr ? "No" : "Yes", amount: (bankDr ? "" : "-") + amount },
        { ledgername: bank, isdeemedpositive: bankDr ? "Yes" : "No", amount: (bankDr ? "-" : "") + amount }
      ]
    };
  }

  function importResult(created, altered, errors) {
    return { status: errors.length && !created && !altered ? "0" : "1", cmp_info: { created: created, altered: altered, deleted: 0, errors: errors.length }, lineerror: errors };
  }

  /* ---------------- Last request / response ---------------- */
  function record(title, sub, request, response) {
    var f = format();
    Data.setObj("tallyLast", {
      title: title, sub: sub + " · " + f.toUpperCase() + " · " + new Date().toLocaleTimeString("en-IN"),
      body: "// Request → " + address() + "\n" + serialize(request, "request", f) + "\n\n// Response\n" + serialize(response, "response", f),
      at: now()
    });
  }
  function lastResponse() { return Data.obj("tallyLast", null); }

  function serialize(o, kind, f) {
    if (f !== "xml") return JSON.stringify(o, null, 2);
    return kind === "request" ? requestXml(o) : responseXml(o);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function xmlNode(name, value, pad) {
    pad = pad || "";
    if (Array.isArray(value)) return value.map(function (v) { return xmlNode(name, v, pad); }).join("\n");
    if (value && typeof value === "object") {
      var inner = Object.keys(value).map(function (k) { return xmlNode(k.toUpperCase(), value[k], pad + "  "); }).join("\n");
      return pad + "<" + name + ">\n" + inner + "\n" + pad + "</" + name + ">";
    }
    return pad + "<" + name + ">" + esc(value) + "</" + name + ">";
  }
  function requestXml(o) {
    var body = Object.assign({}, o);
    ["version", "tallyrequest", "type", "id", "svcurrentcompany"].forEach(function (k) { delete body[k]; });
    return "<ENVELOPE>\n  <HEADER>\n    <VERSION>1</VERSION>\n    <TALLYREQUEST>" + esc(o.tallyrequest) + "</TALLYREQUEST>\n    <TYPE>" + esc(o.type) + "</TYPE>\n    <ID>" + esc(o.id) + "</ID>\n  </HEADER>\n  <BODY>\n    <DESC>\n      <STATICVARIABLES><SVCURRENTCOMPANY>" + esc(o.svcurrentcompany || "") + "</SVCURRENTCOMPANY></STATICVARIABLES>\n    </DESC>" +
      (Object.keys(body).length ? "\n    <DATA>\n" + Object.keys(body).map(function (k) { return xmlNode(k.toUpperCase(), body[k], "      "); }).join("\n") + "\n    </DATA>" : "") + "\n  </BODY>\n</ENVELOPE>";
  }
  function responseXml(o) {
    var head = "<ENVELOPE>\n  <HEADER>\n    <STATUS>" + esc(o.status) + "</STATUS>\n  </HEADER>\n  <BODY>\n";
    var inner;
    if (o.error) inner = "    <DATA><LINEERROR>" + esc(o.error) + "</LINEERROR></DATA>";
    else if (o.cmp_info) inner = "    <DATA>\n      <IMPORTRESULT>\n        <CREATED>" + o.cmp_info.created + "</CREATED>\n        <ALTERED>" + o.cmp_info.altered + "</ALTERED>\n        <DELETED>0</DELETED>\n        <ERRORS>" + o.cmp_info.errors + "</ERRORS>\n      </IMPORTRESULT>" + (o.lineerror || []).map(function (e) { return "\n      <LINEERROR>" + esc(e) + "</LINEERROR>"; }).join("") + "\n    </DATA>";
    else if (o.ledgers) inner = "    <DATA>\n      <COLLECTION>\n" + o.ledgers.map(function (l) { return '        <LEDGER NAME="' + esc(l.name) + '">\n          <PARENT>' + esc(l.parent) + "</PARENT>\n          <OPENINGBALANCE>" + l.openingbalance + "</OPENINGBALANCE>\n          <CLOSINGBALANCE>" + l.closingbalance + "</CLOSINGBALANCE>\n        </LEDGER>"; }).join("\n") + "\n      </COLLECTION>\n    </DATA>";
    else if (o.companies) inner = "    <DATA>\n      <COLLECTION>\n" + o.companies.map(function (c) { return '        <COMPANY NAME="' + esc(c.name) + '"><STARTINGFROM>' + c.startingfrom + "</STARTINGFROM></COMPANY>"; }).join("\n") + "\n      </COLLECTION>\n    </DATA>";
    else if (o.groups) inner = "    <DATA>\n      <COLLECTION>\n" + o.groups.map(function (g) { return '        <GROUP NAME="' + esc(g.name) + '"><PARENT>' + esc(g.parent) + "</PARENT></GROUP>"; }).join("\n") + "\n      </COLLECTION>\n    </DATA>";
    else inner = "    <DATA>" + esc(JSON.stringify(o)) + "</DATA>";
    return head + inner + "\n  </BODY>\n</ENVELOPE>";
  }

  /* ---------------- Raw API console ---------------- */
  function companyList() {
    var t = tenant();
    return companies().map(function (c) { return { name: c, startingfrom: String((t && t.fyStart) || "2026-04-01").replace(/-/g, "") }; });
  }

  // JSON mode: { headers, payload }. XML mode: { xml }.
  function raw(input) {
    var id = "", company, f = input.xml != null ? "xml" : "json";
    return delay(450).then(function () {
      if (!reachable()) throw offlineError();
      if (f === "json") {
        var h = input.headers || {}, p = input.payload || {};
        var lower = {};
        Object.keys(h).forEach(function (k) { lower[k.toLowerCase()] = h[k]; });
        id = lower.id; company = lower.svcurrentcompany || (p.static_variables && p.static_variables.svcurrentcompany) || p.svcurrentcompany;
        if (String(lower.tallyrequest || "").toLowerCase() !== "export") return out({ status: "0", error: "Only Export requests can be sent from the console. Use the Import and Ledgers pages to write to Tally." }, f);
      } else {
        var xml = String(input.xml);
        if (!/<ENVELOPE[\s>]/i.test(xml)) return out({ status: "0", error: "Request must be a Tally <ENVELOPE>…</ENVELOPE> XML document." }, f);
        var tr = (/<TALLYREQUEST>([^<]*)</i.exec(xml) || [])[1];
        if (String(tr || "").trim().toLowerCase() !== "export") return out({ status: "0", error: "Only Export requests can be sent from the console. Use the Import and Ledgers pages to write to Tally." }, f);
        id = (/<ID>([^<]*)</i.exec(xml) || [])[1];
        company = (/<SVCURRENTCOMPANY>([^<]*)</i.exec(xml) || [])[1];
      }
      id = String(id || "").trim();
      company = String(company || "").trim() || primaryName();
      var resp;
      if (/^list of companies$/i.test(id)) resp = { status: "1", companies: companyList() };
      else if (companies().indexOf(company) === -1) resp = { status: "0", error: "Company “" + company + "” is not open in Tally." };
      else if (/^list of ledgers$/i.test(id)) resp = { status: "1", company: company, ledgers: liveLedgers(company).map(tallyLedger) };
      else if (/^list of groups$/i.test(id)) resp = { status: "1", company: company, groups: Data.list("groups").map(function (g) { return { name: g.name, parent: g.parent || "Primary" }; }) };
      else resp = { status: "0", error: "Unknown collection “" + id + "”. Try List of Companies, List of Ledgers or List of Groups." };
      return out(resp, f);
    });
    function out(resp, f) {
      var text = f === "xml" ? responseXml(resp) : JSON.stringify(resp, null, 2);
      Data.setObj("tallyLast", { title: "API console", sub: (id || "request") + " · " + f.toUpperCase() + " · " + new Date().toLocaleTimeString("en-IN"), body: "// Response from " + address() + "\n" + text, at: now() });
      return { ok: resp.status === "1", text: text };
    }
  }

  function sampleRequest(f) {
    var company = primaryName();
    if (f === "xml") return requestXml({ tallyrequest: "Export", type: "Collection", id: "List of Ledgers", svcurrentcompany: company });
    return {
      headers: JSON.stringify({ version: "1", tallyrequest: "Export", type: "Collection", id: "List of Ledgers" }, null, 2),
      payload: JSON.stringify({ static_variables: { svcurrentcompany: company, svexportformat: "jsonex" } }, null, 2)
    };
  }

  /* ---------------- Bank-ledger matching for uploaded statements ---------------- */
  function suggestBank(company, text) {
    var c = cached(company);
    var banks = (c ? c.ledgers : []).filter(function (l) { return isCashOrBankGroup(l.parent) && App.groupsUnder("Bank Accounts").indexOf(l.parent) !== -1; });
    var up = String(text || "").toUpperCase();
    for (var i = 0; i < banks.length; i++) {
      var hints = PRIMARY_BANK_HINTS[banks[i].name] || [banks[i].name.split(/\s+/)[0].toUpperCase()];
      for (var j = 0; j < hints.length; j++) if (hints[j].length > 2 && up.indexOf(hints[j]) !== -1) return { name: banks[i].name, reason: "Matched “" + hints[j] + "” in the statement." };
    }
    return banks.length ? { name: banks[0].name, reason: "No bank name matched in the file; please confirm." } : null;
  }

  /* ---------------- Demo seed ---------------- */
  function ensureSeed() {
    var t = tenant();
    if (!t || Data.obj("tallySeeded", false)) return;
    Data.setObj("tallySeeded", true);
    var twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    writeCache(t.companyName, liveLedgers(t.companyName), twoHoursAgo);
    if (t.tenantId !== Data.DEMO_TENANT) return;

    // A second company open in the same Tally, never fetched yet.
    Data.add("extCompanies", { name: "Sri Ram Agencies" });
    [["Cash", "Cash-in-Hand", -12000], ["ICICI Bank A/c", "Bank Accounts", -84000], ["Capital Account", "Capital Account", 96000],
     ["Sales Account", "Sales Accounts", 0], ["Purchase Account", "Purchase Accounts", 0], ["Kannan Stores", "Sundry Debtors", 0], ["Office Rent", "Indirect Expenses", 0]]
      .forEach(function (l) { Data.add("extLedgers", { company: "Sri Ram Agencies", name: l[0], parent: l[1], opening_balance: l[2] }); });

    var mk = function (date, narration, ref, debit, credit, ledger, vtype, statusV, extra) {
      return Object.assign({ id: Data.uid(), date: date, narration: narration, ref: ref, debit: debit, credit: credit, ledger: ledger, vtype: vtype, status: statusV }, extra || {});
    };
    // Import 1: fully pushed September HDFC statement.
    var sept = [
      mk("2026-09-02", "NEFT CR-SHARMA ENTERPRISES-INV 1182", "N9910021", 0, 18500, "Sharma Enterprises", "Receipt"),
      mk("2026-09-05", "NEFT DR-OFFICE RENT SEP", "N9910102", 30000, 0, "Office Rent", "Payment"),
      mk("2026-09-11", "ATM WDL-T NAGAR CHENNAI", "ATM55120", 8000, 0, "Cash", "Contra"),
      mk("2026-09-17", "IMPS-APEX SUPPLIERS-BILL 4105", "IM771210", 21400, 0, "Apex Suppliers", "Payment"),
      mk("2026-09-24", "SMS ALERT CHARGES", "CHG0924", 59, 0, "Bank Charges", "Payment"),
      mk("2026-09-29", "UPI-METRO DISTRIBUTORS", "UPI60031", 0, 9600, "Metro Distributors", "Receipt")
    ];
    var pushedAt = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
    sept.forEach(function (e) {
      var base = { date: e.date, total: e.debit || e.credit, ref: e.ref, narration: e.narration, source: "statement", mode: "NEFT" };
      var v = e.vtype === "Contra"
        ? Data.addVoucher(Object.assign(base, { type: "Contra", party: e.ledger, account: "HDFC Bank A/c", lines: [{ ledger: e.ledger, dr: e.debit, cr: 0 }, { ledger: "HDFC Bank A/c", dr: 0, cr: e.debit }] }))
        : Data.addVoucher(Object.assign(base, { type: e.vtype, party: e.ledger, account: "HDFC Bank A/c" }));
      e.status = "pushed"; e.voucherNumber = v.number; e.pushedAt = pushedAt;
    });
    Data.add("stmtImports", { file: "HDFC_Statement_Sep2026.pdf", company: t.companyName, bank: "HDFC Bank A/c", uploadedAt: pushedAt, entries: sept });

    // Import 2: October SBI statement still in review.
    Data.add("stmtImports", {
      file: "SBI_Oct2026.xlsx", company: t.companyName, bank: "SBI Current A/c", uploadedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      entries: [
        mk("2026-10-01", "NEFT CR-LAKSHMI STORES-PART PAYMENT", "N2741001", 0, 12500, "Lakshmi Stores", "Receipt", "validated"),
        mk("2026-10-02", "TNEB ELECTRICITY BILL AUTOPAY", "BD9912", 6420, 0, "Electricity Charges", "Payment", "validated"),
        mk("2026-10-03", "CASH DEPOSIT-BRANCH 0412", "CD0412", 0, 15000, "Cash", "Contra", "validated"),
        mk("2026-10-03", "UPI-RAVI KUMAR-ravi@ybl", "UPI71299", 2500, 0, "Ravi Kumar", "Payment", "failed", { error: "Ledger “Ravi Kumar” is not in Tally. Create it or pick another ledger." }),
        mk("2026-10-04", "IMPS-BRIGHT WHOLESALE CO", "IM558320", 18750, 0, "Bright Wholesale Co", "Payment", "pending"),
        mk("2026-10-05", "INT CREDIT SB A/C", "INT1026", 0, 840, "Interest Received", "Receipt", "pending"),
        mk("2026-10-05", "POS PURCHASE-AMAZON PAY", "POS99120", 1899, 0, "", "Payment", "pending"),
        mk("2026-10-06", "CHQ DEP-0045821-KANNAN", "045821", 0, 7200, "", "Receipt", "pending"),
        mk("2026-10-06", "GST ON SMS CHARGES", "CHG1026", 11, 0, "Bank Charges", "Payment", "skipped")
      ]
    });
  }

  /* ---------------- Import statistics ---------------- */
  function importStats(imp) {
    var s = { total: imp.entries.length, pending: 0, validated: 0, failed: 0, pushed: 0, skipped: 0, withdrawals: 0, deposits: 0 };
    imp.entries.forEach(function (e) { s[e.status]++; s.withdrawals += e.debit || 0; s.deposits += e.credit || 0; });
    var open = s.pending + s.validated + s.failed;
    s.label = !s.total ? "Empty" : open === 0 && s.pushed ? "Pushed" : s.failed ? "Needs attention" : s.validated && !s.pending ? "Ready to push" : s.pushed ? "Partly pushed" : "In review";
    s.tone = { Empty: "muted", Pushed: "good", "Needs attention": "bad", "Ready to push": "info", "Partly pushed": "warn", "In review": "warn" }[s.label];
    return s;
  }

  return {
    VERSION: VERSION,
    settings: settings, saveSettings: saveSettings, format: format, address: address, reachable: reachable, status: status,
    companies: companies, isPrimary: isPrimary, liveLedgers: liveLedgers, groupsOf: groupsOf, groupUnder: groupUnder, isCashOrBankGroup: isCashOrBankGroup,
    cached: cached, fetchLedgers: fetchLedgers, createLedger: createLedger, alterLedger: alterLedger, deleteLedger: deleteLedger,
    NATURES: NATURES, groups: groups, groupByName: groupByName, natureOf: natureOf, ledgersInGroup: ledgersInGroup, createGroup: createGroup, alterGroup: alterGroup, deleteGroup: deleteGroup,
    push: push, raw: raw, sampleRequest: sampleRequest, lastResponse: lastResponse, suggestBank: suggestBank,
    ensureSeed: ensureSeed, importStats: importStats
  };
})();
