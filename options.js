const btn = document.getElementById("enable-btn");
const message = document.getElementById("message");

function showSuccess() {
  btn.style.display = "none";
  message.textContent = "Microphone access granted. You can close this tab and start using Live Captions.";
  message.style.color = "#4caf50";
}

function showError(msg) {
  message.textContent = msg;
  message.style.color = "#e53935";
}

btn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    showSuccess();
  } catch {
    showError(
      "Microphone access denied. Click the lock icon in the address bar, " +
      "allow microphone, then reload this page."
    );
  }
});

// If permission was already granted (e.g. reload after setup), skip the button
navigator.permissions.query({ name: "microphone" }).then((status) => {
  if (status.state === "granted") {
    showSuccess();
  }
  status.onchange = () => {
    if (status.state === "granted") showSuccess();
  };
}).catch(() => {});
