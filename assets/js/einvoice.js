/* =========================================================
   e-Invoice (IRP) JSON — built and checked to the NIC
   "e-Invoice Bulk Generation Tool, Format A" documentation:
   JSON schema v1.1, the Validation sheet and the Calculations
   sheet. Also reads Format A sheets (.xlsm / .xlsx) into JSON.
   ========================================================= */
var EInvoice = (function () {
  var VERSION = "1.1";

  /* ---------------- Masters (from the tool's "Master Codes" sheet) ---------------- */
  var STATE_CODES = {
    "ANDHRA PRADESH": "37", "ARUNACHAL PRADESH": "12", "ASSAM": "18", "BIHAR": "10", "CHANDIGARH": "04", "CHHATTISGARH": "22",
    "DADRA AND NAGAR HAVELI": "26", "DAMAN AND DIU": "26", "DELHI": "07", "GOA": "30", "GUJARAT": "24", "HARYANA": "06", "HIMACHAL PRADESH": "02",
    "JAMMU AND KASHMIR": "01", "JHARKHAND": "20", "KARNATAKA": "29", "KERALA": "32", "LAKSHADWEEP": "31", "LADAKH": "38",
    "MADHYA PRADESH": "23", "MAHARASHTRA": "27", "MANIPUR": "14", "MEGHALAYA": "17", "MIZORAM": "15", "NAGALAND": "13",
    "ODISHA": "21", "ORISSA": "21", "PUDUCHERRY": "34", "PONDICHERRY": "34", "PUNJAB": "03", "RAJASTHAN": "08", "SIKKIM": "11",
    "TAMIL NADU": "33", "TELANGANA": "36", "TRIPURA": "16", "UTTAR PRADESH": "09", "UTTARAKHAND": "05", "WEST BENGAL": "19",
    "ANDAMAN AND NICOBAR": "35", "OTHER TERRITORY": "97", "OTHER COUNTRIES": "96"
  };
  var UQC = {
    BAG: "BAGS", BAL: "BALE", BDL: "BUNDLES", BKL: "BUCKLES", BOU: "BILLION OF UNITS", BOX: "BOX", BTL: "BOTTLES", BUN: "BUNCHES", CAN: "CANS",
    CBM: "CUBIC METERS", CCM: "CUBIC CENTIMETERS", CMS: "CENTIMETERS", CTN: "CARTONS", DOZ: "DOZENS", DRM: "DRUMS", GGK: "GREAT GROSS",
    GMS: "GRAMMES", GRS: "GROSS", GYD: "GROSS YARDS", KGS: "KILOGRAMS", KLR: "KILOLITRE", KME: "KILOMETRE", LTR: "LITRES", MLT: "MILILITRE",
    MTR: "METERS", MTS: "METRIC TON", NOS: "NUMBERS", OTH: "OTHERS", PAC: "PACKS", PCS: "PIECES", PRS: "PAIRS", QTL: "QUINTAL", ROL: "ROLLS",
    SET: "SETS", SQF: "SQUARE FEET", SQM: "SQUARE METERS", SQY: "SQUARE YARDS", TBS: "TABLETS", TGM: "TEN GROSS", THD: "THOUSANDS",
    TON: "TONNES", TUB: "TUBES", UGS: "US GALLONS", UNT: "UNITS", YDS: "YARDS"
  };
  // Units used in this app → UQC.
  var UNIT_ALIAS = { BAG: "BAG", BAGS: "BAG", TIN: "CAN", SET: "SET", BOX: "BOX", PKT: "PAC", PACK: "PAC", NOS: "NOS", NO: "NOS", PCS: "PCS", PC: "PCS", KG: "KGS", KGS: "KGS", LTR: "LTR", L: "LTR", MTR: "MTR", DOZ: "DOZ" };
  var RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];
  var SUPPLY_TYPES = ["B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"];
  var DOC_TYPES = { "TAX INVOICE": "INV", "INVOICE": "INV", INV: "INV", "CREDIT NOTE": "CRN", CRN: "CRN", "DEBIT NOTE": "DBN", DBN: "DBN" };
  // First two PIN digits by state (postal circles) — rule 20 falls back to this pattern.
  var PIN_PREFIX = {
    "07": [11], "06": [12, 13], "03": [14, 15, 16], "04": [16], "02": [17], "01": [18, 19], "38": [19], "09": [20, 21, 22, 23, 24, 25, 26, 27, 28],
    "05": [24, 26], "08": [30, 31, 32, 33, 34], "24": [36, 37, 38, 39], "26": [36, 39], "27": [40, 41, 42, 43, 44], "30": [40],
    "23": [45, 46, 47, 48], "22": [49], "36": [50], "37": [50, 51, 52, 53], "29": [56, 57, 58, 59], "33": [60, 61, 62, 63, 64],
    "34": [53, 60, 67], "32": [67, 68, 69], "31": [68], "19": [70, 71, 72, 73, 74], "11": [73], "35": [74], "21": [75, 76, 77],
    "18": [78], "12": [79], "13": [79], "14": [79], "15": [79], "16": [79], "17": [79], "10": [80, 81, 82, 83, 84, 85], "20": [81, 82, 83, 92]
  };

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function stateCode(name) {
    if (!name) return "";
    var s = String(name).trim();
    if (/^\d{1,2}$/.test(s)) return ("0" + s).slice(-2);
    return STATE_CODES[s.toUpperCase().replace(/&/g, "AND").replace(/\s+/g, " ")] || "";
  }
  function stateName(code) { var k = Object.keys(STATE_CODES).filter(function (n) { return STATE_CODES[n] === code; })[0]; return k ? k.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\bAnd\b/g, "and") : ""; }
  function uqc(unit) {
    var u = String(unit || "").trim().toUpperCase();
    if (UQC[u]) return u;
    if (UNIT_ALIAS[u]) return UNIT_ALIAS[u];
    var byName = Object.keys(UQC).filter(function (k) { return UQC[k] === u; })[0];
    return byName || "";
  }
  function ddmmyyyy(iso) { var p = String(iso).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso); }
  function isoFromDdmm(s) {
    var m = String(s || "").trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2) : "";
  }
  function fyOf(iso) { var y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); var s = m >= 4 ? y : y - 1; return s + "-" + String(s + 1).slice(2); }
  function clean(s) { return String(s == null ? "" : s).replace(/["\\]/g, "").replace(/\s+/g, " ").trim(); }
  function drop(o) { Object.keys(o).forEach(function (k) { if (o[k] === "" || o[k] == null) delete o[k]; }); return o; }

  /* ---------------- Build: app invoice → IRP JSON ----------------
     seller: tenant { gstin, companyName, addr1, addr2, location, pin, state, contactNumber, email }
     buyer:  { gstin, name, addr1, addr2, location, pin, state, phone, email }
     doc:    { number, date (yyyy-mm-dd), items[{ name, hsn, qty, rate, gst, unit, discount }], partyState, typ } */
  function build(doc, seller, buyer, opts) {
    opts = opts || {};
    var sellerSt = stateCode(seller.state) || String(seller.gstin || "").slice(0, 2);
    var pos = stateCode(doc.partyState || buyer.state) || String(buyer.gstin || "").slice(0, 2);
    var igstIntra = opts.igstOnIntra === true;
    var inter = igstIntra || sellerSt !== pos;
    var items = (doc.items || []).map(function (it, i) {
      var qty = Number(it.qty) || 0, price = Number(it.rate) || 0, rt = Number(it.gst) || 0;
      var tot = it.totAmt != null ? r2(it.totAmt) : r2(qty * price), disc = r2(it.discount || 0);
      var ass = it.assAmt != null ? r2(it.assAmt) : r2(tot - disc);
      var igst = it.igst != null ? r2(it.igst) : inter ? r2(ass * rt / 100) : 0;
      var cgst = it.cgst != null ? r2(it.cgst) : inter ? 0 : r2(ass * rt / 200);
      var sgst = it.sgst != null ? r2(it.sgst) : inter ? 0 : r2(ass * rt / 200);
      var hsn = String(it.hsn || "").replace(/\D/g, "");
      var service = it.isService != null ? it.isService : /^99/.test(hsn);
      var item = drop({
        SlNo: String(it.slNo || i + 1), PrdDesc: clean(it.name).length >= 3 ? clean(it.name).slice(0, 300) : "", IsServc: service ? "Y" : "N", HsnCd: hsn,
        Qty: qty || (service ? undefined : 0), FreeQty: it.freeQty ? Number(it.freeQty) : undefined, Unit: service && !it.unit ? undefined : uqc(it.unit) || String(it.unit || "").toUpperCase(),
        UnitPrice: Math.round(price * 1000) / 1000, TotAmt: tot, Discount: disc || undefined, AssAmt: ass, GstRt: rt,
        IgstAmt: igst, CgstAmt: cgst, SgstAmt: sgst, CesRt: it.cesRt || undefined, CesAmt: it.cesAmt || undefined, OthChrg: it.othChrg || undefined
      });
      item.TotItemVal = it.totItemVal != null ? r2(it.totItemVal) : r2(ass + igst + cgst + sgst + (Number(it.cesAmt) || 0) + (Number(it.othChrg) || 0));
      return item;
    });
    var sum = function (k) { return r2(items.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0)); };
    var itemsTotal = sum("TotItemVal");
    var invDisc = r2(opts.discount || 0), invOth = r2(opts.othChrg || 0);
    var target = opts.totInvVal != null ? r2(opts.totInvVal) : Math.round(itemsTotal - invDisc + invOth);
    var rnd = r2(target - (itemsTotal - invDisc + invOth));
    var json = {
      Version: VERSION,
      TranDtls: drop({ TaxSch: "GST", SupTyp: opts.supTyp || "B2B", RegRev: opts.regRev ? "Y" : "N", EcmGstin: opts.ecmGstin || "", IgstOnIntra: igstIntra ? "Y" : "N" }),
      DocDtls: { Typ: doc.typ || "INV", No: String(doc.number || ""), Dt: ddmmyyyy(doc.date) },
      SellerDtls: drop({
        Gstin: String(seller.gstin || "").toUpperCase(), LglNm: clean(seller.companyName), TrdNm: clean(seller.tradeName),
        Addr1: clean(seller.addr1), Addr2: clean(seller.addr2), Loc: clean(seller.location), Pin: seller.pin ? Number(seller.pin) : "",
        Stcd: sellerSt, Ph: String(seller.contactNumber || "").replace(/\D/g, ""), Em: seller.email || ""
      }),
      BuyerDtls: drop({
        Gstin: String(buyer.gstin || "").toUpperCase(), LglNm: clean(buyer.name), TrdNm: clean(buyer.tradeName), Pos: pos,
        Addr1: clean(buyer.addr1), Addr2: clean(buyer.addr2), Loc: clean(buyer.location), Pin: buyer.pin ? Number(buyer.pin) : "",
        Stcd: stateCode(buyer.state) || String(buyer.gstin || "").slice(0, 2), Ph: String(buyer.phone || "").replace(/\D/g, ""), Em: buyer.email || ""
      }),
      ItemList: items,
      ValDtls: drop({
        AssVal: sum("AssAmt"), CgstVal: sum("CgstAmt"), SgstVal: sum("SgstAmt"), IgstVal: sum("IgstAmt"), CesVal: sum("CesAmt") || undefined,
        Discount: invDisc || undefined, OthChrg: invOth || undefined, RndOffAmt: rnd || undefined, TotInvVal: target
      })
    };
    if (opts.ewb && opts.ewb.distance != null) {
      var e = opts.ewb, mode = { Road: "1", Rail: "2", Air: "3", Ship: "4" }[e.mode] || "1";
      json.EwbDtls = drop({ TransId: e.transporterId || "", TransName: e.transporter || "", TransMode: mode, Distance: Number(e.distance) || 0,
        VehNo: mode === "1" ? e.vehicleNo || "" : "", VehType: mode === "1" ? (e.vehicleType && e.vehicleType !== "Regular" ? "O" : "R") : "" });
    }
    return json;
  }

  /* ---------------- Validate (Validation + Calculations sheets) ----------------
     ctx: { issued: [{ typ, no, fy, status }] } — IRNs already on record, for the duplicate rules.
     Returns [{ section, field, msg }]. */
  function tolerance(calc, passed) { var lo = Math.floor(calc) - 1, hi = Math.ceil(calc) + 1; return passed >= lo - 0.0001 && passed <= hi + 0.0001; }
  var TEXT_RE = /^[^"\\]*$/;
  var LABELS = { LglNm: "Legal name", TrdNm: "Trade name", Addr1: "Address line 1", Addr2: "Address line 2", Loc: "City / location", PrdDesc: "Product description" };
  function validate(j, ctx) {
    ctx = ctx || {};
    var out = [];
    function bad(section, field, msg) { out.push({ section: section, field: field, msg: msg }); }
    function text(section, field, v, min, max, required) {
      if (v == null || v === "") { if (required) bad(section, field, (LABELS[field] || field) + " is required."); return; }
      v = String(v);
      if (v.length < min || v.length > max) bad(section, field, (LABELS[field] || field) + " must be " + min + "–" + max + " characters.");
      if (!TEXT_RE.test(v)) bad(section, field, (LABELS[field] || field) + " can't contain \" or \\.");
    }
    var GSTIN_RE = /^[0-9]{2}[0-9A-Z]{13}$/;

    if (j.Version !== VERSION) bad("Header", "Version", "Version must be " + VERSION + ".");
    if (j.Irn) bad("Header", "Irn", "IRN must not be sent in the request; the IRP generates it.");

    var t = j.TranDtls || {};
    if (t.TaxSch !== "GST") bad("Transaction", "TaxSch", "Tax scheme must be GST.");
    if (SUPPLY_TYPES.indexOf(String(t.SupTyp || "").toUpperCase()) === -1) bad("Transaction", "SupTyp", "Supply type must be one of " + SUPPLY_TYPES.join(", ") + " (B2C invoices don't get an IRN).");
    if (t.RegRev === "Y" && ["B2B", "SEZWP", "SEZWOP"].indexOf(t.SupTyp) === -1) bad("Transaction", "RegRev", "Reverse charge applies only to B2B and SEZ invoices.");
    if (t.EcmGstin && !GSTIN_RE.test(t.EcmGstin)) bad("Transaction", "EcmGstin", "e-Commerce GSTIN is not in the GSTIN format.");

    var d = j.DocDtls || {};
    if (!DOC_TYPES[String(d.Typ || "").toUpperCase()]) bad("Document", "Typ", "Document type must be INV, CRN or DBN.");
    if (!/^([a-zA-Z1-9]{1}[a-zA-Z0-9\/-]{0,15})$/.test(d.No || "")) bad("Document", "No", "Document number must be 1–16 letters, digits, / or -, and can't start with 0, / or -.");
    var iso = isoFromDdmm(d.Dt);
    if (!/^[0-3][0-9]\/[0-1][0-9]\/20[1-2][0-9]$/.test(d.Dt || "") || !iso) bad("Document", "Dt", "Document date must be DD/MM/YYYY.");
    else {
      if (iso < "2020-10-01") bad("Document", "Dt", "Documents dated before 01/10/2020 are not accepted.");
      if (iso > new Date().toISOString().slice(0, 10)) bad("Document", "Dt", "Document date can't be in the future.");
      var fy = fyOf(iso), typ = DOC_TYPES[String(d.Typ || "").toUpperCase()];
      (ctx.issued || []).forEach(function (x) {
        if (x.typ === typ && String(x.no).toUpperCase() === String(d.No).toUpperCase() && x.fy === fy)
          bad("Document", "No", x.status === "Cancelled" ? "An IRN for " + d.No + " was cancelled; it can't be generated again for this financial year." : "An IRN already exists for " + typ + " " + d.No + " in FY " + fy + ".");
      });
    }

    function party(section, p, isBuyer) {
      p = p || {};
      var g = String(p.Gstin || "");
      var exp = isBuyer && /^EXP/.test(t.SupTyp || "");
      if (exp) { if (g !== "URP") bad(section, "Gstin", "For exports the buyer GSTIN must be URP."); }
      else if (!GSTIN_RE.test(g)) bad(section, "Gstin", isBuyer ? "Buyer GSTIN is missing or invalid — e-invoices are only for registered (B2B) buyers." : "Seller GSTIN is missing or invalid. Add it in My profile → Company.");
      text(section, "LglNm", p.LglNm, 3, 100, true);
      text(section, "Addr1", p.Addr1, 1, 100, true);
      text(section, "Addr2", p.Addr2, 3, 100, false);
      text(section, "Loc", p.Loc, 3, isBuyer ? 100 : 50, true);
      var st = String(p.Stcd || "");
      if (!/^(?!0+$)([0-9]{1,2})$/.test(st)) bad(section, "Stcd", "State code is missing or invalid.");
      else if (GSTIN_RE.test(g) && g.slice(0, 2) !== ("0" + st).slice(-2) && !exp) bad(section, "Stcd", "State code " + st + " doesn't match the GSTIN's first two digits (" + g.slice(0, 2) + ").");
      var pin = p.Pin;
      if (pin == null || pin === "") { if (!isBuyer) bad(section, "Pin", "Seller PIN code is required. Add it in My profile → Company."); }
      else if (!/^[1-9]\d{5}$/.test(String(pin))) bad(section, "Pin", "PIN code must be 6 digits.");
      else if (String(pin) !== "999999" && PIN_PREFIX[("0" + st).slice(-2)] && PIN_PREFIX[("0" + st).slice(-2)].indexOf(Number(String(pin).slice(0, 2))) === -1)
        bad(section, "Pin", "PIN " + pin + " doesn't belong to state " + (stateName(("0" + st).slice(-2)) || st) + ".");
      if (p.Em && !/^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/.test(p.Em)) bad(section, "Em", "Email is not valid.");
      if (p.Ph && !/^[0-9]{6,12}$/.test(p.Ph)) bad(section, "Ph", "Phone must be 6–12 digits.");
    }
    party("Seller", j.SellerDtls, false);
    party("Buyer", j.BuyerDtls, true);
    var b = j.BuyerDtls || {}, s = j.SellerDtls || {};
    if (!/^(?!0+$)([0-9]{1,2})$/.test(String(b.Pos || ""))) bad("Buyer", "Pos", "Place of supply (state code) is required.");
    if (b.Gstin && s.Gstin && b.Gstin === s.Gstin) bad("Buyer", "Gstin", "Buyer and seller GSTIN can't be the same.");

    var inter = t.IgstOnIntra === "Y" || /^(SEZ|EXP)/.test(t.SupTyp || "") || ("0" + s.Stcd).slice(-2) !== ("0" + b.Pos).slice(-2);
    if (t.IgstOnIntra === "Y" && ("0" + s.Stcd).slice(-2) !== ("0" + b.Pos).slice(-2)) bad("Transaction", "IgstOnIntra", "IGST on intra-state needs the seller state and place of supply to be the same.");

    var items = j.ItemList || [];
    if (!items.length) bad("Items", "ItemList", "At least one item is required.");
    if (items.length > 1000) bad("Items", "ItemList", "An invoice can have at most 1000 items.");
    var seen = {};
    var isNote = ["CRN", "DBN"].indexOf(DOC_TYPES[String(d.Typ || "").toUpperCase()]) !== -1;
    items.forEach(function (it, i) {
      var sec = "Item " + (it.SlNo || i + 1);
      if (!/^[0-9]{1,6}$/.test(String(it.SlNo || ""))) bad(sec, "SlNo", "Serial number must be numeric.");
      else if (seen[it.SlNo]) bad(sec, "SlNo", "Serial number " + it.SlNo + " is repeated."); else seen[it.SlNo] = 1;
      if (it.PrdDesc != null) text(sec, "PrdDesc", it.PrdDesc, 3, 300, false);
      if (["Y", "N"].indexOf(it.IsServc) === -1) bad(sec, "IsServc", "Is_Service must be Y or N.");
      if (!/^(?!0+$)([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(String(it.HsnCd || ""))) bad(sec, "HsnCd", "HSN code must have 4, 6 or 8 digits.");
      else if (it.IsServc === "Y" && !/^99/.test(it.HsnCd)) bad(sec, "HsnCd", "Service items need a services code (SAC starting with 99).");
      else if (it.IsServc === "N" && /^99/.test(it.HsnCd)) bad(sec, "IsServc", "HSN " + it.HsnCd + " is a service code — mark Is_Service as Y.");
      if (it.IsServc === "N") {
        if (it.Qty == null || !(Number(it.Qty) > 0)) bad(sec, "Qty", "Quantity is required for goods.");
        if (!it.Unit || !UQC[String(it.Unit).toUpperCase()]) bad(sec, "Unit", "Unit “" + (it.Unit || "") + "” is not a valid UQC. Use one of the master codes, e.g. NOS, KGS, BAG, BOX, PCS.");
      }
      if (RATES.indexOf(Number(it.GstRt)) === -1) bad(sec, "GstRt", "GST rate " + it.GstRt + "% is not an allowed rate.");
      ["UnitPrice", "TotAmt", "AssAmt", "TotItemVal"].forEach(function (k) { if (it[k] == null || isNaN(Number(it[k])) || Number(it[k]) < 0) bad(sec, k, k + " is required and can't be negative."); });
      var ass = Number(it.AssAmt) || 0;
      if (!tolerance(r2((Number(it.TotAmt) || 0) - (Number(it.Discount) || 0)), ass)) bad(sec, "AssAmt", "Taxable value should be Gross amount − Discount (" + r2((Number(it.TotAmt) || 0) - (Number(it.Discount) || 0)) + ").");
      if (!isNote) {
        var rt = Number(it.GstRt) || 0;
        if (inter) {
          if (Number(it.CgstAmt) || Number(it.SgstAmt)) bad(sec, "CgstAmt", "Inter-state supply: pass IGST, not CGST/SGST.");
          if (!tolerance(ass * rt / 100, Number(it.IgstAmt) || 0)) bad(sec, "IgstAmt", "IGST should be " + r2(ass * rt / 100) + " (taxable × " + rt + "%).");
        } else {
          if (Number(it.IgstAmt)) bad(sec, "IgstAmt", "Intra-state supply: pass CGST and SGST, not IGST.");
          if (!tolerance(ass * rt / 200, Number(it.CgstAmt) || 0)) bad(sec, "CgstAmt", "CGST should be " + r2(ass * rt / 200) + " (taxable × " + rt / 2 + "%).");
          if (!tolerance(ass * rt / 200, Number(it.SgstAmt) || 0)) bad(sec, "SgstAmt", "SGST should be " + r2(ass * rt / 200) + " (taxable × " + rt / 2 + "%).");
        }
      }
      var calcTot = ass + (Number(it.IgstAmt) || 0) + (Number(it.CgstAmt) || 0) + (Number(it.SgstAmt) || 0) + (Number(it.CesAmt) || 0) + (Number(it.CesNonAdvlAmt) || 0) + (Number(it.StateCesAmt) || 0) + (Number(it.StateCesNonAdvlAmt) || 0) + (Number(it.OthChrg) || 0);
      var exempt = t.RegRev === "Y" || t.SupTyp === "EXPWP";
      if (!tolerance(calcTot, Number(it.TotItemVal) || 0) && !(exempt && tolerance(ass + (Number(it.OthChrg) || 0), Number(it.TotItemVal) || 0)))
        bad(sec, "TotItemVal", "Item total should be " + r2(calcTot) + " (taxable + taxes + other charges).");
    });

    var v = j.ValDtls || {};
    var sum = function (k) { return items.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); };
    [["AssVal", "AssAmt", "Total taxable value"], ["CgstVal", "CgstAmt", "Total CGST"], ["SgstVal", "SgstAmt", "Total SGST"], ["IgstVal", "IgstAmt", "Total IGST"]].forEach(function (x) {
      if (!tolerance(sum(x[1]), Number(v[x[0]]) || 0)) bad("Totals", x[0], x[2] + " should be the sum of the items (" + r2(sum(x[1])) + ").");
    });
    var cess = sum("CesAmt") + sum("CesNonAdvlAmt");
    if (!tolerance(cess, Number(v.CesVal) || 0)) bad("Totals", "CesVal", "Total cess should be " + r2(cess) + ".");
    var rnd = Number(v.RndOffAmt) || 0;
    if (rnd < -99.99 || rnd > 99.99) bad("Totals", "RndOffAmt", "Round-off must be between −99.99 and +99.99.");
    var calcInv = sum("TotItemVal") - (Number(v.Discount) || 0) + (Number(v.OthChrg) || 0) + rnd;
    if (v.TotInvVal == null) bad("Totals", "TotInvVal", "Total invoice value is required.");
    else if (!tolerance(calcInv, Number(v.TotInvVal))) bad("Totals", "TotInvVal", "Total invoice value should be " + r2(calcInv) + " (items − discount + other charges + round-off).");

    if (j.EwbDtls) {
      var e = j.EwbDtls;
      if (e.Distance == null || e.Distance < 0 || e.Distance > 4000) bad("e-Way Bill", "Distance", "Distance must be 0–4000 km (0 lets the portal calculate it).");
      if (isNote) bad("e-Way Bill", "EwbDtls", "e-Way Bill details can't be sent with a credit or debit note.");
      if (e.TransMode === "1" && e.VehNo && !/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(String(e.VehNo).toUpperCase())) bad("e-Way Bill", "VehNo", "Vehicle number format is invalid.");
    }
    if (JSON.stringify(j).length > 2 * 1024 * 1024) bad("Header", "size", "JSON payload can't exceed 2 MB.");
    return out;
  }

  /* ---------------- IRN (as the IRP derives it): SHA-256 of GSTIN + FY + doc type + doc number ---------------- */
  function irnFor(j) {
    var d = j.DocDtls, src = j.SellerDtls.Gstin + fyOf(isoFromDdmm(d.Dt)) + d.Typ.toUpperCase() + String(d.No).toUpperCase();
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(src)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      }).catch(function () { return Data.fakeHash(src); });
    }
    return Promise.resolve(Data.fakeHash(src));
  }
  function qrPayload(j, irn, ackDt) {
    return JSON.stringify({ SellerGstin: j.SellerDtls.Gstin, BuyerGstin: j.BuyerDtls.Gstin, DocNo: j.DocDtls.No, DocTyp: j.DocDtls.Typ, DocDt: j.DocDtls.Dt,
      TotInvVal: j.ValDtls.TotInvVal, ItemCnt: j.ItemList.length, MainHsnCode: (j.ItemList.slice().sort(function (a, b) { return b.AssAmt - a.AssAmt; })[0] || {}).HsnCd, Irn: irn, IrnDt: ackDt });
  }

  /* ---------------- Format A sheet → invoices ----------------
     Reads the "eInvoice" sheet of the NIC bulk tool: row with column codes (colSupType …), data below.
     Rows sharing a document type + number are one invoice with several items. */
  function fromFormA(XLSX, wb) {
    var name = wb.SheetNames.filter(function (n) { return /^einvoice$/i.test(n.trim()); })[0] || wb.SheetNames[0];
    var grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true });
    var hr = -1;
    for (var i = 0; i < Math.min(grid.length, 15); i++) if (grid[i].indexOf("colSupType") !== -1 || grid[i].indexOf("colDocno") !== -1) { hr = i; break; }
    if (hr === -1) { var e = new Error("This doesn't look like the e-Invoice bulk tool (Format A): the eInvoice sheet with column codes such as colSupType wasn't found."); e.code = "FORMAT"; throw e; }
    var cols = {};
    grid[hr].forEach(function (c, i) { if (c) cols[String(c).trim()] = i; });
    var get = function (row, c) { var v = row[cols[c]]; return v == null ? "" : v; };
    var num = function (v) { var n = Number(String(v).replace(/,/g, "")); return isNaN(n) ? 0 : n; };
    var date = function (v) {
      if (typeof v === "number") { var d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
      return isoFromDdmm(v) || String(v);
    };
    var docs = {}, order = [];
    grid.slice(hr + 1).forEach(function (row, idx) {
      var no = String(get(row, "colDocno")).trim();
      if (!no) return;
      var typ = DOC_TYPES[String(get(row, "colDoctype")).trim().toUpperCase()] || String(get(row, "colDoctype")).trim();
      var key = typ + "|" + no;
      if (!docs[key]) {
        order.push(key);
        docs[key] = {
          row: hr + 2 + idx, typ: typ, number: no, date: date(get(row, "colDocdate")),
          supTyp: String(get(row, "colSupType")).trim().toUpperCase() || "B2B",
          regRev: /^y/i.test(get(row, "colRevCharge")), igstOnIntra: /^y/i.test(get(row, "colIgstIntra")), ecmGstin: String(get(row, "colEcomGstin")).trim(),
          buyer: {
            gstin: String(get(row, "colBgstin")).trim().toUpperCase(), name: get(row, "colBLegalname"), tradeName: get(row, "colBTradname"),
            addr1: get(row, "colBaddr1"), addr2: get(row, "colBaddr2"), location: get(row, "colBLoc"), pin: String(get(row, "colBPin")).trim(),
            state: get(row, "colBState"), phone: String(get(row, "colBPhno")), email: get(row, "colBEmail")
          },
          partyState: get(row, "colPos"),
          items: [],
          totals: { assVal: num(get(row, "colTotTaxval")), totInvVal: get(row, "colTinvoiceval") === "" ? null : num(get(row, "colTinvoiceval")), discount: num(get(row, "colTDiscount")), othChrg: num(get(row, "colTOthChrgs")) },
          ewb: get(row, "colTDistance") !== "" ? { distance: num(get(row, "colTDistance")), transporterId: get(row, "colTid"), transporter: get(row, "colTName"), mode: { "1": "Road", "2": "Rail", "3": "Air", "4": "Ship", ROAD: "Road", RAIL: "Rail", AIR: "Air", SHIP: "Ship" }[String(get(row, "colTMode")).toUpperCase()] || "Road", vehicleNo: get(row, "colTVehno"), vehicleType: /^o/i.test(get(row, "colTVehTyp")) ? "ODC" : "Regular" } : null
        };
      }
      var opt = function (c) { return get(row, c) === "" ? undefined : num(get(row, c)); };
      docs[key].items.push({
        slNo: String(get(row, "colProdSlno") || docs[key].items.length + 1), name: get(row, "colProddesc"), isService: /^y/i.test(get(row, "colProdservice")) ? true : /^n/i.test(get(row, "colProdservice")) ? false : null,
        hsn: String(get(row, "colHsn")).trim(), qty: num(get(row, "colQuantity")), freeQty: num(get(row, "colFreeQuanty")), unit: get(row, "colUnit"),
        rate: num(get(row, "colUnitPrice")), totAmt: opt("colTotal"), discount: num(get(row, "colDiscount")), assAmt: opt("colAssValue"), gst: num(get(row, "colGstrate")),
        sgst: opt("colSgst"), cgst: opt("colCgst"), igst: opt("colIgst"), cesRt: num(get(row, "colCessrate")), cesAmt: num(get(row, "colCessadval")), othChrg: num(get(row, "colOthChrgs")), totItemVal: opt("colTolitemval")
      });
    });
    return order.map(function (k) {
      var d = docs[k];
      d.items.forEach(function (it) { if (it.isService == null) it.isService = /^99/.test(it.hsn); });
      d.source = "Format A";
      d.mapping = [["colDocno", "DocDtls.No", d.number], ["colDocdate", "DocDtls.Dt", ddmmyyyy(d.date)], ["colBgstin", "BuyerDtls.Gstin", d.buyer.gstin], ["colBLegalname", "BuyerDtls.LglNm", d.buyer.name], ["colPos", "BuyerDtls.Pos", d.partyState],
        ["colBaddr1", "BuyerDtls.Addr1", d.buyer.addr1], ["colBLoc", "BuyerDtls.Loc", d.buyer.location], ["colBPin", "BuyerDtls.Pin", d.buyer.pin]].concat(d.items.reduce(function (a, it, i) {
          return a.concat([["colHsn", "ItemList[" + i + "].HsnCd", it.hsn], ["colQuantity / colUnit", "ItemList[" + i + "].Qty / Unit", it.qty + " " + it.unit + " → " + (uqc(it.unit) || "unknown UQC")], ["colAssValue", "ItemList[" + i + "].AssAmt", it.assAmt], ["colGstrate", "ItemList[" + i + "].GstRt", it.gst + "%"]]);
        }, [])).concat([["colTinvoiceval", "ValDtls.TotInvVal", d.totals.totInvVal]]).map(function (x) { return { tally: x[0], path: x[1], value: x[2] === "" || x[2] == null ? "—" : String(x[2]) }; });
      return d;
    });
  }
  function buildFromFormA(d, seller) {
    return build({ typ: d.typ, number: d.number, date: d.date, items: d.items, partyState: d.partyState }, seller, d.buyer,
      { supTyp: d.supTyp, regRev: d.regRev, igstOnIntra: d.igstOnIntra, ecmGstin: d.ecmGstin, totInvVal: d.totals.totInvVal, discount: d.totals.discount, othChrg: d.totals.othChrg, ewb: d.ewb });
  }

  /* ---------------- Tally exports → invoices ----------------
     Reads Sales / Credit Note / Debit Note vouchers from a TallyPrime XML export (Day Book or
     voucher export) or a TallyPrime JSON export. Each invoice also carries a field-by-field mapping
     (Tally tag → IRP JSON path) for the "JSON mapping" step. */
  function num2(v) { var n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function tallyDate(v) { var s = String(v || "").trim(); var m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return m[1] + "-" + m[2] + "-" + m[3]; return isoFromDdmm(s) || s.slice(0, 10); }
  function qtyUnit(v) { var m = String(v || "").trim().match(/^(-?[\d.,]+)\s*(.*)$/); return m ? { qty: Math.abs(num2(m[1])), unit: m[2].trim() } : { qty: 0, unit: "" }; }
  function docTypeOf(t) { t = String(t || "").toLowerCase(); return /credit/.test(t) ? "CRN" : /debit/.test(t) ? "DBN" : "INV"; }
  var TAX_RE = /\b(cgst|sgst|utgst|igst|central tax|state tax|integrated tax|cess)\b/i, ROUND_RE = /round/i;

  // Voucher accessor over either an XML element or a JSON object (keys matched case-insensitively, ".list" optional).
  function xmlAcc(el) {
    var kids = function (tag) { return Array.prototype.filter.call(el.children, function (c) { return c.tagName.toUpperCase() === tag; }); };
    return {
      get: function (tag) { var k = kids(tag.toUpperCase())[0]; return k ? k.textContent.trim() : ""; },
      attr: function (a) { return el.getAttribute(a) || ""; },
      list: function (tag) { var t = tag.toUpperCase(); return kids(t).concat(kids(t + ".LIST")).map(xmlAcc); },
      texts: function (tag) { var t = tag.toUpperCase(); var out = []; kids(t + ".LIST").concat(kids(t)).forEach(function (l) { Array.prototype.forEach.call(l.children, function (c) { if (c.textContent.trim()) out.push(c.textContent.trim()); }); if (!l.children.length && l.textContent.trim()) out.push(l.textContent.trim()); }); return out; }
    };
  }
  function jsonAcc(o) {
    var key = function (tag) { var t = tag.toLowerCase().replace(/\.list$/, ""); return Object.keys(o).filter(function (k) { var x = k.toLowerCase().replace(/\.list$/, ""); return x === t; }); };
    var val = function (v) { return v && typeof v === "object" && !Array.isArray(v) ? (v.value != null ? v.value : v["$value"] != null ? v["$value"] : "") : v; };
    return {
      get: function (tag) { var k = key(tag)[0]; var v = k ? val(o[k]) : ""; return Array.isArray(v) ? String(v[0] == null ? "" : val(v[0])) : String(v == null ? "" : v).trim(); },
      attr: function (a) { var k = key(a)[0] || key("@" + a)[0] || key("meta")[0]; var v = k ? o[k] : ""; return typeof v === "object" && v ? String(v[a.toLowerCase()] || v[a] || "") : String(v || ""); },
      list: function (tag) { var out = []; key(tag).forEach(function (k) { var v = o[k]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x && typeof x === "object") out.push(jsonAcc(x)); }); }); return out; },
      texts: function (tag) { var out = []; key(tag).forEach(function (k) { var v = o[k]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x && typeof x === "object") Object.keys(x).forEach(function (kk) { var y = x[kk]; (Array.isArray(y) ? y : [y]).forEach(function (z) { if (z != null && typeof z !== "object" && String(z).trim()) out.push(String(z).trim()); }); }); else if (x != null && String(x).trim()) out.push(String(x).trim()); }); }); return out; }
    };
  }

  function voucherToDoc(v, source) {
    var map = [];
    var m = function (tally, path, value) { map.push({ tally: tally, path: path, value: value === "" || value == null ? "—" : String(value) }); return value; };
    var vtype = v.get("VOUCHERTYPENAME") || v.attr("VCHTYPE");
    var typ = docTypeOf(vtype);
    var number = m("VOUCHERNUMBER", "DocDtls.No", v.get("VOUCHERNUMBER"));
    var date = tallyDate(v.get("DATE"));
    m("DATE", "DocDtls.Dt", ddmmyyyy(date));
    m("VOUCHERTYPENAME", "DocDtls.Typ", typ + " (" + (vtype || "Sales") + ")");
    var party = v.get("PARTYLEDGERNAME") || v.get("PARTYNAME") || v.get("BASICBUYERNAME");
    var addr = v.texts("ADDRESS").concat([]);
    if (!addr.length) addr = v.texts("BASICBUYERADDRESS");
    var state = v.get("STATENAME") || v.get("LEDSTATENAME");
    var buyer = {
      gstin: m("PARTYGSTIN", "BuyerDtls.Gstin", (v.get("PARTYGSTIN") || v.get("BASICBUYERGSTIN") || v.get("CONSIGNEEGSTIN")).toUpperCase()),
      name: m("BASICBUYERNAME / PARTYLEDGERNAME", "BuyerDtls.LglNm", v.get("BASICBUYERNAME") || party),
      addr1: m("ADDRESS.LIST [1]", "BuyerDtls.Addr1", addr[0] || ""),
      addr2: m("ADDRESS.LIST [2…]", "BuyerDtls.Addr2", addr.slice(1).join(", ")),
      location: "", pin: m("PARTYPINCODE", "BuyerDtls.Pin", v.get("PARTYPINCODE") || v.get("CONSIGNEEPINCODE")),
      state: m("STATENAME", "BuyerDtls.Stcd", state)
    };
    // Location: the last address line that isn't the state or a PIN, else the state.
    buyer.location = addr.slice().reverse().filter(function (a) { return !/^\d{6}$/.test(a) && a.toLowerCase() !== String(state).toLowerCase(); })[0] || state || "";
    map.push({ tally: "ADDRESS.LIST (last line)", path: "BuyerDtls.Loc", value: buyer.location || "—" });
    var pos = m("PLACEOFSUPPLY", "BuyerDtls.Pos", v.get("PLACEOFSUPPLY") || state);

    var ledgers = v.list("LEDGERENTRIES").concat(v.list("ALLLEDGERENTRIES"));
    var partyEntry = ledgers.filter(function (l) { return /yes/i.test(l.get("ISPARTYLEDGER")) || l.get("LEDGERNAME") === party; })[0];
    var taxTotal = 0, roundOff = 0;
    ledgers.forEach(function (l) {
      var n = l.get("LEDGERNAME");
      if (TAX_RE.test(n)) taxTotal += Math.abs(num2(l.get("AMOUNT")));
      else if (ROUND_RE.test(n)) roundOff += -num2(l.get("AMOUNT")) * (typ === "CRN" ? -1 : 1);
    });
    var inv = v.list("ALLINVENTORYENTRIES").concat(v.list("INVENTORYENTRIES"));
    var items = [];
    inv.forEach(function (e) {
      var q = qtyUnit(e.get("BILLEDQTY") || e.get("ACTUALQTY"));
      var amount = Math.abs(num2(e.get("AMOUNT")));
      var rate = num2(String(e.get("RATE")).split("/")[0]) || (q.qty ? amount / q.qty : amount);
      var gst = 0;
      e.list("RATEDETAILS").forEach(function (rd) { if (/integrated/i.test(rd.get("GSTRATEDUTYHEAD"))) gst = num2(rd.get("GSTRATE")); });
      if (!gst) gst = num2(e.get("GSTRATE")) || num2(e.get("IGSTRATE"));
      var hsn = (e.get("GSTHSNNAME") || e.get("HSNCODE") || e.get("GSTHSNCODE") || "").replace(/\D/g, "");
      items.push({ slNo: String(items.length + 1), name: e.get("STOCKITEMNAME"), hsn: hsn, qty: q.qty, unit: q.unit, rate: Math.round(rate * 1000) / 1000, totAmt: amount, discount: num2(e.get("DISCOUNT")) ? Math.round(amount * num2(e.get("DISCOUNT"))) / 100 : 0, gst: gst });
    });
    // Accounting invoice (no stock items): the income ledgers become the lines.
    if (!items.length) ledgers.forEach(function (l) {
      var n = l.get("LEDGERNAME");
      if (l === partyEntry || TAX_RE.test(n) || ROUND_RE.test(n)) return;
      var amt = Math.abs(num2(l.get("AMOUNT")));
      if (!amt) return;
      var hsn = (l.get("GSTHSNNAME") || l.get("HSNCODE") || "").replace(/\D/g, "");
      items.push({ slNo: String(items.length + 1), name: n, hsn: hsn, qty: 1, unit: "", rate: amt, totAmt: amt, gst: num2(l.get("GSTRATE")), isService: /^99/.test(hsn) });
    });
    // GST rate not in the export: derive it from the tax ledgers.
    var taxable = items.reduce(function (s, i) { return s + i.totAmt - (i.discount || 0); }, 0);
    if (items.some(function (i) { return !i.gst; }) && taxable && taxTotal) {
      var rate = Math.round(taxTotal / taxable * 1000) / 10;
      var nearest = RATES.slice().sort(function (a, b) { return Math.abs(a - rate) - Math.abs(b - rate); })[0];
      items.forEach(function (i) { if (!i.gst) i.gst = nearest; });
    }
    items.forEach(function (it, i) {
      var p = "ItemList[" + i + "].";
      map.push({ tally: "STOCKITEMNAME", path: p + "PrdDesc", value: it.name || "—" });
      map.push({ tally: "GSTHSNNAME", path: p + "HsnCd", value: it.hsn || "— (missing)" });
      map.push({ tally: "BILLEDQTY", path: p + "Qty / Unit", value: it.qty + " " + (it.unit || "") + (it.unit ? " → " + (uqc(it.unit) || "unknown UQC") : "") });
      map.push({ tally: "RATE", path: p + "UnitPrice", value: it.rate });
      map.push({ tally: "AMOUNT", path: p + "TotAmt / AssAmt", value: it.totAmt });
      map.push({ tally: "RATEDETAILS · GSTRATE", path: p + "GstRt", value: it.gst + "%" });
    });
    var total = partyEntry ? Math.abs(num2(partyEntry.get("AMOUNT"))) : null;
    map.push({ tally: "CGST / SGST / IGST ledgers", path: "ValDtls (tax)", value: Math.round(taxTotal * 100) / 100 });
    if (roundOff) map.push({ tally: "Round Off ledger", path: "ValDtls.RndOffAmt", value: Math.round(roundOff * 100) / 100 });
    map.push({ tally: "Party ledger AMOUNT", path: "ValDtls.TotInvVal", value: total == null ? "—" : total });
    return {
      source: source, typ: typ, number: number, date: date, supTyp: "B2B", regRev: /yes/i.test(v.get("ISREVERSECHARGEAPPLICABLE")), igstOnIntra: false, ecmGstin: "",
      buyer: buyer, partyState: pos, items: items, totals: { totInvVal: total, discount: 0, othChrg: 0 }, ewb: null, mapping: map
    };
  }

  function fromTallyXml(text) {
    var dom = new DOMParser().parseFromString(String(text).replace(/&#4;/g, "").replace(/&#(?:[0-8]|1[124-9]|2\d|3[01]);/g, ""), "text/xml");
    if (dom.getElementsByTagName("parsererror").length) { var e = new Error("That XML couldn't be read. Export the vouchers again from TallyPrime (Display → Day Book → Export → XML)."); e.code = "FORMAT"; throw e; }
    var vs = Array.prototype.filter.call(dom.getElementsByTagName("VOUCHER"), function (v) {
      var t = (v.getAttribute("VCHTYPE") || "") + " " + ((v.getElementsByTagName("VOUCHERTYPENAME")[0] || {}).textContent || "");
      return /sales|credit note|debit note|invoice/i.test(t);
    });
    return vs.map(function (v) { return voucherToDoc(xmlAcc(v), "Tally XML"); }).filter(function (d) { return d.number; });
  }
  function fromTallyJson(obj) {
    var found = [];
    (function walk(o) {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      var keys = Object.keys(o).map(function (k) { return k.toLowerCase(); });
      if (keys.indexOf("vouchernumber") !== -1 && (keys.indexOf("date") !== -1)) { found.push(o); return; }
      Object.keys(o).forEach(function (k) { walk(o[k]); });
    })(obj);
    return found.map(function (o) { return voucherToDoc(jsonAcc(o), "Tally JSON"); }).filter(function (d) {
      return d.number && /INV|CRN|DBN/.test(d.typ);
    });
  }
  // IRP-format JSON (e.g. TallyPrime's own e-Invoice JSON export): one invoice or an array of them.
  function fromIrpJson(obj) {
    var arr = Array.isArray(obj) ? obj : [obj];
    return arr.filter(function (j) { return j && j.DocDtls && j.ItemList; }).map(function (j) {
      var b = j.BuyerDtls || {}, iso = isoFromDdmm(j.DocDtls.Dt);
      return {
        source: "IRP JSON", typ: String(j.DocDtls.Typ || "INV").toUpperCase(), number: j.DocDtls.No, date: iso, supTyp: (j.TranDtls || {}).SupTyp || "B2B",
        regRev: (j.TranDtls || {}).RegRev === "Y", igstOnIntra: (j.TranDtls || {}).IgstOnIntra === "Y", ecmGstin: (j.TranDtls || {}).EcmGstin || "",
        buyer: { gstin: b.Gstin, name: b.LglNm, addr1: b.Addr1, addr2: b.Addr2, location: b.Loc, pin: b.Pin ? String(b.Pin) : "", state: b.Stcd },
        partyState: b.Pos,
        items: j.ItemList.map(function (it) { return { slNo: it.SlNo, name: it.PrdDesc, hsn: it.HsnCd, isService: it.IsServc === "Y", qty: it.Qty, freeQty: it.FreeQty, unit: it.Unit, rate: it.UnitPrice, totAmt: it.TotAmt, discount: it.Discount, assAmt: it.AssAmt, gst: it.GstRt, igst: it.IgstAmt, cgst: it.CgstAmt, sgst: it.SgstAmt, cesAmt: it.CesAmt, othChrg: it.OthChrg, totItemVal: it.TotItemVal }; }),
        totals: { totInvVal: (j.ValDtls || {}).TotInvVal, discount: (j.ValDtls || {}).Discount, othChrg: (j.ValDtls || {}).OthChrg },
        ewb: j.EwbDtls ? { distance: j.EwbDtls.Distance, transporterId: j.EwbDtls.TransId, transporter: j.EwbDtls.TransName, mode: { "1": "Road", "2": "Rail", "3": "Air", "4": "Ship" }[j.EwbDtls.TransMode] || "Road", vehicleNo: j.EwbDtls.VehNo, vehicleType: j.EwbDtls.VehType === "O" ? "ODC" : "Regular" } : null,
        mapping: [{ tally: "(already IRP JSON)", path: "—", value: "Used as is; seller details come from your company profile" }]
      };
    });
  }

  /* Plain invoice CSV (one row per item): Invoice No, Invoice Date, Buyer GSTIN, Buyer Name, Address,
     City, PIN, State / Place of Supply, Item, HSN, Qty, Unit, Rate, GST %, Amount, Invoice Value. */
  function fromInvoiceCsv(objs) {
    var norm = function (k) { return String(k).toLowerCase().replace(/[^a-z0-9%]/g, ""); };
    var pick = function (o, names) { var keys = Object.keys(o); for (var i = 0; i < names.length; i++) { var k = keys.filter(function (x) { return norm(x) === names[i]; })[0]; if (k && String(o[k]).trim() !== "") return String(o[k]).trim(); } return ""; };
    var F = {
      no: ["invoiceno", "invoicenumber", "docno", "documentnumber", "vouchernumber", "billno", "colDocno".toLowerCase()],
      date: ["invoicedate", "date", "docdate", "documentdate", "voucherdate"],
      typ: ["documenttype", "doctype", "vouchertype", "type"],
      gstin: ["buyergstin", "customergstin", "partygstin", "gstin", "gstinuin"],
      name: ["buyername", "customername", "partyname", "buyerlegalname", "party", "customer"],
      addr1: ["buyeraddress", "address", "address1", "buyeraddr1", "addressline1"], addr2: ["address2", "buyeraddr2", "addressline2"],
      loc: ["city", "location", "buyerlocation", "buyercity"], pin: ["pin", "pincode", "buyerpin", "buyerpincode", "postalcode"],
      state: ["state", "buyerstate", "placeofsupply", "pos", "buyerpos"],
      item: ["item", "itemname", "description", "productdescription", "product", "stockitem"], hsn: ["hsn", "hsncode", "hsnsac", "sac"],
      qty: ["qty", "quantity"], unit: ["unit", "uqc", "uom"], rate: ["rate", "unitprice", "price"], gst: ["gst%", "gstrate", "gstrate%", "taxrate", "rate%", "gst"],
      amount: ["taxablevalue", "taxable", "amount", "assessablevalue"], total: ["invoicevalue", "totalinvoicevalue", "total", "grandtotal"]
    };
    var docs = {}, order = [], map = function (col, path, v) { return { tally: col, path: path, value: v === "" || v == null ? "—" : String(v) }; };
    objs.forEach(function (o) {
      var no = pick(o, F.no);
      if (!no) return;
      var typ = docTypeOf(pick(o, F.typ) || "invoice"), key = typ + "|" + no;
      if (!docs[key]) {
        order.push(key);
        var state = pick(o, F.state);
        docs[key] = { source: "CSV", typ: typ, number: no, date: isoFromDdmm(pick(o, F.date)) || pick(o, F.date).slice(0, 10), supTyp: "B2B", regRev: false, igstOnIntra: false, ecmGstin: "",
          buyer: { gstin: pick(o, F.gstin).toUpperCase(), name: pick(o, F.name), addr1: pick(o, F.addr1), addr2: pick(o, F.addr2), location: pick(o, F.loc), pin: pick(o, F.pin), state: state },
          partyState: state, items: [], totals: { totInvVal: pick(o, F.total) ? num2(pick(o, F.total)) : null, discount: 0, othChrg: 0 }, ewb: null, mapping: [] };
        var d = docs[key];
        d.mapping.push(map("Invoice No", "DocDtls.No", no), map("Invoice Date", "DocDtls.Dt", ddmmyyyy(d.date)), map("Buyer GSTIN", "BuyerDtls.Gstin", d.buyer.gstin), map("Buyer Name", "BuyerDtls.LglNm", d.buyer.name),
          map("Address", "BuyerDtls.Addr1", d.buyer.addr1), map("City", "BuyerDtls.Loc", d.buyer.location), map("PIN", "BuyerDtls.Pin", d.buyer.pin), map("State / Place of Supply", "BuyerDtls.Pos", state));
      }
      var dd = docs[key], qty = num2(pick(o, F.qty)) || 1, amount = num2(pick(o, F.amount)), rate = num2(pick(o, F.rate)) || (amount && qty ? amount / qty : 0);
      var it = { slNo: String(dd.items.length + 1), name: pick(o, F.item), hsn: pick(o, F.hsn).replace(/\D/g, ""), qty: qty, unit: pick(o, F.unit), rate: rate, totAmt: amount || Math.round(qty * rate * 100) / 100, gst: num2(pick(o, F.gst)) };
      it.isService = /^99/.test(it.hsn);
      dd.items.push(it);
      var i = dd.items.length - 1;
      dd.mapping.push(map("Item", "ItemList[" + i + "].PrdDesc", it.name), map("HSN", "ItemList[" + i + "].HsnCd", it.hsn || "— (missing)"), map("Qty / Unit", "ItemList[" + i + "].Qty / Unit", it.qty + " " + it.unit + (it.unit ? " → " + (uqc(it.unit) || "unknown UQC") : "")),
        map("Rate", "ItemList[" + i + "].UnitPrice", it.rate), map("GST %", "ItemList[" + i + "].GstRt", it.gst + "%"));
    });
    return order.map(function (k) { var d = docs[k]; d.mapping.push(map("Invoice Value", "ValDtls.TotInvVal", d.totals.totInvVal == null ? "computed" : d.totals.totInvVal)); return d; });
  }

  /* A TallyPrime-style XML export of app invoices — handy as a sample for the import step. */
  function toTallyXml(vouchers, lookupLedger) {
    var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
    var body = vouchers.map(function (v) {
      var l = lookupLedger(v.party) || {}, intra = !v.igst;
      var items = (v.items || []).map(function (it) {
        var amt = Math.round(it.qty * it.rate * 100) / 100;
        return "      <ALLINVENTORYENTRIES.LIST>\n        <STOCKITEMNAME>" + esc(it.name) + "</STOCKITEMNAME>\n        <GSTHSNNAME>" + esc(it.hsn) + "</GSTHSNNAME>\n        <RATE>" + Number(it.rate).toFixed(2) + "/" + esc(it.unit || "Nos") + "</RATE>\n        <AMOUNT>" + amt.toFixed(2) + "</AMOUNT>\n        <ACTUALQTY> " + it.qty + " " + esc(it.unit || "Nos") + "</ACTUALQTY>\n        <BILLEDQTY> " + it.qty + " " + esc(it.unit || "Nos") + "</BILLEDQTY>\n" +
          "        <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE> " + it.gst + "</GSTRATE></RATEDETAILS.LIST>\n        <ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>" + esc(v.account || "Sales Account") + "</LEDGERNAME><AMOUNT>" + amt.toFixed(2) + "</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>\n      </ALLINVENTORYENTRIES.LIST>";
      }).join("\n");
      var taxes = intra ? [["CGST", v.cgst], ["SGST", v.sgst]] : [["IGST", v.igst]];
      var round = Math.round((v.total - v.subtotal - v.cgst - v.sgst - v.igst) * 100) / 100;
      return '   <TALLYMESSAGE xmlns:UDF="TallyUDF">\n    <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">\n' +
        (l.addr1 || l.location ? "      <ADDRESS.LIST TYPE=\"String\">\n" + [l.addr1, l.addr2, l.location].filter(Boolean).map(function (a) { return "        <ADDRESS>" + esc(a) + "</ADDRESS>"; }).join("\n") + "\n      </ADDRESS.LIST>\n" : "") +
        "      <DATE>" + v.date.replace(/-/g, "") + "</DATE>\n      <STATENAME>" + esc(v.partyState) + "</STATENAME>\n      <PARTYGSTIN>" + esc(v.partyGstin) + "</PARTYGSTIN>\n      <PLACEOFSUPPLY>" + esc(v.partyState) + "</PLACEOFSUPPLY>\n" +
        "      <PARTYNAME>" + esc(v.party) + "</PARTYNAME>\n      <PARTYLEDGERNAME>" + esc(v.party) + "</PARTYLEDGERNAME>\n      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n      <VOUCHERNUMBER>" + esc(v.number) + "</VOUCHERNUMBER>\n      <BASICBUYERNAME>" + esc(v.party) + "</BASICBUYERNAME>\n      <PARTYPINCODE>" + esc(l.pin || "") + "</PARTYPINCODE>\n" +
        items + "\n      <LEDGERENTRIES.LIST><LEDGERNAME>" + esc(v.party) + "</LEDGERNAME><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>-" + Number(v.total).toFixed(2) + "</AMOUNT></LEDGERENTRIES.LIST>\n" +
        taxes.map(function (t) { return "      <LEDGERENTRIES.LIST><LEDGERNAME>" + t[0] + "</LEDGERNAME><AMOUNT>" + Number(t[1]).toFixed(2) + "</AMOUNT></LEDGERENTRIES.LIST>"; }).join("\n") +
        (round ? "\n      <LEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME><AMOUNT>" + round.toFixed(2) + "</AMOUNT></LEDGERENTRIES.LIST>" : "") +
        "\n    </VOUCHER>\n   </TALLYMESSAGE>";
    }).join("\n");
    return '<?xml version="1.0" encoding="utf-8"?>\n<ENVELOPE>\n <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n <BODY>\n  <IMPORTDATA>\n   <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>\n   <REQUESTDATA>\n' + body + "\n   </REQUESTDATA>\n  </IMPORTDATA>\n </BODY>\n</ENVELOPE>\n";
  }
  function buildDoc(d, seller) {
    return build({ typ: d.typ, number: d.number, date: d.date, items: d.items, partyState: d.partyState }, seller, d.buyer,
      { supTyp: d.supTyp, regRev: d.regRev, igstOnIntra: d.igstOnIntra, ecmGstin: d.ecmGstin, totInvVal: d.totals && d.totals.totInvVal, discount: d.totals && d.totals.discount, othChrg: d.totals && d.totals.othChrg, ewb: d.ewb });
  }

  return {
    VERSION: VERSION, STATE_CODES: STATE_CODES, UQC: UQC, RATES: RATES,
    stateCode: stateCode, uqc: uqc, fyOf: fyOf, ddmmyyyy: ddmmyyyy, isoFromDdmm: isoFromDdmm,
    build: build, validate: validate, irnFor: irnFor, qrPayload: qrPayload, fromFormA: fromFormA, buildFromFormA: buildFromFormA,
    fromTallyXml: fromTallyXml, fromTallyJson: fromTallyJson, fromIrpJson: fromIrpJson, toTallyXml: toTallyXml, buildDoc: buildDoc, fromInvoiceCsv: fromInvoiceCsv
  };
})();
