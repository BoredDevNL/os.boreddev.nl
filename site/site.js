(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  if (!header) return;

  var toggle = header.querySelector(".nav-toggle");
  var backdrop = header.querySelector(".nav-backdrop");
  var nav = header.querySelector("#site-nav");

  function setOpen(open) {
    header.classList.toggle("nav-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  }

  if (toggle) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!header.classList.contains("nav-open"));
    });
  }

  var drawerClose = header.querySelector(".drawer-close");
  if (drawerClose) {
    drawerClose.addEventListener("click", function () {
      setOpen(false);
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }
  header.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () {
      setOpen(false);
    });
  });

  header.querySelectorAll(".nav-group-title").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      var group = btn.parentElement;
      var isOpen = group.classList.contains("open");
      header.querySelectorAll(".nav-group.open").forEach(function (g) {
        if (g !== group) {
          g.classList.remove("open");
          g.classList.add("force-closed");
          var b = g.querySelector(".nav-group-title");
          if (b) b.setAttribute("aria-expanded", "false");
        }
      });
      if (isOpen) {
        group.classList.add("force-closed");
      } else {
        group.classList.remove("force-closed");
      }
      group.classList.toggle("open", !isOpen);
      btn.setAttribute("aria-expanded", String(!isOpen));
      e.stopPropagation();
    });
  });

  header.querySelectorAll(".nav-group").forEach(function (group) {
    group.addEventListener("mouseenter", function () {
      group.classList.remove("force-closed");
    });
    group.addEventListener("mouseleave", function () {
      group.classList.remove("force-closed");
    });
  });

  document.addEventListener("click", function (e) {
    if (!header.contains(e.target)) {
      setOpen(false);
      header.querySelectorAll(".nav-group.open").forEach(function (g) {
        g.classList.remove("open");
        var b = g.querySelector(".nav-group-title");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      setOpen(false);
      header.querySelectorAll(".nav-group.open").forEach(function (g) {
        g.classList.remove("open");
        var b = g.querySelector(".nav-group-title");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    }
  });
  var yearEl = document.querySelector(".footer-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

})();