// Toggles the mobile nav dropdown (hamburger menu). Shared across every
// site page since they all use the same header/nav markup.
(function () {
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("siteNav");
  if (!toggle || !nav) return;

  function closeMenu() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
  function openMenu() {
    nav.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener("click", function () {
    if (nav.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Close the menu after tapping any link inside it.
  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  // Close the menu if the window is resized back to desktop width.
  window.addEventListener("resize", function () {
    if (window.innerWidth > 860) closeMenu();
  });
})();