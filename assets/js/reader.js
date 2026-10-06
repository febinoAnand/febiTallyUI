/* =========================================================
   Statement reader: CSV, Excel (.xlsx / .xls) and PDF → rows.

   Returns { rows: string[][], text, pages } where rows is the
   raw grid shown in the column-mapping preview. Excel and PDF
   support load SheetJS / pdf.js from cdnjs on first use.

   Errors carry a .code: PASSWORD, BAD_PASSWORD, UNSUPPORTED,
   EMPTY, LOAD_FAILED, CANCELLED.
   ========================================================= */
var Reader = (function () {
  var LIBS = {
    xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  };
  var loaded = {};

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }

  function loadScript(url) {
    if (loaded[url]) return loaded[url];
    loaded[url] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = function () { delete loaded[url]; reject(fail("LOAD_FAILED", "Couldn't load the file reader. Check your internet connection and try again.")); };
      document.head.appendChild(s);
    });
    return loaded[url];
  }

  function readAs(file, how) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(fail("EMPTY", "The file could not be read.")); };
      if (how === "text") r.readAsText(file); else r.readAsArrayBuffer(file);
    });
  }

  function kind(name) {
    var ext = String(name).toLowerCase().split(".").pop();
    if (ext === "csv" || ext === "txt") return "csv";
    if (ext === "xlsx" || ext === "xls") return "excel";
    if (ext === "pdf") return "pdf";
    return null;
  }

  /* ---------------- CSV ---------------- */
  function csvRows(text) {
    var rows = [], row = [], cell = "", q = false;
    var sample = text.slice(0, 2000), sep = /,/.test(sample) ? "," : /;/.test(sample) ? ";" : /	/.test(sample) ? "	" : ",";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return clean(rows);
  }

  function clean(rows) {
    return rows.map(function (r) { return r.map(function (c) { return String(c == null ? "" : c).replace(/\s+/g, " ").trim(); }); })
      .filter(function (r) { return r.some(function (c) { return c !== ""; }); });
  }

  /* ---------------- Excel ---------------- */
  function excelRows(buf) {
    return loadScript(LIBS.xlsx).then(function () {
      var wb;
      try { wb = XLSX.read(buf, { type: "array", cellDates: true }); }
      catch (e) {
        if (/password|encrypt/i.test(e.message)) throw fail("UNSUPPORTED", "This Excel file is password-protected. Save a copy without a password and upload that.");
        throw fail("EMPTY", "This Excel file could not be read.");
      }
      // Use the sheet with the most filled rows (statements often have a cover sheet).
      var best = null;
      wb.SheetNames.forEach(function (n) {
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, dateNF: "dd/mm/yyyy", defval: "" });
        rows = clean(rows);
        if (!best || rows.length > best.rows.length) best = { sheet: n, rows: rows };
      });
      return { rows: best ? best.rows : [], sheet: best && best.sheet };
    });
  }

  /* ---------------- PDF ---------------- */
  function pdfRows(buf, password, onProgress, isCancelled) {
    return loadScript(LIBS.pdf).then(function () {
      pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
      return pdfjsLib.getDocument({ data: new Uint8Array(buf), password: password || undefined }).promise.catch(function (e) {
        if (e && e.name === "PasswordException") throw fail(e.code === 2 ? "BAD_PASSWORD" : "PASSWORD", e.code === 2 ? "Incorrect password." : "This statement is password-protected.");
        throw fail("EMPTY", "This PDF could not be opened.");
      });
    }).then(function (doc) {
      var lines = [], chain = Promise.resolve();
      for (var p = 1; p <= doc.numPages; p++) (function (pageNo) {
        chain = chain.then(function () {
          if (isCancelled && isCancelled()) throw fail("CANCELLED", "Cancelled.");
          if (onProgress) onProgress("Reading page " + pageNo + " of " + doc.numPages + "…", pageNo / doc.numPages);
          return doc.getPage(pageNo).then(function (page) { return page.getTextContent(); }).then(function (tc) {
            lines = lines.concat(groupLines(tc.items).map(function (l) { l.page = pageNo; return l; }));
          });
        });
      })(p);
      return chain.then(function () { return { rows: linesToRows(lines), pages: doc.numPages }; });
    });
  }

  // Items on (nearly) the same baseline form one line, ordered left to right.
  function groupLines(items) {
    var pieces = items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      return { x: it.transform[4], y: it.transform[5], w: it.width, text: it.str.trim() };
    });
    pieces.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    pieces.forEach(function (pc) {
      var line = lines.filter(function (l) { return Math.abs(l.y - pc.y) < 3; })[0];
      if (!line) { line = { y: pc.y, items: [] }; lines.push(line); }
      line.items.push(pc);
    });
    lines.forEach(function (l) { l.items.sort(function (a, b) { return a.x - b.x; }); });
    return lines;
  }

  // Merge pieces separated by small gaps into cells.
  function cellsOf(line) {
    var cells = [];
    line.items.forEach(function (it) {
      var last = cells[cells.length - 1];
      if (last && it.x - (last.x + last.w) < 6) { last.text += " " + it.text; last.w = it.x + it.w - last.x; }
      else cells.push({ x: it.x, w: it.w, text: it.text });
    });
    return cells;
  }

  var HEADER_WORDS = /(narration|description|particulars|details|remarks)/;
  function isDateText(t) { return /^\d{1,2}[\/\-. ](\d{1,2}|[A-Za-z]{3,9})[\/\-. ,]*\d{2,4}\b/.test(String(t).trim()); }
  function lineText(cells) { return cells.map(function (c) { return c.text; }).join(" "); }

  /* Statement tables in PDFs often wrap: headings span two lines ("Withdrawal / Amt.") and long
     narrations continue on extra lines, sometimes above the date when cells are vertically centred.
     So: merge the header block into columns, place every value in its column, then attach each
     undated line to the nearest dated line on the same page. */
  function linesToRows(lines) {
    lines.sort(function (a, b) { return a.page - b.page || b.y - a.y; });
    var cells = lines.map(cellsOf);
    var simple = function () { return clean(cells.map(function (cs) { return cs.map(function (c) { return c.text; }); })); };

    // 1. Header block: a line with a date/narration heading, plus heading lines just above/below it.
    var h = -1, block = [];
    for (var i = 0; i < lines.length && h === -1; i++) {
      var near = [];
      lines.forEach(function (l, j) { if (l.page === lines[i].page && Math.abs(l.y - lines[i].y) <= 16) near.push(j); });
      var t = near.map(function (j) { return lineText(cells[j]); }).join(" ").toLowerCase();
      var own = lineText(cells[i]).toLowerCase();
      if (/\bdate\b/.test(t) && HEADER_WORDS.test(t) && (/\bdate\b/.test(own) || HEADER_WORDS.test(own))) {
        h = i;
        block = near.filter(function (j) { return !cells[j].some(function (c) { return isDateText(c.text) || /\d[\d,]*\.\d{2}/.test(c.text); }); });
      }
    }
    if (h === -1) return simple();

    // 2. Columns = header cells clustered by horizontal overlap.
    var cols = [];
    block.slice().sort(function (a, b) { return lines[b].y - lines[a].y; }).forEach(function (j) {
      cells[j].forEach(function (c) {
        var col = cols.filter(function (k) { return c.x < k.x2 + 4 && c.x + c.w > k.x1 - 4; })[0];
        if (col) { col.x1 = Math.min(col.x1, c.x); col.x2 = Math.max(col.x2, c.x + c.w); col.parts.push(c.text); }
        else cols.push({ x1: c.x, x2: c.x + c.w, parts: [c.text] });
      });
    });
    cols.sort(function (a, b) { return a.x1 - b.x1; });
    var header = cols.map(function (k) { return k.parts.join(" "); });
    var headerTexts = block.map(function (j) { return lineText(cells[j]).toLowerCase(); });
    var dateCol = Math.max(0, header.findIndex(function (x) { return /date/i.test(x) && !/value/i.test(x); }));
    function colOf(c) {
      var mid = c.x + c.w / 2, best = 0, dist = Infinity;
      cols.forEach(function (k, idx) {
        var overlap = c.x <= k.x2 && c.x + c.w >= k.x1;
        var d = overlap ? Math.abs((k.x1 + k.x2) / 2 - mid) / 10 : Math.min(Math.abs(k.x1 - mid), Math.abs(k.x2 - mid));
        if (d < dist) { dist = d; best = idx; }
      });
      return best;
    }

    // 3. Body lines (after the header block; skip headers repeated on later pages).
    var firstBlockY = Math.min.apply(null, block.map(function (j) { return lines[j].y; }));
    var pre = [], body = [];
    lines.forEach(function (l, j) {
      if (block.indexOf(j) !== -1) return;
      var before = l.page < lines[h].page || (l.page === lines[h].page && l.y > firstBlockY);
      if (before) { pre.push([lineText(cells[j])]); return; }
      if (headerTexts.indexOf(lineText(cells[j]).toLowerCase()) !== -1) return;
      var parts = cells[j].map(function (c) { return { col: colOf(c), text: c.text, y: l.y }; });
      var isDate = parts.some(function (p) { return p.col === dateCol && isDateText(p.text); });
      body.push({ page: l.page, y: l.y, parts: parts, isDate: isDate });
    });

    // 4. Attach undated lines to the nearest dated line on the same page.
    var gaps = [];
    for (var b = 1; b < body.length; b++) if (body[b].page === body[b - 1].page) gaps.push(body[b - 1].y - body[b].y);
    gaps.sort(function (x, y) { return x - y; });
    var lineH = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 12;
    var limit = Math.max(14, lineH * 1.9);
    var groups = body.filter(function (l) { return l.isDate; }).map(function (l) { return { anchor: l, lines: [l] }; });
    body.forEach(function (l) {
      if (l.isDate) return;
      var best = null, dist = Infinity;
      groups.forEach(function (g) {
        if (g.anchor.page !== l.page) return;
        var d = Math.abs(g.anchor.y - l.y);
        if (d < dist) { dist = d; best = g; }
      });
      if (best && dist <= limit) best.lines.push(l);
      else groups.push({ anchor: l, lines: [l] });
    });
    groups.sort(function (a, b) { return a.anchor.page - b.anchor.page || b.anchor.y - a.anchor.y; });

    var rows = pre.concat([header]);
    groups.forEach(function (g) {
      var row = header.map(function () { return []; });
      g.lines.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (l) {
        l.parts.forEach(function (p) { row[p.col].push(p.text); });
      });
      rows.push(row.map(function (xs) { return xs.join(" "); }));
    });
    return clean(rows);
  }

  /* ---------------- Public ---------------- */
  function read(file, opts) {
    opts = opts || {};
    var k = kind(file.name);
    if (!k) return Promise.reject(fail("UNSUPPORTED", "Upload a PDF, Excel (.xlsx / .xls) or CSV file."));
    var progress = opts.onProgress || function () {};
    progress("Reading file…", null);
    var work = k === "csv"
      ? readAs(file, "text").then(function (t) { return { rows: csvRows(t) }; })
      : readAs(file, "buffer").then(function (buf) {
          if (k === "excel") { progress("Reading spreadsheet…", null); return excelRows(buf); }
          return pdfRows(buf, opts.password, progress, opts.isCancelled);
        });
    return work.then(function (res) {
      if (opts.isCancelled && opts.isCancelled()) throw fail("CANCELLED", "Cancelled.");
      if (!res.rows.length) throw fail("EMPTY", "No rows were found in this file.");
      res.text = res.rows.map(function (r) { return r.join(" "); }).join("\n");
      res.kind = k;
      return res;
    });
  }

  /* ---------------- Statement facts & column guessing ---------------- */
  function facts(text) {
    var up = String(text || "");
    var bank = (/(HDFC BANK|ICICI BANK|STATE BANK OF INDIA|SBI|AXIS BANK|KOTAK MAHINDRA BANK|CANARA BANK|INDIAN BANK|BANK OF BARODA)/i.exec(up) || [])[1];
    var acct = (/(?:A\/C|ACCOUNT)\s*(?:NO\.?|NUMBER)?\s*[:\-]?\s*([X*\d][X*\d\s-]{5,})/i.exec(up) || [])[1];
    var period = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*(?:to|-|–)\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i.exec(up);
    return { bank: bank || "", account: acct ? acct.replace(/\s+/g, "") : "", period: period ? period[1] + " to " + period[2] : "" };
  }

  var FIELD_HINTS = {
    date: /^(txn |transaction |value )?date|^dt$/i,
    narration: /narration|description|particulars|details|remarks/i,
    ref: /ref|chq|cheque|utr/i,
    debit: /withdraw|debit|^dr\b|paid out/i,
    credit: /deposit|credit|^cr\b|paid in/i,
    amount: /^amount|^amt/i,
    drcr: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type)$/i,
    balance: /balance/i
  };

  function detectHeader(rows) {
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var t = rows[i].join(" ").toLowerCase();
      if (/date/.test(t) && /(narration|description|particulars|details|remarks)/.test(t)) return i;
    }
    return 0;
  }

  function guessMapping(header) {
    var map = {};
    Object.keys(FIELD_HINTS).forEach(function (f) {
      for (var i = 0; i < header.length; i++) {
        var h = header[i];
        if (!FIELD_HINTS[f].test(h)) continue;
        if (Object.keys(map).some(function (k) { return map[k] === i; })) continue;
        if (f === "date" && /value/i.test(h) && header.some(function (x, j) { return j !== i && /^(txn |transaction )?date/i.test(x); })) continue;
        map[f] = i; break;
      }
    });
    return map;
  }

  return { read: read, facts: facts, detectHeader: detectHeader, guessMapping: guessMapping, kind: kind };
})();
