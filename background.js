// Keep the service worker alive during long sessions
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {});

// Open the setup page on first install so the user can grant mic permission
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  }
});

// --- Message routing ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "start":
      handleStart(sendResponse);
      return true;

    case "stop":
      handleStop(sendResponse);
      return true;

    case "captionResult":
      handleCaptionResult(message);
      break;

    case "micError":
      chrome.storage.session.set({ captionsActive: false });
      chrome.offscreen.closeDocument().catch(() => {});
      broadcastToAllTabs({ type: "hideOverlay" });
      broadcastToAllTabs({ type: "showError", msg: message.msg });
      break;

    case "applySettings":
      broadcastToAllTabs({ type: "applySettings", settings: message.settings });
      break;

    case "getState":
      chrome.storage.session.get(["captionsActive"], (state) => {
        sendResponse(state);
      });
      return true;
  }
});

// --- Handlers ---

async function handleStart(sendResponse) {
  try {
    await startCaptions();
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleStop(sendResponse) {
  await stopCaptions();
  if (sendResponse) sendResponse({ success: true });
}

async function startCaptions() {
  await chrome.storage.session.set({ captionsActive: true });

  // Inject overlay into every currently open tab
  const allTabs = await chrome.tabs.query({});
  await Promise.all(allTabs.map((t) => t.id ? injectContentScript(t.id) : Promise.resolve()));

  // Create the offscreen document — it auto-starts recognition on load.
  // No visible tab, no focus stealing, no clutter.
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
    reasons: ["USER_MEDIA"],
    justification: "Speech recognition for live closed captions",
  });

  broadcastToAllTabs({ type: "showOverlay" });
}

async function stopCaptions() {
  await chrome.storage.session.set({ captionsActive: false });
  // Graceful stop before closing the document
  chrome.runtime.sendMessage({ target: "offscreen", type: "stopRecognition" }).catch(() => {});
  try { await chrome.offscreen.closeDocument(); } catch {}
  broadcastToAllTabs({ type: "hideOverlay" });
}

// Whenever a page finishes loading while captions are active, push the overlay
// to it. This covers new tabs, navigations, and page refreshes without needing
// the content script to read session storage on its own.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const { captionsActive } = await chrome.storage.session.get(["captionsActive"]);
  if (!captionsActive) return;
  await injectContentScript(tabId);
  chrome.tabs.sendMessage(tabId, { type: "showOverlay" }).catch(() => {});
});

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  } catch {}
}

async function handleCaptionResult(message) {
  const { captionsActive } = await chrome.storage.session.get("captionsActive");
  if (!captionsActive) return;
  broadcastToAllTabs({ type: "captionUpdate", text: message.text, isFinal: message.isFinal });
}

async function broadcastToAllTabs(message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}
