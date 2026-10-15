/* =========================================================
   e-Commerce GST: marketplace reports → GSTR-1 working papers.

   Reads one month's reports, in any mix:
     • Amazon   – MTR B2C / B2B (the full report), or the B2C
                  extract (Quantity · Hsn/sac · Ship To State · …)
     • Flipkart – "Report for GSTR-1 and GSTR-8" (7A2, 7B2, 5B, 12,
                  13, GSTR-8) or the monthly Sales Report
     • Meesho   – tcs_sales and tcs_sales_return
     • GSTR-2B  – optional; purchase ITC for the tax calculation
   and builds what the accountant files:
     • GSTR-1 B2B, B2CS, Documents, HSN and "Supply through e-com"
       sheets in the offline-utility layout
     • the GSTR-1 JSON (HSN summary + documents issued)
     • the month's tax calculation (sales, ITC, set-off, TCS check)
   Works in the browser and in Node (for tests).
   ========================================================= */
var EcomGst = (function () {
  var PLATFORMS = { amazon: "Amazon", flipkart: "Flipkart", meesho: "Meesho" };
  // Operator TCS GSTINs are per state; these are the Tamil Nadu ones. Others are typed in once.
  var OPERATOR_GSTIN = { amazon: { "33": "33AAICA3918J1C0" }, flipkart: { "33": "33AACCF0683K1CZ" }, meesho: { "33": "33AARCM9332R1CV" } };
  var RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
  // State names as the GSTR-1 offline utility lists them.
  var STATES = [["35", "Andaman & Nicobar Islands"], ["37", "Andhra Pradesh"], ["12", "Arunachal Pradesh"], ["18", "Assam"], ["10", "Bihar"], ["04", "Chandigarh"],
    ["22", "Chhattisgarh"], ["26", "Dadra and Nagar Haveli & Daman and Diu"], ["25", "Daman and Diu"], ["07", "Delhi"], ["30", "Goa"], ["24", "Gujarat"], ["06", "Haryana"],
    ["02", "Himachal Pradesh"], ["01", "Jammu and Kashmir"], ["20", "Jharkhand"], ["29", "Karnataka"], ["32", "Kerala"], ["38", "Ladakh"], ["31", "Lakshadweep"],
    ["23", "Madhya Pradesh"], ["27", "Maharashtra"], ["14", "Manipur"], ["17", "Meghalaya"], ["15", "Mizoram"], ["13", "Nagaland"], ["21", "Odisha"], ["97", "Other Territory"],
    ["34", "Puducherry"], ["03", "Punjab"], ["08", "Rajasthan"], ["11", "Sikkim"], ["33", "Tamil Nadu"], ["36", "Telangana"], ["16", "Tripura"], ["09", "Uttar Pradesh"],
    ["05", "Uttarakhand"], ["19", "West Bengal"]];
  var STATE_NAME = {}; STATES.forEach(function (s) { STATE_NAME[s[0]] = s[1]; });
  var ALIAS = { chattisgarh: "22", pondicherry: "34", orissa: "21", uttaranchal: "05", newdelhi: "07", nctofdelhi: "07", delhinct: "07", telengana: "36", jammukashmir: "01", damananddiu: "26" };

  function r2(n) { return Math.round((Number(n) || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100; }
  function r0(n) { return Math.round(Number(n) || 0); }
  // Amounts arrive as numbers, "1,31,500.61", "(768.57)", "-" or "".
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v == null ? "" : v).replace(/[₹\s]/g, "");
    if (!s || /^-+$/.test(s)) return 0;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    var n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : neg ? -n : n;
  }
  function key(s) { return String(s == null ? "" : s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, ""); }
  function stateKey(s) { return String(s == null ? "" : s).toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, ""); }
  function stateCode(s) {
    var raw = String(s == null ? "" : s).trim(), m = raw.match(/^(\d{1,2})(\b|-|\s)/);
    if (m && STATE_NAME[("0" + m[1]).slice(-2)]) return ("0" + m[1]).slice(-2);
    var k = stateKey(raw);
    if (!k) return "";
    for (var i = 0; i < STATES.length; i++) if (stateKey(STATES[i][1]) === k) return STATES[i][0];
    if (ALIAS[k]) return ALIAS[k];
    if (/^andaman/.test(k)) return "35";
    if (/^dadra/.test(k)) return "26";
    if (/^jammu/.test(k)) return "01";
    return "";
  }
  function stateName(code) { return STATE_NAME[code] || code || ""; }
  function snapRate(taxable, tax, fallback) {
    if (!taxable || !tax) return fallback == null ? 0 : fallback;
    var r = Math.abs(tax / taxable) * 100, best = RATES[0];
    RATES.forEach(function (x) { if (Math.abs(x - r) < Math.abs(best - r)) best = x; });
    return best;
  }
  function pct(v) { var n = num(v); return n > 0 && n < 1 ? r2(n * 100) : n; }
  function isGstin(s) { return /^[0-9]{2}[0-9A-Z]{13}$/.test(String(s || "").trim().toUpperCase()); }
  function spaced(g) { g = String(g || "").toUpperCase(); return g.length === 15 ? g.slice(0, 2) + " " + g.slice(2, 12) + " " + g.slice(12) : g; }
  function isoDate(v) {
    if (typeof v === "number" && v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    var s = String(v || "").trim(), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})/);
    if (m && MON[m[2].toLowerCase()]) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + ("0" + MON[m[2].toLowerCase()]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return s.slice(0, 10);
  }
  function series(no) { var m = String(no || "").match(/^(.*?)(\d+)$/); return m ? { prefix: m[1], n: Number(m[2]), width: m[2].length } : null; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function hsnSort(a, b) { return (a.hsn.length - b.hsn.length) || a.hsn.localeCompare(b.hsn) || a.rate - b.rate; }
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  /* ---------------- Reading sheets ---------------- */
  // Every sheet as rows of cells (raw values; CSV cells stay text).
  function sheetsOf(XLSX, wb) {
    var out = {};
    wb.SheetNames.forEach(function (n) { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true, blankrows: false }); });
    return out;
  }
  // Finds the header row (within the first rows) that has all the wanted columns.
  function headerAt(rows, wanted, scan) {
    for (var i = 0; i < Math.min(rows.length, scan || 12); i++) {
      var ks = rows[i].map(key);
      if (wanted.every(function (w) { return ks.some(function (k) { return k === w || (w.charAt(0) === "~" && k.indexOf(w.slice(1)) !== -1); }); })) return i;
    }
    return -1;
  }
  // Column index for the first header that matches (exact key, or "~part" contains).
  function colOf(header, names) {
    var ks = header.map(key);
    for (var j = 0; j < names.length; j++) {
      var w = names[j], i = w.charAt(0) === "~" ? ks.findIndex(function (k) { return k.indexOf(w.slice(1)) !== -1; }) : ks.indexOf(w);
      if (i !== -1) return i;
    }
    return -1;
  }
  function objects(rows, h) {
    var head = rows[h];
    return rows.slice(h + 1).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); }).map(function (r) {
      var o = {}; head.forEach(function (k, i) { if (String(k).trim()) o[String(k).trim()] = r[i] == null ? "" : r[i]; }); return o;
    });
  }
  function blankSource(platform, kind, label, file) {
    return { id: platform + ":" + kind + ":" + file, platform: platform, kind: kind, label: label, file: file, gstin: "", eco: "", period: "",
      rows: 0, b2cs: [], hsn: [], b2b: [], cdnr: [], docs: [], docCount: null, purchases: null, taxable: 0, warnings: [] };
  }
  function addTo(map, k, base, x) {
    var o = map[k] = map[k] || base;
    ["qty", "taxable", "igst", "cgst", "sgst", "value"].forEach(function (f) { if (x[f] != null) o[f] = (o[f] || 0) + x[f]; });
    return o;
  }
  function collect(src, map, hmap) {
    src.b2cs = Object.keys(map).map(function (k) { return map[k]; });
    if (hmap) src.hsn = Object.keys(hmap).map(function (k) { return hmap[k]; });
    src.taxable = src.b2cs.reduce(function (a, x) { return a + x.taxable; }, 0) + src.b2b.reduce(function (a, x) { return a + x.taxable; }, 0);
    return src;
  }
  function periodOfName(name) {
    var m = String(name).toUpperCase().match(/(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)[-_ ]?(\d{4})/);
    return m ? m[2] + "-" + pad(MONTHS.indexOf(m[1].slice(0, 3)) + 1, 2) : "";
  }

  /* ---------------- Amazon ---------------- */
  // The B2C extract: one row per sale/return with HSN and ship-to state, plus "<HSN> Total" and "Grand Total" rows.
  function amazonExtract(rows, file) {
    var h = headerAt(rows, ["quantity", "hsnsac", "shiptostate", "taxexclusivegross"]);
    var head = rows[h], c = { q: colOf(head, ["quantity"]), hsn: colOf(head, ["hsnsac"]), st: colOf(head, ["shiptostate"]), val: colOf(head, ["invoiceamount"]),
      tx: colOf(head, ["taxexclusivegross"]), i: colOf(head, ["igst", "igsttax"]), cg: colOf(head, ["cgst", "cgsttax"]), sg: colOf(head, ["sgst", "sgsttax", "utgst"]) };
    var src = blankSource("amazon", "amzExtract", "Amazon B2C (state & HSN extract)", file), map = {}, hmap = {}, grand = null, rates = {}, subtotal = {};
    src.period = periodOfName(file);
    var lines = [];
    rows.slice(h + 1).forEach(function (r) {
      var hsn = String(r[c.hsn]).trim();
      if (/grand\s*total/i.test(hsn)) { grand = { taxable: num(r[c.tx]), igst: num(r[c.i]), cgst: num(r[c.cg]), sgst: num(r[c.sg]), qty: num(r[c.q]) }; return; }
      if (/total/i.test(hsn)) { subtotal[hsn.replace(/\D/g, "")] = { qty: num(r[c.q]), taxable: num(r[c.tx]), igst: num(r[c.i]), cgst: num(r[c.cg]), sgst: num(r[c.sg]) }; return; }
      if (!hsn) return;
      var x = { qty: num(r[c.q]), hsn: hsn.replace(/\D/g, ""), state: stateCode(r[c.st]), stateRaw: String(r[c.st]).trim(), taxable: num(r[c.tx]), igst: num(r[c.i]), cgst: num(r[c.cg]), sgst: num(r[c.sg]), value: num(r[c.val]) };
      if (!x.taxable && !x.igst && !x.cgst && !x.qty) return;
      x.rate = snapRate(x.taxable, x.igst + x.cgst + x.sgst, null);
      if (x.rate != null) rates[x.rate] = (rates[x.rate] || 0) + 1;
      lines.push(x);
    });
    var common = Number(Object.keys(rates).sort(function (a, b) { return rates[b] - rates[a]; })[0] || 5);
    lines.forEach(function (x) {
      if (x.rate == null) x.rate = common;
      x.local = x.cgst || x.sgst ? true : x.igst ? false : null;
      if (!x.state) src.warnings.push("Unknown state “" + x.stateRaw + "” in " + file + ".");
      addTo(map, x.state + "|" + x.rate, { state: x.state, rate: x.rate, local: x.local, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
      addTo(hmap, x.hsn + "|" + x.rate, { hsn: x.hsn, rate: x.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
    });
    src.rows = lines.length;
    // The rows are rounded for display: state tax is taxable × rate, and HSN figures come from the file's own subtotals.
    Object.keys(map).forEach(function (k) {
      var x = map[k], t = x.taxable * x.rate / 100, local = x.local == null ? null : x.local;
      if (local === false || (local == null && !x.cgst)) { x.igst = t; x.cgst = x.sgst = 0; } else { x.cgst = x.sgst = t / 2; x.igst = 0; }
    });
    Object.keys(subtotal).forEach(function (h) {
      var ks = Object.keys(hmap).filter(function (k) { return hmap[k].hsn === h; });
      if (ks.length === 1) Object.assign(hmap[ks[0]], subtotal[h]);
    });
    collect(src, map, hmap);
    if (grand) {
      src.grand = grand;
      var t = src.b2cs.reduce(function (a, x) { return a + x.taxable; }, 0);
      if (Math.abs(t - grand.taxable) > 1) src.warnings.push("Rows add up to " + r2(t) + " but the file's Grand Total is " + r2(grand.taxable) + ".");
    }
    src.warnings.push("This extract has no invoice numbers — enter Amazon's invoice and credit-note series in Documents.");
    return src;
  }
  // The full MTR (B2C or B2B): parsed with Gstr, which knows its columns.
  function amazonMtr(objs, file) {
    var lines = Gstr.parseMtr(objs), b2bReport = Gstr.isB2bReport(Object.keys(objs[0] || {}));
    var src = blankSource("amazon", b2bReport ? "amzB2b" : "amzB2c", b2bReport ? "Amazon MTR B2B" : "Amazon MTR B2C", file);
    src.rows = lines.length;
    src.gstin = (lines.filter(function (l) { return l.sellerGstin; })[0] || {}).sellerGstin || "";
    src.period = periodOfName(file);
    var home = src.gstin.slice(0, 2);
    // B2B: refunds net off their invoice; an invoice refunded in full drops out. Tax is taxable × rate, as on the invoice.
    var inv = {}, order = [];
    lines.filter(function (l) { return l.buyerGstin && (l.taxable || l.value); }).forEach(function (l) {
      var k = l.invNo || l.orderId;
      if (!inv[k]) { inv[k] = { invNo: l.invNo, date: l.invDate, buyer: l.buyerName, gstin: l.buyerGstin, inter: l.inter, rate: l.rate, items: {} }; order.push(k); }
      var x = inv[k], it = x.items[l.hsnRaw + "|" + l.rate] = x.items[l.hsnRaw + "|" + l.rate] || { hsn: l.hsnRaw.replace(/\D/g, ""), rate: l.rate, qty: 0, taxable: 0 };
      it.qty += l.type === "Refund" ? -l.qty : l.qty; it.taxable += l.taxable;
      if (l.type !== "Refund") x.inter = l.inter;
    });
    order.forEach(function (k) {
      var x = inv[k], items = Object.keys(x.items).map(function (i) { return x.items[i]; }).filter(function (i) { return Math.abs(i.taxable) > 0.005; });
      if (!items.length) return;
      var pos = x.inter ? (x.gstin.slice(0, 2) !== home ? x.gstin.slice(0, 2) : stateCode(x.state)) : home;
      items.forEach(function (i) { var t = i.taxable * i.rate / 100; i.igst = x.inter ? t : 0; i.cgst = x.inter ? 0 : t / 2; i.sgst = i.cgst; });
      var sum = function (f) { return items.reduce(function (a, i) { return a + i[f]; }, 0); };
      var rec = { invNo: x.invNo, date: x.date, buyer: x.buyer, gstin: x.gstin, pos: pos, rate: x.rate, taxable: sum("taxable"), igst: sum("igst"), cgst: sum("cgst"), sgst: sum("sgst"), items: items };
      rec.value = rec.taxable + rec.igst + rec.cgst + rec.sgst;
      if (rec.taxable < 0) { src.cdnr.push(rec); src.warnings.push("Refund on " + x.invNo + " has no invoice in this report — file it as a credit note (CDNR)."); }
      else src.b2b.push(rec);
    });
    if (!b2bReport) {
      var s = Gstr.summarize(lines.filter(function (l) { return !l.buyerGstin; }), { gstin: src.gstin });
      var map = {};
      s.b2csLocal.forEach(function (x) { map[home + "|" + x.rate] = { state: home, rate: x.rate, local: true, taxable: x.net, igst: 0, cgst: x.cgst, sgst: x.sgst }; });
      s.b2csInter.concat(s.b2cl).forEach(function (x) { addTo(map, stateCode(x.state) + "|" + x.rate, { state: stateCode(x.state), rate: x.rate, local: false, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, { taxable: x.net != null ? x.net : x.taxable, igst: x.igst }); });
      src.hsn = s.hsnB2c.map(function (x) { return { hsn: x.hsn, rate: Number(String(x.rate).split(",")[0]) || 0, qty: x.qty - (x.qtyReturned || 0), taxable: x.taxable, igst: x.igst, cgst: x.cgst, sgst: x.sgst, value: x.value }; });
      src.docs = s.docs.map(function (d) { return { nature: /credit/i.test(d.nature) ? "Credit Notes" : "Invoices for outward supplies", from: d.from, to: d.to, total: d.total, cancelled: d.cancelled }; });
      if (s.period) src.period = s.period;
      collect(src, map);
    } else collect(src, {});
    return src;
  }

  /* ---------------- Flipkart ---------------- */
  function flipkartGstr(sheets, file) {
    var src = blankSource("flipkart", "fkGstr", "Flipkart GSTR-1 / GSTR-8 report", file), map = {}, hmap = {};
    var find = function (re) { var n = Object.keys(sheets).filter(function (s) { return re.test(s); })[0]; return n ? sheets[n] : null; };
    var data = function (rows) { return rows && rows.length > 1 ? rows.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); }) : []; };
    var a = find(/7\s*\(\s*A\s*\)\s*\(\s*2\s*\)/i), b = find(/7\s*\(\s*B\s*\)\s*\(\s*2\s*\)/i), l5 = find(/section\s*5b/i), s12 = find(/section\s*12/i), s13 = find(/section\s*13/i), g8 = find(/gstr-?8/i);
    var home = "";
    if (a) {
      var ha = a[0], ca = { g: colOf(ha, ["gstin"]), tx: colOf(ha, ["~aggregatetaxable", "~taxablevalue"]), cr: colOf(ha, ["cgst"]), ca: colOf(ha, ["~cgstamount"]), sr: colOf(ha, ["sgstut", "~sgst"]), sa: colOf(ha, ["~sgstutamount", "~sgstamount"]) };
      data(a).forEach(function (r) {
        home = home || String(r[ca.g]).slice(0, 2); src.gstin = src.gstin || String(r[ca.g]).trim();
        var x = { taxable: num(r[ca.tx]), cgst: num(r[ca.ca]), sgst: num(r[ca.sa]), igst: 0 }, rate = r2(pct(r[ca.cr]) + pct(r[ca.sr])) || snapRate(x.taxable, x.cgst + x.sgst, 0);
        addTo(map, home + "|" + rate, { state: home, rate: rate, local: true, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, x); src.rows++;
      });
    }
    var inter = function (rows, isLarge) {
      var hb = rows[0], cb = { g: colOf(hb, ["gstin"]), tx: colOf(hb, ["~aggregatetaxable", "~taxablevalue"]), r: colOf(hb, ["igst"]), i: colOf(hb, ["~igstamount"]), st: colOf(hb, ["~deliveredstatepos", "~pos"]) };
      data(rows).forEach(function (r) {
        src.gstin = src.gstin || String(r[cb.g]).trim();
        var code = stateCode(r[cb.st]), x = { taxable: num(r[cb.tx]), igst: num(r[cb.i]), cgst: 0, sgst: 0 }, rate = pct(r[cb.r]) || snapRate(x.taxable, x.igst, 0);
        if (!code) src.warnings.push("Unknown state “" + r[cb.st] + "” in " + file + ".");
        addTo(map, code + "|" + rate, { state: code, rate: rate, local: false, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, x); src.rows++;
        if (isLarge) src.warnings.push("Invoice above ₹2.5 lakh (Section 5B) is included in B2CS for " + stateName(code) + " — move it to B2CL if needed.");
      });
    };
    if (b) inter(b);
    if (l5) inter(l5, true);
    if (s12) {
      var h12 = s12[0], c12 = { h: colOf(h12, ["hsnnumber", "hsn", "~hsn"]), q: colOf(h12, ["~totalquantity", "~quantity"]), v: colOf(h12, ["~totalvalue"]), tx: colOf(h12, ["~totaltaxable", "~taxable"]), i: colOf(h12, ["~igst"]), cg: colOf(h12, ["~cgst"]), sg: colOf(h12, ["~sgst"]) };
      data(s12).forEach(function (r) {
        var x = { hsn: String(r[c12.h]).replace(/\D/g, ""), qty: num(r[c12.q]), value: num(r[c12.v]), taxable: num(r[c12.tx]), igst: num(r[c12.i]), cgst: num(r[c12.cg]), sgst: num(r[c12.sg]) };
        x.rate = snapRate(x.taxable, x.igst + x.cgst + x.sgst, 5);
        addTo(hmap, x.hsn + "|" + x.rate, { hsn: x.hsn, rate: x.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
      });
    }
    if (s13) {
      var h13 = s13[0], c13 = { f: colOf(h13, ["~seriesfrom", "~from"]), t: colOf(h13, ["~seriesto", "~to"]), n: colOf(h13, ["~totalnumber", "~total"]), c: colOf(h13, ["~cancelled"]) };
      data(s13).forEach(function (r) { if (String(r[c13.f]).trim()) src.docs.push({ nature: "Invoices for outward supplies", from: String(r[c13.f]).trim(), to: String(r[c13.t]).trim(), total: num(r[c13.n]), cancelled: num(r[c13.c]) }); });
    }
    if (g8) { var h8 = g8[0], c8 = colOf(h8, ["~gstinofflipkart", "~operatorgstin"]); data(g8).some(function (r) { if (isGstin(r[c8])) { src.eco = String(r[c8]).trim().toUpperCase(); return true; } return false; }); }
    collect(src, map, hmap);
    if (!src.rows && !src.hsn.length) src.warnings.push("This Flipkart report has headers only — no sales in it. Download it again from Seller Hub (Reports → Tax reports) once the month is closed.");
    return src;
  }
  // Flipkart's monthly Sales Report (one row per sale / return / cancellation).
  function flipkartSales(rows, file) {
    var h = headerAt(rows, ["eventtype", "~taxablevalue", "hsncode"]);
    var src = blankSource("flipkart", "fkSales", "Flipkart Sales Report", file), map = {}, hmap = {}, inv = {}, issued = {}, cancelled = {};
    objects(rows, h).forEach(function (o) {
      var r = {}; Object.keys(o).forEach(function (k) { r[key(k)] = o[k]; });
      var ev = String(r.eventtype || "").toLowerCase(), back = /return|cancel/.test(ev) && !/returncancel/.test(key(ev));
      var sg = function (v) { v = num(v); return back && v > 0 ? -v : v; };
      var x = { qty: sg(r.itemquantity), hsn: String(r.hsncode).replace(/\D/g, ""), taxable: sg(r[Object.keys(r).filter(function (k) { return k.indexOf("taxablevalue") === 0; })[0]]),
        igst: sg(r.igstamount), cgst: sg(r.cgstamount), sgst: sg(r.sgstamountorutgstasapplicable || r.sgstamount), value: sg(r[Object.keys(r).filter(function (k) { return k.indexOf("finalinvoiceamount") === 0; })[0]]) };
      x.rate = r2(pct(r.igstrate) + pct(r.cgstrate) + pct(r.sgstrateorutgstasapplicable || r.sgstrate)) || snapRate(x.taxable, x.igst + x.cgst + x.sgst, 5);
      src.gstin = src.gstin || String(r.sellergstin || "").trim();
      var invNo = String(r.buyerinvoiceid || "").trim(), bg = String(r.businessgstnumber || "").trim().toUpperCase();
      if (invNo) { if (/cancel/.test(ev) && !/return/.test(ev)) cancelled[invNo] = 1; else if (!back) issued[invNo] = 1; }
      src.rows++;
      if (isGstin(bg)) {
        var b = inv[invNo] = inv[invNo] || { invNo: invNo, date: isoDate(r.buyerinvoicedate), buyer: String(r.businessname || "").trim(), gstin: bg, pos: x.cgst ? src.gstin.slice(0, 2) : stateCode(r.customersdeliverystate) || bg.slice(0, 2), rate: x.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0, items: [] };
        b.taxable += x.taxable; b.igst += x.igst; b.cgst += x.cgst; b.sgst += x.sgst; b.value += x.value; b.items.push({ hsn: x.hsn, rate: x.rate, qty: x.qty, taxable: x.taxable, igst: x.igst, cgst: x.cgst, sgst: x.sgst });
        return;
      }
      var code = x.cgst || x.sgst ? src.gstin.slice(0, 2) : stateCode(r.customersdeliverystate);
      addTo(map, code + "|" + x.rate, { state: code, rate: x.rate, local: !!(x.cgst || x.sgst), taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
      addTo(hmap, x.hsn + "|" + x.rate, { hsn: x.hsn, rate: x.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
      var d = isoDate(r.buyerinvoicedate || r.orderdate); if (d && !src.period) src.period = d.slice(0, 7);
    });
    src.b2b = Object.keys(inv).map(function (k) { return inv[k]; }).filter(function (b) { return Math.abs(b.taxable) > 0.005; });
    Object.keys(issued).forEach(function (k) { delete cancelled[k]; });
    src.docNos = { issued: Object.keys(issued), cancelled: Object.keys(cancelled) };
    collect(src, map, hmap);
    if (!src.rows) src.warnings.push("This Flipkart Sales Report has headers only — no sales in it.");
    return src;
  }

  /* ---------------- Meesho ---------------- */
  // tcs_sales / tcs_sales_return. Returns reduce the month; on the HSN summary each return row counts as one piece, as in the working file.
  function meesho(rows, file) {
    var h = headerAt(rows, ["subordernum", "totaltaxablesalevalue"]), head = rows[h].map(key), isReturn = head.indexOf("cancelreturndate") !== -1;
    var src = blankSource("meesho", isReturn ? "mshReturn" : "mshSales", isReturn ? "Meesho sales returns" : "Meesho sales", file), map = {}, hmap = {};
    var sign = isReturn ? -1 : 1, months = {};
    objects(rows, h).forEach(function (o) {
      var r = {}; Object.keys(o).forEach(function (k) { r[key(k)] = o[k]; });
      src.gstin = src.gstin || String(r.gstin || "").trim().toUpperCase();
      if (!src.eco && isGstin(r.ecotcsgstin)) src.eco = String(r.ecotcsgstin).trim().toUpperCase();
      if (r.financialyear && r.monthnumber) months[r.financialyear + "-" + pad(num(r.monthnumber), 2)] = 1;
      var code = stateCode(r.endcustomerstatenew), rate = pct(r.gstrate), taxable = num(r.totaltaxablesalevalue) * sign, tax = num(r.taxamount) * sign;
      if (!code) src.warnings.push("Unknown state “" + r.endcustomerstatenew + "” in " + file + ".");
      var local = code === src.gstin.slice(0, 2);
      var x = { taxable: taxable, igst: local ? 0 : tax, cgst: local ? tax / 2 : 0, sgst: local ? tax / 2 : 0, value: num(r.totalinvoicevalue) * sign, qty: isReturn ? -1 : num(r.quantity) };
      addTo(map, code + "|" + rate, { state: code, rate: rate, local: local, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
      x.hsn = String(r.hsncode).replace(/\D/g, "");
      addTo(hmap, x.hsn + "|" + rate, { hsn: x.hsn, rate: rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x);
      src.rows++;
    });
    src.period = Object.keys(months)[0] || periodOfName(file);
    src.docCount = isReturn ? { cancelled: src.rows } : { issued: src.rows };
    return collect(src, map, hmap);
  }

  /* ---------------- GSTR-2B (purchases) ---------------- */
  function gstr2b(sheets, file) {
    var src = blankSource("purchase", "gstr2b", "GSTR-2B (purchases)", file), inv = [], notes = [];
    Object.keys(sheets).forEach(function (n) {
      var rows = sheets[n], h = headerAt(rows, ["~gstinofsupplier"], 12);
      if (h === -1) return;
      var top = rows[h], sub = rows[h + 1] || [], label = [], last = "";
      top.forEach(function (t, i) { if (String(t).trim()) last = String(t).trim(); label[i] = key((String(sub[i] || "").trim() ? last + " " + sub[i] : t)); });
      for (var i = top.length; i < sub.length; i++) label[i] = key(last + " " + sub[i]);
      var c = function (re) { for (var i = 0; i < label.length; i++) if (re.test(label[i] || "")) return i; return -1; };
      var isNote = c(/notenumber|notedetailsnotenumber|notenumber/) !== -1;
      var col = { g: c(/gstinofsupplier/), name: c(/tradelegalname|tradename/), no: isNote ? c(/notenumber/) : c(/invoicenumber/), type: isNote ? c(/notetype/) : c(/invoicetype/),
        date: isNote ? c(/notedate/) : c(/invoicedate/), val: isNote ? c(/notevalue/) : c(/invoicevalue/), pos: c(/placeofsupply/), rc: c(/reversecharge/),
        tx: c(/^taxablevalue/), i: c(/integratedtax/), cg: c(/centraltax/), sg: c(/stateuttax|statetax/), cs: c(/cess/), itc: c(/itcavailability/) };
      rows.slice(h + 1).forEach(function (r) {
        var g = String(r[col.g] || "").trim().toUpperCase();
        if (!isGstin(g)) return;
        var x = { gstin: g, name: String(r[col.name] || "").trim(), no: String(r[col.no] || "").trim(), type: String(r[col.type] || "").trim(), date: isoDate(r[col.date]),
          value: num(r[col.val]), pos: String(r[col.pos] || "").trim(), rc: String(r[col.rc] || "").trim(), taxable: num(r[col.tx]), igst: num(r[col.i]), cgst: num(r[col.cg]), sgst: num(r[col.sg]),
          itc: col.itc === -1 ? "Yes" : String(r[col.itc] || "").trim() || "Yes" };
        (isNote ? notes : inv).push(x);
      });
    });
    src.purchases = { invoices: inv, notes: notes };
    src.rows = inv.length + notes.length;
    src.taxable = inv.reduce(function (a, x) { return a + x.taxable; }, 0);
    if (!src.rows) src.warnings.push("No supplier rows found in this GSTR-2B file.");
    return src;
  }

  /* ---------------- Detect ---------------- */
  // wb: a SheetJS workbook. Returns a source, or throws with a readable message.
  function read(XLSX, wb, file) {
    var sheets = sheetsOf(XLSX, wb), names = Object.keys(sheets);
    if (names.some(function (n) { return /section\s*7\s*\(\s*[ab]\s*\)/i.test(n); })) return flipkartGstr(sheets, file);
    for (var i = 0; i < names.length; i++) {
      var rows = sheets[names[i]];
      if (headerAt(rows, ["eventtype", "~taxablevalue", "hsncode"]) !== -1) return flipkartSales(rows, file);
      if (headerAt(rows, ["subordernum", "totaltaxablesalevalue"]) !== -1) return meesho(rows, file);
      if (headerAt(rows, ["quantity", "hsnsac", "shiptostate", "taxexclusivegross"]) !== -1 && headerAt(rows, ["transactiontype"]) === -1) return amazonExtract(rows, file);
      var hm = headerAt(rows, ["transactiontype", "shiptostate"]);
      if (hm !== -1 && Gstr.isMtr(rows[hm].map(String))) {
        var objs = XLSX.utils.sheet_to_json(wb.Sheets[names[i]], { defval: "", raw: false, range: hm });
        return amazonMtr(objs, file);
      }
    }
    if (names.some(function (n) { return headerAt(sheets[n], ["~gstinofsupplier"], 12) !== -1; })) return gstr2b(sheets, file);
    throw new Error(file + " isn't a report this page reads. Use the Amazon MTR / B2C extract, Flipkart GSTR or Sales report, Meesho tcs_sales / tcs_sales_return, or GSTR-2B.");
  }

  /* ---------------- Consolidate ---------------- */
  function emptyTax() { return { taxable: 0, igst: 0, cgst: 0, sgst: 0 }; }
  function addTax(a, x) { a.taxable += x.taxable || 0; a.igst += x.igst || 0; a.cgst += x.cgst || 0; a.sgst += x.sgst || 0; return a; }
  function round(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = typeof o[k] === "number" && k !== "rate" && k !== "qty" && k !== "total" && k !== "cancelled" ? r2(o[k]) : o[k]; }); return c; }

  // settings: { gstin, period, docs (manual rows), operators {platform: gstin}, tcsReported {platform: value},
  //             openingItc {igst,cgst,sgst}, cash {igst,cgst,sgst}, purchases (manual {taxable,igst,cgst,sgst}) }
  function build(sources, settings) {
    settings = settings || {};
    var sales = sources.filter(function (s) { return s.platform !== "purchase"; });
    var gstin = (settings.gstin || (sales.filter(function (s) { return isGstin(s.gstin); })[0] || {}).gstin || "").toUpperCase();
    var home = gstin.slice(0, 2);
    var periods = {}; sales.forEach(function (s) { if (s.period) periods[s.period] = (periods[s.period] || 0) + 1; });
    var period = settings.period || Object.keys(periods).sort(function (a, b) { return periods[b] - periods[a]; })[0] || "";
    var warnings = [];
    sales.forEach(function (s) { s.warnings.forEach(function (w) { warnings.push({ platform: s.platform, file: s.file, msg: w }); }); });
    if (gstin && sales.some(function (s) { return isGstin(s.gstin) && s.gstin.toUpperCase() !== gstin; })) warnings.push({ msg: "Some files belong to another GSTIN — check the files." });
    Object.keys(periods).forEach(function (p) { if (period && p !== period) warnings.push({ msg: "A file looks like it is for " + p + " — the return period is " + period + "." }); });

    // Flipkart: when the GSTR report is there, the Sales Report only adds B2B invoices.
    var hasFkGstr = sales.some(function (s) { return s.kind === "fkGstr" && (s.rows || s.hsn.length); });
    var useB2c = function (s) { return !(s.kind === "fkSales" && hasFkGstr); };

    // B2CS by place of supply and rate; local is decided by the seller's state.
    var b2cs = {}, perPlatform = {}, hsnC = {}, hsnB = {}, b2b = [], cdnr = [];
    sales.forEach(function (s) {
      var pp = perPlatform[s.platform] = perPlatform[s.platform] || { platform: s.platform, name: PLATFORMS[s.platform], states: {}, b2c: {}, b2b: {}, files: [] };
      pp.files.push(s.file);
      if (useB2c(s)) {
        s.b2cs.forEach(function (x) {
          var code = x.state || home, local = x.local == null ? code === home : x.local;
          var t = { taxable: x.taxable, igst: x.igst, cgst: x.cgst, sgst: x.sgst };
          if (local && x.igst && !x.cgst) { t.cgst = t.sgst = x.igst / 2; t.igst = 0; }
          addTax(b2cs[code + "|" + x.rate] = b2cs[code + "|" + x.rate] || { state: code, name: stateName(code), rate: x.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, t);
          addTax(pp.states[code] = pp.states[code] || { state: code, name: stateName(code), taxable: 0, igst: 0, cgst: 0, sgst: 0 }, t);
          addTax(pp.b2c[(local ? "L" : "I") + "|" + x.rate] = pp.b2c[(local ? "L" : "I") + "|" + x.rate] || { local: local, rate: x.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, t);
        });
        s.hsn.forEach(function (x) { addTo(hsnC, x.hsn + "|" + x.rate, { hsn: x.hsn, rate: x.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 }, x); });
      }
      s.b2b.forEach(function (x) {
        b2b.push(Object.assign({ platform: s.platform }, x));
        var local = x.pos === home;
        addTax(pp.b2b[(local ? "L" : "I") + "|" + x.rate] = pp.b2b[(local ? "L" : "I") + "|" + x.rate] || { local: local, rate: x.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, x);
        x.items.forEach(function (i) { addTo(hsnB, i.hsn + "|" + i.rate, { hsn: i.hsn, rate: i.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, i); });
      });
      s.cdnr.forEach(function (x) { cdnr.push(Object.assign({ platform: s.platform }, x)); });
    });
    var b2csRows = Object.keys(b2cs).map(function (k) { return round(b2cs[k]); }).sort(function (a, b) { return a.name.localeCompare(b.name) || a.rate - b.rate; });
    var hsnRows = function (m) { return Object.keys(m).map(function (k) { var x = round(m[k]); x.uqc = "NOS"; return x; }).sort(hsnSort); };
    var b2bRows = b2b.map(function (x) { var r = round(x); r.posName = stateName(x.pos); return r; });

    // Documents issued: from the files, then the ones typed in.
    var docs = [];
    var fromNos = function (platform, nos) {
      var by = {};
      nos.issued.concat(nos.cancelled).forEach(function (no) {
        var sr = series(no); if (!sr) return;
        var g = by[sr.prefix] = by[sr.prefix] || { min: Infinity, max: -Infinity, minNo: "", maxNo: "", cancelled: 0 };
        if (sr.n < g.min) { g.min = sr.n; g.minNo = no; } if (sr.n > g.max) { g.max = sr.n; g.maxNo = no; }
      });
      nos.cancelled.forEach(function (no) { var sr = series(no); if (sr && by[sr.prefix]) by[sr.prefix].cancelled++; });
      Object.keys(by).forEach(function (p) { var g = by[p]; docs.push({ platform: platform, nature: "Invoices for outward supplies", from: g.minNo, to: g.maxNo, total: g.max - g.min + 1, cancelled: g.cancelled, auto: true }); });
    };
    ["amazon", "flipkart", "meesho"].forEach(function (p) {
      sales.filter(function (s) { return s.platform === p; }).forEach(function (s) {
        if (s.kind === "fkSales" && hasFkGstr) return;
        s.docs.forEach(function (d) { docs.push(Object.assign({ platform: p, auto: true }, d)); });
        if (s.docNos) fromNos(p, s.docNos);
      });
      if (p === "meesho") {
        var issued = 0, canc = 0, any = false;
        sales.forEach(function (s) { if (s.platform === "meesho" && s.docCount) { any = true; issued += s.docCount.issued || 0; canc += s.docCount.cancelled || 0; } });
        if (any && issued) {
          var mon = period ? MONTHS[Number(period.slice(5, 7)) - 1] : "INV", w = Math.max(4, String(issued).length);
          docs.push({ platform: "meesho", nature: "Invoices for outward supplies", from: "MEESHO/" + mon + "/" + pad(1, w), to: "MEESHO/" + mon + "/" + pad(issued, w), total: issued, cancelled: canc, auto: true });
        }
      }
    });
    (settings.docs || []).forEach(function (d) { if (d) docs.push({ platform: d.platform || "", nature: d.nature || "Invoices for outward supplies", from: d.from || "", to: d.to || "", total: num(d.total), cancelled: num(d.cancelled), auto: false, id: d.id }); });
    docs.forEach(function (d) { d.net = d.total - d.cancelled; d.docNum = /credit/i.test(d.nature) ? 5 : /debit/i.test(d.nature) ? 4 : 1; });
    docs.sort(function (a, b) { return a.docNum - b.docNum; });

    // Supplies through e-commerce operators (TCS u/s 52) — B2C value, as in the working file.
    var ecom = ["amazon", "flipkart", "meesho"].filter(function (p) { return perPlatform[p]; }).map(function (p) {
      var pp = perPlatform[p], t = emptyTax(), all = emptyTax();
      Object.keys(pp.b2c).forEach(function (k) { addTax(t, pp.b2c[k]); addTax(all, pp.b2c[k]); });
      // A file with its own grand total (Amazon's extract) is reported at that total.
      sales.filter(function (s) { return s.platform === p && s.grand && useB2c(s); }).forEach(function (s) {
        var mine = s.b2cs.reduce(addTax, emptyTax());
        ["taxable", "igst", "cgst", "sgst"].forEach(function (f) { var d = s.grand[f] - mine[f]; if (Math.abs(d) < 1) { t[f] += d; all[f] += d; } });
      });
      Object.keys(pp.b2b).forEach(function (k) { addTax(all, pp.b2b[k]); });
      var fileEco = (sales.filter(function (s) { return s.platform === p && isGstin(s.eco); })[0] || {}).eco;
      var g = ((settings.operators || {})[p] || fileEco || (OPERATOR_GSTIN[p] || {})[home] || "").toUpperCase();
      var reported = (settings.tcsReported || {})[p];
      return { platform: p, name: PLATFORMS[p], gstin: g, value: r2(t.taxable), igst: r2(t.igst), cgst: r2(t.cgst), sgst: r2(t.sgst),
        allValue: r2(all.taxable), reported: reported === "" || reported == null ? null : num(reported), diff: reported === "" || reported == null ? null : r2(num(reported) - all.taxable) };
    });
    ecom.forEach(function (e) { if (!isGstin(e.gstin)) warnings.push({ platform: e.platform, msg: e.name + "'s TCS GSTIN for your state isn't known — type it in “Supply through e-com”." }); });

    // Sales split (as the working file's SALES sheet).
    var split = [];
    ["amazon", "flipkart", "meesho"].forEach(function (p) {
      var pp = perPlatform[p]; if (!pp) return;
      ["b2c", "b2b"].forEach(function (kind) {
        Object.keys(pp[kind]).forEach(function (k) { var x = pp[kind][k]; split.push(round({ kind: kind === "b2c" ? "B2CS" : "B2B", platform: p, name: PLATFORMS[p] + (x.local ? " – Local" : " – Inter-state"), local: x.local, rate: x.rate, taxable: x.taxable, igst: x.igst, cgst: x.cgst, sgst: x.sgst })); });
      });
    });
    split.sort(function (a, b) { return a.kind.localeCompare(b.kind) * -1 || a.rate - b.rate || a.platform.localeCompare(b.platform) || (a.local - b.local); });
    var tot = { b2b: emptyTax(), b2cs: emptyTax() };
    b2b.forEach(function (x) { addTax(tot.b2b, x); });
    Object.keys(b2cs).forEach(function (k) { addTax(tot.b2cs, b2cs[k]); });
    var totals = { b2b: round(tot.b2b), b2cs: round(tot.b2cs), all: round(addTax(addTax(emptyTax(), tot.b2b), tot.b2cs)) };
    var companyWise = ["amazon", "flipkart", "meesho"].filter(function (p) { return perPlatform[p]; }).map(function (p) {
      var st = perPlatform[p].states, keys = Object.keys(st), rows = keys.map(function (k) { return round(st[k]); }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      return { platform: p, name: PLATFORMS[p], rows: rows, total: round(keys.reduce(function (a, k) { return addTax(a, st[k]); }, emptyTax())) };
    });
    var hsnByPlatform = ["amazon", "flipkart", "meesho"].filter(function (p) { return perPlatform[p]; }).map(function (p) {
      var m = {};
      sales.filter(function (s) { return s.platform === p && useB2c(s); }).forEach(function (s) { s.hsn.forEach(function (x) { addTo(m, x.hsn + "|" + x.rate, { hsn: x.hsn, rate: x.rate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 }, x); }); });
      return { platform: p, name: PLATFORMS[p], rows: hsnRows(m) };
    });

    var model = {
      gstin: gstin, home: home, homeName: stateName(home), period: period, company: settings.company || "",
      b2b: b2bRows, cdnr: cdnr.map(round), b2cs: b2csRows, hsnB2b: hsnRows(hsnB), hsnB2c: hsnRows(hsnC), docs: docs, ecom: ecom,
      split: split, totals: totals, companyWise: companyWise, hsnByPlatform: hsnByPlatform, warnings: warnings,
      platforms: Object.keys(perPlatform)
    };
    model.tax = taxCalc(model, sources.filter(function (s) { return s.platform === "purchase"; }), settings);
    return model;
  }

  /* ---------------- Tax calculation ---------------- */
  // ITC is used in the order the law sets: IGST credit first (IGST, then CGST, SGST), then CGST (CGST, IGST), then SGST (SGST, IGST).
  function taxCalc(model, purchaseSources, settings) {
    var inv = [], notes = [];
    purchaseSources.forEach(function (s) { inv = inv.concat(s.purchases.invoices); notes = notes.concat(s.purchases.notes); });
    var eligible = function (x) { return !/^no/i.test(x.itc) && !/^y/i.test(x.rc); };
    var gross = inv.filter(eligible).reduce(addTax, emptyTax());
    var cn = notes.filter(function (x) { return eligible(x) && /credit/i.test(x.type); }).reduce(addTax, emptyTax());
    var dn = notes.filter(function (x) { return eligible(x) && /debit/i.test(x.type); }).reduce(addTax, emptyTax());
    var manual = settings.purchases && (num(settings.purchases.igst) || num(settings.purchases.cgst) || num(settings.purchases.taxable));
    var net = manual ? { taxable: num(settings.purchases.taxable), igst: num(settings.purchases.igst), cgst: num(settings.purchases.cgst), sgst: num(settings.purchases.sgst) }
      : { taxable: gross.taxable - cn.taxable + dn.taxable, igst: gross.igst - cn.igst + dn.igst, cgst: gross.cgst - cn.cgst + dn.cgst, sgst: gross.sgst - cn.sgst + dn.sgst };
    var open = settings.openingItc || {}, cash = settings.cash || {};
    var itc = { i: r0(net.igst), c: r0(net.cgst), s: r0(net.sgst) };
    var avail = { i: num(open.igst) + itc.i, c: num(open.cgst) + itc.c, s: num(open.sgst) + itc.s };
    var out = model.totals.all, pay = { i: r0(out.igst), c: r0(out.cgst), s: r0(out.sgst) }, due = { i: pay.i, c: pay.c, s: pay.s };
    var left = { i: avail.i, c: avail.c, s: avail.s }, used = { i: { i: 0, c: 0, s: 0 }, c: { i: 0, c: 0, s: 0 }, s: { i: 0, c: 0, s: 0 } };
    var use = function (from, to) { var n = Math.max(0, Math.min(left[from], due[to])); left[from] -= n; due[to] -= n; used[from][to] += n; };
    use("i", "i"); use("i", "c"); use("i", "s"); use("c", "c"); use("c", "i"); use("s", "s"); use("s", "i");
    var cashLeft = { i: num(cash.igst) - due.i, c: num(cash.cgst) - due.c, s: num(cash.sgst) - due.s };
    return {
      invoices: inv, notes: notes, gross: round(gross), creditNotes: round(cn), debitNotes: round(dn), net: round(net), manual: !!manual,
      opening: { i: num(open.igst), c: num(open.cgst), s: num(open.sgst) }, itc: itc, avail: avail, output: { i: out.igst, c: out.cgst, s: out.sgst }, pay: pay,
      used: used, cashPayable: due, closing: left, cash: { i: num(cash.igst), c: num(cash.cgst), s: num(cash.sgst) }, cashAfter: cashLeft
    };
  }

  /* ---------------- GSTR-1 JSON ---------------- */
  function ddmmyyyy(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : iso; }
  // Rows still being typed (no numbers yet) stay out of the files.
  function filedDocs(m) { return m.docs.filter(function (d) { return d.from || d.total; }); }
  function hsnJson(rows) { return rows.map(function (x, i) { return { num: i + 1, hsn_sc: x.hsn, txval: r2(x.taxable), iamt: r2(x.igst), camt: r2(x.cgst), samt: r2(x.sgst), csamt: 0, uqc: x.uqc || "NOS", qty: r2(x.qty), rt: x.rate }; }); }
  // full: also B2B, B2CS and Table 14 (supplies through e-commerce operators).
  function json(model, full) {
    var j = { gstin: model.gstin, fp: model.period ? model.period.slice(5, 7) + model.period.slice(0, 4) : "" };
    if (full) {
      var byCtin = {};
      model.b2b.forEach(function (x) {
        var c = byCtin[x.gstin] = byCtin[x.gstin] || { ctin: x.gstin, inv: [] };
        c.inv.push({ inum: x.invNo, idt: ddmmyyyy(x.date), val: r2(x.value), pos: x.pos, rchrg: "N", inv_typ: "R",
          itms: [{ num: 1, itm_det: { rt: x.rate, txval: r2(x.taxable), iamt: r2(x.igst), camt: r2(x.cgst), samt: r2(x.sgst), csamt: 0 } }] });
      });
      if (model.b2b.length) j.b2b = Object.keys(byCtin).map(function (k) { return byCtin[k]; });
      j.b2cs = model.b2cs.filter(function (x) { return Math.abs(x.taxable) > 0.004; }).map(function (x) {
        var intra = x.state === model.home, o = { sply_ty: intra ? "INTRA" : "INTER", rt: x.rate, typ: "OE", pos: x.state, txval: r2(x.taxable) };
        if (intra) { o.camt = r2(x.cgst); o.samt = r2(x.sgst); } else o.iamt = r2(x.igst);
        o.csamt = 0; return o;
      });
    }
    j.hsn = { hsn_b2b: hsnJson(model.hsnB2b), hsn_b2c: hsnJson(model.hsnB2c) };
    if (full && model.ecom.length) j.supeco = { clttx: model.ecom.filter(function (e) { return isGstin(e.gstin); }).map(function (e) { return { etin: e.gstin, suppval: e.value, igst: e.igst, cgst: e.cgst, sgst: e.sgst, cess: 0 }; }) };
    var byNum = {};
    filedDocs(model).forEach(function (d) { (byNum[d.docNum] = byNum[d.docNum] || []).push(d); });
    j.doc_issue = { doc_det: Object.keys(byNum).sort(function (a, b) { return b - a; }).map(function (n) {
      return { doc_num: Number(n), docs: byNum[n].map(function (d, i) { return { cancel: d.cancelled, from: d.from, net_issue: d.net, num: i + 1, to: d.to, totnum: d.total }; }) };
    }) };
    return j;
  }

  /* ---------------- Offline-utility sheets ---------------- */
  function serial(iso) { var p = String(iso).split("-"); return p.length === 3 ? (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 864e5 : iso; }
  // Same rows as the utility: tag row, field codes, blank, labels, [section], dashes, data.
  function utilSheet(XLSX, o) {
    var aoa = [[o.tag, o.title, o.ver].concat(o.code ? [o.code] : []), o.fields, [], o.labels];
    if (o.section) aoa.push(o.section);
    aoa.push(new Array(o.labels.length + 1).join("-|").split("|").slice(0, o.labels.length + 1));
    var start = aoa.length;
    aoa = aoa.concat(o.rows);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    o.rows.forEach(function (r, ri) {
      r.forEach(function (v, ci) {
        var c = ws[XLSX.utils.encode_cell({ r: start + ri, c: ci })];
        if (!c) return;
        if (o.dates && o.dates.indexOf(ci) !== -1 && typeof v === "number") c.z = "dd-mmm-yy";
        else if (c.t === "n" && (!o.plain || o.plain.indexOf(ci) === -1)) c.z = "#,##0.00";
      });
    });
    ws["!cols"] = o.labels.map(function (l, i) { return { wch: (o.widths && o.widths[i]) || Math.max(12, String(l).length + 2) }; });
    return ws;
  }
  function book(XLSX, sheets) { var wb = XLSX.utils.book_new(); sheets.forEach(function (s) { XLSX.utils.book_append_sheet(wb, s[1], s[0]); }); return wb; }
  var HSN_FIELDS = ["DESCRIPTION", "HSN", "UNITOFMEASURE", "TOTALQUAN", "TAXRATE", "TAXVALUE", "IGST", "CGST", "SGST", "CESS"];
  var HSN_LABELS = ["Description", "HSN", "Unit of measurement", "Total Quantity", "Tax Rate (%)", "Total Taxable Value", "IGST ", "Central Tax ", "State Tax ", "Cess "];
  var hsnRow = function (x) { return ["", x.hsn, "Numbers", x.qty, String(x.rate), r2(x.taxable), r2(x.igst), r2(x.cgst), r2(x.sgst), ""]; };
  var workbooks = {
    b2b: function (XLSX, m) {
      return book(XLSX, [["B2B", utilSheet(XLSX, { tag: "GSTR1_B2B", title: "B2B", ver: 6,
        fields: ["INVOICENO", "CUSTNAME", "GSTIN", "INVDATE", "INVVALUE", "TAXRATE", "TAXVALUE", "IGST", "CGST", "SGST", "CESS", "STATESUPPLY", "REVCHARGE"],
        labels: ["Invoice No.", "Customer Name", "GSTIN", "Invoice Date", "Invoice Value", "Tax Rate(%)", "Taxable value", "IGST", "Central Tax", "State Tax", "Cess", "State of supply", "Reverse Charge"],
        rows: m.b2b.map(function (x) { return [x.invNo, String(x.buyer || "").replace(/[^A-Za-z0-9 &.,()\/-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30), spaced(x.gstin), serial(x.date), r2(x.value), String(x.rate), r2(x.taxable), x.igst ? r2(x.igst) : "", x.cgst ? r2(x.cgst) : "", x.sgst ? r2(x.sgst) : "", "", x.posName, ""]; }),
        dates: [3], widths: [14, 32, 20, 12, 14, 10, 14, 12, 12, 12, 8, 22, 10] })]]);
    },
    b2cs: function (XLSX, m) {
      return book(XLSX, [["B2CS others", utilSheet(XLSX, { tag: "GSTR1_B2CS", title: "B2CS others", ver: 6,
        fields: ["STATESUPPLY", "TAXRATE", "TAXVALUE", "IGST", "CGST", "SGST", "CESS"],
        labels: ["State of supply", "Tax Rate(%)", "Total Taxable value ", "IGST ", "Central Tax ", "State Tax", "Cess"],
        rows: m.b2cs.map(function (x) { return [x.name, String(x.rate), r2(x.taxable), r2(x.igst), r2(x.cgst), r2(x.sgst), ""]; }), widths: [36, 10, 18, 14, 14, 14, 8] })]]);
    },
    docs: function (XLSX, m) {
      var f = ["PARTICULARS", "SINOFROM", "SINOTO", "TOTALCOUNT", "CANCELLED"], l = ["Particulars", "Sl. No. From", "Sl. No. To", "Total count", "Cancelled ", "Net issued"];
      return book(XLSX, [
        ["Documents", utilSheet(XLSX, { tag: "GSTR1_DOC", title: "Documents", ver: 7, code: "5.25.01.*.00.00", fields: f, labels: l, section: ["Nature of document"],
          rows: filedDocs(m).map(function (d) { return [d.nature, d.from, d.to, d.total, d.cancelled, ""]; }), plain: [3, 4], widths: [32, 22, 22, 12, 12, 12] })],
        ["Delivery Challans", utilSheet(XLSX, { tag: "GSTR1_DOC", title: "Delivery Challans", ver: 7, code: "5.25.03.*.00.00", fields: f, labels: l, section: ["Delivery Challan"], rows: [], widths: [32, 22, 22, 12, 12, 12] })]]);
    },
    hsn: function (XLSX, m) {
      return book(XLSX, [
        ["HSN - regd. supplies", utilSheet(XLSX, { tag: "GSTR1_HSN", title: "HSN - regd. supplies", ver: 7, code: "5.23.08.*.00.00", fields: HSN_FIELDS, labels: HSN_LABELS, section: ["Registered Supplies"], rows: m.hsnB2b.map(hsnRow), plain: [3], widths: [14, 12, 18, 14, 12, 18, 14, 14, 14, 8] })],
        ["HSN - Unregd. Supplies, Exports", utilSheet(XLSX, { tag: "GSTR1_HSN", title: "HSN - Unregd. Supplies, Exports", ver: 7, code: "5.23.09.07.*.00", fields: HSN_FIELDS, labels: HSN_LABELS, section: ["Unregistered Supplies / Exports"], rows: m.hsnB2c.map(hsnRow), plain: [3], widths: [14, 12, 18, 14, 12, 18, 14, 14, 14, 8] })]]);
    },
    ecom: function (XLSX, m) {
      var f = ["ECOMOPERATORNAME", "ECOMGSTIN", "NETVALOFSUPPLY", "INTEGRTDTAX", "CENTTAX", "STATETAX", "CESS"], l = ["E-com operator Name", "E-com GSTIN", "Net value of Supply", "IGST", "Central Tax", "State Tax", "Cess"];
      return book(XLSX, [
        ["Supplies liable for TCS sec.52", utilSheet(XLSX, { tag: "GSTR1_EcomSup", title: "Supplies liable for TCS sec.52", ver: 7, code: "7.58.05.*.00.00", fields: f, labels: l, section: ["Supplies liable for TCS u/s 52"],
          rows: m.ecom.map(function (e) { return [e.name, spaced(e.gstin), e.value, e.igst, e.cgst, e.sgst, ""]; }), widths: [22, 20, 18, 14, 14, 14, 8] })],
        ["E-com paid tax under sec.9(5)", utilSheet(XLSX, { tag: "GSTR1_EcomSup", title: "E-com paid tax under sec.9(5)", ver: 7, code: "7.58.11.*.00.00", fields: f, labels: l, section: ["Supplies on which E-com operator pays tax u/s 9(5)", "[Do not include this in prev. tables]"], rows: [], widths: [22, 20, 18, 14, 14, 14, 8] })]]);
    },
    tax: function (XLSX, m) { return taxWorkbook(XLSX, m); }
  };

  function taxWorkbook(XLSX, m) {
    var t = m.tax, sheets = [], money = function (n) { return r2(n); };
    var mk = function (name, aoa, widths) { var ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = (widths || []).map(function (w) { return { wch: w }; }); sheets.push([name, ws]); };
    var fmtPeriod = m.period ? MONTHS[Number(m.period.slice(5, 7)) - 1] + "'" + m.period.slice(2, 4) : "";
    // Input (purchases from GSTR-2B)
    var inp = [["Goods and Services Tax - GSTR-2B · Taxable inward supplies received from registered persons"], [],
      ["GSTIN of supplier", "Trade/Legal name", "Invoice number", "Invoice type", "Invoice Date", "Invoice Value(₹)", "Place of supply", "Reverse Charge", "Taxable Value (₹)", "Integrated Tax(₹)", "Central Tax(₹)", "State/UT Tax(₹)", "ITC Availability"]];
    t.invoices.forEach(function (x) { inp.push([x.gstin, x.name, x.no, x.type, ddmmyyyy(x.date), money(x.value), x.pos, x.rc || "No", money(x.taxable), money(x.igst), money(x.cgst), money(x.sgst), x.itc]); });
    inp.push(["Total", "", "", "", "", money(t.invoices.reduce(function (a, x) { return a + x.value; }, 0)), "", "", t.gross.taxable, t.gross.igst, t.gross.cgst, t.gross.sgst, ""]);
    mk("Input", inp, [18, 30, 18, 10, 12, 14, 14, 10, 16, 16, 14, 14, 12]);
    var cn = [["Debit / Credit notes (from GSTR-2B)"], [], ["GSTIN of supplier", "Trade/Legal name", "Note number", "Note type", "Note date", "Note Value (₹)", "Place of supply", "Taxable Value (₹)", "Integrated Tax(₹)", "Central Tax(₹)", "State/UT Tax(₹)"]];
    t.notes.forEach(function (x) { cn.push([x.gstin, x.name, x.no, x.type, ddmmyyyy(x.date), money(x.value), x.pos, money(x.taxable), money(x.igst), money(x.cgst), money(x.sgst)]); });
    mk("Credit Note", cn, [18, 30, 18, 12, 12, 14, 14, 16, 16, 14, 14]);
    // SALES
    var sales = [["Sales – rate wise (B2CS)"], ["Rate", "Particulars", "Taxable value", "IGST", "CGST", "SGST"]];
    var part = function (kind) { var s = emptyTax(); m.split.filter(function (x) { return x.kind === kind; }).forEach(function (x) { sales.push([x.rate + "%", x.name, x.taxable, x.local ? "" : x.igst, x.local ? x.cgst : "", x.local ? x.sgst : ""]); addTax(s, x); }); sales.push(["", "Total", money(s.taxable), money(s.igst), money(s.cgst), money(s.sgst)]); };
    part("B2CS"); sales.push([], ["Sales – rate wise (B2B)"], ["Rate", "Particulars", "Taxable value", "IGST", "CGST", "SGST"]); part("B2B");
    sales.push([], ["Consolidated"], ["", "Particulars", "Taxable value", "IGST", "CGST", "SGST"], ["", "B2B", m.totals.b2b.taxable, m.totals.b2b.igst, m.totals.b2b.cgst, m.totals.b2b.sgst], ["", "B2CS", m.totals.b2cs.taxable, m.totals.b2cs.igst, m.totals.b2cs.cgst, m.totals.b2cs.sgst], ["", "Total", m.totals.all.taxable, m.totals.all.igst, m.totals.all.cgst, m.totals.all.sgst]);
    var local = m.b2cs.filter(function (x) { return x.state === m.home; }).reduce(addTax, emptyTax()), inter = m.b2cs.filter(function (x) { return x.state !== m.home; }).reduce(addTax, emptyTax());
    sales.push([], ["Sales – state wise (B2CS)"], ["", "Supply", "Taxable value"], ["", "Local", money(local.taxable)], ["", "Inter-state", money(inter.taxable)], ["", "Total", money(local.taxable + inter.taxable)]);
    mk("SALES", sales, [8, 28, 16, 14, 14, 14]);
    // TAX CALCULATION
    var tc = [["Tax calculation · " + (m.company || "") + " · " + fmtPeriod], [], ["PURCHASE"], ["Particulars", "Amount", "IGST", "CGST", "SGST"]];
    if (t.manual) tc.push(["Purchases (entered)", t.net.taxable, t.net.igst, t.net.cgst, t.net.sgst]);
    else tc.push(["As per GSTR-2B invoices", t.gross.taxable, t.gross.igst, t.gross.cgst, t.gross.sgst], ["Less: Credit notes", t.creditNotes.taxable, t.creditNotes.igst, t.creditNotes.cgst, t.creditNotes.sgst], ["Add: Debit notes", t.debitNotes.taxable, t.debitNotes.igst, t.debitNotes.cgst, t.debitNotes.sgst]);
    tc.push(["Net ITC for the month", t.net.taxable, t.net.igst, t.net.cgst, t.net.sgst], [], ["SALES"], ["Particulars", "Amount", "IGST", "CGST", "SGST"], ["Sales (B2B + B2CS)", m.totals.all.taxable, m.totals.all.igst, m.totals.all.cgst, m.totals.all.sgst], [],
      ["SET-OFF", "", "IGST", "CGST", "SGST"], ["ITC opening balance", "", t.opening.i, t.opening.c, t.opening.s], ["ITC for the month", "", t.itc.i, t.itc.c, t.itc.s], ["ITC available", "", t.avail.i, t.avail.c, t.avail.s],
      ["Output tax", "", t.output.i, t.output.c, t.output.s], ["Tax to be paid (rounded)", "", t.pay.i, t.pay.c, t.pay.s],
      ["Adjustment: IGST credit", "", t.used.i.i, t.used.i.c, t.used.i.s], ["Adjustment: CGST credit", "", t.used.c.i, t.used.c.c, t.used.c.s], ["Adjustment: SGST credit", "", t.used.s.i, t.used.s.c, t.used.s.s],
      ["To be paid in cash", "", t.cashPayable.i, t.cashPayable.c, t.cashPayable.s], ["ITC closing balance", "", t.closing.i, t.closing.c, t.closing.s],
      ["Cash ledger balance", "", t.cash.i, t.cash.c, t.cash.s], ["Cash ledger after payment", "", t.cashAfter.i, t.cashAfter.c, t.cashAfter.s], [],
      ["TCS RECONCILIATION", "As per books (B2C + B2B)", "As per operator (GSTR-8)", "Difference"]);
    m.ecom.forEach(function (e) { tc.push([e.name + " – " + e.gstin, e.allValue, e.reported == null ? "" : e.reported, e.diff == null ? "" : e.diff]); });
    mk("TAX CALCULATION", tc, [34, 18, 18, 16, 16]);
    // B2B
    var b = [["Invoice Number", "Invoice Date", "Buyer Name", "GST No.", "Invoice Amount", "Taxable value", "Tax rate", "IGST", "CGST", "SGST", "Place of supply", "Platform"]];
    m.b2b.forEach(function (x) { b.push([x.invNo, ddmmyyyy(x.date), x.buyer, x.gstin, x.value, x.taxable, x.rate, x.igst || "", x.cgst || "", x.sgst || "", x.posName, PLATFORMS[x.platform]]); });
    b.push(["Total", "", "", "", m.b2b.reduce(function (a, x) { return r2(a + x.value); }, 0), m.totals.b2b.taxable, "", m.totals.b2b.igst, m.totals.b2b.cgst, m.totals.b2b.sgst, "", ""]);
    mk("B2B", b, [14, 12, 32, 18, 14, 14, 8, 12, 12, 12, 18, 10]);
    // Company Wise Sales
    var cw = [];
    m.companyWise.forEach(function (p) { cw.push([p.name.toUpperCase()], ["Ship To State", "Taxable value", "IGST", "CGST", "SGST"]); p.rows.forEach(function (x) { cw.push([x.name, x.taxable, x.igst, x.cgst, x.sgst]); }); cw.push(["Total", p.total.taxable, p.total.igst, p.total.cgst, p.total.sgst], []); });
    mk("Company Wise Sales", cw, [36, 16, 14, 14, 14]);
    var cs = [["Ship To State", "Rate", "Taxable value", "IGST", "CGST", "SGST"]];
    m.b2cs.forEach(function (x) { cs.push([x.name, x.rate, x.taxable, x.igst, x.cgst, x.sgst]); });
    cs.push(["Total", "", m.totals.b2cs.taxable, m.totals.b2cs.igst, m.totals.b2cs.cgst, m.totals.b2cs.sgst]);
    mk("conso sales", cs, [36, 8, 16, 14, 14, 14]);
    var hc = [];
    if (m.hsnB2b.length) { hc.push(["B2B"], ["HSN", "Qty", "Taxable value", "IGST", "CGST", "SGST"]); m.hsnB2b.forEach(function (x) { hc.push([x.hsn, x.qty, x.taxable, x.igst, x.cgst, x.sgst]); }); hc.push([]); }
    hc.push(["B2CS"]);
    m.hsnByPlatform.forEach(function (p) { hc.push([p.name.toUpperCase()], ["HSN", "Qty", "Taxable value", "IGST", "CGST", "SGST"]); p.rows.forEach(function (x) { hc.push([x.hsn, x.qty, x.taxable, x.igst, x.cgst, x.sgst]); }); hc.push([]); });
    mk("HSN CODE", hc, [14, 10, 16, 14, 14, 14]);
    var dc = [["Platform", "Nature of document", "Series From", "Series To", "Total", "Cancelled", "Net issued"]];
    filedDocs(m).forEach(function (d) { dc.push([PLATFORMS[d.platform] || "", d.nature, d.from, d.to, d.total, d.cancelled, d.net]); });
    mk("Documents", dc, [12, 30, 22, 22, 10, 10, 10]);
    var ch = [["HSN", "Qty", "Rate", "Taxable value", "IGST", "CGST", "SGST"]];
    m.hsnB2c.forEach(function (x) { ch.push([x.hsn, x.qty, x.rate, x.taxable, x.igst, x.cgst, x.sgst]); });
    mk("conso hsn", ch, [14, 10, 8, 16, 14, 14, 14]);
    return book(XLSX, sheets);
  }

  /* ---------------- Flipkart sample ---------------- */
  // A "Report for GSTR-1 and GSTR-8" filled with the Flipkart figures of the SSS Novelties August working
  // (the Flipkart files that came with it have headers only).
  function flipkartSample(XLSX) {
    var g = "33BQZPN3163K1Z7", fk = "33AACCF0683K1CZ";
    var inter = [["Madhya Pradesh", 1729.9, 86.47], ["Maharashtra", 5978.5, 298.91], ["Andhra Pradesh", 12341.62, 617.05], ["Bihar", 4130.19, 206.49], ["Dadra and Nagar Haveli", 569.11, 28.45],
      ["Jharkhand", 499.47, 24.97], ["Pondicherry", 496.19, 24.81], ["Karnataka", 12170.29, 608.51], ["Delhi", 966.2, 48.3], ["Tripura", -121.12, -6.06], ["Haryana", 425.71, 21.29],
      ["Goa", 855.47, 42.75], ["Chhattisgarh", 770.34, 38.52], ["Assam", 4774.19, 238.74], ["Odisha", 1676.7, 83.82], ["Telangana", 7374.86, 368.75], ["Rajasthan", 314.6, 15.74],
      ["Uttarakhand", 200.54, 10.02], ["Meghalaya", 225.81, 11.29], ["West Bengal", 8752.27, 437.62], ["Uttar Pradesh", 2223.79, 111.21], ["Mizoram", 554.47, 27.73], ["Sikkim", 307.06, 15.36],
      ["Kerala", 43800.78, 2189.88], ["Gujarat", 1387.61, 69.38]];
    var wb = XLSX.utils.book_new(), add = function (name, aoa) { XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name); };
    add("Help", [["Report for GSTR-1 and GSTR-8 Return Filing"], ["Sample rebuilt from the SSS Novelties August 2026 working file."]]);
    add("Section 5B in GSTR-1", [["GSTIN", "Delivered State (PoS)", "Invoice Number", "Invoice Date", "Invoice Amount Rs.", "IGST %", "Taxable Value Rs.", "IGST Amount Rs.", "Cess %", "CESS Amount Rs."]]);
    add("Section 7(A)(2) in GSTR-1", [["GSTIN", "Gross Taxable Value Rs.", "Taxable Sales Return Value Rs.", "Aggregate Taxable Value Rs.", "CGST %", "CGST Amount Rs.", "SGST/UT %", "SGST /UT Amount Rs.", "Cess %", "CESS Amount Rs."],
      [g, 22682.62, 0, 22682.62, 2.5, 567.0655, 2.5, 567.0655, 0, 0]]);
    add("Section 7(B)(2) in GSTR-1", [["GSTIN", "Gross Taxable Value Rs.", "Taxable Sales Return Value Rs.", "Aggregate Taxable Value Rs.", "IGST %", "IGST Amount Rs.", "Cess %", "CESS Amount Rs.", "Delivered State (PoS)", "Delivered State Code"]]
      .concat(inter.map(function (x) { return [g, x[1] > 0 ? x[1] : 0, x[1] < 0 ? -x[1] : 0, x[1], 5, x[2], 0, 0, x[0], Number(stateCode(x[0]))]; })));
    add("Section 13 in GSTR-1", [["GSTIN", "Invoice Series From", "Invoice Series To", "Total Number of Invoices", "Cancelled if any", "Net invoices Issued"], [g, "LWABM4B270001703", "LWABM4B270002367", 665, 0, 665]]);
    add("Section 12 in GSTR-1", [["GSTIN", "HSN Number", "Total Quantity in Nos.", "Total Value Rs.", "Total Taxable Value Rs.", "IGST Amount Rs.", "CGST Amount Rs.", "SGST Amount Rs.", "Cess Rs."], [g, "52083210", 501, 141841.25, 135087.17, 5620, 567.04, 567.04, 0]]);
    add("Section 3 in GSTR-8", [["GSTIN", "Seller ID issued by Flipkart", "GSTIN of Flipkart.Com", "Gross Taxable Value Rs.", "Taxable Sales Return Value Rs.", "Net Taxable Value", "TCS %", "TCS IGST amount Rs.", "TCS CGST amount Rs.", "TCS SGST amount Rs.", "IGST Amount Rs.", "CGST Amount Rs.", "SGST Amount Rs.", "Invoice Qty (Net)"],
      [g, "sssnovelties", fk, 135208.29, 121.12, 135087.17, 0.5, 562.02, 113.41, 113.41, 5620, 567.07, 567.07, 501]]);
    return wb;
  }

  return {
    read: read, build: build, json: json, workbooks: workbooks, flipkartSample: flipkartSample, stateCode: stateCode, stateName: stateName, STATES: STATES,
    PLATFORMS: PLATFORMS, isGstin: isGstin, spaced: spaced, num: num, r2: r2, MONTHS: MONTHS
  };
})();
if (typeof module !== "undefined") module.exports = EcomGst;
