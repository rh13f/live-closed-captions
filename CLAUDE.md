# Live Closed Captions — Extension Notes

## Architecture

Speech recognition runs in a **dedicated pinned tab** (`recognition.html`) at the extension's `chrome-extension://` origin — not in a content script, not in an offscreen document.

Message flow:
```
recognition.js → chrome.runtime.sendMessage (captionResult)
  → background.js (relay)
    → chrome.tabs.sendMessage to all tabs (captionUpdate)
      → content.js overlay UI
```

## Why a pinned recognition tab (not offscreen document)

Three approaches were tried in order:

1. **Content script** — works, but `webkitSpeechRecognition` is per-page-origin. Each new website requires a fresh mic permission grant.
2. **Offscreen document** — `webkitSpeechRecognition` returns `"not-allowed"` in offscreen documents regardless of permissions — even after `getUserMedia` grants mic access to the extension origin via `options.html`. Chrome blocks `webkitSpeechRecognition` in non-visible contexts unconditionally.
3. **Pinned recognition tab** ✓ — a real, visible Chrome tab at `chrome-extension://` origin. Mic permission is granted once to the extension. Recognition persists across all page navigation in other tabs. `chrome.tabs.onRemoved` cleans up if the user closes the tab manually.

Do not attempt to move recognition back to offscreen documents or content scripts.

## Onboarding flow

`chrome.runtime.onInstalled` (reason: `"install"`) opens `options.html`. The user clicks "Enable Microphone" which calls `navigator.mediaDevices.getUserMedia({ audio: true })`, releases the stream, and shows a success state. This pre-grants mic permission to the extension so the recognition tab doesn't need to steal focus for the permission prompt.

On subsequent loads of `options.html`, the page checks `navigator.permissions.query({ name: "microphone" })` and skips the button if already granted.

## New tab / navigation handling

`content.js` checks `chrome.storage.session` on load, but this check is not reliable enough on its own. The background uses `chrome.tabs.onUpdated` (status: `"complete"`) to push `showOverlay` to every page that loads while captions are active. This is the primary mechanism for new tabs and navigations.

## Key technical decisions

- **Shadow DOM for overlay** — prevents extension styles conflicting with page styles. The host element (`#cc-overlay-host`) is positioned via `style.setProperty(prop, val, "important")` in JS (not CSS) so page stylesheets can't override it. The shadow DOM `#cc-overlay` is a plain block element filling the host — do NOT make it `position: fixed` (that positions it relative to the fixed shadow host, which has zero height, pushing it off-screen).
- **Background as relay** — content scripts can't message each other directly.
- **`chrome.alarms` keep-alive** — prevents service worker sleeping during long sessions.
- **Auto-restart on `onend`** — handles Chrome's ~7s silence auto-stop in `recognition.js`.
- **Programmatic injection on start** — `startCaptions()` in `background.js` calls `chrome.scripting.executeScript` on all open tabs so pre-existing tabs (opened before the extension loaded) get the content script.
- **Double-injection guard** — `if (window.__ccInjected) return;` at top of `content.js` IIFE.

## Mic permission

`getUserMedia` in `options.html` (a `chrome-extension://` page) grants mic permission to the extension's origin permanently. Do NOT add a `getUserMedia` step from the popup — extension popup windows cannot reliably host permission dialogs.

The popup shows a "Microphone not set up" warning (with link to `options.html`) if `navigator.permissions.query({ name: "microphone" })` returns a non-`"granted"` state.

## Settings

Stored in `chrome.storage.sync`: `{ position: "top"|"bottom", fontSize: "small"|"medium"|"large" }`.
Font sizes: small = 18px, medium = 24px, large = 36px.
Position applied by toggling `top`/`bottom` on the host element via `setProperty(..., "important")`.

## Font

OpenDyslexic Regular OTF bundled at `fonts/OpenDyslexic-Regular.otf`.
Loaded via `@font-face` in the shadow DOM stylesheet using `chrome.runtime.getURL("fonts/OpenDyslexic-Regular.otf")`.
Declared in `web_accessible_resources` in `manifest.json`.

## Data & Privacy

The extension makes **zero network requests** and stores **no caption text**. Transcribed text is held in the in-memory variable `finalText` in each tab's content script and discarded after 5 seconds of silence or on stop. `webkitSpeechRecognition` streams audio to Google's servers (same as Chrome voice search / Google Slides captions). Google's privacy policy applies.

| What | Where | Who has access | Stored? |
|---|---|---|---|
| Raw audio | Google speech servers (via Chrome API) | Google | Per Google's policy |
| Transcribed text | In-memory in Chrome only | Nobody outside Chrome | No |
| Extension settings (font size, position) | `chrome.storage.sync` | Nobody outside Chrome | Yes, not sensitive |

## Permissions used

- `tabs` — query, message, create tabs
- `scripting` — programmatic content script injection
- `storage` — session state and synced settings
- `alarms` — keep-alive ping
- `host_permissions: <all_urls>` — inject content script everywhere
