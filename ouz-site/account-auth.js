// Handles customer accounts across the whole public site:
//  - On EVERY page: checks for a saved session and, if logged in, updates
//    the "Log In" nav button to show the customer's first name instead
//    (still links to /account.html, which shows their profile when logged
//    in, or the login/signup form when not).
//  - On account.html specifically: the login form, the create-account
//    form, and the profile view are all wired up here too.
//
// Same no-password Name+Mobile Number pattern as the Tutee page: login
// goes through the checkCustomer Cloud Function (Admin SDK, keeps the
// "customers" roster private), while account creation writes directly to
// Firestore since firestore.rules allows public self-registration
// (create-only — the roster still can't be read or listed by anyone but
// the signed-in admin).
//
// Uses the Firebase "compat" (non-module) API, same as every other script
// on this site, for maximum network compatibility.

(function () {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var db = firebase.firestore();

  var CHECK_CUSTOMER_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/checkCustomer";
  var GET_MY_EVENT_APPLICATIONS_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/getMyEventApplications";
  var APPLY_TO_EVENT_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/applyToEvent";
  var SESSION_KEY = "ouz_customer_session";

  function normalizePhoneDigits(phone) {
    return (phone || "").replace(/\D/g, "");
  }
  function isValidPhone(phone) {
    var digits = normalizePhoneDigits(phone);
    return digits.length === 10 || (digits.length === 13 && digits.indexOf("977") === 0);
  }
  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function setSession(customer) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(customer));
    } catch (e) {
      /* sessionStorage unavailable — session just won't persist across pages */
    }
  }
  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* no-op */
    }
  }

  // ================= NAV BUTTON (every page) =================
  function updateNavButton() {
    var navBtn = document.getElementById("navAccountBtn");
    if (!navBtn) return;
    var session = getSession();
    if (session && session.fullName) {
      var firstName = session.fullName.trim().split(/\s+/)[0];
      navBtn.textContent = firstName;
    } else {
      navBtn.textContent = "Log In";
    }
  }
  updateNavButton();

  // ================= ACCOUNT PAGE (only runs if these elements exist) =================
  var loginCard = document.getElementById("accountLoginCard");
  var profileView = document.getElementById("accountProfileView");
  if (!loginCard || !profileView) return; // not on account.html — nothing more to do

  var loginPane = document.getElementById("accountLoginPane");
  var signupPane = document.getElementById("accountSignupPane");
  var showSignupLink = document.getElementById("showSignupLink");
  var showLoginLink = document.getElementById("showLoginLink");

  showSignupLink.addEventListener("click", function (e) {
    e.preventDefault();
    loginPane.style.display = "none";
    signupPane.style.display = "block";
  });
  showLoginLink.addEventListener("click", function (e) {
    e.preventDefault();
    signupPane.style.display = "none";
    loginPane.style.display = "block";
  });

  function clearFieldErrors(inputs, errorEls) {
    inputs.forEach(function (el) {
      el.classList.remove("invalid");
    });
    errorEls.forEach(function (el) {
      if (el) el.classList.remove("show");
    });
  }
  function markFieldInvalid(el, errorEl) {
    el.classList.add("invalid");
    if (errorEl) errorEl.classList.add("show");
  }

  function showProfile(customer) {
    loginCard.style.display = "none";
    profileView.style.display = "block";
    document.getElementById("profileName").textContent = customer.fullName;
    document.getElementById("profilePhone").textContent = customer.mobileNumber;
    // Load applications first so the events list can grey out ones
    // already applied to; loadMyApplications triggers loadAvailableEvents
    // itself once it knows which event IDs to exclude.
    loadMyApplications(customer);
  }

  // Restore session on page load
  var existingSession = getSession();
  if (existingSession) {
    showProfile(existingSession);
  }

  // ---- Log Out ----
  var logoutBtn = document.getElementById("accountLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      clearSession();
      updateNavButton();
      profileView.style.display = "none";
      loginCard.style.display = "block";
      loginPane.style.display = "block";
      signupPane.style.display = "none";
    });
  }

  // ---- Log In ----
  var loginName = document.getElementById("loginName");
  var loginPhone = document.getElementById("loginPhone");
  var loginNameError = document.getElementById("loginNameError");
  var loginPhoneError = document.getElementById("loginPhoneError");
  var loginBtn = document.getElementById("accountLoginBtn");
  var loginStatus = document.getElementById("accountLoginStatus");

  [
    [loginName, loginNameError],
    [loginPhone, loginPhoneError],
  ].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      pair[0].classList.remove("invalid");
      if (pair[1]) pair[1].classList.remove("show");
    });
  });

  loginBtn.addEventListener("click", function () {
    var name = loginName.value.trim();
    var phone = loginPhone.value.trim();

    clearFieldErrors([loginName, loginPhone], [loginNameError, loginPhoneError]);
    var firstInvalid = null;

    if (!name) {
      markFieldInvalid(loginName, loginNameError);
      firstInvalid = firstInvalid || loginName;
    }
    if (!phone || !isValidPhone(phone)) {
      markFieldInvalid(loginPhone, loginPhoneError);
      firstInvalid = firstInvalid || loginPhone;
    }
    if (firstInvalid) {
      loginStatus.textContent = "Please fix the highlighted field(s) above.";
      loginStatus.className = "status-msg error";
      firstInvalid.focus();
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
    loginStatus.textContent = "";
    loginStatus.className = "status-msg";

    fetch(CHECK_CUSTOMER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, mobileNumber: phone }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.success) {
          var customer = { fullName: name, mobileNumber: phone };
          setSession(customer);
          updateNavButton();
          showProfile(customer);
        } else {
          loginStatus.textContent =
            "We couldn't find a matching account. Check your name and number, or create a new account below.";
          loginStatus.className = "status-msg error";
        }
      })
      .catch(function (err) {
        loginStatus.textContent = "Something went wrong. Please try again.";
        loginStatus.className = "status-msg error";
        console.error(err);
      })
      .finally(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = "Log In";
      });
  });

  // ---- Create Account ----
  var signupName = document.getElementById("signupName");
  var signupPhone = document.getElementById("signupPhone");
  var signupNameError = document.getElementById("signupNameError");
  var signupPhoneError = document.getElementById("signupPhoneError");
  var signupBtn = document.getElementById("accountSignupBtn");
  var signupStatus = document.getElementById("accountSignupStatus");

  [
    [signupName, signupNameError],
    [signupPhone, signupPhoneError],
  ].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      pair[0].classList.remove("invalid");
      if (pair[1]) pair[1].classList.remove("show");
    });
  });

  signupBtn.addEventListener("click", function () {
    var name = signupName.value.trim();
    var phone = signupPhone.value.trim();

    clearFieldErrors([signupName, signupPhone], [signupNameError, signupPhoneError]);
    var firstInvalid = null;

    if (!name) {
      markFieldInvalid(signupName, signupNameError);
      firstInvalid = firstInvalid || signupName;
    }
    if (!phone || !isValidPhone(phone)) {
      markFieldInvalid(signupPhone, signupPhoneError);
      firstInvalid = firstInvalid || signupPhone;
    }
    if (firstInvalid) {
      signupStatus.textContent = "Please fix the highlighted field(s) above.";
      signupStatus.className = "status-msg error";
      firstInvalid.focus();
      return;
    }

    signupBtn.disabled = true;
    signupBtn.textContent = "Creating account...";
    signupStatus.textContent = "";
    signupStatus.className = "status-msg";

    // Check for an existing account with this name+phone first, so we
    // don't create obvious duplicates — same lookup the login form uses.
    fetch(CHECK_CUSTOMER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, mobileNumber: phone }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.success) {
          signupStatus.textContent = "An account with this name and number already exists — try logging in instead.";
          signupStatus.className = "status-msg error";
          return null;
        }
        return db.collection("customers").add({
          fullName: name,
          mobileNumber: phone,
          source: "self-signup",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      })
      .then(function (docRef) {
        if (!docRef) return; // duplicate case already handled above
        var customer = { fullName: name, mobileNumber: phone };
        setSession(customer);
        updateNavButton();
        showProfile(customer);
      })
      .catch(function (err) {
        signupStatus.textContent = "Something went wrong. Please try again.";
        signupStatus.className = "status-msg error";
        console.error(err);
      })
      .finally(function () {
        signupBtn.disabled = false;
        signupBtn.textContent = "Create Account";
      });
  });

  // ================= EVENTS: browse, apply, and view my applications =================
  var categoryLabels = { "coffee-gear": "Coffee Gear", roastery: "Roastery", "green-beans": "Green Beans" };
  function categoryLabel(cat) {
    return categoryLabels[cat] || cat;
  }

  var availableEventsList = document.getElementById("availableEventsList");
  var noEventsMsg = document.getElementById("noEventsMsg");
  var applyFormCard = document.getElementById("applyFormCard");
  var applyEventTitle = document.getElementById("applyEventTitle");
  var applyName = document.getElementById("applyName");
  var applyPhone = document.getElementById("applyPhone");
  var applyEmail = document.getElementById("applyEmail");
  var applyNameError = document.getElementById("applyNameError");
  var applyPhoneError = document.getElementById("applyPhoneError");
  var applyEmailError = document.getElementById("applyEmailError");
  var applySubmitBtn = document.getElementById("applySubmitBtn");
  var applyCancelBtn = document.getElementById("applyCancelBtn");
  var applyStatus = document.getElementById("applyStatus");
  var myApplicationsList = document.getElementById("myApplicationsList");
  var noApplicationsMsg = document.getElementById("noApplicationsMsg");

  var currentApplyEvent = null;
  var currentApplyCustomer = null;
  var myAppliedEventIds = {}; // set of eventIds this customer already has an application for

  function loadAvailableEvents() {
    if (!availableEventsList) return;
    db.collection("events")
      .where("active", "==", true)
      .get()
      .then(function (snapshot) {
        var docs = [];
        snapshot.forEach(function (docSnap) {
          docs.push({ id: docSnap.id, data: docSnap.data() });
        });

        // Client-side safety net: the scheduled Cloud Function that flips
        // "active" to false only runs once a day, so also hide anything
        // whose window has already closed right now, without waiting for
        // that job to catch up.
        docs = docs.filter(function (item) {
          if (!item.data.createdAt || !item.data.durationDays) return true;
          var createdMillis = item.data.createdAt.toMillis();
          var expiryMillis = createdMillis + item.data.durationDays * 24 * 60 * 60 * 1000;
          return Date.now() < expiryMillis;
        });

        if (!docs.length) {
          availableEventsList.innerHTML = "";
          noEventsMsg.style.display = "block";
          return;
        }

        availableEventsList.innerHTML = "";
        noEventsMsg.style.display = "none";

        // Sort newest-first client-side, avoiding the need for a Firestore
        // composite index (where + orderBy on different fields requires one).
        docs.sort(function (a, b) {
          var at = a.data.createdAt ? a.data.createdAt.toMillis() : 0;
          var bt = b.data.createdAt ? b.data.createdAt.toMillis() : 0;
          return bt - at;
        });

        docs.forEach(function (item) {
          var data = item.data;
          var alreadyApplied = !!myAppliedEventIds[item.id];
          var card = document.createElement("div");
          card.className = "event-offer-card";
          card.innerHTML =
            "<div>" +
            '<div class="event-offer-title">' + escapeHtmlLocal(data.title || "") + "</div>" +
            '<div class="event-offer-meta">' +
            (data.categories || []).map(categoryLabel).join(", ") +
            " &middot; " + (data.durationDays || 0) + " days &middot; " + escapeHtmlLocal(data.offerText || "") +
            "</div>" +
            (data.description ? '<div class="event-offer-desc">' + escapeHtmlLocal(data.description) + "</div>" : "") +
            "</div>" +
            (alreadyApplied
              ? '<span class="already-applied-label">Already Applied</span>'
              : '<button class="btn btn-primary apply-event-btn" type="button">Apply</button>');

          if (!alreadyApplied) {
            card.querySelector(".apply-event-btn").addEventListener("click", function () {
              openApplyForm(Object.assign({ id: item.id }, data));
            });
          }

          availableEventsList.appendChild(card);
        });
      })
      .catch(function (err) {
        console.warn("Could not load events.", err);
      });
  }

  function escapeHtmlLocal(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function openApplyForm(eventData) {
    currentApplyEvent = eventData;
    applyEventTitle.textContent = eventData.title || "";
    applyName.value = currentApplyCustomer ? currentApplyCustomer.fullName : "";
    applyPhone.value = currentApplyCustomer ? currentApplyCustomer.mobileNumber : "";
    applyEmail.value = "";
    applyStatus.textContent = "";
    applyStatus.className = "status-msg";
    applyFormCard.style.display = "block";
    applyFormCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (applyCancelBtn) {
    applyCancelBtn.addEventListener("click", function () {
      applyFormCard.style.display = "none";
      currentApplyEvent = null;
    });
  }

  [
    [applyName, applyNameError],
    [applyPhone, applyPhoneError],
    [applyEmail, applyEmailError],
  ].forEach(function (pair) {
    if (!pair[0]) return;
    pair[0].addEventListener("input", function () {
      pair[0].classList.remove("invalid");
      if (pair[1]) pair[1].classList.remove("show");
    });
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
  }

  if (applySubmitBtn) {
    applySubmitBtn.addEventListener("click", function () {
      if (!currentApplyEvent) return;
      var name = applyName.value.trim();
      var phone = applyPhone.value.trim();
      var email = applyEmail.value.trim();

      [applyName, applyPhone, applyEmail].forEach(function (el) {
        el.classList.remove("invalid");
      });
      [applyNameError, applyPhoneError, applyEmailError].forEach(function (el) {
        if (el) el.classList.remove("show");
      });
      var firstInvalid = null;

      if (!name) {
        markFieldInvalid(applyName, applyNameError);
        firstInvalid = firstInvalid || applyName;
      }
      if (!phone || !isValidPhone(phone)) {
        markFieldInvalid(applyPhone, applyPhoneError);
        firstInvalid = firstInvalid || applyPhone;
      }
      if (!email || !isValidEmail(email)) {
        markFieldInvalid(applyEmail, applyEmailError);
        firstInvalid = firstInvalid || applyEmail;
      }
      if (firstInvalid) {
        applyStatus.textContent = "Please fix the highlighted field(s) above.";
        applyStatus.className = "status-msg error";
        firstInvalid.focus();
        return;
      }

      applySubmitBtn.disabled = true;
      applySubmitBtn.textContent = "Submitting...";
      applyStatus.textContent = "";
      applyStatus.className = "status-msg";

      fetch(APPLY_TO_EVENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: currentApplyEvent.id,
          fullName: name,
          mobileNumber: phone,
          email: email,
          source: "customer",
        }),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (result) {
          if (result.success) {
            applyStatus.textContent = "Application submitted! Check your email for confirmation.";
            applyStatus.classList.add("success");
            // Refresh the list right away — don't tie this to the cosmetic
            // delay below, so it starts updating as soon as possible
            // instead of waiting an extra 1.5s for no reason.
            if (currentApplyCustomer) loadMyApplications(currentApplyCustomer);
            setTimeout(function () {
              applyFormCard.style.display = "none";
              currentApplyEvent = null;
            }, 1500);
          } else if (result.error === "already_applied") {
            applyStatus.textContent = "You've already applied to this event.";
            applyStatus.className = "status-msg error";
          } else if (result.error === "not_registered") {
            applyStatus.textContent = result.message || "This account isn't registered. Please log in again.";
            applyStatus.className = "status-msg error";
          } else {
            applyStatus.textContent = "Something went wrong. Please try again.";
            applyStatus.className = "status-msg error";
          }
        })
        .catch(function (err) {
          applyStatus.textContent = "Something went wrong. Please try again.";
          applyStatus.className = "status-msg error";
          console.error(err);
        })
        .finally(function () {
          applySubmitBtn.disabled = false;
          applySubmitBtn.textContent = "Submit Application";
        });
    });
  }

  function loadMyApplications(customer, isRetry) {
    if (!myApplicationsList) return;
    currentApplyCustomer = customer;

    fetch(GET_MY_EVENT_APPLICATIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: customer.fullName, mobileNumber: customer.mobileNumber }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var applications = (data && data.applications) || [];
        myApplicationsList.innerHTML = "";

        myAppliedEventIds = {};
        applications.forEach(function (app) {
          if (app.eventId) myAppliedEventIds[app.eventId] = true;
        });
        loadAvailableEvents();

        if (!applications.length) {
          noApplicationsMsg.style.display = "block";
          return;
        }
        noApplicationsMsg.style.display = "none";

        applications.forEach(function (app) {
          if (app.status === "approved") {
            myApplicationsList.appendChild(buildIdCard(app, customer));
          } else {
            myApplicationsList.appendChild(buildStatusRow(app));
          }
        });
      })
      .catch(function (err) {
        console.warn("Could not load your applications.", err);
        loadAvailableEvents(); // still show events even if this fetch failed
        // A Cloud Function that hasn't been called in a while can take a
        // few seconds to "cold start" and occasionally times out on the
        // very first request — silently retry once after a short delay
        // rather than leaving the list stale until the next full reload.
        if (!isRetry) {
          setTimeout(function () {
            loadMyApplications(customer, true);
          }, 2500);
        }
      });
  }

  function buildStatusRow(app) {
    var row = document.createElement("div");
    row.className = "application-status-row";
    var noteClass = app.status === "cancelled" ? "cancelled" : "pending";
    var noteText =
      app.status === "cancelled"
        ? "This application was not approved."
        : "Your application is under review — we'll be in touch within 12 hours.";
    row.innerHTML =
      '<div class="application-status-title">' + escapeHtmlLocal(app.eventTitle || "") + "</div>" +
      '<div class="application-status-note ' + noteClass + '">' + noteText + "</div>";
    return row;
  }

  function buildIdCard(app, customer) {
    var card = document.createElement("div");
    var expiresText = "";
    var isExpired = false;
    if (app.expiresAt) {
      var d = new Date(app.expiresAt);
      expiresText = d.toLocaleDateString();
      isExpired = d.getTime() < Date.now();
    }
    card.className = "id-card" + (isExpired ? " id-card-expired" : "");
    card.innerHTML =
      '<div class="id-card-top">' +
      '<span class="id-card-brand">Ouz Coffee &amp; Co.</span>' +
      (isExpired
        ? '<span class="id-card-expired-badge">Expired</span>'
        : '<span class="id-card-code">#' + escapeHtmlLocal(app.uniqueCode || "") + "</span>") +
      "</div>" +
      '<div class="id-card-name">' + escapeHtmlLocal(customer.fullName || "") + "</div>" +
      '<div class="id-card-contact">' + escapeHtmlLocal(customer.mobileNumber || "") + "</div>" +
      '<div class="id-card-row"><span>Event</span><span>' + escapeHtmlLocal(app.eventTitle || "") + "</span></div>" +
      '<div class="id-card-row"><span>Offer</span><span>' + escapeHtmlLocal(app.eventOfferText || "") + "</span></div>" +
      '<div class="id-card-row"><span>Categories</span><span>' +
      (app.eventCategories || []).map(categoryLabel).join(", ") +
      "</span></div>" +
      '<div class="id-card-row"><span>Duration</span><span>' + (app.eventDurationDays || 0) + " days</span></div>" +
      (expiresText ? '<div class="id-card-row"><span>Valid Until</span><span>' + expiresText + "</span></div>" : "") +
      (isExpired ? '<div class="id-card-row"><span>Code</span><span>#' + escapeHtmlLocal(app.uniqueCode || "") + "</span></div>" : "") +
      '<button class="id-card-download-btn" type="button">&#8681; Download ID Card</button>';

    card.querySelector(".id-card-download-btn").addEventListener("click", function (e) {
      e.stopPropagation();
      downloadIdCard(app, customer, isExpired, expiresText);
    });

    return card;
  }

  // ================= DOWNLOAD ID CARD AS IMAGE =================
  // Hand-drawn on a <canvas> rather than using a screenshot library — this
  // card is simple enough (gradient + text, no images) that drawing it
  // directly is more reliable than depending on an external script to
  // capture the live DOM, and needs no extra library at all.
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function truncateToWidth(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var t = text;
    while (t.length > 3 && ctx.measureText(t + "…").width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + "…";
  }

  function drawIdCardCanvas(app, customer, isExpired, expiresText) {
    var scale = 2; // render at 2x for a crisp download regardless of screen
    var width = 480;
    var height = 460;

    var canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    var ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    var gradient = ctx.createLinearGradient(0, 0, width, height);
    if (isExpired) {
      gradient.addColorStop(0, "#6b6560");
      gradient.addColorStop(1, "#4a453f");
    } else {
      gradient.addColorStop(0, "#7a1b34");
      gradient.addColorStop(1, "#4a1220");
    }
    roundRectPath(ctx, 0, 0, width, height, 18);
    ctx.fillStyle = gradient;
    ctx.fill();

    var pad = 28;
    var y = 44;

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "600 11px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("OUZ COFFEE & CO.", pad, y);

    if (isExpired) {
      var badgeText = "EXPIRED";
      ctx.font = "700 11px 'IBM Plex Mono', monospace";
      var badgeW = ctx.measureText(badgeText).width + 22;
      var badgeX = width - pad - badgeW;
      var badgeY = y - 15;
      roundRectPath(ctx, badgeX, badgeY, badgeW, 21, 11);
      ctx.fillStyle = "#c0392b";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 15);
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = "700 21px 'IBM Plex Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText("#" + (app.uniqueCode || ""), width - pad, y + 3);
    }

    y += 42;
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "700 23px Georgia, 'Fraunces', serif";
    ctx.fillText(truncateToWidth(ctx, customer.fullName || "", width - pad * 2), pad, y);

    y += 22;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "13px 'Work Sans', sans-serif";
    ctx.fillText(customer.mobileNumber || "", pad, y);

    y += 26;

    var rows = [
      ["Event", app.eventTitle || ""],
      ["Offer", app.eventOfferText || ""],
      ["Categories", (app.eventCategories || []).map(categoryLabel).join(", ")],
      ["Duration", (app.eventDurationDays || 0) + " days"],
    ];
    if (expiresText) rows.push(["Valid Until", expiresText]);
    if (isExpired) rows.push(["Code", "#" + (app.uniqueCode || "")]);

    rows.forEach(function (row) {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();

      y += 22;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "13px 'Work Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row[0], pad, y);

      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.fillText(truncateToWidth(ctx, row[1], width - pad * 2 - 90), width - pad, y);

      y += 12;
    });

    return canvas;
  }

  function downloadIdCard(app, customer, isExpired, expiresText) {
    var canvas = drawIdCardCanvas(app, customer, isExpired, expiresText);
    var safeTitle = (app.eventTitle || "membership").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    var link = document.createElement("a");
    link.download = "ouz-coffee-id-card-" + (safeTitle || "membership") + ".png";
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
})();