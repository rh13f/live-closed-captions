// Offscreen document — runs at the extension's chrome-extension:// origin.
// Mic permission was granted during onboarding (options.html), so recognition
// starts immediately without any permission check or focus stealing.

let recognition = null;
let shouldRestart = false;

// Auto-start on load
startRecognition();

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;
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
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
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
        msg: "Microphone access denied. Open the extension's options page to grant access.",
      });
    } else if (event.error !== "no-speech") {
      console.warn("[CC offscreen] Recognition error:", event.error);
    }
  };

  recognition.onend = () => {
    recognition = null;
    if (shouldRestart) {
      setTimeout(startRecognition, 300);
    }
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
