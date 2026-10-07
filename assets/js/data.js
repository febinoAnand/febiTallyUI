/* =========================================================
   Tally Suite — localStorage data layer (UI demo only)

   Tenants live in one global list. Every accounting record
   (groups, ledgers, vouchers, quotations, e-way bills, import
   logs) is stored under a key scoped to the signed-in tenant,
   so one organisation never sees another's books.
   ========================================================= */
var Data = (function () {
  var TENANTS_KEY = "tally_tenants";

  /* Bump when the sample data changes: older demo data in this browser is cleared and re-seeded. */
  var DATA_VERSION = "8";
  try {
    if (localStorage.getItem("tally_data_version") !== DATA_VERSION) {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf("tally_") === 0 && k !== "tally_theme") localStorage.removeItem(k);
      });
      localStorage.setItem("tally_data_version", DATA_VERSION);
    }
  } catch (e) { /* storage blocked: pages still render with in-memory seeds */ }
  var DEMO_TENANT = "TALLY01";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full / blocked */ }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- Tenants ---------------- */

  var SEED_TENANTS = [
    { tenantId: "TALLY01", username: "admin", email: "accounts@sriramtraders.in", password: "Admin@123", companyName: "Sri Ram Traders Pvt Ltd", gstin: "33ABCDE1234F1Z5", state: "Tamil Nadu", contactNumber: "9876543210", businessType: "Trading", fyStart: "2026-04-01", status: "Active", addr1: "No. 8, Anna Salai", addr2: "Teynampet", location: "Chennai", pin: "600018", createdAt: "2026-04-01T09:00:00.000Z" },
    { tenantId: "TALLY02", username: "kaveri", email: "finance@kaveriretail.in", password: "Kaveri@123", companyName: "Kaveri Retail LLP", gstin: "29KLMNO5678P1Z2", state: "Karnataka", contactNumber: "9845012345", businessType: "Retail", fyStart: "2026-04-01", status: "Pending", createdAt: "2026-10-04T11:30:00.000Z" }
  ];

  function getTenants() {
    var list = read(TENANTS_KEY, null);
    if (!list) { list = SEED_TENANTS.slice(); write(TENANTS_KEY, list); }
    return list;
  }
  function saveTenants(list) { write(TENANTS_KEY, list); }

  function findTenant(tenantId) {
    var id = String(tenantId || "").trim().toUpperCase();
    return getTenants().filter(function (t) { return t.tenantId === id; })[0] || null;
  }

  function isEmailTaken(email) {
    var e = String(email).trim().toLowerCase();
    return getTenants().some(function (t) { return t.email.toLowerCase() === e; });
  }

  /* Org IDs follow TALLY01, TALLY02 … so they are easy to read out over the phone. */
  function generateTenantId(list) {
    var max = 0;
    list.forEach(function (t) {
      var m = /^TALLY(\d+)$/.exec(t.tenantId);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    var next = String(max + 1);
    return "TALLY" + (next.length < 2 ? "0" + next : next);
  }

  function registerTenant(details) {
    var list = getTenants();
    var tenant = {
      tenantId: generateTenantId(list),
      username: details.username,
      email: details.email,
      password: details.password,
      companyName: details.companyName,
      gstin: details.gstin,
      state: details.state,
      contactNumber: details.contactNumber,
      businessType: details.businessType,
      fyStart: details.fyStart,
      status: "Pending",
      createdAt: new Date().toISOString()
    };
    list.push(tenant);
    saveTenants(list);
    return tenant;
  }

  /* Returns { tenant, user } or null. The owner signs in with the password on the tenant
     record; every other user has their own password in the tenant's users list. */
  function authenticate(tenantId, username, password) {
    var t = findTenant(tenantId);
    if (!t) return null;
    useTenant(t.tenantId);
    var uname = String(username).trim().toLowerCase();
    var user = list("users").filter(function (u) { return u.username.toLowerCase() === uname; })[0];
    if (!user) return null;
    var ok = user.owner ? t.password === password : user.password === password;
    return ok ? { tenant: t, user: user } : null;
  }

  function updateTenant(tenantId, patch) {
    var list = getTenants();
    list.forEach(function (t) { if (t.tenantId === tenantId) Object.assign(t, patch); });
    saveTenants(list);
  }

  function setTenantStatus(tenantId, status) {
    var list = getTenants();
    list.forEach(function (t) { if (t.tenantId === tenantId) t.status = status; });
    saveTenants(list);
  }


  /* ---------------- Users, roles & permissions ---------------- */

  /* Every permission-controlled module and the actions that make sense for it. */
  var MODULES = [
    { key: "dashboard", label: "Dashboard", group: "Overview", actions: ["view"] },
    { key: "statement", label: "Import Statement", group: "Masters & Documents", actions: ["view", "create", "edit", "delete"], note: "Create = upload & push · Edit = map, validate · Delete = remove an import" },
    { key: "ledger", label: "Ledgers", group: "Masters & Documents", actions: ["view", "create", "edit", "delete"], note: "Changes are written to Tally Prime" },
    { key: "invoice", label: "Invoice / Quotation", group: "Transactions", actions: ["view", "create", "delete"] },
    { key: "salespurchase", label: "Sales & Purchase", group: "Transactions", actions: ["view", "create", "delete"] },
    { key: "paymentreceipt", label: "Payment & Receipt", group: "Transactions", actions: ["view", "create", "delete"] },
    { key: "contrajournal", label: "Contra & Journal", group: "Transactions", actions: ["view", "create", "delete"] },
    { key: "einvoice", label: "e-Invoice", group: "GST Compliance", actions: ["view", "create", "delete"], note: "Create = generate IRN · Delete = cancel IRN" },
    { key: "ewaybill", label: "e-Way Bill", group: "GST Compliance", actions: ["view", "create", "edit", "delete"], note: "Edit = update vehicle / extend" },
    { key: "ecommerce", label: "e-Commerce Import", group: "Integrations", actions: ["view", "create"], note: "Create = post settlements" },
    { key: "settings", label: "Settings", group: "Administration", actions: ["view", "edit"], note: "Tally Prime connection & API console" },
    { key: "users", label: "Users", group: "Administration", actions: ["view", "create", "edit", "delete"] },
    { key: "roles", label: "Roles & Permissions", group: "Administration", actions: ["view", "create", "edit", "delete"] }
  ];
  var ACTIONS = ["view", "create", "edit", "delete"];
  var ADMIN_ROLE = "role-admin";

  function permsFor(spec) {
    var out = {};
    MODULES.forEach(function (m) {
      var wanted = typeof spec === "function" ? spec(m) : spec[m.key];
      if (wanted === "all") wanted = m.actions;
      out[m.key] = (wanted || []).filter(function (a) { return m.actions.indexOf(a) !== -1; });
    });
    return out;
  }
  var NO_ADMIN = function (m) { return m.group === "Administration"; };

  function defaultRoles() {
    var now = new Date().toISOString();
    return [
      { id: ADMIN_ROLE, name: "Administrator", description: "Full access to every module, users and settings.", system: true, perms: permsFor(function () { return "all"; }) },
      { id: "role-accountant", name: "Accountant", description: "Runs the books: all accounting and GST modules, no user management.", builtIn: true, perms: permsFor(function (m) { return m.key === "settings" ? ["view"] : NO_ADMIN(m) ? [] : "all"; }) },
      { id: "role-dataentry", name: "Data Entry Operator", description: "Enters vouchers and imports. Cannot delete anything.", builtIn: true,
        perms: permsFor({ dashboard: ["view"], statement: ["view", "create", "edit"], invoice: ["view", "create"], ledger: ["view"], salespurchase: ["view", "create"], paymentreceipt: ["view", "create"], contrajournal: ["view", "create"], ecommerce: ["view", "create"] }) },
      { id: "role-gst", name: "GST Executive", description: "Handles e-Invoice and e-Way Bill; can look up invoices and ledgers.", builtIn: true,
        perms: permsFor({ dashboard: ["view"], invoice: ["view"], ledger: ["view"], salespurchase: ["view"], einvoice: "all", ewaybill: "all" }) },
      { id: "role-auditor", name: "Auditor", description: "Read-only access to all books for review and audit.", builtIn: true, perms: permsFor(function (m) { return NO_ADMIN(m) ? [] : ["view"]; }) }
    ].map(function (r) { r.createdAt = now; return r; });
  }

  function ensureAccess(tenantId) {
    if (read(scopedKey("roles"), null)) return;
    var t = findTenant(tenantId) || {};
    save("roles", defaultRoles());
    var users = [{ id: "user-owner", name: t.username ? t.username.charAt(0).toUpperCase() + t.username.slice(1) : "Owner", username: t.username, email: t.email, phone: t.contactNumber, roleId: ADMIN_ROLE, owner: true, status: "Active", createdAt: t.createdAt }];
    if (tenantId === DEMO_TENANT) {
      users[0].name = "Ramesh Iyer";
      users = users.concat([
        { id: uid(), name: "Priya Sharma", username: "priya", email: "priya@sriramtraders.in", phone: "9840011223", roleId: "role-accountant", password: "Priya@123", status: "Active", lastLogin: "2026-10-05T17:42:00.000Z", createdAt: "2026-04-10T10:00:00.000Z" },
        { id: uid(), name: "Ravi Kumar", username: "ravi", email: "ravi@sriramtraders.in", phone: "9884455667", roleId: "role-dataentry", password: "Ravi@123", status: "Active", lastLogin: "2026-10-06T09:15:00.000Z", createdAt: "2026-05-02T10:00:00.000Z" },
        { id: uid(), name: "Kavya Nair", username: "kavya", email: "kavya@sriramtraders.in", phone: "9790012345", roleId: "role-gst", password: "Kavya@123", status: "Active", lastLogin: "2026-10-03T12:05:00.000Z", createdAt: "2026-06-15T10:00:00.000Z" },
        { id: uid(), name: "S. Venkatesh (CA)", username: "auditor", email: "venkatesh@caassociates.in", phone: "9444098765", roleId: "role-auditor", password: "Audit@123", status: "Inactive", createdAt: "2026-07-01T10:00:00.000Z" }
      ]);
    }
    save("users", users);
  }

  /* Transactions refer to ledgers by name, so a rename has to follow through everywhere. */
  function renameLedger(oldName, newName) {
    if (!oldName || oldName === newName) return;
    var vs = list("vouchers");
    vs.forEach(function (v) {
      if (v.party === oldName) v.party = newName;
      if (v.account === oldName) v.account = newName;
      (v.lines || []).forEach(function (l) { if (l.ledger === oldName) l.ledger = newName; });
    });
    save("vouchers", vs);
    ["quotations", "ewaybills"].forEach(function (c) {
      var arr = list(c);
      arr.forEach(function (r) { if (r.party === oldName) r.party = newName; });
      save(c, arr);
    });
  }

  function roleById(id) { return list("roles").filter(function (r) { return r.id === id; })[0] || null; }

  function can(user, moduleKey, action) {
    if (!user) return false;
    if (user.roleId === ADMIN_ROLE) return true;
    var role = roleById(user.roleId);
    return !!role && (role.perms[moduleKey] || []).indexOf(action) !== -1;
  }

  function isUsernameTaken(username, exceptId) {
    var u = String(username).trim().toLowerCase();
    return list("users").some(function (x) { return x.username.toLowerCase() === u && x.id !== exceptId; });
  }

  /* ---------------- Tenant-scoped collections ---------------- */

  var currentTenant = null;
  function useTenant(tenantId) { currentTenant = tenantId; ensureSeeded(tenantId); ensureAccess(tenantId); }
  function scopedKey(name) { return "tally_" + currentTenant + "_" + name; }

  function list(name) { return read(scopedKey(name), []); }
  function obj(name, fallback) { return read(scopedKey(name), fallback); }
  function setObj(name, value) { write(scopedKey(name), value); }
  function save(name, arr) { write(scopedKey(name), arr); }
  function add(name, obj) {
    var arr = list(name);
    obj.id = obj.id || uid();
    obj.createdAt = obj.createdAt || new Date().toISOString();
    arr.push(obj);
    save(name, arr);
    return obj;
  }
  function update(name, id, patch) {
    var arr = list(name), found = null;
    arr.forEach(function (r) { if (r.id === id) { Object.assign(r, patch); found = r; } });
    save(name, arr);
    return found;
  }
  function remove(name, id) { save(name, list(name).filter(function (r) { return r.id !== id; })); }
  function get(name, id) { return list(name).filter(function (r) { return r.id === id; })[0] || null; }

  /* ---------------- Masters: groups & ledgers ---------------- */

  /* Tally's predefined primary groups and their common sub-groups. */
  var PREDEFINED_GROUPS = [
    ["Capital Account", null, "Liabilities"],
    ["Reserves & Surplus", "Capital Account", "Liabilities"],
    ["Current Liabilities", null, "Liabilities"],
    ["Duties & Taxes", "Current Liabilities", "Liabilities"],
    ["Provisions", "Current Liabilities", "Liabilities"],
    ["Sundry Creditors", "Current Liabilities", "Liabilities"],
    ["Loans (Liability)", null, "Liabilities"],
    ["Bank OD A/c", "Loans (Liability)", "Liabilities"],
    ["Secured Loans", "Loans (Liability)", "Liabilities"],
    ["Unsecured Loans", "Loans (Liability)", "Liabilities"],
    ["Current Assets", null, "Assets"],
    ["Bank Accounts", "Current Assets", "Assets"],
    ["Cash-in-Hand", "Current Assets", "Assets"],
    ["Deposits (Asset)", "Current Assets", "Assets"],
    ["Loans & Advances (Asset)", "Current Assets", "Assets"],
    ["Stock-in-Hand", "Current Assets", "Assets"],
    ["Sundry Debtors", "Current Assets", "Assets"],
    ["Fixed Assets", null, "Assets"],
    ["Investments", null, "Assets"],
    ["Sales Accounts", null, "Income"],
    ["Direct Incomes", null, "Income"],
    ["Indirect Incomes", null, "Income"],
    ["Purchase Accounts", null, "Expenses"],
    ["Direct Expenses", null, "Expenses"],
    ["Indirect Expenses", null, "Expenses"],
    ["Suspense A/c", null, "Liabilities"]
  ];

  var SEED_LEDGERS = [
    ["Cash", "Cash-in-Hand", 45000, "Dr"],
    ["HDFC Bank A/c", "Bank Accounts", 900000, "Dr"],
    ["SBI Current A/c", "Bank Accounts", 180000, "Dr"],
    ["Owner's Capital", "Capital Account", 1294000, "Cr"],
    ["Sales Account", "Sales Accounts", 0, "Cr"],
    ["Purchase Account", "Purchase Accounts", 0, "Dr"],
    ["CGST", "Duties & Taxes", 0, "Cr"],
    ["SGST", "Duties & Taxes", 0, "Cr"],
    ["IGST", "Duties & Taxes", 0, "Cr"],
    ["Round Off", "Indirect Expenses", 0, "Dr"],
    ["Sharma Enterprises", "Sundry Debtors", 35000, "Dr", "07AAKCS4521M1Z8", "Delhi"],
    ["Lakshmi Stores", "Sundry Debtors", 12000, "Dr", "33AAFPL7788K1Z3", "Tamil Nadu"],
    ["Metro Distributors", "Sundry Debtors", 0, "Dr", "29AABCM9911Q1ZK", "Karnataka"],
    ["Apex Suppliers", "Sundry Creditors", 28000, "Cr", "33AACFA3344H1Z9", "Tamil Nadu"],
    ["Bright Wholesale Co", "Sundry Creditors", 0, "Cr", "27AADCB5566J1Z1", "Maharashtra"],
    ["Amazon Seller Services", "Sundry Debtors", 0, "Dr", "29AAICA3918J1ZE", "Karnataka"],
    ["Flipkart Internet Pvt Ltd", "Sundry Debtors", 0, "Dr", "29AABCF8078M1Z8", "Karnataka"],
    ["Office Rent", "Indirect Expenses", 0, "Dr"],
    ["Electricity Charges", "Indirect Expenses", 0, "Dr"],
    ["Salaries", "Indirect Expenses", 0, "Dr"],
    ["Bank Charges", "Indirect Expenses", 0, "Dr"],
    ["Marketplace Commission", "Indirect Expenses", 0, "Dr"],
    ["Freight Inward", "Direct Expenses", 0, "Dr"],
    ["Interest Received", "Indirect Incomes", 0, "Cr"],
    ["TCS Receivable", "Current Assets", 0, "Dr"],
    ["TDS Receivable", "Current Assets", 0, "Dr"],
    ["Furniture & Fixtures", "Fixed Assets", 150000, "Dr"],
    ["Depreciation", "Indirect Expenses", 0, "Dr"],
    ["Bad Debts", "Indirect Expenses", 0, "Dr"],
    ["Salary Payable", "Provisions", 0, "Cr"]
  ];

  var ITEMS = [
    { name: "Basmati Rice 25kg", hsn: "1006", rate: 2150, gst: 5, unit: "Bag" },
    { name: "Sunflower Oil 15L", hsn: "1512", rate: 1980, gst: 5, unit: "Tin" },
    { name: "Toor Dal 30kg", hsn: "0713", rate: 3600, gst: 5, unit: "Bag" },
    { name: "Steel Container Set", hsn: "7323", rate: 850, gst: 12, unit: "Set" },
    { name: "LED Bulb 9W (Pack 10)", hsn: "8539", rate: 720, gst: 18, unit: "Box" },
    { name: "Detergent Powder 5kg", hsn: "3402", rate: 540, gst: 18, unit: "Pkt" }
  ];

  function companyState() {
    var t = findTenant(currentTenant);
    return t ? t.state : "Tamil Nadu";
  }

  /* GST split: same state → CGST + SGST, different state → IGST. */
  function computeTotals(items, partyState) {
    var subtotal = 0, tax = 0;
    (items || []).forEach(function (it) {
      var amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
      subtotal += amt;
      tax += amt * (Number(it.gst) || 0) / 100;
    });
    var intra = !partyState || partyState === companyState();
    var r = function (n) { return Math.round(n * 100) / 100; };
    return {
      subtotal: r(subtotal),
      cgst: intra ? r(tax / 2) : 0,
      sgst: intra ? r(tax / 2) : 0,
      igst: intra ? 0 : r(tax),
      total: Math.round(subtotal + tax)
    };
  }

  /* ---------------- Numbering ---------------- */

  var PREFIX = { Sales: "SAL", Purchase: "PUR", Payment: "PAY", Receipt: "RCT", Contra: "CON", Journal: "JRN", Quotation: "QTN" };
  function fyTag(dateStr) {
    var d = dateStr ? new Date(dateStr) : new Date();
    var y = d.getFullYear(), start = d.getMonth() >= 3 ? y : y - 1;
    return String(start).slice(2) + "-" + String(start + 1).slice(2);
  }
  function nextNumber(type, dateStr) {
    var coll = type === "Quotation" ? "quotations" : "vouchers";
    var head = PREFIX[type] + "/" + fyTag(dateStr) + "/";
    var max = 0;
    list(coll).forEach(function (v) {
      if (v.number && v.number.indexOf(head) === 0) max = Math.max(max, parseInt(v.number.slice(head.length), 10) || 0);
    });
    return head + String(max + 1).padStart(4, "0");
  }

  /* ---------------- Seeding ---------------- */

  function ensureSeeded(tenantId) {
    if (read("tally_" + tenantId + "_seeded", false)) return;

    var groups = PREDEFINED_GROUPS.map(function (g) {
      return { id: uid(), name: g[0], parent: g[1], nature: g[2], predefined: true };
    });
    save("groups", groups);

    // Only the demo tenant gets sample books; fresh tenants get the default ledgers with zero balances and no parties.
    var isDemo = tenantId === DEMO_TENANT;
    var base = isDemo ? SEED_LEDGERS : SEED_LEDGERS.filter(function (l) {
      return l[1] !== "Sundry Debtors" && l[1] !== "Sundry Creditors";
    }).map(function (l) { return [l[0], l[1], 0, l[3]]; });
    save("ledgers", base.map(function (l) {
      return { id: uid(), name: l[0], group: l[1], openingBalance: l[2], balanceType: l[3], gstin: l[4] || "", state: l[5] || "", createdAt: new Date().toISOString() };
    }));
    save("vouchers", []);
    save("quotations", []);
    save("ewaybills", []);
    save("imports", []);

    if (isDemo) seedDemoBooks();
    write("tally_" + tenantId + "_seeded", true);
  }

  function seedDemoBooks() {
    var customers = [["Sharma Enterprises", "Delhi", "07AAKCS4521M1Z8"], ["Lakshmi Stores", "Tamil Nadu", "33AAFPL7788K1Z3"], ["Metro Distributors", "Karnataka", "29AABCM9911Q1ZK"]];
    var suppliers = [["Apex Suppliers", "Tamil Nadu", "33AACFA3344H1Z9"], ["Bright Wholesale Co", "Maharashtra", "27AADCB5566J1Z1"]];
    var months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    var salesQty = [8, 11, 9, 14, 12, 16, 6];
    var purQty = [10, 8, 12, 9, 13, 11, 4];

    months.forEach(function (m, i) {
      var c = customers[i % 3], s = suppliers[i % 2];
      var day = i === 6 ? "03" : "12";
      var sItems = [Object.assign({ qty: salesQty[i] }, ITEMS[i % 6]), Object.assign({ qty: Math.ceil(salesQty[i] / 2) }, ITEMS[(i + 2) % 6])];
      var pItems = [Object.assign({ qty: purQty[i] }, ITEMS[(i + 1) % 6], { rate: Math.round(ITEMS[(i + 1) % 6].rate * 0.82) })];
      addVoucher({ type: "Sales", date: m + "-" + day, party: c[0], partyState: c[1], partyGstin: c[2], account: "Sales Account", items: sItems, narration: "Being goods sold to " + c[0], source: i % 2 ? "invoice" : "manual" });
      addVoucher({ type: "Purchase", date: m + "-" + (i === 6 ? "02" : "08"), party: s[0], partyState: s[1], partyGstin: s[2], account: "Purchase Account", items: pItems, narration: "Being goods purchased from " + s[0], ref: "SUP-" + (4100 + i) });
      addVoucher({ type: "Receipt", date: m + "-" + (i === 6 ? "04" : "20"), party: c[0], account: "HDFC Bank A/c", total: 15000 + i * 1500, mode: "NEFT", ref: "UTR" + (88120 + i * 7), narration: "Payment received from " + c[0] });
      addVoucher({ type: "Payment", date: m + "-" + (i === 6 ? "05" : "05"), party: "Office Rent", account: "HDFC Bank A/c", total: 30000, mode: "NEFT", ref: "RENT-" + m, narration: "Rent paid for " + m });

      // A second sale, receipt and two more payments each month so the registers fill a few pages.
      var c2 = customers[(i + 1) % 3], c3 = customers[(i + 2) % 3];
      addVoucher({ type: "Sales", date: m + "-" + (i === 6 ? "05" : "22"), party: c2[0], partyState: c2[1], partyGstin: c2[2], account: "Sales Account", items: [Object.assign({ qty: 4 + i }, ITEMS[(i + 4) % 6])], narration: "Being goods sold to " + c2[0], source: "invoice" });
      addVoucher({ type: "Receipt", date: m + "-" + (i === 6 ? "06" : "26"), party: c3[0], account: i % 2 ? "SBI Current A/c" : "Cash", total: 6000 + i * 800, mode: i % 2 ? "UPI" : "Cash", ref: i % 2 ? "UPI" + (55100 + i * 13) : "CR-" + (300 + i), narration: "Part payment received from " + c3[0] });
      addVoucher({ type: "Payment", date: m + "-" + (i === 6 ? "04" : "10"), party: "Electricity Charges", account: "SBI Current A/c", total: 6200 + i * 450, mode: "UPI", ref: "TNEB-" + m, narration: "Electricity bill for " + m });
      if (i < 6) addVoucher({ type: "Payment", date: m + "-28", party: "Salaries", account: "HDFC Bank A/c", total: 85000, mode: "NEFT", ref: "SAL-" + m, narration: "Salaries paid for " + m });
    });
    addVoucher({ type: "Contra", date: "2026-09-15", party: "Cash", account: "HDFC Bank A/c", total: 20000, ref: "CW-1182", narration: "Cash withdrawn for office use", lines: [{ ledger: "Cash", dr: 20000, cr: 0 }, { ledger: "HDFC Bank A/c", dr: 0, cr: 20000 }] });
    addVoucher({ type: "Journal", date: "2026-09-30", party: "Salaries", account: "", total: 85000, narration: "Salary provision for September", lines: [{ ledger: "Salaries", dr: 85000, cr: 0 }, { ledger: "Salary Payable", dr: 0, cr: 85000 }] });

    // One sales voucher already has an IRN so the e-Invoice screen isn't empty.
    var vs = list("vouchers");
    var firstSale = vs.filter(function (v) { return v.type === "Sales"; })[4];
    if (firstSale) {
      firstSale.einvoice = { irn: fakeHash(firstSale.number), ackNo: "1124" + "10293847561", ackDate: firstSale.date + "T14:22:00", status: "Generated" };
      save("vouchers", vs);
    }

    // One e-Way Bill against the largest seeded invoice so the e-Way Bill list isn't empty.
    // Seeded here (not on first visit to the page) so it never lands on an invoice the user created.
    var big = list("vouchers").filter(function (v) { return v.type === "Sales"; }).sort(function (a, b) { return b.total - a.total; })[0];
    if (big) {
      var gen = new Date(); gen.setHours(gen.getHours() - 5);
      var until = new Date(); until.setDate(until.getDate() + 2); until.setHours(23, 59, 0, 0);
      add("ewaybills", { ewbNo: "331009876543", voucherId: big.id, invoiceNumber: big.number, party: big.party, value: big.total, fromPin: "600040", toPlace: big.partyState, toPin: "560001", subType: "Supply", mode: "Road", distance: 350, vehicleNo: "TN09BX4521", vehicleType: "Regular", transporter: "VRL Logistics", transporterId: "", generatedAt: gen.toISOString(), validUntil: until.toISOString(), status: "Active" });
    }

    add("quotations", { number: "QTN/26-27/0001", date: "2026-10-01", validTill: "2026-10-15", party: "Metro Distributors", partyState: "Karnataka", partyGstin: "29AABCM9911Q1ZK", items: [Object.assign({ qty: 20 }, ITEMS[0]), Object.assign({ qty: 10 }, ITEMS[4])], status: "Open", notes: "Prices valid for 15 days. Freight extra." });
    var q = list("quotations")[0];
    Object.assign(q, computeTotals(q.items, q.partyState));
    save("quotations", [q]);
  }

  /* ---------------- Vouchers ---------------- */

  function addVoucher(v) {
    v.number = v.number || nextNumber(v.type, v.date);
    if (v.items && v.items.length) Object.assign(v, computeTotals(v.items, v.partyState));
    v.total = Number(v.total) || 0;
    v.source = v.source || "manual";
    return add("vouchers", v);
  }

  /* Double-entry view of a voucher: [{ ledger, dr, cr }]. Balances are derived from these. */
  function postings(v) {
    var t = Number(v.total) || 0;
    var round = Math.round((t - (v.subtotal || 0) - (v.cgst || 0) - (v.sgst || 0) - (v.igst || 0)) * 100) / 100;
    var rows = [];
    function push(ledger, dr, cr) { if (ledger && (dr || cr)) rows.push({ ledger: ledger, dr: dr || 0, cr: cr || 0 }); }
    switch (v.type) {
      case "Sales":
        push(v.party, t, 0);
        push(v.account || "Sales Account", 0, v.subtotal);
        push("CGST", 0, v.cgst); push("SGST", 0, v.sgst); push("IGST", 0, v.igst);
        if (round) push("Round Off", round < 0 ? -round : 0, round > 0 ? round : 0);
        break;
      case "Purchase":
        push(v.account || "Purchase Account", v.subtotal, 0);
        push("CGST", v.cgst, 0); push("SGST", v.sgst, 0); push("IGST", v.igst, 0);
        if (round) push("Round Off", round > 0 ? round : 0, round < 0 ? -round : 0);
        push(v.party, 0, t);
        break;
      case "Receipt": push(v.account, t, 0); push(v.party, 0, t); break;
      case "Payment": push(v.party, t, 0); push(v.account, 0, t); break;
      default: (v.lines || []).forEach(function (l) { push(l.ledger, Number(l.dr) || 0, Number(l.cr) || 0); });
    }
    return rows;
  }

  /* Closing balance as a signed number: positive = Dr, negative = Cr. */
  function ledgerBalance(name) {
    var l = list("ledgers").filter(function (x) { return x.name === name; })[0];
    var bal = l ? (l.balanceType === "Cr" ? -1 : 1) * (Number(l.openingBalance) || 0) : 0;
    list("vouchers").forEach(function (v) {
      postings(v).forEach(function (p) { if (p.ledger === name) bal += p.dr - p.cr; });
    });
    return Math.round(bal * 100) / 100;
  }

  /* Deterministic 64-char hex string — stands in for an IRN / hash in the demo. */
  function fakeHash(seed) {
    var h = 2166136261, out = "";
    var s = String(seed) + "|irn";
    while (out.length < 64) {
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      out += h.toString(16).padStart(8, "0");
      s = out;
    }
    return out.slice(0, 64);
  }

  return {
    DEMO_TENANT: DEMO_TENANT,
    ITEMS: ITEMS,
    INDIAN_STATES: ["Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"],
    getTenants: getTenants,
    findTenant: findTenant,
    isEmailTaken: isEmailTaken,
    registerTenant: registerTenant,
    authenticate: authenticate,
    setTenantStatus: setTenantStatus, updateTenant: updateTenant,
    MODULES: MODULES, ACTIONS: ACTIONS, ADMIN_ROLE: ADMIN_ROLE,
    roleById: roleById, can: can, renameLedger: renameLedger, isUsernameTaken: isUsernameTaken,
    useTenant: useTenant,
    list: list, save: save, obj: obj, setObj: setObj, uid: uid, add: add, update: update, remove: remove, get: get,
    companyState: companyState,
    computeTotals: computeTotals,
    nextNumber: nextNumber,
    addVoucher: addVoucher,
    postings: postings,
    ledgerBalance: ledgerBalance,
    fakeHash: fakeHash
  };
})();
