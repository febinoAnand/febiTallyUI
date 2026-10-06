/* =========================================================
   Shared item-grid editor + printable document preview.
   Used by Invoice / Quotation and Sales & Purchase.
   ========================================================= */
var Items = (function () {

  /* Editable line-item grid. `tbody` gets one <tr> per line; onChange fires on every edit. */
  function editor(tbody, onChange) {
    var listId = "itemList" + Math.random().toString(36).slice(2, 6);
    var dl = document.createElement("datalist");
    dl.id = listId;
    dl.innerHTML = Data.ITEMS.map(function (i) { return '<option value="' + App.esc(i.name) + '">'; }).join("");
    document.body.appendChild(dl);

    function rowHtml(it) {
      it = it || {};
      return '<td><input type="text" class="it-name" list="' + listId + '" placeholder="Item name" value="' + App.esc(it.name || "") + '"></td>' +
        '<td style="width:90px"><input type="text" class="it-hsn mono" placeholder="HSN" value="' + App.esc(it.hsn || "") + '"></td>' +
        '<td style="width:80px"><input type="number" class="it-qty num" min="0" step="1" value="' + (it.qty == null ? 1 : it.qty) + '"></td>' +
        '<td style="width:110px"><input type="number" class="it-rate num" min="0" step="0.01" value="' + (it.rate || "") + '" placeholder="0.00"></td>' +
        '<td style="width:100px"><select class="it-gst">' + [0, 5, 12, 18, 28].map(function (g) { return "<option value='" + g + "'" + (Number(it.gst) === g ? " selected" : "") + ">" + g + "%</option>"; }).join("") + "</select></td>" +
        '<td class="num it-amt" style="width:120px;font-weight:700">₹0.00</td>' +
        '<td style="width:44px"><button type="button" class="btn btn-ghost btn-xs it-del" title="Remove">' + App.icon("trash") + "</button></td>";
    }

    function addRow(it) {
      var tr = document.createElement("tr");
      tr.innerHTML = rowHtml(it);
      tbody.appendChild(tr);
      recalc();
      return tr;
    }

    function getItems() {
      return Array.prototype.map.call(tbody.querySelectorAll("tr"), function (tr) {
        var unitMatch = Data.ITEMS.filter(function (i) { return i.name === tr.querySelector(".it-name").value; })[0];
        return {
          name: tr.querySelector(".it-name").value.trim(),
          hsn: tr.querySelector(".it-hsn").value.trim(),
          qty: Number(tr.querySelector(".it-qty").value) || 0,
          rate: Number(tr.querySelector(".it-rate").value) || 0,
          gst: Number(tr.querySelector(".it-gst").value) || 0,
          unit: unitMatch ? unitMatch.unit : "Nos"
        };
      }).filter(function (i) { return i.name && i.qty > 0; });
    }

    function setItems(items) {
      tbody.innerHTML = "";
      (items && items.length ? items : [{}]).forEach(addRow);
    }

    function recalc() {
      tbody.querySelectorAll("tr").forEach(function (tr) {
        var amt = (Number(tr.querySelector(".it-qty").value) || 0) * (Number(tr.querySelector(".it-rate").value) || 0);
        tr.querySelector(".it-amt").textContent = App.inr(amt);
      });
      if (onChange) onChange();
    }

    tbody.addEventListener("input", function (e) {
      // Picking a known item fills HSN, rate and GST.
      if (e.target.classList.contains("it-name")) {
        var match = Data.ITEMS.filter(function (i) { return i.name === e.target.value; })[0];
        if (match) {
          var tr = e.target.closest("tr");
          tr.querySelector(".it-hsn").value = match.hsn;
          tr.querySelector(".it-rate").value = match.rate;
          tr.querySelector(".it-gst").value = match.gst;
        }
      }
      recalc();
    });
    tbody.addEventListener("change", recalc);
    tbody.addEventListener("click", function (e) {
      var del = e.target.closest(".it-del");
      if (!del) return;
      if (tbody.querySelectorAll("tr").length === 1) { setItems([]); return; }
      del.closest("tr").remove();
      recalc();
    });

    return { addRow: addRow, getItems: getItems, setItems: setItems, recalc: recalc };
  }

  /* Totals block (subtotal, CGST/SGST or IGST, grand total) for the entry forms. */
  function totalsHtml(t) {
    return '<div class="totals-row"><span>Taxable value</span><span>' + App.inr(t.subtotal) + "</span></div>" +
      (t.igst ? '<div class="totals-row"><span>IGST</span><span>' + App.inr(t.igst) + "</span></div>"
              : '<div class="totals-row"><span>CGST</span><span>' + App.inr(t.cgst) + '</span></div><div class="totals-row"><span>SGST</span><span>' + App.inr(t.sgst) + "</span></div>") +
      '<div class="totals-row"><span>Round off</span><span>' + App.inr(t.total - t.subtotal - t.cgst - t.sgst - t.igst) + "</span></div>" +
      '<div class="totals-row grand"><span>Grand Total</span><span>' + App.inr(t.total) + "</span></div>";
  }

  /* Printable tax-invoice / quotation / purchase-bill preview. */
  function preview(doc, tenant, title) {
    var t = Data.computeTotals(doc.items, doc.partyState);
    var lines = (doc.items || []).map(function (it, i) {
      var amt = it.qty * it.rate;
      return "<tr><td>" + (i + 1) + "</td><td><b>" + App.esc(it.name) + '</b></td><td class="mono">' + App.esc(it.hsn || "") + '</td><td class="num">' + it.qty + " " + App.esc(it.unit || "") + '</td><td class="num">' + App.inr(it.rate) + '</td><td class="num">' + it.gst + '%</td><td class="num">' + App.inr(amt) + "</td></tr>";
    }).join("") || '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px">Add items to see them here</td></tr>';
    var irn = doc.einvoice && doc.einvoice.status === "Generated" ? doc.einvoice : null;

    return '<div class="doc-preview">' +
      '<div class="doc-head"><div><div class="doc-co">' + App.esc(tenant.companyName) + '</div><div style="color:#6b7280;font-size:11.5px">' + App.esc(tenant.state) + " · GSTIN " + App.esc(tenant.gstin || "—") + "<br>" + App.esc(tenant.email) + " · " + App.esc(tenant.contactNumber) + "</div></div>" +
      '<div class="doc-meta"><h3>' + App.esc(title) + "</h3>No. <b>" + App.esc(doc.number || "—") + "</b><br>Date <b>" + App.date(doc.date) + "</b>" +
      (doc.validTill ? "<br>Valid till <b>" + App.date(doc.validTill) + "</b>" : "") + (doc.dueDate ? "<br>Due <b>" + App.date(doc.dueDate) + "</b>" : "") + "</div></div>" +
      (irn ? '<div style="font-size:10.5px;color:#4b5563;margin:-6px 0 12px;word-break:break-all"><b>IRN:</b> <span class="mono">' + irn.irn + "</span> · <b>Ack No:</b> " + irn.ackNo + "</div>" : "") +
      '<div class="doc-parties"><div><div class="lbl">' + (title === "PURCHASE BILL" ? "Supplier" : "Bill To") + '</div><b style="font-size:13.5px">' + App.esc(doc.party || "—") + "</b><br>" + App.esc(doc.partyState || "") + (doc.partyGstin ? '<br>GSTIN <span class="mono">' + App.esc(doc.partyGstin) + "</span>" : "") + "</div>" +
      '<div><div class="lbl">Place of Supply</div><b>' + App.esc(doc.partyState || tenant.state) + "</b><br>" + (t.igst ? "Inter-state · IGST" : "Intra-state · CGST + SGST") + "</div></div>" +
      '<table class="doc-table"><thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amount</th></tr></thead><tbody>' + lines + "</tbody></table>" +
      '<div class="doc-totals"><div><span>Taxable value</span><span>' + App.inr(t.subtotal) + "</span></div>" +
      (t.igst ? "<div><span>IGST</span><span>" + App.inr(t.igst) + "</span></div>" : "<div><span>CGST</span><span>" + App.inr(t.cgst) + "</span></div><div><span>SGST</span><span>" + App.inr(t.sgst) + "</span></div>") +
      '<div class="grand"><span>Total</span><span>' + App.inr(t.total) + "</span></div></div>" +
      '<div class="doc-words">' + App.amountInWords(t.total) + "</div>" +
      (doc.notes || doc.narration ? '<div style="margin-top:10px;font-size:11.5px"><b>Notes:</b> ' + App.esc(doc.notes || doc.narration) + "</div>" : "") +
      '<div class="doc-foot"><span>This is a computer-generated document.</span>' + (irn ? '<span class="doc-stamp">E-INVOICED</span>' : "<span>For " + App.esc(tenant.companyName) + "<br><br>Authorised Signatory</span>") + "</div>" +
      "</div>";
  }

  /* Opens a print window containing just the document. */
  function print(html) {
    var w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { App.toast("Allow pop-ups to print.", "bad"); return; }
    var css = document.querySelector('link[href*="style.css"]').href;
    w.document.write('<!DOCTYPE html><html><head><title>Print</title><link rel="stylesheet" href="' + css + '"><style>body{background:#fff;padding:24px}.doc-preview{box-shadow:none;border:0}</style></head><body>' + html + "</body></html>");
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 500);
  }

  return { editor: editor, totalsHtml: totalsHtml, preview: preview, print: print };
})();
