// Homepage Barista Training teaser box, between the hero and the "Our Roof"
// section. Collapsed, it shows a short pitch and a "Know More" button.
// Clicking it expands the box in place (pushing the rest of the page down)
// to reveal the full curriculum plus the SAME "Ask About the Next Cohort"
// enquiry form used on the Training page — writing to the same
// trainingEnquiries collection, so the admin sees these in one place
// regardless of where they came from. The "Know More" button becomes
// "Show Less" and collapses it back.
//
// Uses the Firebase "compat" (non-module) API, same as every other script
// on this site. Guards against double-initializing the Firebase app, since
// this page also loads other scripts (e.g. visit-form.js) that initialize
// it too.

(function () {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var db = firebase.firestore();

  // ================= EXPAND / COLLAPSE =================
  var toggleBtn = document.getElementById("trainingTeaserToggleBtn");
  var panel = document.getElementById("trainingTeaserPanel");
  if (!toggleBtn || !panel) {
    console.warn("training-teaser.js: toggle button or panel not found on this page.");
    return;
  }

  var isOpen = false;

  function refreshPanelHeight() {
    if (isOpen) {
      panel.style.maxHeight = panel.scrollHeight + "px";
    }
  }

  toggleBtn.addEventListener("click", function (e) {
    e.preventDefault();
    isOpen = !isOpen;
    toggleBtn.textContent = isOpen ? "Show less" : "Read more...";
    panel.style.maxHeight = isOpen ? panel.scrollHeight + "px" : "0px";
  });

  window.addEventListener("resize", refreshPanelHeight);

  // ================= ENQUIRY FORM =================
  // Mirrors training-enquiry.js's validation and submission logic exactly,
  // just against this box's own uniquely-prefixed ("tt") element IDs so it
  // never collides with the real form if both ever ended up on one page.
  var ttName = document.getElementById("ttName");
  var ttPhone = document.getElementById("ttPhone");
  var ttTier = document.getElementById("ttTier");
  var ttMsg = document.getElementById("ttMsg");
  var ttNameError = document.getElementById("ttNameError");
  var ttPhoneError = document.getElementById("ttPhoneError");
  var ttSubmitBtn = document.getElementById("ttSubmitBtn");
  var ttStatus = document.getElementById("ttStatus");
  var ttFormCard = document.getElementById("ttFormCard");
  var ttSuccessCard = document.getElementById("ttSuccessCard");

  if (!ttSubmitBtn) return;

  function clearFieldErrors() {
    [ttName, ttPhone].forEach(function (el) {
      el.classList.remove("invalid");
    });
    [ttNameError, ttPhoneError].forEach(function (el) {
      if (el) el.classList.remove("show");
    });
  }

  function markFieldInvalid(el, errorEl) {
    el.classList.add("invalid");
    if (errorEl) errorEl.classList.add("show");
  }

  [
    [ttName, ttNameError],
    [ttPhone, ttPhoneError],
  ].forEach(function (pair) {
    var el = pair[0];
    var errorEl = pair[1];
    el.addEventListener("input", function () {
      el.classList.remove("invalid");
      if (errorEl) errorEl.classList.remove("show");
      refreshPanelHeight(); // error text can grow the panel's height
    });
  });

  ttSubmitBtn.addEventListener("click", function () {
    var name = ttName.value.trim();
    var phone = ttPhone.value.trim();
    var tier = ttTier.value;
    var message = ttMsg.value.trim();
    var phoneDigits = phone.replace(/\D/g, "");
    var phoneValid =
      phoneDigits.length === 10 || (phoneDigits.length === 13 && phoneDigits.indexOf("977") === 0);

    clearFieldErrors();
    var firstInvalid = null;

    if (!name) {
      markFieldInvalid(ttName, ttNameError);
      firstInvalid = firstInvalid || ttName;
    }
    if (!phone || !phoneValid) {
      markFieldInvalid(ttPhone, ttPhoneError);
      firstInvalid = firstInvalid || ttPhone;
    }

    if (firstInvalid) {
      ttStatus.textContent = "Please fix the highlighted field(s) above.";
      ttStatus.className = "status-msg error";
      firstInvalid.focus();
      refreshPanelHeight();
      return;
    }

    ttSubmitBtn.disabled = true;
    ttSubmitBtn.textContent = "Sending...";
    ttStatus.textContent = "";
    ttStatus.className = "status-msg";

    db.collection("trainingEnquiries")
      .add({
        fullName: name,
        contactNumber: phone,
        interestedIn: tier,
        message: message,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(function () {
        if (ttFormCard) ttFormCard.style.display = "none";
        if (ttSuccessCard) ttSuccessCard.style.display = "block";
        refreshPanelHeight();

        setTimeout(function () {
          ttName.value = "";
          ttPhone.value = "";
          ttTier.selectedIndex = 0;
          ttMsg.value = "";
          clearFieldErrors();
          ttStatus.textContent = "";
          ttStatus.className = "status-msg";

          if (ttSuccessCard) ttSuccessCard.style.display = "none";
          if (ttFormCard) ttFormCard.style.display = "block";
          refreshPanelHeight();
        }, 3000);
      })
      .catch(function (err) {
        ttStatus.textContent = "Something went wrong. Please try again.";
        ttStatus.className = "status-msg error";
        console.error(err);
        refreshPanelHeight();
      })
      .finally(function () {
        ttSubmitBtn.disabled = false;
        ttSubmitBtn.textContent = "Send Enquiry";
      });
  });
})();