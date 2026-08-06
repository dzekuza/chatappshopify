(function () {
  var root = document.getElementById("ai-chat-widget-root");
  if (!root) return;

  var chatEndpoint = root.dataset.chatEndpoint;
  var settingsEndpoint = root.dataset.settingsEndpoint;
  var messagesEndpoint = root.dataset.messagesEndpoint;
  var historyEndpoint = root.dataset.historyEndpoint;
  var history = [];
  var lastAgentMessageAt = new Date(0).toISOString();
  var agentPollTimer = null;
  var AGENT_POLL_INTERVAL_MS = 5000;

  function getConversationId() {
    try {
      var id = window.sessionStorage.getItem("aicw-conversation-id");
      if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
        window.sessionStorage.setItem("aicw-conversation-id", id);
      }
      return id;
    } catch (err) {
      return String(Date.now());
    }
  }

  var conversationId = getConversationId();

  function getStoredContact() {
    try {
      var raw = window.sessionStorage.getItem("aicw-contact");
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function storeContact(value) {
    try {
      window.sessionStorage.setItem("aicw-contact", JSON.stringify(value));
    } catch (err) {}
  }

  var contact = getStoredContact();

  function contrastColor(hex) {
    var value = (hex || "").replace("#", "");
    if (value.length === 3) {
      value = value
        .split("")
        .map(function (c) {
          return c + c;
        })
        .join("");
    }
    if (value.length !== 6) return "#ffffff";
    var r = parseInt(value.substring(0, 2), 16);
    var g = parseInt(value.substring(2, 4), 16);
    var b = parseInt(value.substring(4, 6), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  }

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function bubbleIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 4h16v12H7l-3 3V4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function downArrowIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 4v14m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function upArrowIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function plusIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function refreshIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 11a8 8 0 10-2.34 5.66M20 5v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function closeIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function emptyChatIcon() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 4h16v12H7l-3 3V4z" stroke="currentColor" stroke-width="1.75" stroke-dasharray="3 3" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function greetingForNow() {
    var hour = new Date().getHours();
    if (hour < 12) return "Morning";
    if (hour < 18) return "Afternoon";
    return "Evening";
  }

  function init(settings) {
    if (!settings || settings.enabled === false) return;

    root.classList.add(
      "aicw-position-" + (settings.position || "bottom-right"),
    );
    root.style.setProperty("--aicw-color", settings.primaryColor || "#1a1a1a");
    root.style.setProperty(
      "--aicw-color-contrast",
      contrastColor(settings.primaryColor),
    );

    root.innerHTML =
      '<button type="button" class="aicw-bubble" aria-label="Open chat">' +
      bubbleIcon() +
      "</button>" +
      '<div class="aicw-panel' +
      (contact ? "" : " aicw-show-gate") +
      '">' +
      '<div class="aicw-header">' +
      '<div class="aicw-header-titles">' +
      '<p class="aicw-header-title">Chat with us</p>' +
      '<p class="aicw-header-subtitle">' +
      escapeHtml(settings.welcomeMessage || "How can I help you today?") +
      "</p>" +
      "</div>" +
      '<div class="aicw-header-actions">' +
      '<button type="button" class="aicw-icon-button aicw-reset" aria-label="Reset conversation" title="Reset conversation">' +
      refreshIcon() +
      "</button>" +
      '<button type="button" class="aicw-icon-button aicw-close" aria-label="Close chat">' +
      closeIcon() +
      "</button>" +
      "</div>" +
      "</div>" +
      '<form class="aicw-gate">' +
      '<p class="aicw-gate-intro">Tell us a bit about you to start chatting.</p>' +
      '<label class="aicw-field"><span>Name</span>' +
      '<input type="text" class="aicw-gate-name" autocomplete="name" required /></label>' +
      '<label class="aicw-field"><span>Email</span>' +
      '<input type="email" class="aicw-gate-email" autocomplete="email" /></label>' +
      '<label class="aicw-field"><span>Phone</span>' +
      '<input type="tel" class="aicw-gate-phone" autocomplete="tel" /></label>' +
      '<p class="aicw-gate-error" hidden></p>' +
      '<button type="submit" class="aicw-gate-submit">Start chat</button>' +
      "</form>" +
      '<div class="aicw-viewport" role="region" aria-label="Chat messages">' +
      '<div class="aicw-empty-state">' +
      '<div class="aicw-empty-icon">' +
      emptyChatIcon() +
      "</div>" +
      '<p class="aicw-empty-title">' +
      greetingForNow() +
      "!</p>" +
      '<p class="aicw-empty-subtitle">Ask a question below to get started.</p>' +
      "</div>" +
      '<div class="aicw-messages" role="log" aria-live="polite"></div>' +
      '<button type="button" class="aicw-scroll-bottom" aria-label="Scroll to latest messages" hidden>' +
      downArrowIcon() +
      "</button>" +
      "</div>" +
      '<form class="aicw-form">' +
      '<textarea class="aicw-input" rows="1" placeholder="Type a message..."></textarea>' +
      '<div class="aicw-input-actions">' +
      '<button type="button" class="aicw-icon-button" disabled aria-label="Attachments not available" title="Attachments not available">' +
      plusIcon() +
      "</button>" +
      '<button type="submit" class="aicw-send" aria-label="Send message">' +
      upArrowIcon() +
      "</button>" +
      "</div>" +
      "</form>" +
      "</div>";

    var bubble = root.querySelector(".aicw-bubble");
    var closeBtn = root.querySelector(".aicw-close");
    var resetBtn = root.querySelector(".aicw-reset");
    var panelEl = root.querySelector(".aicw-panel");
    var gateForm = root.querySelector(".aicw-gate");
    var gateName = root.querySelector(".aicw-gate-name");
    var gateEmail = root.querySelector(".aicw-gate-email");
    var gatePhone = root.querySelector(".aicw-gate-phone");
    var gateError = root.querySelector(".aicw-gate-error");
    var viewport = root.querySelector(".aicw-viewport");
    var emptyState = root.querySelector(".aicw-empty-state");
    var messagesEl = root.querySelector(".aicw-messages");
    var scrollBottomBtn = root.querySelector(".aicw-scroll-bottom");
    var form = root.querySelector(".aicw-form");
    var input = root.querySelector(".aicw-input");
    var sendBtn = root.querySelector(".aicw-send");

    function updateEmptyState() {
      var hasMessages = history.length > 0;
      emptyState.hidden = hasMessages;
      messagesEl.hidden = !hasMessages;
      resetBtn.disabled = !hasMessages;
    }

    updateEmptyState();

    // A page reload keeps the same conversationId (sessionStorage) and the
    // backend already has every message, but the rendered chat + in-memory
    // `history` used for AI context were never persisted client-side — so
    // without this, reloading mid-chat silently looked like it started over.
    function restoreHistory() {
      if (!historyEndpoint || !contact) return;
      fetch(
        historyEndpoint +
          "?conversationId=" +
          encodeURIComponent(conversationId),
      )
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          var incoming = (data && data.messages) || [];
          incoming.forEach(function (m) {
            if (m.role === "user" || m.role === "assistant") {
              appendMessage(m.role, m.content);
              history.push({ role: m.role, content: m.content });
            } else if (m.role === "agent") {
              appendMessage("agent", m.content);
              history.push({ role: "assistant", content: m.content });
              lastAgentMessageAt = m.createdAt;
            }
          });
        })
        .catch(function () {});
    }

    restoreHistory();

    function pollForAgentReplies() {
      if (!messagesEndpoint || !contact) return;
      fetch(
        messagesEndpoint +
          "?conversationId=" +
          encodeURIComponent(conversationId) +
          "&since=" +
          encodeURIComponent(lastAgentMessageAt),
      )
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          var incoming = (data && data.messages) || [];
          incoming.forEach(function (m) {
            appendMessage("agent", m.content);
            history.push({ role: "assistant", content: m.content });
            lastAgentMessageAt = m.createdAt;
          });
        })
        .catch(function () {});
    }

    function startAgentPolling() {
      if (agentPollTimer) return;
      pollForAgentReplies();
      agentPollTimer = window.setInterval(
        pollForAgentReplies,
        AGENT_POLL_INTERVAL_MS,
      );
    }

    function stopAgentPolling() {
      if (!agentPollTimer) return;
      window.clearInterval(agentPollTimer);
      agentPollTimer = null;
    }

    resetBtn.addEventListener("click", function () {
      history = [];
      messagesEl.innerHTML = "";
      updateEmptyState();
      lastAgentMessageAt = new Date(0).toISOString();
      try {
        window.sessionStorage.removeItem("aicw-conversation-id");
      } catch (err) {}
      conversationId = getConversationId();
    });

    var isFollowing = true;
    var ignoreNextScroll = false;
    var BOTTOM_THRESHOLD = 24;

    function isNearBottom() {
      return (
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        BOTTOM_THRESHOLD
      );
    }

    function setFollowing(value) {
      isFollowing = value;
      scrollBottomBtn.hidden = isFollowing;
      scrollBottomBtn.toggleAttribute("inert", isFollowing);
    }

    function scrollToBottom(smooth) {
      ignoreNextScroll = true;
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setFollowing(true);
    }

    viewport.addEventListener("scroll", function () {
      if (ignoreNextScroll) {
        ignoreNextScroll = false;
        return;
      }
      setFollowing(isNearBottom());
    });

    scrollBottomBtn.addEventListener("click", function () {
      scrollToBottom(true);
    });

    bubble.addEventListener("click", function () {
      root.classList.toggle("aicw-open");
      if (!root.classList.contains("aicw-open")) {
        stopAgentPolling();
        return;
      }
      if (contact) {
        input.focus();
        startAgentPolling();
      } else {
        gateName.focus();
      }
    });

    closeBtn.addEventListener("click", function () {
      root.classList.remove("aicw-open");
      stopAgentPolling();
    });

    gateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = gateName.value.trim();
      var email = gateEmail.value.trim();
      var phone = gatePhone.value.trim();
      var emailValid = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!name) {
        gateError.textContent = "Please enter your name.";
        gateError.hidden = false;
        gateName.focus();
        return;
      }

      if (!emailValid && !phone) {
        gateError.textContent =
          "Please enter a valid email address or phone number.";
        gateError.hidden = false;
        return;
      }

      gateError.hidden = true;
      contact = {
        name: name,
        email: emailValid ? email : "",
        phone: phone,
      };
      storeContact(contact);
      panelEl.classList.remove("aicw-show-gate");
      input.focus();
      startAgentPolling();
    });

    // Matches a "Video: <url>" / "Image: <url>" line whole (as the knowledge
    // base prompt instructs the model to emit) so the label doesn't leak
    // into the rendered text — the model doesn't always drop the label even
    // though it's only supposed to echo the bare URL.
    var LABELED_MEDIA_LINE_REGEX = /^[ \t]*(?:Video|Image)[ \t]*:[ \t]*(https?:\/\/\S+)[ \t]*$/im;
    var VIDEO_EXT_REGEX = /\.(?:mp4|mov|webm|m3u8)(?:\?|$)/i;
    var IMAGE_EXT_REGEX = /\.(?:jpe?g|png|gif|webp|svg)(?:\?|$)/i;
    var VIDEO_URL_REGEX = /https?:\/\/\S+\.(?:mp4|mov|webm|m3u8)(?:\?\S*)?/i;
    var IMAGE_URL_REGEX = /https?:\/\/\S+\.(?:jpe?g|png|gif|webp|svg)(?:\?\S*)?/i;

    function extractMedia(text) {
      var labeled = text.match(LABELED_MEDIA_LINE_REGEX);
      if (labeled) {
        var url = labeled[1];
        var isVideo = VIDEO_EXT_REGEX.test(url);
        var isImage = !isVideo && IMAGE_EXT_REGEX.test(url);
        if (isVideo || isImage) {
          return {
            url: url,
            isVideo: isVideo,
            matchText: labeled[0],
            index: labeled.index,
          };
        }
      }
      var video = text.match(VIDEO_URL_REGEX);
      if (video) {
        return { url: video[0], isVideo: true, matchText: video[0], index: video.index };
      }
      var image = text.match(IMAGE_URL_REGEX);
      if (image) {
        return { url: image[0], isVideo: false, matchText: image[0], index: image.index };
      }
      return null;
    }

    // Minimal **bold** support, applied within a single line/paragraph.
    function appendInlineFormatted(el, text) {
      var parts = text.split(/(\*\*[^*]+\*\*)/g);
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part) continue;
        if (part.slice(0, 2) === "**" && part.slice(-2) === "**" && part.length > 4) {
          var strong = document.createElement("strong");
          strong.textContent = part.slice(2, -2);
          el.appendChild(strong);
        } else {
          el.appendChild(document.createTextNode(part));
        }
      }
    }

    // Minimal markdown: paragraphs plus "* "/"- " bullet lists, each line
    // supporting **bold**. Deliberately built with createElement/textContent
    // rather than innerHTML so AI-generated or merchant-entered text can
    // never inject markup.
    function appendFormattedBlock(container, text) {
      var lines = text.split("\n");
      var i = 0;
      while (i < lines.length) {
        var line = lines[i];
        if (/^\s*[-*]\s+/.test(line)) {
          var ul = document.createElement("ul");
          ul.className = "aicw-message-list";
          while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
            var li = document.createElement("li");
            appendInlineFormatted(li, lines[i].replace(/^\s*[-*]\s+/, ""));
            ul.appendChild(li);
            i++;
          }
          container.appendChild(ul);
        } else if (line.trim() === "") {
          i++;
        } else {
          var p = document.createElement("p");
          p.className = "aicw-message-paragraph";
          appendInlineFormatted(p, line);
          container.appendChild(p);
          i++;
        }
      }
    }

    function renderMessageContent(el, text) {
      el.innerHTML = "";
      var media = extractMedia(text);
      if (!media) {
        appendFormattedBlock(el, text);
        return;
      }

      var remainder = (
        text.slice(0, media.index) + text.slice(media.index + media.matchText.length)
      ).trim();

      if (remainder) {
        var textEl = document.createElement("div");
        textEl.className = "aicw-message-text";
        appendFormattedBlock(textEl, remainder);
        el.appendChild(textEl);
      }

      if (media.isVideo) {
        var video = document.createElement("video");
        video.className = "aicw-message-video";
        video.src = media.url;
        video.controls = true;
        video.setAttribute("playsinline", "");
        el.appendChild(video);
      } else {
        var image = document.createElement("img");
        image.className = "aicw-message-image";
        image.src = media.url;
        image.alt = "";
        el.appendChild(image);
      }
    }

    function appendMessage(role, text) {
      var el = document.createElement("div");
      el.className = "aicw-message aicw-message-" + role;
      renderMessageContent(el, text);
      messagesEl.appendChild(el);
      updateEmptyState();
      if (isFollowing) scrollToBottom(false);
      return el;
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;

      input.value = "";
      sendBtn.disabled = true;
      scrollToBottom(false);
      appendMessage("user", text);
      history.push({ role: "user", content: text });

      var assistantEl = appendMessage("assistant", "");

      try {
        var response = await fetch(chatEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            conversationId: conversationId,
            contact: contact,
          }),
        });

        if (!response.ok || !response.body) {
          assistantEl.textContent =
            "Sorry, something went wrong. Please try again.";
          return;
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var full = "";

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;
          full += decoder.decode(chunk.value, { stream: true });
          renderMessageContent(assistantEl, full);
          if (isFollowing) scrollToBottom(false);
        }

        history.push({ role: "assistant", content: full });
      } catch (err) {
        assistantEl.textContent =
          "Sorry, something went wrong. Please try again.";
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  fetch(settingsEndpoint)
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(init)
    .catch(function () {});
})();
