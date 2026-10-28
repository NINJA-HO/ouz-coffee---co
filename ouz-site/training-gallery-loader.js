// Loads images/videos from Firestore's "gallery" collection into the
// Barista Training teaser's strip (#training-gallery-grid), same visual
// style as the homepage "Around the Shop" gallery. Only items tagged with
// section: "training" render here — uploaded from the same admin Gallery
// page, just with "Barista Training teaser strip" chosen instead of
// "Homepage" — so this never mixes with the main homepage gallery.
//
// Videos autoplay silently as a preview right in the strip (like a GIF);
// clicking one opens it with sound in the SAME shared lightbox the
// homepage gallery uses (window.ouzOpenLightbox, exposed by
// gallery-loader.js — that script must load before this one).
//
// Uses the Firebase "compat" (non-module) API, same as every other script
// on this site. Guards against double-initializing the Firebase app.

(function () {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  var db = firebase.firestore();

  function loadTrainingGallery() {
    var grid = document.getElementById("training-gallery-grid");
    var emptyMsg = document.getElementById("training-gallery-empty");
    if (!grid) return;

    db.collection("gallery")
      .orderBy("uploadedAt", "asc")
      .get()
      .then(function (snapshot) {
        var trainingItems = [];
        snapshot.forEach(function (doc) {
          var data = doc.data();
          if (data.section === "training") {
            trainingItems.push(data);
          }
        });

        if (!trainingItems.length) {
          if (emptyMsg) emptyMsg.style.display = "block";
          return;
        }

        if (emptyMsg) emptyMsg.style.display = "none";
        grid.innerHTML = "";
        trainingItems.forEach(function (data) {
          var mediaType = data.mediaType || "image";
          var item = document.createElement("div");
          item.className = "gal-item";

          var captionHtml = data.caption
            ? '<div class="gal-cap">' + data.caption + "</div>"
            : "";

          item.innerHTML =
            (mediaType === "video"
              ? '<video src="' + data.imageUrl + '" muted autoplay loop playsinline></video>'
              : '<img src="' + data.imageUrl + '" alt="' + (data.caption || "Barista Training") + '" />') +
            captionHtml;

          item.addEventListener("click", function () {
            if (window.ouzOpenLightbox) {
              window.ouzOpenLightbox(data.imageUrl, data.caption, mediaType);
            }
          });

          grid.appendChild(item);
        });
      })
      .catch(function (err) {
        if (emptyMsg) emptyMsg.style.display = "block";
        console.warn("Training gallery could not load from Firestore.", err);
      });
  }

  loadTrainingGallery();
})();