// Keep the service worker alive during long sessions
chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {});

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
      chrome.storage.session.set({ captionsActive: false, recognitionTabId: null });
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

  // Open the recognition tab — a real, visible chrome-extension:// page that can
  // prompt for mic access and run webkitSpeechRecognition reliably.
  // pinned: true keeps it as a small favicon tab that doesn't clutter the tab bar.
  // active: false avoids stealing focus from the user's current page;
  // recognition.js will bring itself forward if it needs to show a mic prompt.
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL("recognition.html"),
    pinned: true,
    active: false,
  });
  await chrome.storage.session.set({ recognitionTabId: tab.id });

  broadcastToAllTabs({ type: "showOverlay" });
}

async function stopCaptions() {
  const { recognitionTabId } = await chrome.storage.session.get("recognitionTabId");
  await chrome.storage.session.set({ captionsActive: false, recognitionTabId: null });

  if (recognitionTabId) {
    try { await chrome.tabs.remove(recognitionTabId); } catch {}
  }

  broadcastToAllTabs({ type: "hideOverlay" });
}

// If the user manually closes the recognition tab, stop captions cleanly
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { captionsActive, recognitionTabId } = await chrome.storage.session.get([
    "captionsActive",
    "recognitionTabId",
  ]);
  if (captionsActive && tabId === recognitionTabId) {
    await chrome.storage.session.set({ captionsActive: false, recognitionTabId: null });
    broadcastToAllTabs({ type: "hideOverlay" });
  }
});

// Whenever a page finishes loading while captions are active, push the overlay
// to it. This covers new tabs, navigations, and page refreshes without needing
// the content script to read session storage on its own.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const { captionsActive, recognitionTabId } = await chrome.storage.session.get([
    "captionsActive",
    "recognitionTabId",
  ]);
  if (!captionsActive) return;
  if (tabId === recognitionTabId) return; // skip the recognition tab itself
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
