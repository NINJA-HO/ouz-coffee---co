// Loads ALL products (Coffee Gear + Roastery + Green Beans combined — no
// category filter) for the Collections page, so customers can browse
// everything in one place instead of visiting three separate pages.
//
// Behavior mirrors product-loader.js exactly: click a card for the full
// detail modal, click Place Order to open the order form (Quantity field,
// live stock check via the same placeOrder Cloud Function, so it can never
// oversell), click the WhatsApp button to open a pre-filled chat. The one
// addition is a small category badge on each card (Coffee Gear / Roastery /
// Green Beans) plus a live, ranked search box at the top of the page.
//
// NESTED CATEGORIES: items can be groups (browse-only: image, name, description)
// or products (full ordering flow). Browsing shows one level at a time with a
// breadcrumb; typing in the search box searches every item flat, across all levels.
//
// Uses the Firebase "compat" (non-module) API on purpose, same as every
// other loader script on this site, for maximum network compatibility.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  var DESC_PREVIEW_LENGTH = 90;
  var currentOrderProduct = null; // includes .id (Firestore doc id) once set
  var whatsappNumber = "";
  var PLACE_ORDER_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/placeOrder";
  var allProducts = []; // flat array of { id, ...productFields }
  var activeCategory = "all"; // "all" | "coffee-gear" | "roastery" | "green-beans"

  // ---- nested view state ----
  var byId = {};
  var trail = []; // [{id, name}, ...] groups from the top level down to the current level

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  // Top-level = no parentId, or its parent no longer exists.
  function isRoot(item) {
    return !item.parentId || !byId[item.parentId];
  }
  function getChildren(parentId) {
    return allProducts.filter(function (item) {
      return item.parentId === parentId;
    });
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
  function currentQuery() {
    var el = document.getElementById("collectionsSearch");
    return el ? el.value : "";
  }
  function refresh() {
    renderProducts(getFilteredSortedProducts(currentQuery()));
  }
  function scrollToTopOfList() {
    var bc = document.getElementById("productBreadcrumb");
    var anchor = bc && bc.style.display !== "none" ? bc : document.getElementById("product-grid");
    if (!anchor) return;
    var top = anchor.getBoundingClientRect().top + window.pageYOffset - 100;
    if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: "smooth" });
  }

  var WHATSAPP_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.25.9 4.29 2.4 5.9L2 22l5.5-1.8C9 20.7 10.46 21 12 21c5.52 0 10-4.02 10-9S17.52 2 12 2z"/></svg>';

  function categoryLabel(cat) {
    if (cat === "roastery") return "Roastery";
    if (cat === "green-beans") return "Green Beans";
    return "Coffee Gear";
  }

  function isOutOfStock(product) {
    return typeof product.stock !== "number" || product.stock <= 0;
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
      // Only the crossed-out old price gets its own styled span (smaller,
      // muted, line-through) — the current price is left as plain text so
      // it inherits the exact same size/weight/color a normal price would
      // (whatever .price already applies), instead of risking a mismatch
      // from an inline override.
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

  // ================= SEARCH: fuzzy match + relevance ranking =================
  // Same ranking approach used on the admin Inventory search: exact match >
  // starts-with > word-boundary substring > plain substring > scattered
  // (typo-tolerant) subsequence match. Category name is checked too, at a
  // lower weight, so typing "roastery" surfaces all Roastery products.
  function fuzzyScore(text, query) {
    if (!text) return -1;
    var t = text.toLowerCase();
    var q = query.toLowerCase();
    if (!q) return 0;

    if (t === q) return 1000;

    var idx = t.indexOf(q);
    if (idx === 0) return 900 - t.length;

    if (idx > -1) {
      var precedingChar = t.charAt(idx - 1);
      var atWordStart = precedingChar === " " || precedingChar === "-" || precedingChar === "/";
      return (atWordStart ? 750 : 600) - idx;
    }

    var ti = 0;
    var firstMatch = -1;
    var lastMatch = -1;
    var matchedAll = true;

    for (var qi = 0; qi < q.length; qi++) {
      var ch = q.charAt(qi);
      var found = false;
      while (ti < t.length) {
        if (t.charAt(ti) === ch) {
          if (firstMatch === -1) firstMatch = ti;
          lastMatch = ti;
          ti++;
          found = true;
          break;
        }
        ti++;
      }
      if (!found) {
        matchedAll = false;
        break;
      }
    }

    if (matchedAll) {
      var span = lastMatch - firstMatch + 1;
      return Math.max(1, 400 - span);
    }

    return -1;
  }

  function scoreProduct(product, query) {
    var name = product.name || "";
    var category = categoryLabel(product.category);

    var nameScore = fuzzyScore(name, query);
    var categoryScore = fuzzyScore(category, query);

    if (nameScore === -1 && categoryScore === -1) return -1;
    if (nameScore === -1) return categoryScore * 0.3;
    if (categoryScore === -1) return nameScore;
    return Math.max(nameScore, categoryScore * 0.3);
  }

  function getFilteredSortedProducts(query) {
    var trimmed = (query || "").trim();

    function inCategory(product) {
      return activeCategory === "all" || product.category === activeCategory;
    }

    // Browsing (no search text): show just the current level of the tree.
    if (!trimmed) {
      if (trail.length) return getChildren(trail[trail.length - 1].id);
      return allProducts.filter(isRoot).filter(inCategory);
    }

    // Searching: flat, ranked results across every level.
    return allProducts
      .filter(inCategory)
      .map(function (product) {
        return { product: product, score: scoreProduct(product, trimmed) };
      })
      .filter(function (entry) {
        return entry.score > -1;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .map(function (entry) {
        return entry.product;
      });
  }

  function categoryFilterLabel() {
    if (activeCategory === "all") return "";
    return categoryLabel(activeCategory);
  }

  // ================= BREADCRUMB, INTRO, GROUP CARD =================
  function renderBreadcrumb(searching) {
    var el = document.getElementById("productBreadcrumb");
    if (!el) return;
    if (searching || !trail.length) {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }
    el.style.display = "block";
    el.innerHTML = "";

    var home = document.createElement("a");
    home.href = "#";
    home.textContent = activeCategory === "all" ? "Collections" : categoryLabel(activeCategory);
    home.addEventListener("click", function (e) {
      e.preventDefault();
      trail = [];
      refresh();
      scrollToTopOfList();
    });
    el.appendChild(home);

    trail.forEach(function (crumb, index) {
      var sep = document.createElement("span");
      sep.textContent = " › ";
      el.appendChild(sep);
      if (index === trail.length - 1) {
        var cur = document.createElement("span");
        cur.textContent = crumb.name;
        cur.className = "menu-breadcrumb-current";
        el.appendChild(cur);
      } else {
        var link = document.createElement("a");
        link.href = "#";
        link.textContent = crumb.name;
        link.addEventListener("click", function (e) {
          e.preventDefault();
          trail = trail.slice(0, index + 1);
          refresh();
          scrollToTopOfList();
        });
        el.appendChild(link);
      }
    });
  }

  // Shows the current group's full description as an intro line.
  function renderIntro(searching) {
    var el = document.getElementById("productGroupIntro");
    if (!el) return;
    var group = !searching && trail.length ? byId[trail[trail.length - 1].id] : null;
    var text = group && group.description ? group.description.trim() : "";
    el.textContent = text;
    el.style.display = text ? "block" : "none";
  }

  // Browse-only card: image, name, description. No price, stock or buttons.
  function buildGroupCard(item) {
    var count = getChildren(item.id).length;
    var flat = (item.description || "").replace(/\s+/g, " ").trim();
    var preview = flat.length > DESC_PREVIEW_LENGTH ? flat.slice(0, DESC_PREVIEW_LENGTH).trim() + "…" : flat;
    var mainImage = (item.images && item.images[0]) || "";

    var card = document.createElement("div");
    card.className = "product-card product-card-clickable product-card-group";
    card.innerHTML =
      '<div class="product-card-img">' +
      (mainImage ? '<img src="' + escapeHtml(mainImage) + '" alt="' + escapeHtml(item.name) + '" />' : "") +
      '<span class="collection-category-badge collection-cat-' + escapeHtml(item.category || "coffee-gear") + '">' +
      categoryLabel(item.category) +
      "</span>" +
      "</div>" +
      "<h3>" + escapeHtml(item.name) + " &rsaquo;</h3>" +
      (preview ? '<p class="product-card-desc">' + escapeHtml(preview) + "</p>" : "") +
      '<div class="product-group-hint">' +
      (count ? count + (count === 1 ? " item" : " items") : "Coming soon") +
      "</div>";

    card.addEventListener("click", function () {
      // Opening a group (even from search results) leaves search and drills in.
      var searchEl = document.getElementById("collectionsSearch");
      if (searchEl) searchEl.value = "";
      trail = pathTo(item.id).concat({ id: item.id, name: item.name || "" });
      refresh();
      scrollToTopOfList();
    });
    return card;
  }

  // ================= RENDER PRODUCT GRID =================
  function renderProducts(products) {
    var grid = document.getElementById("product-grid");
    var emptyMsg = document.getElementById("product-empty");
    var countEl = document.getElementById("collectionsSearchCount");
    var searchInput = document.getElementById("collectionsSearch");
    var query = searchInput ? searchInput.value.trim() : "";
    var filterLabel = categoryFilterLabel();

    if (!grid) return;
    grid.innerHTML = "";
    renderBreadcrumb(!!query);
    renderIntro(!!query);

    if (!products.length) {
      if (emptyMsg) {
        emptyMsg.style.display = "block";
        if (allProducts.length === 0) {
          emptyMsg.textContent = "New products are on their way — check back shortly.";
        } else if (query) {
          emptyMsg.textContent = "No products match your search.";
        } else if (trail.length) {
          emptyMsg.textContent = "Nothing here yet.";
        } else {
          emptyMsg.textContent = "No " + (filterLabel ? filterLabel + " " : "") + "products yet.";
        }
      }
    } else if (emptyMsg) {
      emptyMsg.style.display = "none";
    }

    if (countEl) {
      if (query) {
        countEl.textContent =
          products.length + " match" + (products.length === 1 ? "" : "es") + ' for "' + query + '"' +
          (filterLabel ? " in " + filterLabel : "");
      } else if (filterLabel && !trail.length) {
        countEl.textContent = products.length + " " + filterLabel + " item" + (products.length === 1 ? "" : "s");
      } else {
        countEl.textContent = "";
      }
    }

    products.forEach(function (data) {
      if (isGroupItem(data)) {
        grid.appendChild(buildGroupCard(data));
        return;
      }
      var images = data.images || [];
      var mainImage = images[0] || "";
      var description = data.description || "";
      var flatDescription = description.replace(/\s+/g, " ").trim();
      var preview =
        flatDescription.length > DESC_PREVIEW_LENGTH
          ? flatDescription.slice(0, DESC_PREVIEW_LENGTH).trim() + "…"
          : flatDescription;

      var whatsappLink = buildWhatsappLink(data, data.id);
      var whatsappHtml = whatsappLink
        ? '<a class="whatsapp-btn" href="' + whatsappLink + '" target="_blank" rel="noopener" ' +
          'aria-label="Chat on WhatsApp about ' + (data.name || "this product") + '">' +
          WHATSAPP_ICON_SVG +
          "</a>"
        : "";

      var outOfStock = isOutOfStock(data);
      var badgeHtml = outOfStock ? '<span class="out-of-stock-badge">Out of Stock</span>' : "";
      var categoryBadgeHtml =
        '<span class="collection-category-badge collection-cat-' + (data.category || "coffee-gear") + '">' +
        categoryLabel(data.category) +
        "</span>";
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
        categoryBadgeHtml +
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
        openModal(data, data.id);
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

      grid.appendChild(card);
    });
  }

  // ================= LOAD ALL PRODUCTS (once) =================
  function loadAllProducts() {
    return db.collection("products")
      .orderBy("createdAt", "asc")
      .get()
      .then(function (snapshot) {
        allProducts = [];
        byId = {};
        snapshot.forEach(function (docSnap) {
          var item = Object.assign({ id: docSnap.id }, docSnap.data());
          allProducts.push(item);
          byId[item.id] = item;
        });
        trail = [];
        refresh();
      })
      .catch(function (err) {
        var emptyMsg = document.getElementById("product-empty");
        if (emptyMsg) emptyMsg.style.display = "block";
        console.warn("Products could not load from Firestore.", err);
      });
  }

  // ================= DEEP LINK: open a specific product's modal =================
  function openProductFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var productId = params.get("product");
    if (!productId) return;

    // Already loaded: go to the item's group first so the breadcrumb is right.
    var known = byId[productId];
    if (known) {
      if (isGroupItem(known)) {
        trail = pathTo(productId).concat({ id: productId, name: known.name || "" });
        refresh();
      } else {
        trail = pathTo(productId);
        refresh();
        currentOrderProduct = known;
        openModal(known, productId);
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

  // ================= SEARCH INPUT WIRING =================
  var collectionsSearchInput = document.getElementById("collectionsSearch");
  if (collectionsSearchInput) {
    collectionsSearchInput.addEventListener("input", function (e) {
      refresh();
    });
  }

  // ================= CATEGORY FILTER BUTTONS =================
  var filterButtons = document.querySelectorAll(".collections-filter-btn");
  filterButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      filterButtons.forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      activeCategory = btn.getAttribute("data-category");

      trail = []; // switching category always returns to the top level
      refresh();
    });
  });

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
      loadAllProducts().then(openProductFromUrl);
    });
})();