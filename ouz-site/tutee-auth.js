// Handles the Tutee page: validates the student's Full Name + Mobile Number,
// checks them against the private student roster via the checkTutee Cloud
// Function (keeps the roster private — never queried directly from the
// client), then loads and renders all lessons from Firestore.
//
// Mobile-first reading experience: a "Lesson 2 of 8" picker that opens a
// bottom sheet lesson list, Previous / Next buttons,
// tap-to-zoom images, big tap targets for checkboxes, and it remembers the
// student's device and last-opened lesson. On wide screens the lesson list is a
// sidebar instead.
//
// Uses the Firebase "compat" (non-module) API for the same reason as
// product-loader.js: better compatibility with networks/proxies that have
// been seen mis-handling ES module <script type="module"> imports.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  // Update this if the Cloud Functions region/project ever changes.
  var CHECK_TUTEE_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/checkTutee";
  var TOGGLE_CHECKBOX_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/toggleLessonCheckbox";
  var SESSION_KEY = "ouz_tutee_session";
  var LAST_LESSON_KEY = "ouz_tutee_last_lesson";

  // ---- safe storage (private browsing / blocked storage must never break the page) ----
  function store(kind) {
    try {
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch (e) {
      return null;
    }
  }
  function safeGet(kind, key) {
    try {
      var s = store(kind);
      return s ? s.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }
  function safeSet(kind, key, val) {
    try {
      var s = store(kind);
      if (s) s.setItem(key, val);
    } catch (e) {}
  }
  function safeRemove(kind, key) {
    try {
      var s = store(kind);
      if (s) s.removeItem(key);
    } catch (e) {}
  }

  var loginCard = document.getElementById("tuteeLoginCard");
  var lessonsView = document.getElementById("tuteeLessonsView");
  var loginName = document.getElementById("loginName");
  var loginPhone = document.getElementById("loginPhone");
  var loginKeep = document.getElementById("loginKeep");
  var loginNameError = document.getElementById("loginNameError");
  var loginPhoneError = document.getElementById("loginPhoneError");
  var loginBtn = document.getElementById("loginBtn");
  var loginStatus = document.getElementById("loginStatus");
  var welcomeName = document.getElementById("welcomeName");
  var logoutBtn = document.getElementById("logoutTuteeBtn");

  function clearFieldErrors() {
    [loginName, loginPhone].forEach(function (el) {
      el.classList.remove("invalid");
    });
    [loginNameError, loginPhoneError].forEach(function (el) {
      if (el) el.classList.remove("show");
    });
  }
  function markFieldInvalid(el, errorEl) {
    el.classList.add("invalid");
    if (errorEl) errorEl.classList.add("show");
  }
  [
    [loginName, loginNameError],
    [loginPhone, loginPhoneError],
  ].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      pair[0].classList.remove("invalid");
      if (pair[1]) pair[1].classList.remove("show");
    });
  });

  var currentStudent = null; // { fullName, mobileNumber } once logged in

  function saveSession(student, remember) {
    var json = JSON.stringify(student);
    safeRemove("local", SESSION_KEY);
    safeRemove("session", SESSION_KEY);
    safeSet(remember ? "local" : "session", SESSION_KEY, json);
  }
  function clearSession() {
    safeRemove("local", SESSION_KEY);
    safeRemove("session", SESSION_KEY);
  }

  function showLessonsView(name) {
    loginCard.style.display = "none";
    lessonsView.style.display = "block";
    welcomeName.textContent = name;
    loadLessons();
  }

  logoutBtn.addEventListener("click", function () {
    clearSession();
    safeRemove("local", LAST_LESSON_KEY);
    currentStudent = null;
    allLessons = [];
    lessonsView.style.display = "none";
    loginCard.style.display = "block";
    loginName.value = "";
    loginPhone.value = "";
    loginStatus.textContent = "";
    loginStatus.className = "status-msg";
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo(0, 0);
  });

  function attemptLogin() {
    var name = loginName.value.trim();
    var phone = loginPhone.value.trim();
    var phoneDigits = phone.replace(/\D/g, "");
    var phoneValid =
      phoneDigits.length === 10 || (phoneDigits.length === 13 && phoneDigits.indexOf("977") === 0);

    clearFieldErrors();
    var firstInvalid = null;

    if (!name) {
      markFieldInvalid(loginName, loginNameError);
      firstInvalid = firstInvalid || loginName;
    }
    if (!phone || !phoneValid) {
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
    loginBtn.textContent = "Checking...";
    loginStatus.textContent = "";
    loginStatus.className = "status-msg";

    fetch(CHECK_TUTEE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, mobileNumber: phone }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.success) {
          currentStudent = { fullName: name, mobileNumber: phone };
          saveSession(currentStudent, !loginKeep || loginKeep.checked);
          showLessonsView(name);
          window.scrollTo(0, 0);
        } else {
          loginStatus.textContent =
            "We couldn't find a match. Please check your name and number, or ask your instructor to register you.";
          loginStatus.className = "status-msg error";
        }
      })
      .catch(function (err) {
        loginStatus.textContent = "Something went wrong. Please check your connection and try again.";
        loginStatus.className = "status-msg error";
        console.error(err);
      })
      .finally(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = "Enter";
      });
  }
  loginBtn.addEventListener("click", attemptLogin);
  [loginName, loginPhone].forEach(function (el) {
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        attemptLogin();
      }
    });
  });

  // ================= LESSON READING VIEW =================
  var navList = document.getElementById("lessonNavList"); // desktop sidebar
  var sheetList = document.getElementById("ttSheetList"); // mobile bottom sheet
  var contentArea = document.getElementById("lessonContentArea");
  var noLessonsMsg = document.getElementById("noLessonsMsg");
  var layout = document.getElementById("ttLayout");
  var bar = document.getElementById("ttBar");
  var pickerBtn = document.getElementById("ttPickerBtn");
  var pickerLabel = document.getElementById("ttPickerLabel");
  var pickerTitle = document.getElementById("ttPickerTitle");
  var pager = document.getElementById("ttPager");
  var sheet = document.getElementById("ttSheet");
  var lightbox = document.getElementById("ttLightbox");
  var lightboxImg = document.getElementById("ttLightboxImg");

  var allLessons = [];
  var currentIndex = 0;

  function showLoadMessage(text, withRetry) {
    noLessonsMsg.textContent = text;
    noLessonsMsg.style.display = "block";
    if (withRetry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost";
      btn.style.cssText = "display:block;margin:14px auto 0;";
      btn.textContent = "Try again";
      btn.addEventListener("click", loadLessons);
      noLessonsMsg.appendChild(btn);
    }
    layout.style.display = "none";
  }

  function loadLessons() {
    noLessonsMsg.style.display = "none";
    layout.style.display = "";
    contentArea.innerHTML = '<div class="tt-loading">Loading your lessons…</div>';
    navList.innerHTML = "";
    pager.innerHTML = "";

    db.collection("lessons")
      .orderBy("createdAt", "asc")
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          showLoadMessage("No lessons have been added yet — check back soon.", false);
          return;
        }
        allLessons = [];
        snapshot.forEach(function (docSnap) {
          allLessons.push(Object.assign({ id: docSnap.id }, docSnap.data()));
        });
        buildNav();

        // Open: the lesson in the link (#lesson=ID) → the last one read → the first.
        var wanted = null;
        var m = /lesson=([\w-]+)/.exec(window.location.hash || "");
        if (m) wanted = m[1];
        if (!wanted) wanted = safeGet("local", LAST_LESSON_KEY);
        var start = 0;
        allLessons.forEach(function (l, i) {
          if (l.id === wanted) start = i;
        });
        selectLesson(start, { scroll: false });
      })
      .catch(function (err) {
        showLoadMessage("Couldn't load lessons. Please check your connection and try again.", true);
        console.error(err);
      });
  }

  // ---- navigation lists (sidebar + bottom sheet share the same items) ----
  function navItem(lesson, index) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tt-nav-item";
    b.setAttribute("data-index", index);
    var num = document.createElement("span");
    num.className = "tt-nav-num";
    num.textContent = index + 1;
    var t = document.createElement("span");
    t.className = "tt-nav-title";
    t.textContent = lesson.title || "Untitled lesson";
    b.appendChild(num);
    b.appendChild(t);
    b.addEventListener("click", function () {
      closeSheet();
      selectLesson(index, { scroll: true });
    });
    return b;
  }

  function buildNav() {
    navList.innerHTML = "";
    sheetList.innerHTML = "";
    allLessons.forEach(function (lesson, index) {
      navList.appendChild(navItem(lesson, index));
      sheetList.appendChild(navItem(lesson, index));
    });
  }

  function markActive(index) {
    [navList, sheetList].forEach(function (list) {
      Array.prototype.forEach.call(list.querySelectorAll(".tt-nav-item"), function (el) {
        var on = Number(el.getAttribute("data-index")) === index;
        el.classList.toggle("active", on);
        if (on) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      });
    });
    var lesson = allLessons[index];
    pickerLabel.textContent = "Lesson " + (index + 1) + " of " + allLessons.length;
    pickerTitle.textContent = (lesson && lesson.title) || "Untitled lesson";
  }

  function selectLesson(index, opts) {
    if (index < 0 || index >= allLessons.length) return;
    currentIndex = index;
    var lesson = allLessons[index];
    markActive(index);
    renderLessonContent(lesson, index);
    renderPager(index);

    safeSet("local", LAST_LESSON_KEY, lesson.id);
    try {
      history.replaceState(null, "", "#lesson=" + lesson.id);
    } catch (e) {}

    if (opts && opts.scroll) {
      // bring the top of the lesson (picker bar on phones, title on desktop) into view
      var target = bar && bar.offsetParent !== null ? bar : contentArea;
      var y = target.getBoundingClientRect().top + window.pageYOffset - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
    // keep the active sidebar item in view on desktop
    var active = navList.querySelector(".tt-nav-item.active");
    if (active && active.scrollIntoView && navList.offsetParent !== null) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function renderPager(index) {
    pager.innerHTML = "";
    var prev = allLessons[index - 1];
    var next = allLessons[index + 1];

    function pagerBtn(cls, label, lesson, target) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tt-pager-btn " + cls;
      var small = document.createElement("span");
      small.className = "tt-pager-label";
      small.textContent = label;
      var title = document.createElement("span");
      title.className = "tt-pager-title";
      title.textContent = lesson.title || "Untitled lesson";
      b.appendChild(small);
      b.appendChild(title);
      b.addEventListener("click", function () {
        selectLesson(target, { scroll: true });
      });
      return b;
    }

    if (prev) pager.appendChild(pagerBtn("prev", "‹ Previous", prev, index - 1));
    else pager.appendChild(document.createElement("span"));
    if (next) {
      pager.appendChild(pagerBtn("next", "Next ›", next, index + 1));
    } else {
      var done = document.createElement("div");
      done.className = "tt-pager-done";
      done.textContent = "🎉 You've reached the last lesson";
      pager.appendChild(done);
    }
  }

  // ---- reading time ----
  function readingMinutes(blocks) {
    var words = 0;
    (blocks || []).forEach(function (b) {
      if (!b || !b.content) return;
      var tmp = document.createElement("div");
      tmp.innerHTML = b.content;
      var text = (tmp.textContent || "").trim();
      if (text) words += text.split(/\s+/).length;
    });
    return Math.max(1, Math.round(words / 200));
  }

  // ---- lesson body ----
  function renderLessonContent(lesson, index) {
    contentArea.innerHTML = "";
    if (!lesson) return;

    // A <div>, not <header>: the site stylesheet makes <header> elements stick to the top of the screen.
    var head = document.createElement("div");
    head.className = "tt-article-head";
    var meta = document.createElement("p");
    meta.className = "tt-meta";
    meta.textContent = "Lesson " + (index + 1) + " · " + readingMinutes(lesson.blocks) + " min read";
    var title = document.createElement("h2");
    title.className = "tt-title";
    title.textContent = lesson.title || "Untitled lesson";
    head.appendChild(meta);
    head.appendChild(title);
    contentArea.appendChild(head);

    var numberedCount = 0;
    var blocks = lesson.blocks || [];

    if (!blocks.length) {
      var empty = document.createElement("p");
      empty.className = "tt-b tt-p";
      empty.style.color = "#8a7d72";
      empty.textContent = "This lesson doesn't have any notes yet.";
      contentArea.appendChild(empty);
    }

    blocks.forEach(function (block) {
      if (block.type !== "numbered") numberedCount = 0;

      var el;
      switch (block.type) {
        case "heading1":
        case "heading2":
        case "heading3":
          el = document.createElement("div");
          el.className = "tt-b tt-" + block.type.replace("heading", "h");
          el.setAttribute("role", "heading");
          el.setAttribute("aria-level", block.type.replace("heading", ""));
          el.innerHTML = block.content || "";
          break;
        case "bullet":
          el = document.createElement("div");
          el.className = "tt-b tt-bullet";
          el.innerHTML = block.content || "";
          break;
        case "numbered":
          numberedCount++;
          el = document.createElement("div");
          el.className = "tt-b tt-numbered";
          el.setAttribute("data-num", numberedCount + ".");
          el.innerHTML = block.content || "";
          break;
        case "checkbox":
          el = document.createElement("label");
          el.className = "tt-b tt-check";
          var input = document.createElement("input");
          input.type = "checkbox";
          input.checked = !!block.checked;
          var span = document.createElement("span");
          span.innerHTML = block.content || "";
          el.appendChild(input);
          el.appendChild(span);
          (function (blockRef, lessonRef, inputEl) {
            inputEl.addEventListener("change", function (e) {
              toggleCheckbox(lessonRef, blockRef, e.target.checked, e.target);
            });
          })(block, lesson, input);
          break;
        case "image":
          el = document.createElement("div");
          el.className = "tt-b tt-image";
          if (block.imageUrl) {
            var img = document.createElement("img");
            img.src = block.imageUrl;
            img.alt = "";
            img.loading = "lazy";
            img.decoding = "async";
            img.addEventListener("error", function () {
              el.style.display = "none";
            });
            var zoom = document.createElement("button");
            zoom.type = "button";
            zoom.className = "tt-zoom";
            zoom.setAttribute("aria-label", "View image full screen");
            zoom.appendChild(img);
            zoom.addEventListener("click", function () {
              openLightbox(block.imageUrl);
            });
            el.appendChild(zoom);
          }
          break;
        default:
          el = document.createElement("div");
          el.className = "tt-b tt-p";
          el.innerHTML = block.content || "";
      }
      contentArea.appendChild(el);
    });
  }

  // ================= BOTTOM SHEET (lesson picker on phones) =================
  var lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("tt-lock");
    var active = sheetList.querySelector(".tt-nav-item.active");
    if (active) {
      active.scrollIntoView({ block: "center" });
      active.focus({ preventScroll: true });
    }
  }
  function closeSheet() {
    if (!sheet.classList.contains("open")) return;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tt-lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  pickerBtn.addEventListener("click", openSheet);
  document.getElementById("ttAllBtn").addEventListener("click", openSheet);
  document.getElementById("ttSheetClose").addEventListener("click", closeSheet);
  document.getElementById("ttSheetBackdrop").addEventListener("click", closeSheet);

  // ================= IMAGE LIGHTBOX =================
  function openLightbox(url) {
    lightboxImg.src = url;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("tt-lock");
  }
  function closeLightbox() {
    if (!lightbox.classList.contains("open")) return;
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.removeAttribute("src");
    if (!sheet.classList.contains("open")) document.body.classList.remove("tt-lock");
  }
  lightbox.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeLightbox();
      closeSheet();
    }
    // Left / right arrows move between lessons (not while typing or in a popup)
    if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      lessonsView.style.display !== "none" &&
      allLessons.length &&
      !sheet.classList.contains("open") &&
      !lightbox.classList.contains("open") &&
      !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "") &&
      !e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      var target = currentIndex + (e.key === "ArrowRight" ? 1 : -1);
      if (target >= 0 && target < allLessons.length) selectLesson(target, { scroll: true });
    }
  });

  // ================= CHECKBOX TOGGLE (writes back via Cloud Function) =================
  function toggleCheckbox(lesson, block, checked, checkboxEl) {
    if (!currentStudent) return;
    checkboxEl.disabled = true;
    var row = checkboxEl.closest(".tt-check");
    if (row) row.classList.add("saving");

    fetch(TOGGLE_CHECKBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: currentStudent.fullName,
        mobileNumber: currentStudent.mobileNumber,
        lessonId: lesson.id,
        blockId: block.id,
        checked: checked,
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.success) {
          // Keep the in-memory lesson in sync so switching lessons and coming
          // back doesn't show a stale tick.
          block.checked = checked;
        } else {
          // Revert the checkbox visually if the save didn't go through.
          checkboxEl.checked = !checked;
          console.warn("Couldn't save checkbox state:", data.error);
        }
      })
      .catch(function (err) {
        checkboxEl.checked = !checked;
        console.error("Checkbox toggle failed:", err);
      })
      .finally(function () {
        checkboxEl.disabled = false;
        if (row) row.classList.remove("saving");
      });
  }

  // Everything above is defined now, so it's safe to restore a saved session.
  // Restore a previous session (this tab, or this device if "keep me signed in" was ticked).
  function restoreSession() {
  var saved = safeGet("session", SESSION_KEY) || safeGet("local", SESSION_KEY);
  if (saved) {
    try {
      var savedData = JSON.parse(saved);
      if (savedData && savedData.fullName && savedData.mobileNumber) {
        currentStudent = savedData;
        showLessonsView(savedData.fullName);
      } else {
        clearSession();
      }
    } catch (e) {
      clearSession();
    }
  }
  }

  restoreSession();
})();