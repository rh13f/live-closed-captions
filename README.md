# Live Closed Captions

A Chrome extension that shows real-time speech-to-text captions in a persistent overlay bar — on any tab, any page, any app. Inspired by Google Slides' live captions feature, but works everywhere.

## Features

- Caption bar appears on every open tab simultaneously
- Follows you as you switch tabs, open new tabs, or navigate to new pages
- Top or bottom position, adjustable in the popup
- Three font sizes — S / M / L — to suit different room sizes
- OpenDyslexic font, centered text, solid black background
- Microphone permission granted **once** to the extension — never re-prompted per site
- Auto-restarts after Chrome's silence timeout — no manual intervention needed
- Minimize button to collapse the bar without stopping recognition

## Installation

1. Unzip the extension folder
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select the `closed-captions` folder

## Usage

1. Click the extension icon and press **Start Captions**
2. A small pinned tab labelled "Live Captions — Recognition" will appear — allow microphone access when Chrome prompts (first time only)
3. Speak — captions appear on every open tab
4. Adjust position (top/bottom) and font size (S/M/L) in the popup at any time
5. Switch tabs, open new pages — the caption bar follows automatically
6. Press **Stop Captions** to dismiss the overlay on all tabs and close the recognition tab

> **Note:** The caption bar cannot appear on `chrome://` system pages (new tab page, settings, etc.). It will appear as soon as you navigate to a regular website.

## How the microphone permission works

Speech recognition runs in a dedicated pinned tab (`recognition.html`) at the extension's own `chrome-extension://` origin. Because this is an extension page — not a website — Chrome attributes the microphone permission to the extension rather than to any individual site. The first time you start captions, Chrome prompts once. Every subsequent time, recognition starts silently in the background with no prompt.

## Data & Privacy

### What the extension does

The extension itself makes **zero network requests** and stores **no caption text**. The only data it persists are UI preferences (position and font size). All transcribed text is held in memory and discarded after 5 seconds of silence or when captions are stopped.

### What Chrome's Web Speech API does

`webkitSpeechRecognition` — the browser API powering the transcription — is **not on-device**. Raw audio is streamed to Google's speech recognition servers and transcribed text is returned. This is the same pipeline used by Chrome voice search and Google Slides' own captions feature. Google's standard privacy policy applies.

| What | Where | Who has access | Stored? |
|---|---|---|---|
| Raw audio | Google speech servers (via Chrome API) | Google | Per Google's policy |
| Transcribed text | In-memory in Chrome only | Nobody outside Chrome | No |
| Extension settings (font size, position) | `chrome.storage.sync` | Nobody outside Chrome | Yes, not sensitive |

**Do not use this for confidential conversations.** Anything spoken while captions are active is sent to Google's servers, just as it would be with Google Slides' built-in captions.

If on-device/private speech recognition is required, the `webkitSpeechRecognition` calls would need to be replaced with a local model (e.g. Whisper via WASM).

## File Structure

```
closed-captions/
├── manifest.json         # MV3 extension manifest
├── background.js         # Service worker: state, message relay, tab lifecycle
├── content.js            # Injected into all pages: overlay UI only
├── content.css           # Placeholder (host positioning handled in JS)
├── recognition.html      # Pinned recognition tab (chrome-extension:// origin)
├── recognition.js        # Runs webkitSpeechRecognition, sends results to background
├── popup.html            # Extension popup: start/stop + settings
├── popup.js
├── popup.css
├── fonts/
│   └── OpenDyslexic-Regular.otf
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
