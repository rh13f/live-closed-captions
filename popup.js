const toggleBtn = document.getElementById("toggle-btn");
const statusDot = document.getElementById("status-dot");
const statusLabel = document.getElementById("status-label");
const hintText = document.getElementById("hint-text");

let captionsActive = false;

// ─── Caption on/off ───────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: "getState" }, (state) => {
  if (chrome.runtime.lastError) return;
  setActive(state?.captionsActive ?? false);
});

toggleBtn.addEventListener("click", () => {
  toggleBtn.disabled = true;
  const msgType = captionsActive ? "stop" : "start";
  chrome.runtime.sendMessage({ type: msgType }, (response) => {
    toggleBtn.disabled = false;
    if (response?.success) setActive(!captionsActive);
    else showError(response?.error ?? "unknown");
  });
});

function showError(msg) {
  hintText.textContent = "Error: " + msg;
  hintText.style.color = "#c00";
}

function setActive(active) {
  captionsActive = active;
  if (active) {
    statusDot.classList.add("active");
    statusLabel.textContent = "Active";
    toggleBtn.textContent = "Stop Captions";
    toggleBtn.classList.add("btn-stop");
    hintText.textContent = "Captions are live on all open tabs. Speak to see them.";
    hintText.style.color = "";
  } else {
    statusDot.classList.remove("active");
    statusLabel.textContent = "Inactive";
    toggleBtn.textContent = "Start Captions";
    toggleBtn.classList.remove("btn-stop");
    hintText.textContent = "Click \"Start Captions\", then speak — captions will appear on every open tab.";
    hintText.style.color = "";
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────

const DEFAULTS = { position: "bottom", fontSize: "medium" };

// Restore saved settings and mark the active button in each group
chrome.storage.sync.get(DEFAULTS, (saved) => {
  for (const [setting, value] of Object.entries(saved)) {
    markActive(setting, value);
  }
});

document.querySelectorAll(".btn-group").forEach((group) => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;

    const setting = group.dataset.setting;
    const value = btn.dataset.value;

    markActive(setting, value);

    // Persist and broadcast to all tabs immediately
    chrome.storage.sync.set({ [setting]: value });
    chrome.runtime.sendMessage({ type: "applySettings", settings: { [setting]: value } });
  });
});

function markActive(setting, value) {
  const group = document.querySelector(`.btn-group[data-setting="${setting}"]`);
  if (!group) return;
  group.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.value === value);
  });
}

// ─── Mic permission warning ────────────────────────────────────────────────

const micWarning = document.getElementById("mic-warning");

navigator.permissions.query({ name: "microphone" }).then((status) => {
  micWarning.style.display = status.state !== "granted" ? "" : "none";
  status.onchange = () => {
    micWarning.style.display = status.state !== "granted" ? "" : "none";
  };
}).catch(() => {});

document.getElementById("setup-link").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
