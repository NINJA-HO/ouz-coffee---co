// Loads products (Coffee Gear, Roastery, Green Beans — set via
// window.PRODUCT_CATEGORY on each page) from Firestore and renders them as
// teaser cards (one image, name, price, truncated description, a Place
// Order button, and a circular WhatsApp button). Clicking a card opens a
// full-detail modal with all images + full description. Clicking "Place
// Order" opens an order form (with a Quantity field, and an optional
// Membership Code field) that submits to the placeOrder Cloud Function —
// which checks REAL, live stock atomically before accepting the order, so
// it can never oversell even if two people order at the same time, and
// rejects orders for products with no stock tracked at all (untracked = 0
// available). If a product's stock is 0 (or untracked), ordering is
// disabled up front and an "Out of Stock" badge shows instead. Clicking
// the WhatsApp button opens a WhatsApp chat pre-filled with the product
// name, price, and a direct link back to that product, using the number
// set by the admin in Settings (fetched from the "settings" collection).
//
// Membership Code (optional): if a customer has an approved event
// application ID card, they can enter its 5-digit code here. The
// placeOrder function checks it against the private eventApplications
// collection server-side — valid only if the code exists, is approved,
// hasn't expired, AND the event's categories include this product's own
// category. If valid, the order is tagged with the offer details for the
// admin to see and manually honor (prices on this site are free text, not
// structured numbers a discount could be mechanically calculated
// against). If invalid, the exact reason is shown inline instead of
// silently failing.
//
// NESTED CATEGORIES (opt-in): when a page sets window.PRODUCT_TREE = true,
// items can be organised into groups. A "group" (isGroup === true, or any
// item that has sub-items) is browse-only: its card shows just an image,
// name and description — no price, no stock badge, no Place Order or
// WhatsApp button. Tapping a group drills into it (with a breadcrumb and
// the group's description as an intro line). Items with no sub-items are
// normal products with the full order flow. Pages that don't set the flag
// (Roastery, Green Beans) behave exactly as before.
//
// Uses the Firebase "compat" (non-module) API on purpose: some networks/proxies
// have been seen mis-handling ES module <script type="module"> imports, so this
// avoids the "import" keyword entirely for maximum compatibility.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  var CATEGORY = window.PRODUCT_CATEGORY || "coffee-gear";
  var TREE_MODE = window.PRODUCT_TREE === true;
  var ROOT_LABEL = window.PRODUCT_ROOT_LABEL || "All";
  var DESC_PREVIEW_LENGTH = 90;
  var currentOrderProduct = null; // includes .id (Firestore doc id) once set
  var whatsappNumber = "";
  var PLACE_ORDER_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/placeOrder";

  var WHATSAPP_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.25.9 4.29 2.4 5.9L2 22l5.5-1.8C9 20.7 10.46 21 12 21c5.52 0 10-4.02 10-9S17.52 2 12 2z"/></svg>';

  function isOutOfStock(product) {
    return typeof product.stock !== "number" || product.stock <= 0;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // Renders a price string, supporting an optional strikethrough discount
  // syntax: "~~NPR 1400~~ NPR 999" shows NPR 1400 crossed out next to
  // NPR 999 in bold. A plain price like "NPR 999" (or "Ask in-store")
  // with no ~~..~~ just renders as-is, completely unaffected.
  function renderPriceHtml(priceStr) {
    if (!priceStr) return "";
    var match = priceStr.match(/~~(.*?)~~\s*(.*)/);
    if (match) {
      var oldPrice = match[1].trim();
      var newPrice = match[2].trim();
      // The old price gets a highlighted badge (light red background,
      // darker red text, line-through) so it's clearly legible and stands
      // out as a real discount — not just faded gray text — while the
      // current price stays plain, matching normal price styling exactly.
      return (
        '<span style="background:#f3d4d4;color:#8a2f2f;text-decoration:line-through;' +
        'padding:2px 9px;border-radius:5px;margin-right:8px;font-weight:600;">' +
        oldPrice +
        "</span>" +
        newPrice
      );
    }
    return priceStr;
  }

  function buildWhatsappLink(product, productId) {
    var digitsOnly = whatsappNumber.replace(/\D/g, "");
    if (!digitsOnly) return "";
    var productUrl = window.location.origin + window.location.pathname + "?product=" + productId;
    var message =
      'Hi, I\'m interested in "' + (product.name || "") + '" (' + (product.price || "") + ").\n" + productUrl;
    return "https://wa.me/" + digitsOnly + "?text=" + encodeURIComponent(message);
  }

  // ================= PRODUCT DETAIL MODAL =================
  var modal = document.getElementById("productModal");
  var modalClose = document.getElementById("productModalClose");
  var pmMainImage = document.getElementById("pmMainImage");
  var pmThumbRow = document.getElementById("pmThumbRow");
  var pmName = document.getElementById("pmName");
  var pmPrice = document.getElementById("pmPrice");
  var pmDescription = document.getElementById("pmDescription");
  var pmOrderBtn = document.getElementById("pmOrderBtn");
  var pmWhatsappBtn = document.getElementById("pmWhatsappBtn");

  function openModal(product, productId) {
    if (!modal) return;
    var images = product.images || [];

    pmName.textContent = product.name || "";
    pmPrice.innerHTML = renderPriceHtml(product.price || "");
    pmDescription.textContent = product.description || "";

    if (pmOrderBtn) {
      var outOfStock = isOutOfStock(product);
      pmOrderBtn.textContent = outOfStock ? "Out of Stock" : "Place Order";
      pmOrderBtn.classList.toggle("out-of-stock", outOfStock);
    }

    if (pmWhatsappBtn) {
      var link = buildWhatsappLink(product, productId);
      pmWhatsappBtn.href = link || "#";
      pmWhatsappBtn.style.display = link ? "flex" : "none";
    }

    pmMainImage.src = images[0] || "";
    pmMainImage.alt = product.name || "";

    pmThumbRow.innerHTML = "";
    if (images.length > 1) {
      images.forEach(function (url, index) {
        var thumb = document.createElement("img");
        thumb.src = url;
        thumb.className = "pm-thumb" + (index === 0 ? " active" : "");
        thumb.addEventListener("click", function () {
          pmMainImage.src = url;
          pmThumbRow.querySelectorAll(".pm-thumb").forEach(function (t) {
            t.classList.remove("active");
          });
          thumb.classList.add("active");
        });
        pmThumbRow.appendChild(thumb);
      });
      pmThumbRow.style.display = "flex";
    } else {
      pmThumbRow.style.display = "none";
    }

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }
  if (pmOrderBtn) {
    pmOrderBtn.addEventListener("click", function () {
      if (currentOrderProduct && !isOutOfStock(currentOrderProduct)) {
        closeModal();
        openOrderModal(currentOrderProduct);
      }
    });
  }

  // ================= ORDER FORM MODAL =================
  var orderModal = document.getElementById("orderModal");
  var orderModalClose = document.getElementById("orderModalClose");
  var orderFormView = document.getElementById("orderFormView");
  var orderSuccessView = document.getElementById("orderSuccessView");
  var orderProductName = document.getElementById("orderProductName");
  var orderProductPrice = document.getElementById("orderProductPrice");
  var orderProductImage = document.getElementById("orderProductImage");
  var orderName = document.getElementById("orderName");
  var orderPhone = document.getElementById("orderPhone");
  var orderAddress = document.getElementById("orderAddress");
  var orderQuantity = document.getElementById("orderQuantity");
  var orderMembershipCode = document.getElementById("orderMembershipCode"); // optional — page may not have this yet
  var orderNameError = document.getElementById("orderNameError");
  var orderPhoneError = document.getElementById("orderPhoneError");
  var orderAddressError = document.getElementById("orderAddressError");
  var orderQuantityError = document.getElementById("orderQuantityError");
  var orderMembershipCodeError = document.getElementById("orderMembershipCodeError");
  var orderSubmitBtn = document.getElementById("orderSubmitBtn");
  var orderStatus = document.getElementById("orderStatus");
  var orderDoneBtn = document.getElementById("orderDoneBtn");
  var orderSuccessMsg = document.getElementById("orderSuccessMsg"); // optional — shows offer confirmation text

  function clearFieldErrors() {
    [orderName, orderPhone, orderAddress, orderQuantity, orderMembershipCode].forEach(function (el) {
      if (el) el.classList.remove("invalid");
    });
    [orderNameError, orderPhoneError, orderAddressError, orderQuantityError, orderMembershipCodeError].forEach(
      function (el) {
        if (el) el.classList.remove("show");
      }
    );
  }

  function markFieldInvalid(el, errorEl) {
    if (!el) return;
    el.classList.add("invalid");
    if (errorEl) errorEl.classList.add("show");
  }

  [
    [orderName, orderNameError],
    [orderPhone, orderPhoneError],
    [orderAddress, orderAddressError],
    [orderQuantity, orderQuantityError],
    [orderMembershipCode, orderMembershipCodeError],
  ].forEach(function (pair) {
    var el = pair[0];
    var errorEl = pair[1];
    if (!el) return;
    el.addEventListener("input", function () {
      el.classList.remove("invalid");
      if (errorEl) errorEl.classList.remove("show");
    });
  });

  function openOrderModal(product) {
    if (!orderModal) return;
    currentOrderProduct = product;

    orderProductName.textContent = product.name || "";
    orderProductPrice.innerHTML = renderPriceHtml(product.price || "");
    orderProductImage.src = (product.images && product.images[0]) || "";
    orderProductImage.alt = product.name || "";

    orderName.value = "";
    orderPhone.value = "";
    orderAddress.value = "";
    if (orderMembershipCode) orderMembershipCode.value = "";
    orderStatus.textContent = "";
    orderStatus.className = "order-status";
    clearFieldErrors();

    if (orderQuantity) {
      orderQuantity.value = 1;
      if (typeof product.stock === "number") {
        orderQuantity.max = product.stock;
      } else {
        orderQuantity.removeAttribute("max");
      }
    }

    orderFormView.style.display = "block";
    orderSuccessView.style.display = "none";

    orderModal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeOrderModal() {
    if (!orderModal) return;
    orderModal.classList.remove("open");
    document.body.style.overflow = "";
  }

  if (orderModalClose) orderModalClose.addEventListener("click", closeOrderModal);
  if (orderDoneBtn) orderDoneBtn.addEventListener("click", closeOrderModal);
  if (orderModal) {
    orderModal.addEventListener("click", function (e) {
      if (e.target === orderModal) closeOrderModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeModal();
      closeOrderModal();
    }
  });

  if (orderSubmitBtn) {
    orderSubmitBtn.addEventListener("click", function () {
      var name = orderName.value.trim();
      var phone = orderPhone.value.trim();
      var address = orderAddress.value.trim();
      var quantity = orderQuantity ? parseInt(orderQuantity.value, 10) : 1;
      var membershipCode = orderMembershipCode ? orderMembershipCode.value.trim() : "";
      var phoneDigits = phone.replace(/\D/g, "");
      var phoneValid =
        phoneDigits.length === 10 || (phoneDigits.length === 13 && phoneDigits.indexOf("977") === 0);
      var maxStock =
        currentOrderProduct && typeof currentOrderProduct.stock === "number"
          ? currentOrderProduct.stock
          : null;
      var quantityValid =
        !isNaN(quantity) && quantity >= 1 && (maxStock === null || quantity <= maxStock);

      clearFieldErrors();
      var firstInvalid = null;

      if (!name) {
        markFieldInvalid(orderName, orderNameError);
        firstInvalid = firstInvalid || orderName;
      }
      if (!phone || !phoneValid) {
        markFieldInvalid(orderPhone, orderPhoneError);
        firstInvalid = firstInvalid || orderPhone;
      }
      if (!address) {
        markFieldInvalid(orderAddress, orderAddressError);
        firstInvalid = firstInvalid || orderAddress;
      }
      if (orderQuantity && !quantityValid) {
        markFieldInvalid(orderQuantity, orderQuantityError);
        if (orderQuantityError) {
          orderQuantityError.textContent =
            maxStock !== null
              ? "Please enter a quantity between 1 and " + maxStock + " (available stock)."
              : "Please enter a valid quantity (1 or more).";
        }
        firstInvalid = firstInvalid || orderQuantity;
      }

      if (firstInvalid) {
        orderStatus.textContent = "Please fix the highlighted field(s) above.";
        orderStatus.className = "order-status error";
        firstInvalid.focus();
        return;
      }
      if (!currentOrderProduct) return;

      orderSubmitBtn.disabled = true;
      orderSubmitBtn.textContent = "Submitting...";
      orderStatus.textContent = "";
      orderStatus.className = "order-status";

      fetch(PLACE_ORDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: currentOrderProduct.id || "",
          quantity: quantity,
          customerName: name,
          mobileNumber: phone,
          address: address,
          membershipCode: membershipCode,
        }),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (result) {
          if (result.success) {
            orderFormView.style.display = "none";
            orderSuccessView.style.display = "block";
            if (orderSuccessMsg) {
              orderSuccessMsg.textContent = result.offerApplied
                ? "Offer applied — " + (result.offerText || "your membership offer") + " — confirmed by our team."
                : "";
              orderSuccessMsg.style.display = result.offerApplied ? "block" : "none";
            }
          } else if (result.error === "Insufficient stock") {
            var available = typeof result.available === "number" ? result.available : 0;
            if (orderQuantity) {
              markFieldInvalid(orderQuantity, orderQuantityError);
              if (orderQuantityError) {
                orderQuantityError.textContent =
                  available > 0
                    ? "Only " + available + " left in stock. Please lower the quantity."
                    : "Sorry, this item just went out of stock.";
              }
              orderQuantity.max = available;
            }
            orderStatus.textContent = "Please adjust the quantity above.";
            orderStatus.className = "order-status error";
          } else if (
            result.error === "membership_category_mismatch" ||
            result.error === "membership_expired" ||
            result.error === "membership_invalid"
          ) {
            markFieldInvalid(orderMembershipCode, orderMembershipCodeError);
            if (orderMembershipCodeError) {
              orderMembershipCodeError.textContent = result.message || "That membership code isn't valid for this order.";
            }
            orderStatus.textContent = "Please check the membership code, or remove it to order without it.";
            orderStatus.className = "order-status error";
          } else {
            orderStatus.textContent = "Something went wrong. Please try again.";
            orderStatus.className = "order-status error";
          }
        })
        .catch(function (err) {
          orderStatus.textContent = "Something went wrong. Please try again.";
          orderStatus.className = "order-status error";
          console.error(err);
        })
        .finally(function () {
          orderSubmitBtn.disabled = false;
          orderSubmitBtn.textContent = "Submit Order";
        });
    });
  }

  // ================= PRODUCT CARD (orderable product) =================
  // Builds the standard product card. Used as-is by both the flat list
  // (Roastery, Green Beans) and the nested view (Coffee Gear).
  function buildProductCard(data, docId) {
    var images = data.images || [];
    var mainImage = images[0] || "";
    var description = data.description || "";
    var flatDescription = description.replace(/\s+/g, " ").trim();
    var preview =
      flatDescription.length > DESC_PREVIEW_LENGTH
        ? flatDescription.slice(0, DESC_PREVIEW_LENGTH).trim() + "…"
        : flatDescription;

    var whatsappLink = buildWhatsappLink(data, docId);
    var whatsappHtml = whatsappLink
      ? '<a class="whatsapp-btn" href="' + whatsappLink + '" target="_blank" rel="noopener" ' +
        'aria-label="Chat on WhatsApp about ' + (data.name || "this product") + '">' +
        WHATSAPP_ICON_SVG +
        "</a>"
      : "";

    var outOfStock = isOutOfStock(data);
    var badgeHtml = outOfStock ? '<span class="out-of-stock-badge">Out of Stock</span>' : "";
    var orderBtnHtml =
      '<button class="btn btn-primary product-card-order-btn' +
      (outOfStock ? " out-of-stock" : "") +
      '" type="button">' +
      (outOfStock ? "Out of Stock" : "Place Order") +
      "</button>";

    var card = document.createElement("div");
    card.className = "product-card product-card-clickable";
    card.innerHTML =
      '<div class="product-card-img">' +
      '<img src="' + mainImage + '" alt="' + (data.name || "") + '" />' +
      "</div>" +
      badgeHtml +
      "<h3>" + (data.name || "") + "</h3>" +
      '<div class="price">' + renderPriceHtml(data.price || "") + "</div>" +
      '<p class="product-card-desc">' + preview + "</p>" +
      '<div class="product-card-action-row">' +
      orderBtnHtml +
      whatsappHtml +
      "</div>";

    card.addEventListener("click", function () {
      currentOrderProduct = data;
      openModal(data, docId);
    });

    card.querySelector(".product-card-order-btn").addEventListener("click", function (e) {
      e.stopPropagation();
      if (!outOfStock) {
        currentOrderProduct = data;
        openOrderModal(data);
      }
    });

    var waBtn = card.querySelector(".whatsapp-btn");
    if (waBtn) {
      waBtn.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    return card;
  }

  // ================= FLAT LIST (original behaviour) =================
  function loadFlatProducts() {
    var grid = document.getElementById("product-grid");
    var emptyMsg = document.getElementById("product-empty");
    if (!grid) return;

    db.collection("products")
      .where("category", "==", CATEGORY)
      .orderBy("createdAt", "asc")
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          if (emptyMsg) emptyMsg.style.display = "block";
          return;
        }

        if (emptyMsg) emptyMsg.style.display = "none";
        grid.innerHTML = "";

        snapshot.forEach(function (docSnap) {
          var data = Object.assign({ id: docSnap.id }, docSnap.data());
          grid.appendChild(buildProductCard(data, docSnap.id));
        });
      })
      .catch(function (err) {
        if (emptyMsg) emptyMsg.style.display = "block";
        console.warn("Products could not load from Firestore.", err);
      });
  }

  // ================= NESTED VIEW (groups + products) =================
  var allItems = []; // flat list, each with .id
  var byId = {};
  var trail = []; // [{id, name}, ...] groups from the top level down to the current level

  var treeGrid = document.getElementById("product-grid");
  var treeEmptyMsg = document.getElementById("product-empty");
  var breadcrumbEl = document.getElementById("productBreadcrumb");
  var introEl = document.getElementById("productGroupIntro");
  var defaultEmptyText = treeEmptyMsg ? treeEmptyMsg.textContent : "";

  // Top-level = no parentId, or its parent no longer exists.
  function isRoot(item) {
    return !item.parentId || !byId[item.parentId];
  }
  function getChildren(parentId) {
    return allItems.filter(function (item) {
      return item.parentId === parentId;
    });
  }
  function itemsAt(parentId) {
    return parentId ? getChildren(parentId) : allItems.filter(isRoot);
  }
  // A group is flagged isGroup, or simply has sub-items.
  function isGroupItem(item) {
    return item.isGroup === true || getChildren(item.id).length > 0;
  }
  function pathTo(id) {
    var arr = [];
    var cur = byId[id];
    var guard = 0;
    while (cur && cur.parentId && byId[cur.parentId] && guard < 50) {
      cur = byId[cur.parentId];
      arr.unshift({ id: cur.id, name: cur.name || "" });
      guard++;
    }
    return arr;
  }

  function scrollToTopOfList() {
    var anchor = breadcrumbEl && breadcrumbEl.style.display !== "none" ? breadcrumbEl : treeGrid;
    if (!anchor) return;
    var top = anchor.getBoundingClientRect().top + window.pageYOffset - 100;
    if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: "smooth" });
  }

  function renderBreadcrumb() {
    if (!breadcrumbEl) return;
    if (!trail.length) {
      breadcrumbEl.style.display = "none";
      breadcrumbEl.innerHTML = "";
      return;
    }
    breadcrumbEl.style.display = "block";
    breadcrumbEl.innerHTML = "";

    var homeLink = document.createElement("a");
    homeLink.href = "#";
    homeLink.textContent = ROOT_LABEL;
    homeLink.addEventListener("click", function (e) {
      e.preventDefault();
      trail = [];
      renderLevel("");
      scrollToTopOfList();
    });
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
          scrollToTopOfList();
        });
        breadcrumbEl.appendChild(link);
      }
    });
  }

  // Shows the current group's full description as an intro line.
  function renderIntro() {
    if (!introEl) return;
    var group = trail.length ? byId[trail[trail.length - 1].id] : null;
    var text = group && group.description ? group.description.trim() : "";
    if (text) {
      introEl.textContent = text;
      introEl.style.display = "block";
    } else {
      introEl.textContent = "";
      introEl.style.display = "none";
    }
  }

  // Browse-only card: image, name, description. No price, stock or buttons.
  function buildGroupCard(item) {
    var count = getChildren(item.id).length;
    var flatDescription = (item.description || "").replace(/\s+/g, " ").trim();
    var preview =
      flatDescription.length > DESC_PREVIEW_LENGTH
        ? flatDescription.slice(0, DESC_PREVIEW_LENGTH).trim() + "…"
        : flatDescription;
    var mainImage = (item.images && item.images[0]) || "";

    var card = document.createElement("div");
    card.className = "product-card product-card-clickable product-card-group";
    card.innerHTML =
      '<div class="product-card-img">' +
      (mainImage ? '<img src="' + escapeHtml(mainImage) + '" alt="' + escapeHtml(item.name) + '" />' : "") +
      "</div>" +
      "<h3>" + escapeHtml(item.name) + " &rsaquo;</h3>" +
      (preview ? '<p class="product-card-desc">' + escapeHtml(preview) + "</p>" : "") +
      '<div class="product-group-hint">' +
      (count ? count + (count === 1 ? " item" : " items") : "Coming soon") +
      "</div>";

    card.addEventListener("click", function () {
      trail.push({ id: item.id, name: item.name || "" });
      renderLevel(item.id);
      scrollToTopOfList();
    });

    return card;
  }

  function renderLevel(parentId) {
    if (!treeGrid) return;
    var items = itemsAt(parentId);
    treeGrid.innerHTML = "";
    renderBreadcrumb();
    renderIntro();

    if (!items.length) {
      if (treeEmptyMsg) {
        treeEmptyMsg.style.display = "block";
        treeEmptyMsg.textContent = trail.length ? "Nothing here yet." : defaultEmptyText;
      }
      return;
    }
    if (treeEmptyMsg) treeEmptyMsg.style.display = "none";

    items.forEach(function (item) {
      if (isGroupItem(item)) {
        treeGrid.appendChild(buildGroupCard(item));
      } else {
        treeGrid.appendChild(buildProductCard(item, item.id));
      }
    });
  }

  function loadTree() {
    if (!treeGrid) return Promise.resolve();

    return db
      .collection("products")
      .where("category", "==", CATEGORY)
      .orderBy("createdAt", "asc")
      .get()
      .then(function (snapshot) {
        allItems = [];
        byId = {};
        snapshot.forEach(function (docSnap) {
          var item = Object.assign({ id: docSnap.id }, docSnap.data());
          allItems.push(item);
          byId[item.id] = item;
        });
        trail = [];
        renderLevel("");
      })
      .catch(function (err) {
        if (treeEmptyMsg) {
          treeEmptyMsg.style.display = "block";
          treeEmptyMsg.textContent = defaultEmptyText;
        }
        console.warn("Products could not load from Firestore.", err);
      });
  }

  function loadProducts() {
    if (TREE_MODE) return loadTree();
    loadFlatProducts();
    return Promise.resolve();
  }

  // ================= DEEP LINK: open a specific product's modal =================
  // If the page was visited via a shared link like coffee-gear.html?product=abc123
  // (e.g. from a WhatsApp message), open that product's modal. In the nested
  // view, the list is first navigated to the product's group so the
  // breadcrumb is right; a link to a group simply opens that group.
  function openProductFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var productId = params.get("product");
    if (!productId) return;

    if (TREE_MODE && byId[productId]) {
      var item = byId[productId];
      if (isGroupItem(item)) {
        trail = pathTo(productId).concat({ id: productId, name: item.name || "" });
        renderLevel(productId);
      } else {
        trail = pathTo(productId);
        renderLevel(trail.length ? trail[trail.length - 1].id : "");
        currentOrderProduct = item;
        openModal(item, productId);
      }
      return;
    }

    db.collection("products")
      .doc(productId)
      .get()
      .then(function (docSnap) {
        if (docSnap.exists) {
          var data = Object.assign({ id: docSnap.id }, docSnap.data());
          currentOrderProduct = data;
          openModal(data, docSnap.id);
        }
      })
      .catch(function (err) {
        console.warn("Could not load shared product link.", err);
      });
  }

  // ================= LOAD SETTINGS (WhatsApp number), THEN products =================
  db.collection("settings")
    .doc("site")
    .get()
    .then(function (docSnap) {
      if (docSnap.exists) {
        whatsappNumber = docSnap.data().whatsappNumber || "";
      }
    })
    .catch(function (err) {
      console.warn("Could not load settings.", err);
    })
    .finally(function () {
      if (TREE_MODE) {
        // The deep link needs the full list loaded first.
        loadProducts().then(openProductFromUrl);
      } else {
        loadProducts();
        openProductFromUrl();
      }
    });
})();