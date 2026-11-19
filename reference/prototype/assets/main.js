(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* reading progress, header state, back to top */
  var bar = $(".progress"), head = $(".site-head"), top = $(".totop");
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (bar) bar.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
    if (head) head.classList.toggle("scrolled", h.scrollTop > 20);
    if (top) top.classList.toggle("show", h.scrollTop > 700);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (top) top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });

  /* chapters open as they enter the screen */
  var rev = $$(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("open"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    rev.forEach(function (el) { io.observe(el); });
  } else {
    rev.forEach(function (el) { el.classList.add("open"); });
  }

  /* count-up for plain integers only */
  $$("[data-count]").forEach(function (el) {
    var end = parseInt(el.getAttribute("data-count"), 10);
    if (reduce || !("IntersectionObserver" in window)) return;
    var fmt = function (n) { return n.toLocaleString("en-US"); };
    var done = false;
    new IntersectionObserver(function (es, obs) {
      if (done || !es[0].isIntersecting) return;
      done = true; obs.disconnect();
      var t0 = performance.now(), dur = 1400;
      (function step(t) {
        var p = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(end * eased));
        if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(end);
      })(t0);
    }, { threshold: 0.6 }).observe(el);
  });

  /* "how was this measured" toggles */
  $$(".stat button").forEach(function (b) {
    b.addEventListener("click", function () {
      var how = document.getElementById(b.getAttribute("aria-controls"));
      var open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", String(!open));
      how.hidden = open;
      b.textContent = open ? "How was this measured?" : "Hide";
    });
  });

  /* command palette: Ctrl/Cmd + K, or the Jump to button */
  var dlg = $("#palette"), input = $("#pal-input"), list = $("#pal-list");
  if (dlg && typeof dlg.showModal === "function") {
    var items = $$("a", list);
    var filter = function () {
      var q = input.value.trim().toLowerCase();
      items.forEach(function (a) { a.parentNode.hidden = q && a.textContent.toLowerCase().indexOf(q) === -1; });
    };
    var openPal = function () { dlg.showModal(); input.value = ""; filter(); input.focus(); };
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); dlg.open ? dlg.close() : openPal(); }
    });
    $$("[data-open-palette]").forEach(function (b) { b.addEventListener("click", openPal); });
    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var first = items.filter(function (a) { return !a.parentNode.hidden; })[0]; if (first) first.click(); }
      if (e.key === "ArrowDown") { var f = items.filter(function (a) { return !a.parentNode.hidden; })[0]; if (f) { e.preventDefault(); f.focus(); } }
    });
    list.addEventListener("click", function (e) { if (e.target.closest("a")) dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  } else {
    $$("[data-open-palette]").forEach(function (b) { b.hidden = true; });
  }

  /* contact form: posts to Web3Forms, which emails the owner. No address is on the page. */
  var form = $("#contact-form"), status = $("#form-status");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = ""; status.textContent = "Sending...";
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.success) { status.className = "ok"; status.textContent = "Thanks. Your message is on its way, and I'll reply soon."; form.reset(); }
          else { throw new Error("fail"); }
        })
        .catch(function () { status.className = "err"; status.textContent = "That did not send. Please try again, or message me on LinkedIn."; });
    });
  }
  var y = $("#year"); if (y) y.textContent = new Date().getFullYear();
})();
