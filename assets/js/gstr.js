/* =========================================================
   Marketplace tax report → GSTR-1 / GSTR-8 figures.

   Reads the Amazon Merchant Tax Report (MTR, B2C and B2B) and
   works out what goes into each GSTR-1 section, the same way the
   accountant's workbook does:
     • 7(A)(2)  B2C intra-state, rate-wise (gross − returns)
     • 7(B)(2)  B2C inter-state, state- and rate-wise
     • 5B       B2C inter-state invoices above ₹2.5 lakh
     • 4A       B2B invoices (when the report has buyer GSTINs)
     • 12       HSN summary (B2C and B2B), with HSN corrections
     • 13       Document series issued / cancelled
     • GSTR-8   TCS collected by the operator
   Every row of the month's report counts — returns of earlier
   months' invoices reduce this month's figures.
   ========================================================= */
var Gstr = (function () {
  var B2CL_LIMIT = 250000;
  var ISO = {
    "Andhra Pradesh": "IN-AP", "Arunachal Pradesh": "IN-AR", "Assam": "IN-AS", "Bihar": "IN-BR", "Chandigarh": "IN-CH", "Chhattisgarh": "IN-CT",
    "Delhi": "IN-DL", "Goa": "IN-GA", "Gujarat": "IN-GJ", "Haryana": "IN-HR", "Himachal Pradesh": "IN-HP", "Jammu and Kashmir": "IN-JK",
    "Jharkhand": "IN-JH", "Karnataka": "IN-KA", "Kerala": "IN-KL", "Ladakh": "IN-LA", "Lakshadweep": "IN-LD", "Madhya Pradesh": "IN-MP",
    "Maharashtra": "IN-MH", "Manipur": "IN-MN", "Meghalaya": "IN-ML", "Mizoram": "IN-MZ", "Nagaland": "IN-NL", "Odisha": "IN-OR",
    "Puducherry": "IN-PY", "Punjab": "IN-PB", "Rajasthan": "IN-RJ", "Sikkim": "IN-SK", "Tamil Nadu": "IN-TN", "Telangana": "IN-TG",
    "Tripura": "IN-TR", "Uttar Pradesh": "IN-UP", "Uttarakhand": "IN-UT", "West Bengal": "IN-WB", "Andaman and Nicobar Islands": "IN-AN",
    "Dadra and Nagar Haveli and Daman and Diu": "IN-DH"
  };
  var CODE_STATE = { "37": "Andhra Pradesh", "12": "Arunachal Pradesh", "18": "Assam", "10": "Bihar", "04": "Chandigarh", "22": "Chhattisgarh", "07": "Delhi", "30": "Goa", "24": "Gujarat", "06": "Haryana", "02": "Himachal Pradesh", "01": "Jammu and Kashmir", "20": "Jharkhand", "29": "Karnataka", "32": "Kerala", "38": "Ladakh", "31": "Lakshadweep", "23": "Madhya Pradesh", "27": "Maharashtra", "14": "Manipur", "17": "Meghalaya", "15": "Mizoram", "13": "Nagaland", "21": "Odisha", "34": "Puducherry", "03": "Punjab", "08": "Rajasthan", "11": "Sikkim", "33": "Tamil Nadu", "36": "Telangana", "16": "Tripura", "09": "Uttar Pradesh", "05": "Uttarakhand", "19": "West Bengal", "35": "Andaman and Nicobar Islands", "26": "Dadra and Nagar Haveli and Daman and Diu" };

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function num(v) { var n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function stateName(s) {
    s = String(s || "").trim().replace(/&/g, "and").replace(/\s+/g, " ");
    if (!s) return "";
    var hit = Object.keys(ISO).filter(function (k) { return k.toLowerCase() === s.toLowerCase(); })[0];
    if (hit) return hit;
    if (/^orissa$/i.test(s)) return "Odisha";
    if (/^pondicherry$/i.test(s)) return "Puducherry";
    return s.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\bAnd\b/g, "and");
  }
  function norm(h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function pick(row, names) {
    for (var i = 0; i < names.length; i++) { var v = row[names[i]]; if (v != null && v !== "") return v; }
    return "";
  }

  /* Accepts objects keyed by the report's own headers; returns normalised keys. */
  function normaliseRows(objs) {
    return objs.map(function (o) { var r = {}; Object.keys(o).forEach(function (k) { r[norm(k)] = o[k]; }); return r; });
  }
  function isMtr(headers) {
    var h = headers.map(norm);
    return h.indexOf("transactiontype") !== -1 && (h.indexOf("taxexclusivegross") !== -1 || h.indexOf("invoiceamount") !== -1) && h.indexOf("shiptostate") !== -1;
  }
  function isB2bReport(headers) {
    var h = headers.map(norm);
    return h.some(function (x) { return /^(customerbilltogstid|buyergstin|customergstin|billtogstin)$/.test(x); });
  }
  function isoDate(v) {
    var s = String(v || "").trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m) { var y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2); }
    return s.slice(0, 10);
  }

  /* ---------------- Parse the MTR ---------------- */
  function parseMtr(objs) {
    return normaliseRows(objs).map(function (r, i) {
      var type = String(pick(r, ["transactiontype"])).trim();
      var igR = num(r.igstrate), cgR = num(r.cgstrate), sgR = num(r.sgstrate) + num(r.utgstrate);
      var rate = r2((igR + cgR + sgR) * (igR + cgR + sgR > 1 ? 1 : 100));
      var tax = r.totaltaxamount !== undefined ? num(r.totaltaxamount)
        : num(r.cgsttax) + num(r.sgsttax) + num(r.utgsttax) + num(r.igsttax) + num(r.shippingcgsttax) + num(r.shippingsgsttax) + num(r.shippingutgsttax) + num(r.shippingigsttax) + num(r.giftwrapcgsttax) + num(r.giftwrapsgsttax) + num(r.giftwraputgsttax) + num(r.giftwrapigsttax) - num(r.itempromotax) - num(r.shippingpromotax) - num(r.giftwrappromotax);
      var inter = igR > 0 || (num(r.igsttax) !== 0 && !num(r.cgsttax));
      return {
        i: i, type: type, invNo: String(pick(r, ["invoicenumber"])).trim(), invDate: isoDate(pick(r, ["invoicedate", "orderdate", "shipmentdate"])),
        orderId: String(pick(r, ["orderid"])).trim(), qty: num(r.quantity), hsnRaw: String(pick(r, ["hsnsac", "hsn", "hsncode"])).trim(),
        sku: String(pick(r, ["sku"])).trim(), desc: String(pick(r, ["itemdescription"])).trim().replace(/\s+/g, " "),
        sellerGstin: String(pick(r, ["sellergstin"])).trim().toUpperCase(),
        fromState: stateName(pick(r, ["billfromstate", "shipfromstate"])), toState: stateName(pick(r, ["shiptostate", "billtostate"])), toCity: String(pick(r, ["shiptocity"])),
        value: num(r.invoiceamount), taxable: num(r.taxexclusivegross), tax: r2(tax), rate: rate, inter: inter,
        igst: inter ? r2(tax) : 0, cgst: inter ? 0 : r2(tax / 2), sgst: inter ? 0 : r2(tax / 2),
        tcsC: num(r.tcscgstamount), tcsS: num(r.tcssgstamount) + num(r.tcsutgstamount), tcsI: num(r.tcsigstamount),
        tcsRate: r2((num(r.tcscgstrate) + num(r.tcssgstrate) + num(r.tcsutgstrate) + num(r.tcsigstrate)) * 100),
        cn: String(pick(r, ["creditnoteno"])).trim(), cnDate: isoDate(pick(r, ["creditnotedate"])),
        buyerGstin: String(pick(r, ["customerbilltogstid", "buyergstin", "customergstin", "billtogstin"])).trim().toUpperCase(),
        buyerName: String(pick(r, ["buyername", "customername", "billtoname"])).trim(), channel: String(pick(r, ["fulfillmentchannel"])).trim()
      };
    });
  }

  /* ---------------- Summarise ---------------- */
  function series(no) { var m = String(no).match(/^(.*?)(\d+)$/); return m ? { prefix: m[1], n: Number(m[2]), width: m[2].length } : null; }
  function fmtNo(prefix, n, width) { var s = String(n); while (s.length < width) s = "0" + s; return prefix + s; }

  function summarize(lines, opts) {
    opts = opts || {};
    var hsnMap = opts.hsnMap || {};
    var gstin = opts.gstin || (lines.filter(function (l) { return l.sellerGstin; })[0] || {}).sellerGstin || "";
    var home = opts.homeState || CODE_STATE[gstin.slice(0, 2)] || (lines[0] || {}).fromState || "";
    var money = lines.filter(function (l) { return l.taxable || l.tax || l.value; });

    var counts = {};
    lines.forEach(function (l) { counts[l.type] = (counts[l.type] || 0) + 1; });
    var tot = { taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0, tcsC: 0, tcsS: 0, tcsI: 0, qtyShipped: 0, qtyReturned: 0, grossTaxable: 0, returnsTaxable: 0 };
    money.forEach(function (l) {
      tot.taxable += l.taxable; tot.igst += l.igst; tot.cgst += l.cgst; tot.sgst += l.sgst; tot.value += l.value;
      tot.tcsC += l.tcsC; tot.tcsS += l.tcsS; tot.tcsI += l.tcsI;
      if (l.taxable >= 0) tot.grossTaxable += l.taxable; else tot.returnsTaxable -= l.taxable;
    });
    lines.forEach(function (l) { if (l.type === "Shipment") tot.qtyShipped += l.qty; if (l.type === "Refund") tot.qtyReturned += l.qty; });
    Object.keys(tot).forEach(function (k) { tot[k] = r2(tot[k]); });

    var isLocal = function (l) { return !l.inter && (l.toState || "").toLowerCase() === (home || l.fromState || "").toLowerCase(); };
    var b2c = money.filter(function (l) { return !l.buyerGstin; }), b2bLines = money.filter(function (l) { return l.buyerGstin; });

    // 5B: inter-state B2C invoices above ₹2.5 lakh (by invoice).
    var invTotals = {};
    b2c.forEach(function (l) { if (!isLocal(l) && l.invNo && l.type === "Shipment") invTotals[l.invNo] = (invTotals[l.invNo] || 0) + l.value; });
    var largeInv = Object.keys(invTotals).filter(function (k) { return invTotals[k] > B2CL_LIMIT; });
    var b2cl = {};
    b2c.forEach(function (l) {
      if (largeInv.indexOf(l.invNo) === -1 || isLocal(l)) return;
      var k = l.invNo + "|" + l.rate;
      var x = b2cl[k] = b2cl[k] || { invNo: l.invNo, date: l.invDate, state: l.toState, code: ISO[l.toState] || "", rate: l.rate, value: 0, taxable: 0, igst: 0 };
      x.value += l.value; x.taxable += l.taxable; x.igst += l.igst;
    });

    var local = {}, inter = {};
    b2c.forEach(function (l) {
      if (largeInv.indexOf(l.invNo) !== -1 && !isLocal(l) && l.type === "Shipment") return;
      if (isLocal(l)) {
        var a = local[l.rate] = local[l.rate] || { rate: l.rate, gross: 0, returns: 0, cgst: 0, sgst: 0, value: 0 };
        if (l.taxable >= 0) a.gross += l.taxable; else a.returns -= l.taxable;
        a.cgst += l.cgst; a.sgst += l.sgst; a.value += l.value;
      } else {
        var k = l.toState + "|" + l.rate;
        var b = inter[k] = inter[k] || { state: l.toState, code: ISO[l.toState] || "", rate: l.rate, gross: 0, returns: 0, igst: 0, value: 0 };
        if (l.taxable >= 0) b.gross += l.taxable; else b.returns -= l.taxable;
        b.igst += l.igst; b.value += l.value;
      }
    });
    var fin = function (o) { Object.keys(o).forEach(function (k) { if (typeof o[k] === "number" && k !== "rate") o[k] = r2(o[k]); }); if ("gross" in o) o.net = r2(o.gross - o.returns); return o; };
    var b2csLocal = Object.keys(local).map(function (k) { return fin(local[k]); }).sort(function (a, b) { return a.rate - b.rate; });
    var b2csInter = Object.keys(inter).map(function (k) { return fin(inter[k]); }).sort(function (a, b) { return a.state.localeCompare(b.state) || a.rate - b.rate; });

    // B2B invoices and notes.
    var b2b = {}, b2bNotes = [];
    b2bLines.forEach(function (l) {
      if (l.taxable < 0) { b2bNotes.push({ cn: l.cn || l.invNo, date: l.cnDate || l.invDate, against: l.invNo, buyer: l.buyerName, gstin: l.buyerGstin, state: l.toState, rate: l.rate, taxable: -l.taxable, igst: -l.igst, cgst: -l.cgst, sgst: -l.sgst, value: -l.value }); return; }
      var k = l.invNo + "|" + l.rate;
      var x = b2b[k] = b2b[k] || { invNo: l.invNo, date: l.invDate, buyer: l.buyerName, gstin: l.buyerGstin, state: l.toState, rate: l.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0 };
      x.taxable += l.taxable; x.igst += l.igst; x.cgst += l.cgst; x.sgst += l.sgst; x.value += l.value;
    });

    // HSN (Table 12): value net of returns; quantity = shipped quantity, as in the workbook.
    function hsnTable(set) {
      var h = {};
      set.forEach(function (l) {
        var code = hsnMap[l.hsnRaw] || l.hsnRaw || "(blank)";
        var x = h[code] = h[code] || { hsn: code, from: [], desc: l.desc, uqc: "NOS", qty: 0, qtyReturned: 0, value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, rates: {} };
        if (l.hsnRaw && l.hsnRaw !== code && x.from.indexOf(l.hsnRaw) === -1) x.from.push(l.hsnRaw);
        if (l.type === "Shipment") x.qty += l.qty; if (l.type === "Refund") x.qtyReturned += l.qty;
        x.value += l.value; x.taxable += l.taxable; x.igst += l.igst; x.cgst += l.cgst; x.sgst += l.sgst;
        if (l.rate) x.rates[l.rate] = 1;
        if (!x.desc && l.desc) x.desc = l.desc;
      });
      return Object.keys(h).sort().map(function (k) { var x = fin(h[k]); x.rate = Object.keys(x.rates).map(Number).join(", "); delete x.rates; return x; });
    }
    var hsnRaw = {};
    lines.forEach(function (l) { if (l.hsnRaw) hsnRaw[l.hsnRaw] = (hsnRaw[l.hsnRaw] || 0) + 1; });

    // Table 13: document series.
    var invPrefixes = {};
    lines.forEach(function (l) { if ((l.type === "Shipment" || l.type === "FreeReplacement") && series(l.invNo)) invPrefixes[series(l.invNo).prefix] = 1; });
    var issued = {}, cancelledNos = {}, cnNos = {};
    lines.forEach(function (l) {
      var s = series(l.invNo);
      if (l.type === "Shipment" || l.type === "FreeReplacement") { if (s) issued[l.invNo] = s; }
      else if (l.type === "Cancel" && s) { if (invPrefixes[s.prefix]) cancelledNos[l.invNo] = s; else cnNos[l.invNo] = s; }
      if (l.cn && series(l.cn)) cnNos[l.cn] = series(l.cn);
    });
    Object.keys(issued).forEach(function (k) { delete cancelledNos[k]; });
    function seriesRows(map, cancelled, label) {
      var by = {};
      Object.keys(map).concat(Object.keys(cancelled || {})).forEach(function (no) {
        var s = map[no] || cancelled[no];
        var g = by[s.prefix] = by[s.prefix] || { nature: label, prefix: s.prefix, width: s.width, min: Infinity, max: -Infinity, present: {} };
        g.min = Math.min(g.min, s.n); g.max = Math.max(g.max, s.n); g.present[s.n] = no; g.width = Math.min(g.width, s.width);
      });
      return Object.keys(by).map(function (p) {
        var g = by[p], canc = Object.keys(cancelled || {}).filter(function (no) { return series(no).prefix === p; }), missing = [];
        for (var n = g.min; n <= g.max; n++) if (!g.present[n]) missing.push(fmtNo(p, n, g.width));
        var total = g.max - g.min + 1;
        return { nature: label, from: g.present[g.min], to: g.present[g.max], total: total, cancelled: canc.length, net: total - canc.length, cancelledNos: canc, missing: missing };
      });
    }
    var docs = seriesRows(issued, cancelledNos, "Invoices for outward supply").concat(seriesRows(cnNos, null, "Credit Note"));
    var preInvoiceCancels = lines.filter(function (l) { return l.type === "Cancel" && !l.invNo; }).length;

    // State-wise and rate-wise views (as in the workbook's "State wise" and "SALES" sheets).
    var st = {};
    money.forEach(function (l) {
      var x = st[l.toState] = st[l.toState] || { state: l.toState, local: isLocal(l), value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      x.value += l.value; x.taxable += l.taxable; x.igst += l.igst; x.cgst += l.cgst; x.sgst += l.sgst;
    });
    var stateWise = Object.keys(st).map(function (k) { return fin(st[k]); }).sort(function (a, b) { return (b.local - a.local) || a.state.localeCompare(b.state); });
    var rw = {};
    money.forEach(function (l) {
      var kind = l.buyerGstin ? "B2B" : "B2CS";
      var x = rw[kind + "|" + l.rate] = rw[kind + "|" + l.rate] || { kind: kind, rate: l.rate, localTaxable: 0, cgst: 0, sgst: 0, interTaxable: 0, igst: 0 };
      if (isLocal(l)) { x.localTaxable += l.taxable; x.cgst += l.cgst; x.sgst += l.sgst; } else { x.interTaxable += l.taxable; x.igst += l.igst; }
    });
    var rateWise = Object.keys(rw).map(function (k) { return fin(rw[k]); }).sort(function (a, b) { return a.kind.localeCompare(b.kind) || a.rate - b.rate; });

    var tcsRate = (money.filter(function (l) { return l.tcsRate; })[0] || {}).tcsRate || 0;
    var months = {};
    lines.forEach(function (l) { if (l.type === "Shipment" && l.invDate) months[l.invDate.slice(0, 7)] = (months[l.invDate.slice(0, 7)] || 0) + 1; });
    var period = Object.keys(months).sort(function (a, b) { return months[b] - months[a]; })[0] || "";

    return {
      gstin: gstin, homeState: home, period: period, counts: counts, totals: tot,
      b2csLocal: b2csLocal, b2csInter: b2csInter, b2cl: Object.keys(b2cl).map(function (k) { return fin(b2cl[k]); }),
      b2b: Object.keys(b2b).map(function (k) { return fin(b2b[k]); }), b2bNotes: b2bNotes.map(fin),
      hsnB2c: hsnTable(b2c), hsnB2b: hsnTable(b2bLines), hsnCodes: hsnRaw,
      docs: docs, preInvoiceCancels: preInvoiceCancels,
      stateWise: stateWise, rateWise: rateWise,
      tcs: { rate: tcsRate, gross: tot.grossTaxable, returns: tot.returnsTaxable, net: r2(tot.grossTaxable - tot.returnsTaxable), igst: tot.tcsI, cgst: tot.tcsC, sgst: tot.tcsS, total: r2(tot.tcsI + tot.tcsC + tot.tcsS), qtyNet: tot.qtyShipped - tot.qtyReturned },
      outOfPeriod: lines.filter(function (l) { return l.invDate && period && l.invDate.slice(0, 7) !== period && (l.taxable || l.value); }).map(function (l) { return { type: l.type, invNo: l.invNo, date: l.invDate, cn: l.cn, taxable: l.taxable }; })
    };
  }

  /* ---------------- Workbook in the GSTR-1 / GSTR-8 report layout ---------------- */
  function workbook(XLSX, s, opts) {
    opts = opts || {};
    var wb = XLSX.utils.book_new(), g = s.gstin;
    function sheet(name, header, rows, widths) {
      var ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
      ws["!cols"] = header.map(function (h, i) { return { wch: (widths && widths[i]) || Math.max(12, Math.min(34, String(h).length + 2)) }; });
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    sheet("Help", ["Return Name", "Return Due date", "Section", "Sheet Name", "Reporting Purpose"], [
      ["GSTR-1", "11th of next month", "5B", "Section 5B in GSTR-1", "B2C inter-state sales — only invoices above Rs. 2.5 lakh each."],
      ["GSTR-1", "11th of next month", "7(A)(2)", "Section 7(A)(2) in GSTR-1", "All intra-state (local) B2C supplies of goods."],
      ["GSTR-1", "11th of next month", "7(B)(2)", "Section 7(B)(2) in GSTR-1", "All inter-state B2C supplies, excluding invoices above Rs. 2.5 lakh."],
      ["GSTR-1", "11th of next month", "4A", "B2B in GSTR-1", "Invoices to registered buyers (from the B2B report)."],
      ["GSTR-1", "11th of next month", "13", "Section 13 in GSTR-1", "Invoice and credit note series issued through " + (opts.platform || "the marketplace") + "."],
      ["GSTR-1", "11th of next month", "12", "Section 12 in GSTR-1", "HSN-wise summary of B2C supplies (B2B in 'HSN B2B')."],
      ["GSTR-1", "11th of next month", "10A(1)/10B(1)", "Section 10A(1) / 10B(1) in GSTR-1", "Amendments of earlier periods' B2C figures."],
      ["GSTR-8", "10th of next month", "3", "Section 3 in GSTR-8", "TCS collected by the operator — appears in your TCS credit (GSTR-2A Part C)."],
      ["", "", "", "Report period", s.period + " · " + (opts.platform || "") + " · " + (opts.file || "")]
    ], [12, 18, 12, 32, 90]);
    sheet("Section 5B in GSTR-1", ["GSTIN", "Delivered State (PoS)", "Invoice Number", "Invoice Date", "Invoice Amount Rs.", "IGST %", "Taxable Value Rs.", "IGST Amount Rs.", "Cess %", "CESS Amount Rs."],
      s.b2cl.map(function (x) { return [g, x.state, x.invNo, x.date, x.value, x.rate, x.taxable, x.igst, 0, 0]; }));
    sheet("Section 7(A)(2) in GSTR-1", ["GSTIN", "Gross Taxable Value Rs.", "Taxable Sales Return Value Rs.", "Aggregate Taxable Value Rs.", "CGST %", "CGST Amount Rs.", "SGST/UT %", "SGST /UT Amount Rs.", "Cess %", "CESS Amount Rs."],
      s.b2csLocal.map(function (x) { return [g, x.gross, x.returns, x.net, x.rate / 2, x.cgst, x.rate / 2, x.sgst, 0, 0]; }));
    sheet("Section 7(B)(2) in GSTR-1", ["GSTIN", "Gross Taxable Value Rs.", "Taxable Sales Return Value Rs.", "Aggregate Taxable Value Rs.", "IGST %", "IGST Amount Rs.", "Cess %", "CESS Amount Rs.", "Delivered State (PoS)", "Delivered State Code"],
      s.b2csInter.map(function (x) { return [g, x.gross, x.returns, x.net, x.rate, x.igst, 0, 0, x.state, x.code]; }));
    sheet("B2B in GSTR-1", ["GSTIN", "Buyer GSTIN", "Buyer Name", "Invoice Number", "Invoice Date", "Invoice Value Rs.", "Place Of Supply", "Rate %", "Taxable Value Rs.", "IGST Amount Rs.", "CGST Amount Rs.", "SGST Amount Rs."],
      s.b2b.map(function (x) { return [g, x.gstin, x.buyer, x.invNo, x.date, x.value, x.state, x.rate, x.taxable, x.igst, x.cgst, x.sgst]; }));
    sheet("Section 13 in GSTR-1", ["GSTIN", "Nature of Document", "Invoice Series From", "Invoice Series To", "Total Number of Invoices", "Cancelled if any", "Net invoices Issued"],
      s.docs.map(function (x) { return [g, x.nature, x.from, x.to, x.total, x.cancelled, x.net]; }));
    sheet("Section 12 in GSTR-1", ["GSTIN", "HSN Number", "Description", "UQC", "Total Quantity in Nos.", "Total Value Rs.", "Rate %", "Total Taxable Value Rs.", "IGST Amount Rs.", "CGST Amount Rs.", "SGST Amount Rs.", "Cess Rs."],
      s.hsnB2c.map(function (x) { return [g, x.hsn, x.desc.slice(0, 60), x.uqc, x.qty, x.value, x.rate, x.taxable, x.igst, x.cgst, x.sgst, 0]; }));
    if (s.hsnB2b.length) sheet("HSN B2B", ["GSTIN", "HSN Number", "Description", "UQC", "Total Quantity in Nos.", "Total Value Rs.", "Rate %", "Total Taxable Value Rs.", "IGST Amount Rs.", "CGST Amount Rs.", "SGST Amount Rs.", "Cess Rs."],
      s.hsnB2b.map(function (x) { return [g, x.hsn, x.desc.slice(0, 60), x.uqc, x.qty, x.value, x.rate, x.taxable, x.igst, x.cgst, x.sgst, 0]; }));
    sheet("Section 3 in GSTR-8", ["GSTIN", "Seller ID issued by " + (opts.platform || "Operator"), "GSTIN of " + (opts.platform || "Operator"), "Gross Taxable Value Rs.", "Taxable Sales Return Value Rs.", "Net Taxable Value", "TCS %", "TCS IGST amount Rs.", "TCS CGST amount Rs.", "TCS SGST amount Rs.", "IGST Amount Rs.", "CGST Amount Rs.", "SGST Amount Rs.", "Invoice Qty (Net)"],
      [[g, opts.sellerId || "", opts.operatorGstin || "", s.tcs.gross, s.tcs.returns, s.tcs.net, s.tcs.rate, s.tcs.igst, s.tcs.cgst, s.tcs.sgst, s.totals.igst, s.totals.cgst, s.totals.sgst, s.tcs.qtyNet]]);
    sheet("Section 10A(1) in GSTR-1", ["GSTIN", "Taxable Value Rs.", "CGST %", "CGST Amount Rs.", "SGST/UT %", "SGST /UT Amount Rs.", "CESS Amount Rs.", "Amended Period"], []);
    sheet("Section 10B(1) in GSTR-1", ["GSTIN", "Aggregate Taxable Value Rs.", "IGST %", "IGST Amount Rs.", "CESS Amount Rs.", "Delivered State (PoS)", "Delivered State Code", "Amended Period"], []);
    sheet("State wise", ["Ship To State", "Invoice Amount", "Tax Exclusive Gross", "IGST", "CGST", "SGST"],
      s.stateWise.map(function (x) { return [x.state + (x.local ? " (local)" : ""), x.value, x.taxable, x.igst, x.cgst, x.sgst]; }).concat([["Total", s.totals.value, s.totals.taxable, s.totals.igst, s.totals.cgst, s.totals.sgst]]));
    sheet("Rate wise", ["Particulars", "Rate %", "Local Taxable Value", "CGST", "SGST", "Inter-state Taxable Value", "IGST"],
      s.rateWise.map(function (x) { return [(opts.platform || "") + " " + x.kind, x.rate, x.localTaxable, x.cgst, x.sgst, x.interTaxable, x.igst]; }));
    return wb;
  }

  return { isMtr: isMtr, isB2bReport: isB2bReport, parseMtr: parseMtr, summarize: summarize, workbook: workbook, stateName: stateName, ISO: ISO, B2CL_LIMIT: B2CL_LIMIT };
})();
