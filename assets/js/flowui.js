/* =========================================================
   Step flow UI: a progress bar over numbered step cards,
   one step open at a time, folded summaries for finished
   steps, locked future steps, and Back / Continue buttons.

   FlowUI.init({
     bar: element for the progress bar,
     steps: [{ id, label, state() → "done" | "ready" | "locked", lockedMsg, summary() → text }],
     onOpen(index)
   })
   ========================================================= */
var FlowUI = (function () {
  function init(opts) {
    var steps = opts.steps, open = -1;
    var els = steps.map(function (s) { return document.getElementById(s.id); });

    // Progress bar
    opts.bar.innerHTML = '<ol class="flowbar-steps">' + steps.map(function (s, i) {
      return '<li><button type="button" class="fb-step" data-i="' + i + '"><span class="fb-num">' + (i + 1) + '</span><span class="fb-label">' + s.label + "</span></button></li>";
    }).join("") + "</ol>";
    opts.bar.addEventListener("click", function (e) { var b = e.target.closest(".fb-step"); if (b) go(Number(b.dataset.i), true); });

    // Each card: clickable head with a summary, and a Back / Continue footer.
    els.forEach(function (el, i) {
      var head = el.querySelector(".card-head"), title = head.querySelector(".flow-title");
      var sum = document.createElement("span"); sum.className = "step-sum"; head.appendChild(sum);
      var chev = document.createElement("span"); chev.className = "step-chev"; chev.innerHTML = App.icon("arrowRight"); head.appendChild(chev);
      title.setAttribute("role", "button"); title.tabIndex = 0;
      head.addEventListener("click", function (e) {
        if (e.target.closest("select, input, button, a, label") && !e.target.closest(".flow-title")) return;
        go(i === open ? -1 : i, true);
      });
      title.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(i === open ? -1 : i, true); } });
      var body = el.querySelectorAll(":scope > .card-body"), last = body[body.length - 1];
      var nav = document.createElement("div"); nav.className = "step-nav";
      nav.innerHTML = (i > 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-back>' + App.icon("arrowRight", 'style="transform:rotate(180deg)"') + "Back</button>" : "<span></span>") +
        '<span class="step-nav-hint muted small"></span>' +
        (i < steps.length - 1 ? '<button type="button" class="btn btn-primary btn-sm" data-next>Continue to ' + steps[i + 1].label + " " + App.icon("arrowRight") + "</button>" : "");
      (last || el).appendChild(nav);
      nav.addEventListener("click", function (e) {
        if (e.target.closest("[data-back]")) go(i - 1, true);
        if (e.target.closest("[data-next]")) go(i + 1, true);
      });
    });

    function state(i) { return steps[i].state(); }
    function firstLockedReason(i) {
      for (var k = 0; k < i; k++) if (state(k) !== "done" && !steps[k].optional) return "Finish step " + (k + 1) + " (" + steps[k].label + ") first.";
      return steps[i].lockedMsg || "Finish the earlier steps first.";
    }
    function go(i, scroll) {
      if (i >= 0 && state(i) === "locked") { App.toast(firstLockedReason(i), "info"); return; }
      open = i;
      paint();
      if (opts.onOpen && i >= 0) opts.onOpen(i);
      if (scroll && i >= 0) setTimeout(function () {
        var mb = document.querySelector(".mobile-bar"), sticky = opts.bar.closest(".flowbar");
        var offset = (mb && getComputedStyle(mb).display !== "none" ? mb.offsetHeight : 0) + 12 + (sticky && getComputedStyle(sticky).position === "sticky" ? sticky.offsetHeight + 8 : 0);
        var top = els[i].getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }, 30);
    }
    function paint() {
      var btns = opts.bar.querySelectorAll(".fb-step");
      steps.forEach(function (s, i) {
        var st = state(i), el = els[i];
        el.classList.toggle("collapsed", i !== open);
        el.classList.toggle("done", st === "done");
        el.classList.toggle("locked", st === "locked");
        el.classList.toggle("current", i === open);
        var sum = el.querySelector(".step-sum");
        sum.textContent = i === open ? "" : st === "locked" ? firstLockedReason(i) : (s.summary && s.summary()) || (st === "done" ? "Done" : "Open");
        btns[i].className = "fb-step " + st + (i === open ? " current" : "");
        btns[i].querySelector(".fb-num").innerHTML = st === "done" && i !== open ? "✓" : String(i + 1);
        var next = el.querySelector("[data-next]"), hint = el.querySelector(".step-nav-hint");
        if (next) {
          var blocked = st !== "done" && !s.optional;
          next.disabled = blocked;
          hint.textContent = blocked ? (s.nextHint ? s.nextHint() : "Complete this step to continue.") : "";
          next.title = hint.textContent;
        }
      });
    }
    // The first step that isn't done (and isn't locked) is where the user should be.
    function resume() {
      for (var i = 0; i < steps.length; i++) if (state(i) !== "done") { go(state(i) === "locked" ? Math.max(0, i - 1) : i, false); return; }
      go(steps.length - 1, false);
    }
    return { go: go, refresh: paint, resume: resume, current: function () { return open; } };
  }
  return { init: init };
})();
