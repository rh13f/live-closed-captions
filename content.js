(() => {
  // Guard against double-injection
  if (window.__ccInjected) return;
  window.__ccInjected = true;

  // ─── Default settings (overridden immediately from storage) ─────────────
  const settings = { position: "bottom", fontSize: "medium" };
  const FONT_SIZES = { small: "18px", medium: "24px", large: "36px" };

  // ─── Overlay UI (Shadow DOM) ─────────────────────────────────────────────

  const host = document.createElement("div");
  host.id = "cc-overlay-host";

  // Set positioning via setProperty so 'important' beats any page stylesheet.
  // The host IS the fixed bar; the shadow DOM overlay fills it as a normal block.
  const hostBase = {
    position: "fixed",
    left: "0",
    right: "0",
    "z-index": "2147483647",
    margin: "0",
    padding: "0",
    border: "none",
    background: "none",
  };
  for (const [prop, val] of Object.entries(hostBase)) {
    host.style.setProperty(prop, val, "important");
  }

  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  // Font URL must be resolved at runtime so it points to the extension package.
  const fontUrl = chrome.runtime.getURL("fonts/OpenDyslexic-Regular.otf");

  const style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: 'OpenDyslexic';
      src: url('${fontUrl}') format('opentype');
      font-weight: normal;
      font-style: normal;
    }

    :host { all: initial; }

    #cc-overlay {
      display: none;
      width: 100%;
      box-sizing: border-box;
      background: #000;
      color: #ffffff;
      font-family: 'OpenDyslexic', sans-serif;
      font-size: 24px;
      line-height: 1.5;
      padding: 16px 24px;
      max-height: 35vh;
      overflow: hidden;
      text-align: center;
    }

    #cc-overlay.visible {
      display: block;
    }

    #cc-lines {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0 44px 0 0;
    }

    .cc-line-final {
      opacity: 1;
    }

    .cc-line-interim {
      opacity: 1;
      font-style: italic;
    }

    #cc-close {
      position: absolute;
      top: 8px;
      right: 8px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.4);
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      border-radius: 4px;
      padding: 2px 6px;
      line-height: 1.4;
      font-family: sans-serif;
    }

    #cc-close:hover {
      background: rgba(255,255,255,0.15);
    }
  `;
  shadow.appendChild(style);

  const overlay = document.createElement("div");
  overlay.id = "cc-overlay";
  shadow.appendChild(overlay);

  const lines = document.createElement("div");
  lines.id = "cc-lines";
  overlay.appendChild(lines);

  const closeBtn = document.createElement("button");
  closeBtn.id = "cc-close";
  closeBtn.textContent = "✕";
  closeBtn.title = "Minimize captions";
  overlay.appendChild(closeBtn);

  let minimized = false;
  closeBtn.addEventListener("click", () => {
    minimized = !minimized;
    if (minimized) {
      lines.style.display = "none";
      closeBtn.textContent = "▲";
      closeBtn.title = "Restore captions";
      overlay.style.padding = "6px 24px";
    } else {
      lines.style.display = "";
      closeBtn.textContent = "✕";
      closeBtn.title = "Minimize captions";
      overlay.style.padding = "";
    }
  });

  // ─── Apply settings to the overlay ──────────────────────────────────────

  function applySettings(delta) {
    Object.assign(settings, delta);

    // Position: anchor host to top or bottom
    if (settings.position === "top") {
      host.style.setProperty("top", "0", "important");
      host.style.setProperty("bottom", "auto", "important");
    } else {
      host.style.setProperty("bottom", "0", "important");
      host.style.setProperty("top", "auto", "important");
    }

    // Font size
    overlay.style.fontSize = FONT_SIZES[settings.fontSize] || FONT_SIZES.medium;
  }

  // Load persisted settings on init
  chrome.storage.sync.get({ position: "bottom", fontSize: "medium" }, applySettings);

  // ─── Caption text state ──────────────────────────────────────────────────

  let finalText = "";
  let clearFinalTimer = null;

  function updateOverlay(text, isFinal) {
    if (minimized) return;

    if (isFinal) {
      finalText = (finalText + " " + text).trim();
      if (finalText.length > 200) {
        finalText = finalText.slice(-200).replace(/^\S+\s/, "");
      }
      if (clearFinalTimer) clearTimeout(clearFinalTimer);
      clearFinalTimer = setTimeout(() => { finalText = ""; renderLines("", false); }, 5000);
      renderLines("", false);
    } else {
      renderLines(text, true);
    }
  }

  function renderLines(interimText, isInterim) {
    lines.innerHTML = "";

    if (finalText) {
      const el = document.createElement("div");
      el.className = "cc-line-final";
      el.textContent = finalText;
      lines.appendChild(el);
    }

    if (isInterim && interimText) {
      const el = document.createElement("div");
      el.className = "cc-line-interim";
      el.textContent = interimText;
      lines.appendChild(el);
    }
  }

  // ─── Message listener ────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case "showOverlay":
        overlay.classList.add("visible");
        finalText = "";
        break;

      case "hideOverlay":
        overlay.classList.remove("visible");
        finalText = "";
        lines.innerHTML = "";
        break;

      case "captionUpdate":
        updateOverlay(message.text, message.isFinal);
        break;

      case "applySettings":
        applySettings(message.settings);
        break;

      case "showError":
        showError(message.msg);
        break;
    }
  });

  // ─── Show overlay if captions were already active when this tab loaded ───

  chrome.storage.session.get(["captionsActive"], ({ captionsActive }) => {
    if (captionsActive) {
      overlay.classList.add("visible");
    }
  });

  // ─── Error display ───────────────────────────────────────────────────────

  function showError(msg) {
    lines.innerHTML = "";
    const el = document.createElement("div");
    el.className = "cc-line-final";
    el.style.color = "#ff8a80";
    el.textContent = msg;
    lines.appendChild(el);
    overlay.classList.add("visible");
  }
})();
