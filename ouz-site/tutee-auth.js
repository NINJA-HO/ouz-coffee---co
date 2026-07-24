// Handles the Tutee page: validates the student's Full Name + Mobile Number,
// checks them against the private student roster via the checkTutee Cloud
// Function (keeps the roster private — never queried directly from the
// client), then loads and renders all lessons (read-only) from Firestore.
//
// Uses the Firebase "compat" (non-module) API for the same reason as
// product-loader.js: better compatibility with networks/proxies that have
// been seen mis-handling ES module <script type="module"> imports.

(function () {
  firebase.initializeApp(firebaseConfig);
  var db = firebase.firestore();

  // Update this if the Cloud Functions region/project ever changes.
  var CHECK_TUTEE_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/checkTutee";
  var SESSION_KEY = "ouz_tutee_session";

  var loginCard = document.getElementById("tuteeLoginCard");
  var lessonsView = document.getElementById("tuteeLessonsView");
  var loginName = document.getElementById("loginName");
  var loginPhone = document.getElementById("loginPhone");
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

  function showLessonsView(name) {
    loginCard.style.display = "none";
    lessonsView.style.display = "block";
    welcomeName.textContent = name;
    loadLessons();
  }

  // Restore a previous session for this browser tab, if any.
  var saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      var savedData = JSON.parse(saved);
      currentStudent = savedData;
      showLessonsView(savedData.fullName);
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  logoutBtn.addEventListener("click", function () {
    sessionStorage.removeItem(SESSION_KEY);
    currentStudent = null;
    lessonsView.style.display = "none";
    loginCard.style.display = "block";
    loginName.value = "";
    loginPhone.value = "";
  });

  loginBtn.addEventListener("click", function () {
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
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentStudent));
          showLessonsView(name);
        } else {
          loginStatus.textContent =
            "We couldn't find a match. Please check your name and number, or ask your instructor to register you.";
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
        loginBtn.textContent = "Enter";
      });
  });

  // ================= LESSON RENDERING (read-only) =================
  var navList = document.getElementById("lessonNavList");
  var contentArea = document.getElementById("lessonContentArea");
  var noLessonsMsg = document.getElementById("noLessonsMsg");
  var allLessons = [];

  function loadLessons() {
    db.collection("lessons")
      .orderBy("createdAt", "asc")
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          noLessonsMsg.style.display = "block";
          navList.style.display = "none";
          return;
        }
        noLessonsMsg.style.display = "none";
        allLessons = [];
        snapshot.forEach(function (docSnap) {
          allLessons.push(Object.assign({ id: docSnap.id }, docSnap.data()));
        });
        renderLessonNav();
        renderLessonContent(allLessons[0]);
      })
      .catch(function (err) {
        noLessonsMsg.textContent = "Couldn't load lessons. Please try again later.";
        noLessonsMsg.style.display = "block";
        console.error(err);
      });
  }

  function renderLessonNav() {
    navList.innerHTML = "";
    allLessons.forEach(function (lesson, index) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "lesson-nav-item" + (index === 0 ? " active" : "");
      item.textContent = lesson.title || "(untitled lesson)";
      item.addEventListener("click", function () {
        navList.querySelectorAll(".lesson-nav-item").forEach(function (el) {
          el.classList.remove("active");
        });
        item.classList.add("active");
        renderLessonContent(lesson);
      });
      navList.appendChild(item);
    });
  }

  function renderLessonContent(lesson) {
    contentArea.innerHTML = "";
    if (!lesson) return;

    var title = document.createElement("h2");
    title.className = "lesson-title";
    title.textContent = lesson.title || "(untitled lesson)";
    contentArea.appendChild(title);

    var numberedCount = 0;
    var blocks = lesson.blocks || [];

    blocks.forEach(function (block, i) {
      if (block.type !== "numbered") numberedCount = 0;

      var el;
      switch (block.type) {
        case "heading1":
        case "heading2":
        case "heading3":
          el = document.createElement("div");
          el.className = "lesson-block lesson-" + block.type;
          el.innerHTML = block.content || "";
          break;
        case "bullet":
          el = document.createElement("div");
          el.className = "lesson-block lesson-bullet";
          el.innerHTML = block.content || "";
          break;
        case "numbered":
          numberedCount++;
          el = document.createElement("div");
          el.className = "lesson-block lesson-numbered";
          el.setAttribute("data-num", numberedCount + ".");
          el.innerHTML = block.content || "";
          break;
        case "checkbox":
          el = document.createElement("div");
          el.className = "lesson-block lesson-checkbox";
          el.innerHTML =
            '<input type="checkbox" ' + (block.checked ? "checked" : "") + " />" +
            '<span>' + (block.content || "") + "</span>";
          (function (blockRef, lessonRef) {
            el.querySelector('input[type="checkbox"]').addEventListener("change", function (e) {
              toggleCheckbox(lessonRef.id, blockRef.id, e.target.checked, e.target);
            });
          })(block, lesson);
          break;
        case "image":
          el = document.createElement("div");
          el.className = "lesson-block lesson-image";
          if (block.imageUrl) {
            el.innerHTML = '<img src="' + block.imageUrl + '" alt="" />';
          }
          break;
        default:
          el = document.createElement("div");
          el.className = "lesson-block lesson-paragraph";
          el.innerHTML = block.content || "";
      }
      contentArea.appendChild(el);
    });
  }

  // ================= CHECKBOX TOGGLE (writes back via Cloud Function) =================
  var TOGGLE_CHECKBOX_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/toggleLessonCheckbox";

  function toggleCheckbox(lessonId, blockId, checked, checkboxEl) {
    if (!currentStudent) return;
    checkboxEl.disabled = true;

    fetch(TOGGLE_CHECKBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: currentStudent.fullName,
        mobileNumber: currentStudent.mobileNumber,
        lessonId: lessonId,
        blockId: blockId,
        checked: checked,
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data.success) {
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
      });
  }
})();