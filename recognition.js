// This page runs at chrome-extension:// origin so mic permission is granted
// to the extension (once, permanently) rather than to individual websites.
// It auto-starts recognition on load and closes itself when captions stop.

let recognition = null;
let shouldRestart = false;

(async () => {
  // If mic permission hasn't been granted yet, bring this tab into focus so
  // Chrome can show the permission prompt — prompts don't appear on background tabs.
  const permStatus = await navigator.permissions.query({ name: "microphone" });
  if (permStatus.state !== "granted") {
    const tab = await new Promise((r) => chrome.tabs.getCurrent(r));
    chrome.tabs.update(tab.id, { active: true });
  }

  startRecognition();
})();

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "recognition") return;
  if (message.type === "stopRecognition") stopRecognition();
});

function startRecognition() {
  if (recognition) return;

  const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
  if (!SR) {
    chrome.runtime.sendMessage({ type: "micError", msg: "Speech recognition is not supported in this browser." });
    return;
  }

  shouldRestart = true;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalTranscript += result[0].transcript;
      else interimTranscript += result[0].transcript;
    }
    if (finalTranscript) {
      chrome.runtime.sendMessage({ type: "captionResult", text: finalTranscript, isFinal: true });
    }
    if (interimTranscript) {
      chrome.runtime.sendMessage({ type: "captionResult", text: interimTranscript, isFinal: false });
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") {
      shouldRestart = false;
      chrome.runtime.sendMessage({
        type: "micError",
        msg: "Microphone access denied. Click the microphone icon in the address bar to allow access.",
      });
    } else if (event.error !== "no-speech") {
      console.warn("[CC recognition]", event.error);
    }
  };

  recognition.onend = () => {
    recognition = null;
    if (shouldRestart) setTimeout(startRecognition, 300);
  };

  recognition.start();
}

function stopRecognition() {
  shouldRestart = false;
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
}
