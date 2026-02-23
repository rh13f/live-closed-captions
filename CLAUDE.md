# Live Closed Captions — Extension Notes

## Architecture

Speech recognition runs in a **hidden offscreen document** (`offscreen.html`) at the extension's `chrome-extension://` origin — no visible tab, no focus stealing.

Mic permission is granted once during **onboarding** (`options.html`) via `getUserMedia`, which permanently attributes mic access to the extension. This carries over to all extension pages including offscreen documents.

Message flow:
```
offscreen.js → chrome.runtime.sendMessage (captionResult)
  → background.js (relay)
    → chrome.tabs.sendMessage to all tabs (captionUpdate)
      → content.js overlay UI
```

## Why offscreen document (not pinned tab)

Three approaches were tried in order:

1. **Content script** — works, but `webkitSpeechRecognition` is per-page-origin. Each new website requires a fresh mic permission grant.
2. **Pinned recognition tab** — works, but leaves a visible tab in the tab bar and required awkward focus-stealing to show the Chrome permission prompt.
3. **Offscreen document + onboarding** ✓ — `options.html` runs `getUserMedia` once on install (user gesture required). This grants mic permission to the `chrome-extension://` origin permanently, including offscreen documents. Recognition then runs silently with no visible tab.

Do not attempt to move recognition back to content scripts. Do not attempt to use `getUserMedia` from the popup — popup windows cannot reliably host permission dialogs.

## Onboarding flow

`chrome.runtime.onInstalled` (reason: `"install"`) opens `options.html`. The user clicks "Enable Microphone" which calls `navigator.mediaDevices.getUserMedia({ audio: true })`, releases the stream, and shows a success state. This grants mic permission to the extension permanently.

On subsequent loads of `options.html`, the page checks `navigator.permissions.query({ name: "microphone" })` and skips the button if already granted.

## New tab / navigation handling

`content.js` checks `chrome.storage.session` on load, but this check is not reliable enough on its own. The background uses `chrome.tabs.onUpdated` (status: `"complete"`) to push `showOverlay` to every page that loads while captions are active. This is the primary mechanism for new tabs and navigations.

## Key technical decisions

- **Shadow DOM for overlay** — prevents extension styles conflicting with page styles. The host element (`#cc-overlay-host`) is positioned via `style.setProperty(prop, val, "important")` in JS (not CSS) so page stylesheets can't override it. The shadow DOM `#cc-overlay` is a plain block element filling the host — do NOT make it `position: fixed` (that positions it relative to the fixed shadow host, which has zero height, pushing it off-screen).
- **Background as relay** — content scripts can't message each other directly.
- **`chrome.alarms` keep-alive** — prevents service worker sleeping during long sessions.
- **Auto-restart on `onend`** — handles Chrome's ~7s silence auto-stop in `offscreen.js`.
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
- `offscreen` — create offscreen document for speech recognition
- `host_permissions: <all_urls>` — inject content script everywhere
