// Floating AI chatbot widget, shown in the bottom-right corner on every
// site page. Builds its own HTML/CSS at runtime (so it only needs one
// script include, no separate markup per page) and talks to the
// chatWithBot Cloud Function, which combines the admin's Personal Prompt
// with a live product catalog before calling Gemini. The conversation
// (and whether the chat window was open) is persisted in sessionStorage,
// so it survives navigating between pages on the site — since this is a
// traditional multi-page site, each page load would otherwise wipe an
// in-memory-only history. sessionStorage clears automatically when the
// tab/browser is actually closed, which is exactly the "only restart when
// the page is closed" behavior wanted. Bot replies are rendered with basic
// markdown support (bold, bullet/numbered lists, links), since Gemini often
// replies using markdown. The panel can also be resized by dragging its
// top-left corner handle.

(function () {
  var CHAT_URL = "https://us-central1-ouz-coffee-co.cloudfunctions.net/chatWithBot";
  var HISTORY_KEY = "ouz_chat_history";
  var OPEN_KEY = "ouz_chat_open";
  var history = []; // [{ role: "user"|"model", text: "..." }]
  var isOpen = false;
  var isSending = false;

  function saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      /* sessionStorage unavailable (e.g. private browsing) — chat still works, just won't persist */
    }
  }
  function saveOpenState() {
    try {
      sessionStorage.setItem(OPEN_KEY, isOpen ? "1" : "0");
    } catch (e) {
      /* no-op */
    }
  }
  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function loadOpenState() {
    try {
      return sessionStorage.getItem(OPEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  // ---- Build the widget markup ----
  var wrap = document.createElement("div");
  wrap.id = "ouzChatWidget";
  wrap.innerHTML =
    '<button id="ouzChatToggle" aria-label="Open chat" type="button">' +
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.25.9 4.29 2.4 5.9L2 22l5.5-1.8C9 20.7 10.46 21 12 21c5.52 0 10-4.02 10-9S17.52 2 12 2z"/></svg>' +
    "</button>" +
    '<div id="ouzChatPanel" class="ouz-chat-panel">' +
    '<div id="ouzChatResizeHandle" class="ouz-chat-resize" title="Drag to resize"></div>' +
    '<div class="ouz-chat-header">' +
    "<span>Ask Ouz Coffee &amp; Co.</span>" +
    '<button id="ouzChatClose" type="button" aria-label="Close chat">&times;</button>' +
    "</div>" +
    '<div id="ouzChatMessages" class="ouz-chat-messages">' +
    '<div class="ouz-msg ouz-msg-bot">Hi! Ask me anything about our coffee, gear, training, or visiting the café.</div>' +
    "</div>" +
    '<div class="ouz-chat-input-row">' +
    '<input id="ouzChatInput" type="text" placeholder="Type a message..." />' +
    '<button id="ouzChatSend" type="button" aria-label="Send">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>' +
    "</button>" +
    "</div>" +
    "</div>";
  document.body.appendChild(wrap);

  var toggleBtn = document.getElementById("ouzChatToggle");
  var panel = document.getElementById("ouzChatPanel");
  var resizeHandle = document.getElementById("ouzChatResizeHandle");
  var closeBtn = document.getElementById("ouzChatClose");
  var messagesEl = document.getElementById("ouzChatMessages");
  var input = document.getElementById("ouzChatInput");
  var sendBtn = document.getElementById("ouzChatSend");

  function isMobileWidth() {
    return window.innerWidth <= 600;
  }

  // On mobile, the panel is full-screen. When the on-screen keyboard opens,
  // the browser shrinks the *visual* viewport but not the layout viewport,
  // so a plain 100vh/100dvh panel can end up with a dead gap where the
  // keyboard now sits. Tracking window.visualViewport directly (where
  // supported) is the most reliable fix across mobile browsers.
  function syncPanelHeightToViewport() {
    if (!isMobileWidth() || !isOpen) return;
    if (window.visualViewport) {
      panel.style.height = window.visualViewport.height + "px";
      panel.style.top = window.visualViewport.offsetTop + "px";
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncPanelHeightToViewport);
    window.visualViewport.addEventListener("scroll", syncPanelHeightToViewport);
  }

  function openChat(skipFocus) {
    isOpen = true;
    panel.classList.add("open");
    document.body.classList.add("ouz-chat-open");
    if (!skipFocus) input.focus();
    syncPanelHeightToViewport();
    saveOpenState();
  }
  function closeChat() {
    isOpen = false;
    panel.classList.remove("open");
    document.body.classList.remove("ouz-chat-open");
    if (isMobileWidth()) {
      panel.style.height = "";
      panel.style.top = "";
    }
    saveOpenState();
  }
  toggleBtn.addEventListener("click", function () {
    if (isOpen) closeChat();
    else openChat();
  });
  closeBtn.addEventListener("click", closeChat);

  // ================= LIGHTWEIGHT MARKDOWN RENDERING (bot replies only) =================
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function renderMarkdown(raw) {
    var escaped = escapeHtml(raw);
    var lines = escaped.split("\n");
    var html = "";
    var listType = null; // "ul" | "ol" | null

    function closeList() {
      if (listType) {
        html += "</" + listType + ">";
        listType = null;
      }
    }
    function inline(text) {
      // Links: [text](url) — supports both relative site links and full URLs.
      text = text.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      );
      // Bare URLs written out directly (not in markdown link format) — Gemini
      // doesn't always wrap links in [text](url), so this catches plain
      // "https://..." text and makes it clickable too. Skips anything already
      // inside an href="..." from the replacement above, and trims trailing
      // punctuation (periods, commas, etc.) off the end of the link.
      text = text.replace(
        /(?<!href=")(https?:\/\/[^\s<]+)/g,
        function (match) {
          var trailing = "";
          var url = match;
          var trailingPunctuation = /[.,;:!?)\]]+$/;
          var found = url.match(trailingPunctuation);
          if (found) {
            trailing = found[0];
            url = url.slice(0, url.length - trailing.length);
          }
          return '<a href="' + url + '" target="_blank" rel="noopener">' + url + "</a>" + trailing;
        }
      );
      // Bold: **text**
      text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      // Italic: *text* (single asterisks not already consumed by bold)
      text = text.replace(/(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
      return text;
    }

    lines.forEach(function (line) {
      var trimmed = line.trim();
      var bulletMatch = trimmed.match(/^[*-]\s+(.*)/);
      var numberedMatch = trimmed.match(/^\d+\.\s+(.*)/);

      if (bulletMatch) {
        if (listType !== "ul") {
          closeList();
          html += "<ul>";
          listType = "ul";
        }
        html += "<li>" + inline(bulletMatch[1]) + "</li>";
      } else if (numberedMatch) {
        if (listType !== "ol") {
          closeList();
          html += "<ol>";
          listType = "ol";
        }
        html += "<li>" + inline(numberedMatch[1]) + "</li>";
      } else if (trimmed === "") {
        closeList();
        // Blank line: paragraph margins already provide spacing, no <br> needed.
      } else {
        closeList();
        html += "<p>" + inline(trimmed) + "</p>";
      }
    });
    closeList();
    return html;
  }

  function addMessage(text, role) {
    var el = document.createElement("div");
    el.className = "ouz-msg " + (role === "user" ? "ouz-msg-user" : "ouz-msg-bot");
    if (role === "user") {
      el.textContent = text;
    } else {
      el.innerHTML = renderMarkdown(text);
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function sendMessage() {
    var text = input.value.trim();
    if (!text || isSending) return;

    addMessage(text, "user");
    input.value = "";
    isSending = true;
    sendBtn.disabled = true;

    var typingEl = addMessage("Typing...", "model");
    typingEl.classList.add("ouz-msg-typing");

    fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        typingEl.remove();
        if (data.success) {
          addMessage(data.reply, "model");
          history.push({ role: "user", text: text });
          history.push({ role: "model", text: data.reply });
          saveHistory();
        } else {
          addMessage("Sorry, something went wrong. Please try again.", "model");
        }
      })
      .catch(function (err) {
        typingEl.remove();
        addMessage("Sorry, something went wrong. Please try again.", "model");
        console.error(err);
      })
      .finally(function () {
        isSending = false;
        sendBtn.disabled = false;
      });
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendMessage();
  });
  input.addEventListener("focus", function () {
    setTimeout(syncPanelHeightToViewport, 300);
  });
  input.addEventListener("blur", function () {
    setTimeout(syncPanelHeightToViewport, 300);
  });

  // ================= RESTORE PERSISTED CONVERSATION (runs once on page load) =================
  // Keeps the welcome message, then replays any prior conversation on top of
  // it, so navigating to a new page continues the same chat instead of
  // starting fresh.
  (function restore() {
    var savedHistory = loadHistory();
    if (savedHistory.length) {
      history = savedHistory;
      savedHistory.forEach(function (turn) {
        addMessage(turn.text, turn.role);
      });
    }
    if (loadOpenState()) {
      openChat(true);
    }
  })();

  // ================= DRAG-TO-RESIZE (top-left corner handle) =================
  // Panel is anchored to the bottom-right of the widget, so growing it means
  // increasing width/height while the bottom-right corner stays put.
  var resizing = false;
  var startX, startY, startWidth, startHeight;
  var MIN_WIDTH = 260;
  var MIN_HEIGHT = 320;
  var MAX_WIDTH = Math.min(window.innerWidth - 24, 640);
  var MAX_HEIGHT = Math.min(window.innerHeight - 100, 720);

  resizeHandle.addEventListener("pointerdown", function (e) {
    resizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = panel.offsetWidth;
    startHeight = panel.offsetHeight;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  resizeHandle.addEventListener("pointermove", function (e) {
    if (!resizing) return;
    var deltaX = startX - e.clientX; // dragging left increases width
    var deltaY = startY - e.clientY; // dragging up increases height

    var newWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), MAX_WIDTH);
    var newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT);

    panel.style.width = newWidth + "px";
    panel.style.height = newHeight + "px";
  });

  function stopResizing(e) {
    if (resizing && resizeHandle.releasePointerCapture && e.pointerId !== undefined) {
      try {
        resizeHandle.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* no-op */
      }
    }
    resizing = false;
  }
  resizeHandle.addEventListener("pointerup", stopResizing);
  resizeHandle.addEventListener("pointercancel", stopResizing);
})();