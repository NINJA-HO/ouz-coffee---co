// Loads the Café's nested menu tree from Firestore ("menuItems" collection,
// where each item optionally has a parentId pointing to another item) and
// renders it as clickable cards. Clicking an item that HAS sub-items drills
// down into them (with a breadcrumb + back button); clicking a "leaf" item
// (no sub-items) opens a simple info popup — image, price, description,
// no ordering — exactly like the admin's Menu page describes it. Works for
// however deep any given branch goes, since it's built recursively rather
// than assuming a fixed number of levels.
//
// Uses the Firebase "compat" (non-module) API for the same reason as
// product-loader.js: better compatibility with networks/proxies that have
// been seen mis-handling ES module <script type="module"> imports.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  var grid = document.getElementById("menu-grid");
  var emptyMsg = document.getElementById("menu-empty");
  var breadcrumbEl = document.getElementById("menuBreadcrumb");
  if (!grid) return;

  var allItems = []; // flat list, each with .id
  var trail = []; // [{id, name}, ...] — breadcrumb path from root to current level

  function getChildren(parentId) {
    return allItems.filter(function (item) {
      return (item.parentId || "") === (parentId || "");
    });
  }

  function renderBreadcrumb() {
    if (!trail.length) {
      breadcrumbEl.style.display = "none";
      breadcrumbEl.innerHTML = "";
      return;
    }
    breadcrumbEl.style.display = "block";

    var homeLink = document.createElement("a");
    homeLink.href = "#";
    homeLink.textContent = "Menu";
    homeLink.addEventListener("click", function (e) {
      e.preventDefault();
      trail = [];
      renderLevel("");
    });

    breadcrumbEl.innerHTML = "";
    breadcrumbEl.appendChild(homeLink);

    trail.forEach(function (crumb, index) {
      var sep = document.createElement("span");
      sep.textContent = " › ";
      breadcrumbEl.appendChild(sep);

      if (index === trail.length - 1) {
        var current = document.createElement("span");
        current.textContent = crumb.name;
        current.className = "menu-breadcrumb-current";
        breadcrumbEl.appendChild(current);
      } else {
        var link = document.createElement("a");
        link.href = "#";
        link.textContent = crumb.name;
        link.addEventListener("click", function (e) {
          e.preventDefault();
          trail = trail.slice(0, index + 1);
          renderLevel(crumb.id);
        });
        breadcrumbEl.appendChild(link);
      }
    });
  }

  function renderLevel(parentId) {
    var items = getChildren(parentId);
    grid.innerHTML = "";
    renderBreadcrumb();

    if (!items.length) {
      emptyMsg.style.display = "block";
      emptyMsg.textContent = trail.length
        ? "Nothing here yet."
        : "Menu coming soon — check back shortly.";
      return;
    }
    emptyMsg.style.display = "none";

    items.forEach(function (item) {
      var hasChildren = getChildren(item.id).length > 0;
      var flatDescription = (item.description || "")
        .replace(/\s+/g, " ")
        .trim();
      var preview =
        flatDescription.length > 90
          ? flatDescription.slice(0, 90).trim() + "…"
          : flatDescription;

      var card = document.createElement("div");
      card.className = "product-card product-card-clickable";
      card.innerHTML =
        '<div class="product-card-img">' +
        (item.imageUrl
          ? '<img src="' + item.imageUrl + '" alt="' + item.name + '" />'
          : "") +
        "</div>" +
        "<h3>" +
        item.name +
        (hasChildren ? " &rsaquo;" : "") +
        "</h3>" +
        (item.price ? '<div class="price">' + item.price + "</div>" : "") +
        (preview ? '<p class="product-card-desc">' + preview + "</p>" : "");

      card.addEventListener("click", function () {
        if (hasChildren) {
          trail.push({ id: item.id, name: item.name });
          renderLevel(item.id);
        } else {
          openLeafModal(item);
        }
      });

      grid.appendChild(card);
    });
  }

  // ================= LEAF ITEM INFO MODAL (read-only) =================
  var modal = document.getElementById("menuItemModal");
  var modalClose = document.getElementById("menuItemModalClose");
  var modalImage = document.getElementById("menuItemImage");
  var modalName = document.getElementById("menuItemName");
  var modalPrice = document.getElementById("menuItemPrice");
  var modalDesc = document.getElementById("menuItemDesc");

  function openLeafModal(item) {
    if (!modal) return;
    modalName.textContent = item.name || "";
    modalPrice.textContent = item.price || "";
    modalDesc.textContent = item.description || "";

    var galleryEl = modalImage.closest(".pm-gallery");
    if (item.imageUrl) {
      modalImage.src = item.imageUrl;
      if (galleryEl) galleryEl.style.display = "flex";
      modal
        .querySelector(".product-modal-content")
        .classList.remove("no-image");
    } else {
      if (galleryEl) galleryEl.style.display = "none";
      modal.querySelector(".product-modal-content").classList.add("no-image");
    }

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLeafModal() {
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (modalClose) modalClose.addEventListener("click", closeLeafModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeLeafModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLeafModal();
  });

  // ================= LOAD =================
  db.collection("menuItems")
    .orderBy("createdAt", "asc")
    .get()
    .then(function (snapshot) {
      allItems = [];
      snapshot.forEach(function (docSnap) {
        allItems.push(Object.assign({ id: docSnap.id }, docSnap.data()));
      });
      renderLevel("");
    })
    .catch(function (err) {
      emptyMsg.style.display = "block";
      emptyMsg.textContent = "Menu coming soon — check back shortly.";
      console.warn("Menu could not load from Firestore.", err);
    });
})();
