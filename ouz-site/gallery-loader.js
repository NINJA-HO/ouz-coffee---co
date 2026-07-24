// Loads gallery images/videos from Firestore and renders them into
// #gallery-grid. Only items tagged for the "homepage" section render here
// — the admin's Gallery page lets each upload be tagged Homepage or
// Training, so the two never mix. Legacy items uploaded before this field
// existed have no "section" value at all; those are treated as "homepage"
// so nothing existing disappears.
//
// If Firestore has no homepage images yet, shows a quiet "coming soon"
// placeholder instead of any hardcoded images — the owner controls 100% of
// the content shown here through the admin panel.
//
// Also wires up a click-to-enlarge lightbox: tapping any gallery item opens
// a fullscreen popup with the larger image/video (with sound) and its
// caption. openLightbox is exposed on window so the Training gallery strip
// (training-gallery-loader.js) can reuse the exact same lightbox instead of
// building a second one.
//
// Uses the Firebase "compat" (non-module) API on purpose: some networks/proxies
// have been seen mis-handling ES module <script type="module"> imports, so this
// avoids the "import" keyword entirely for maximum compatibility.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  // ---- Lightbox setup ----
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxVideo = document.getElementById("lightboxVideo");
  var lightboxCaption = document.getElementById("lightboxCaption");
  var lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(src, caption, mediaType) {
    if (!lightbox) return;
    if (mediaType === "video") {
      lightboxVideo.src = src;
      lightboxVideo.style.display = "block";
      lightboxVideo.play().catch(function () {
        /* autoplay with sound may be blocked until user interacts — fine, controls are visible */
      });
      lightboxImg.style.display = "none";
      lightboxImg.src = "";
    } else {
      lightboxImg.src = src;
      lightboxImg.alt = caption || "Ouz Coffee & Co.";
      lightboxImg.style.display = "block";
      lightboxVideo.style.display = "none";
      lightboxVideo.pause();
      lightboxVideo.src = "";
    }
    lightboxCaption.textContent = caption || "";
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  window.ouzOpenLightbox = openLightbox; // shared with training-gallery-loader.js

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("open");
    lightboxImg.src = "";
    lightboxVideo.pause();
    lightboxVideo.src = "";
    document.body.style.overflow = "";
  }

  if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
  if (lightbox) {
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox(); // click outside the image
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
  });

  function loadGallery() {
    var grid = document.getElementById("gallery-grid");
    var emptyMsg = document.getElementById("gallery-empty");
    if (!grid) return;

    db.collection("gallery")
      .orderBy("uploadedAt", "asc")
      .get()
      .then(function (snapshot) {
        var homepageItems = [];
        snapshot.forEach(function (doc) {
          var data = doc.data();
          if ((data.section || "homepage") === "homepage") {
            homepageItems.push(data);
          }
        });

        if (!homepageItems.length) {
          if (emptyMsg) emptyMsg.style.display = "block";
          return;
        }

        if (emptyMsg) emptyMsg.style.display = "none";
        grid.innerHTML = "";
        homepageItems.forEach(function (data) {
          var mediaType = data.mediaType || "image";
          var item = document.createElement("div");
          item.className = "gal-item";

          var captionHtml = data.caption
            ? '<div class="gal-cap">' + data.caption + "</div>"
            : "";

          item.innerHTML =
            (mediaType === "video"
              ? '<video src="' +
                data.imageUrl +
                '" muted autoplay loop playsinline></video>'
              : '<img src="' +
                data.imageUrl +
                '" alt="' +
                (data.caption || "Ouz Coffee & Co.") +
                '" />') + captionHtml;

          item.addEventListener("click", function () {
            openLightbox(data.imageUrl, data.caption, mediaType);
          });

          grid.appendChild(item);
        });
      })
      .catch(function (err) {
        // Network issue or Firebase not configured yet — show the placeholder
        // rather than leaving the section blank.
        if (emptyMsg) emptyMsg.style.display = "block";
        console.warn("Gallery could not load from Firestore.", err);
      });
  }

  loadGallery();
})();
