// Wires up WhatsApp buttons for static (non-product) content — e.g. the
// Barista Training tiers. Each button needs class="whatsapp-btn" and a
// data-tier="..." attribute naming what it's about; this script fetches the
// WhatsApp number from Settings (settings/site in Firestore) and builds a
// wa.me link with a message mentioning that specific item.
//
// Uses the Firebase "compat" (non-module) API for the same reason as
// product-loader.js: better compatibility with networks/proxies that have
// been seen mis-handling ES module <script type="module"> imports.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  db.collection("settings")
    .doc("site")
    .get()
    .then(function (docSnap) {
      var whatsappNumber = docSnap.exists ? docSnap.data().whatsappNumber || "" : "";
      var digitsOnly = whatsappNumber.replace(/\D/g, "");
      if (!digitsOnly) return;

      document.querySelectorAll(".whatsapp-btn[data-tier]").forEach(function (btn) {
        var tier = btn.getAttribute("data-tier");
        var message = 'Hi, I\'m interested in the "' + tier + '" training program. ';
        btn.href = "https://wa.me/" + digitsOnly + "?text=" + encodeURIComponent(message);
      });
    })
    .catch(function (err) {
      console.warn("Could not load WhatsApp settings.", err);
    });
})();