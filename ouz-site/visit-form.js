// Handles the "Send a Message" contact form on the Visit page. Same
// workflow as the Barista Training "Ask About the Next Cohort" form:
// validates Name, Contact Number (required), Interested In (required,
// always has a value since it's a dropdown), Message (optional), then saves
// to the SAME Firestore "trainingEnquiries" collection so it shows up
// alongside training enquiries in the admin's "Training Enquiries" page,
// and triggers the same email notification automatically (no separate
// Cloud Function needed — it's the same collection).
//
// Uses the Firebase "compat" (non-module) API for the same reason as
// product-loader.js: better compatibility with networks/proxies that have
// been seen mis-handling ES module <script type="module"> imports.
//
// Guards against double-initializing the Firebase app in case another
// script on this page also initializes it.

(function () {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var db = firebase.firestore();

  var vName = document.getElementById("vname");
  var vPhone = document.getElementById("vphone");
  var vTopic = document.getElementById("vtopic");
  var vMsg = document.getElementById("vmsg");
  var vNameError = document.getElementById("vnameError");
  var vPhoneError = document.getElementById("vphoneError");
  var vSubmitBtn = document.getElementById("vSubmitBtn");
  var vStatus = document.getElementById("vStatus");
  var fieldsWrap = document.getElementById("visitFormFields");
  var successCard = document.getElementById("visitSuccessCard");

  if (!vSubmitBtn) return; // page doesn't have this form

  function clearFieldErrors() {
    [vName, vPhone].forEach(function (el) {
      el.classList.remove("invalid");
    });
    [vNameError, vPhoneError].forEach(function (el) {
      if (el) el.classList.remove("show");
    });
  }
  function markFieldInvalid(el, errorEl) {
    el.classList.add("invalid");
    if (errorEl) errorEl.classList.add("show");
  }
  [
    [vName, vNameError],
    [vPhone, vPhoneError],
  ].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      pair[0].classList.remove("invalid");
      if (pair[1]) pair[1].classList.remove("show");
    });
  });

  vSubmitBtn.addEventListener("click", function () {
    var name = vName.value.trim();
    var phone = vPhone.value.trim();
    var topic = vTopic.value;
    var message = vMsg.value.trim();
    var phoneDigits = phone.replace(/\D/g, "");
    var phoneValid =
      phoneDigits.length === 10 || (phoneDigits.length === 13 && phoneDigits.indexOf("977") === 0);

    clearFieldErrors();
    var firstInvalid = null;

    if (!name) {
      markFieldInvalid(vName, vNameError);
      firstInvalid = firstInvalid || vName;
    }
    if (!phone || !phoneValid) {
      markFieldInvalid(vPhone, vPhoneError);
      firstInvalid = firstInvalid || vPhone;
    }

    if (firstInvalid) {
      vStatus.textContent = "Please fix the highlighted field(s) above.";
      vStatus.className = "status-msg error";
      firstInvalid.focus();
      return;
    }

    vSubmitBtn.disabled = true;
    vSubmitBtn.textContent = "Sending...";
    vStatus.textContent = "";
    vStatus.className = "status-msg";

    db.collection("trainingEnquiries")
      .add({
        fullName: name,
        contactNumber: phone,
        interestedIn: topic,
        message: message,
        source: "visit",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(function () {
        fieldsWrap.style.display = "none";
        successCard.style.display = "block";

        setTimeout(function () {
          vName.value = "";
          vPhone.value = "";
          vTopic.selectedIndex = 0;
          vMsg.value = "";
          clearFieldErrors();
          vStatus.textContent = "";
          vStatus.className = "status-msg";

          successCard.style.display = "none";
          fieldsWrap.style.display = "block";
        }, 3000);
      })
      .catch(function (err) {
        vStatus.textContent = "Something went wrong. Please try again.";
        vStatus.className = "status-msg error";
        console.error(err);
      })
      .finally(function () {
        vSubmitBtn.disabled = false;
        vSubmitBtn.textContent = "Send Message";
      });
  });
})();