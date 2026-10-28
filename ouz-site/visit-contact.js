// Loads contact details (address, hours, phone numbers, emails, social
// links, WhatsApp number) from Firestore settings/site and renders them
// into the Visit page's Details section AND a row of small contact icons
// next to the homepage hero buttons (if present on the page). If nothing
// has been added yet in ouz-admin > Settings, shows a clean "coming soon"
// message instead of old placeholder/fallback data — no stale content.
//
// Icons are generic universal symbols (chat bubble, envelope, phone,
// map pin, and a generic link icon for each social platform) rather than
// brand-specific logos — the platform name still shows as a tooltip.
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

  var rowsContainer = document.getElementById("contactRows");
  var emptyMsg = document.getElementById("contactEmptyMsg");
  var ctas = document.getElementById("contactCtas");
  var getDirectionsBtn = document.getElementById("getDirectionsBtn");
  var callUsBtn = document.getElementById("callUsBtn");
  var heroIconLinks = document.getElementById("heroIconLinks");

  if (!rowsContainer && !heroIconLinks) return;

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // Prefers the admin's own Google Maps share link (contactMapUrl) when
  // set; falls back to an auto-generated Maps search URL built from the
  // address text so existing sites without a saved map link still work.
  function buildMapHref(data) {
    if (data.contactMapUrl) return data.contactMapUrl;
    if (data.contactAddress) {
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(data.contactAddress);
    }
    return "";
  }

  var ICONS = {
    whatsapp:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.25.9 4.29 2.4 5.9L2 22l5.5-1.8C9 20.7 10.46 21 12 21c5.52 0 10-4.02 10-9S17.52 2 12 2z"/></svg>',
    mail:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>',
    pin:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    link:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    facebook:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M14 9h3V5h-3c-2.21 0-4 1.79-4 4v2H7v4h3v7h4v-7h3l1-4h-4V9c0-.55.45-1 1-1z"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="#fff" stroke="none"/></svg>',
    x:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="#fff"><path d="M18.9 3H22l-7.5 8.6L23 21h-6.9l-5.4-6.6L4.5 21H1.4l8-9.2L1 3h7.1l4.9 6.1L18.9 3zm-1.2 16h1.9L7.4 4.9H5.4L17.7 19z"/></svg>',
    tiktok:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.7c-1.3 0-2.5-.4-3.5-1.1v6.3c0 3-2.5 5.2-5.4 5.2S5.7 17.8 5.7 14.8s2.5-5.2 5.4-5.2c.3 0 .6 0 .9.1v2.8c-.3-.1-.6-.2-.9-.2-1.4 0-2.6 1.1-2.6 2.5s1.2 2.5 2.6 2.5 2.7-1 2.7-2.5V3h2.7z"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="#fff"><path d="M10 15.5l5.5-3.5L10 8.5v7zM22 12c0 2.2-.2 3.7-.5 4.6a3 3 0 01-2.1 2.1c-1.2.3-6.4.3-7.4.3s-6.2 0-7.4-.3a3 3 0 01-2.1-2.1C2.2 15.7 2 14.2 2 12s.2-3.7.5-4.6a3 3 0 012.1-2.1C5.8 5 11 5 12 5s6.2 0 7.4.3a3 3 0 012.1 2.1c.3.9.5 2.4.5 4.6z"/></svg>',
    linkedin:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2.2"/><path d="M9 9h4v2c.7-1.2 2-2.3 4-2.3 3 0 5 2 5 5.6V21h-4v-6c0-1.6-.6-2.7-2-2.7-1.1 0-1.8.8-2.1 1.5-.1.3-.1.7-.1 1.1V21H9V9z"/></svg>',
  };

  var PLATFORM_COLORS = {
    whatsapp: "#25d366",
    facebook: "#1877f2",
    instagram: "linear-gradient(45deg, #f58529, #dd2a7b, #8134af, #515bd4)",
    x: "#000000",
    tiktok: "#010101",
    youtube: "#ff0000",
    linkedin: "#0a66c2",
  };

  function detectPlatform(name) {
    var n = (name || "").toLowerCase();
    if (n.indexOf("whatsapp") !== -1) return "whatsapp";
    if (n.indexOf("facebook") !== -1) return "facebook";
    if (n.indexOf("instagram") !== -1) return "instagram";
    if (n.indexOf("twitter") !== -1 || n === "x" || n.indexOf(" x") !== -1 || n.indexOf("x ") !== -1) return "x";
    if (n.indexOf("tiktok") !== -1 || n.indexOf("tik tok") !== -1) return "tiktok";
    if (n.indexOf("youtube") !== -1) return "youtube";
    if (n.indexOf("linkedin") !== -1) return "linkedin";
    return null;
  }

  function buildHeroIconLink(href, iconKey, label, colorKey) {
    var bg = colorKey && PLATFORM_COLORS[colorKey] ? PLATFORM_COLORS[colorKey] : null;
    var style = bg ? ' style="background:' + bg + ';border-color:transparent;"' : "";
    return (
      '<a href="' + href + '" target="_blank" rel="noopener" class="hero-icon-link" title="' +
      escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '"' + style + ">" +
      ICONS[iconKey] +
      "</a>"
    );
  }

  function populateHeroIcons(data) {
    if (!heroIconLinks) return;
    var iconsHtml = "";

    if (data.whatsappNumber) {
      var waDigits = data.whatsappNumber.replace(/\D/g, "");
      if (waDigits) {
        var waMsg = encodeURIComponent("Hi! I have a question about Ouz Coffee & Co.");
        iconsHtml += buildHeroIconLink(
          "https://wa.me/" + waDigits + "?text=" + waMsg,
          "whatsapp",
          "Chat on WhatsApp",
          "whatsapp"
        );
      }
    }
    if (data.contactEmails && data.contactEmails.length) {
      iconsHtml += buildHeroIconLink("mailto:" + escapeHtml(data.contactEmails[0]), "mail", "Email us");
    }
    if (data.contactPhones && data.contactPhones.length) {
      var phoneDigits = data.contactPhones[0].replace(/[^\d+]/g, "");
      iconsHtml += buildHeroIconLink("tel:" + phoneDigits, "phone", "Call us");
    }
    if (data.contactAddress) {
      iconsHtml += buildHeroIconLink(escapeHtml(buildMapHref(data)), "pin", "Find us");
    }
    (data.contactSocials || []).forEach(function (social) {
      if (!social.url) return;
      var platformKey = detectPlatform(social.platform);
      var iconKey = platformKey || "link";
      iconsHtml += buildHeroIconLink(escapeHtml(social.url), iconKey, social.platform || "Social link", platformKey);
    });

    heroIconLinks.innerHTML = iconsHtml;
  }

  db.collection("settings")
    .doc("site")
    .get()
    .then(function (docSnap) {
      var data = docSnap.exists ? docSnap.data() : {};

      populateHeroIcons(data);

      if (!rowsContainer) return;

      var hasAnyContactData =
        data.contactAddress ||
        data.contactHours ||
        (data.contactPhones && data.contactPhones.length) ||
        (data.contactEmails && data.contactEmails.length) ||
        (data.contactSocials && data.contactSocials.length);

      if (!hasAnyContactData) return; // keep showing the empty-state message

      var rowsHtml = "";

      if (data.contactAddress) {
        var mapHref = buildMapHref(data);
        var addressHtml = escapeHtml(data.contactAddress).replace(/\n/g, "<br />");
        var addressValue = mapHref
          ? '<a href="' + escapeHtml(mapHref) + '" target="_blank" rel="noopener">' + addressHtml + "</a>"
          : addressHtml;
        rowsHtml +=
          '<div class="info-row"><span class="k">Address</span><span class="v">' +
          addressValue +
          "</span></div>";
      }
      if (data.contactHours) {
        rowsHtml +=
          '<div class="info-row"><span class="k">Hours</span><span class="v">' +
          escapeHtml(data.contactHours).replace(/\n/g, "<br />") +
          "</span></div>";
      }
      if (data.contactPhones && data.contactPhones.length) {
        var phoneLinks = data.contactPhones
          .map(function (phone) {
            var digits = phone.replace(/[^\d+]/g, "");
            return '<a href="tel:' + digits + '">' + escapeHtml(phone) + "</a>";
          })
          .join("<br />");
        rowsHtml +=
          '<div class="info-row"><span class="k">Phone</span><span class="v">' + phoneLinks + "</span></div>";
      }
      if (data.contactEmails && data.contactEmails.length) {
        var emailLinks = data.contactEmails
          .map(function (email) {
            return '<a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + "</a>";
          })
          .join("<br />");
        rowsHtml +=
          '<div class="info-row"><span class="k">Email</span><span class="v">' + emailLinks + "</span></div>";
      }
      (data.contactSocials || []).forEach(function (social) {
        if (!social.platform && !social.display && !social.url) return;
        var linkText = escapeHtml(social.display || social.url || "");
        var linkHtml = social.url
          ? '<a href="' + escapeHtml(social.url) + '" target="_blank" rel="noopener">' + linkText + "</a>"
          : linkText;
        rowsHtml +=
          '<div class="info-row"><span class="k">' + escapeHtml(social.platform || "Link") + '</span><span class="v">' +
          linkHtml +
          "</span></div>";
      });

      rowsContainer.innerHTML = rowsHtml;
      if (emptyMsg) emptyMsg.style.display = "none";

      var showDirections = !!data.contactAddress;
      var showCall = !!(data.contactPhones && data.contactPhones.length);

      if (getDirectionsBtn) {
        getDirectionsBtn.style.display = showDirections ? "inline-flex" : "none";
        if (showDirections) {
          getDirectionsBtn.href = buildMapHref(data);
        }
      }
      if (callUsBtn) {
        callUsBtn.style.display = showCall ? "inline-flex" : "none";
        if (showCall) {
          var firstDigits = data.contactPhones[0].replace(/[^\d+]/g, "");
          callUsBtn.href = "tel:" + firstDigits;
        }
      }
    })
    .catch(function (err) {
      // Leave the empty-state message showing — no stale fallback data.
      console.warn("Could not load contact details.", err);
    });
})();