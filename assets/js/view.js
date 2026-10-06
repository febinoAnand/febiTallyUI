/* =========================================================
   Web / mobile view
   index.html asks which view to use; the choice lasts for the browser session.
   Mobile view on a wide screen opens the page inside a phone frame (mobile.html),
   so the phone layout applies exactly as it would on a real phone.
   Loaded in <head> of every page, after the stylesheet.
   ========================================================= */
var FebiView = (function () {
  var KEY = "tally_view", LAST = "tally_view_last";
  var root = document.documentElement;
  var file = location.pathname.split("/").pop() || "index.html";
  var here = file + location.search + location.hash;
  var framed = false;
  try { framed = window.top !== window; } catch (e) { framed = true; }

  function read(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function write(store, k, v) { try { if (v) store.setItem(k, v); else store.removeItem(k); } catch (e) { /* ignore */ } }

  var mode = framed ? "mobile" : read(sessionStorage, KEY);

  /* Navigate the whole tab — from inside the phone frame that means asking the frame page. */
  function go(url) {
    if (framed) window.parent.postMessage({ febi: "nav", url: url }, "*");
    else window.location.href = url;
  }
  function set(m) { write(sessionStorage, KEY, m); write(localStorage, LAST, m); }
  /* Back to the chooser, remembering where we were. */
  function choose() {
    write(sessionStorage, KEY, null);
    go("index.html?next=" + encodeURIComponent(here));
  }
  function wide() { return Math.max(window.innerWidth, document.documentElement.clientWidth || 0) >= 700; }
  function safeNext(n) { return /^[\w-]+\.html([?#].*)?$/.test(n || "") && !/^(index|mobile)\.html/.test(n) ? n : ""; }

  var api = { mode: mode, framed: framed, set: set, go: go, choose: choose, wide: wide, safeNext: safeNext, last: function () { return read(localStorage, LAST); } };

  // [data-view-pill] buttons show the current view and reopen the chooser.
  var ICON = {
    mobile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
  };
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-view-pill]").forEach(function (b) {
      var m = mode === "mobile" ? "mobile" : "web";
      b.innerHTML = ICON[m] + "<span>" + (m === "mobile" ? "Mobile" : "Web") + " view</span><b>Change</b>";
      b.addEventListener("click", choose);
    });
  });

  // The chooser and the phone frame manage themselves.
  if (file === "index.html" || file === "mobile.html") return api;

  if (!mode) {
    root.style.visibility = "hidden";
    window.location.replace("index.html?next=" + encodeURIComponent(here));
    return api;
  }

  root.setAttribute("data-view", mode);

  if (mode === "mobile" && !framed && wide()) {
    root.style.visibility = "hidden";
    window.location.replace("mobile.html?p=" + encodeURIComponent(here));
    return api;
  }

  if (mode === "web" && Math.min(screen.width, screen.height) < 768) {
    // Web view on a phone: show the full desktop layout, zoomed out.
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) vp.setAttribute("content", "width=1280");
  }

  if (framed) {
    // Keep the frame's address bar and title in step with the page shown inside it.
    var report = function () { window.parent.postMessage({ febi: "page", url: file + location.search + location.hash, title: document.title }, "*"); };
    window.addEventListener("DOMContentLoaded", report);
    window.addEventListener("hashchange", report);
  }
  return api;
})();
