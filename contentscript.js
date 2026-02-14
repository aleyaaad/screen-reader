console.log("screen_reader contentscript loaded");

// ---------- SCANNING OVERLAY ----------
const SCAN_ID = "sr-scan-overlay";
const STYLE_ID = "sr-scan-style";

function showScanningOverlay(message = "scanning…") {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SCAN_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        background: rgba(0,0,0,0.10);
      }
      #${SCAN_ID} .line {
        position: absolute;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, transparent, cyan, transparent);
        animation: move 1.2s linear infinite;
      }
      #${SCAN_ID} .text {
        position: fixed;
        bottom: 18px;
        right: 18px;
        background: black;
        color: white;
        padding: 10px 14px;
        border-radius: 12px;
        font: 600 14px system-ui;
      }
      @keyframes move {
        0% { top: -10%; }
        100% { top: 110%; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  let el = document.getElementById(SCAN_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = SCAN_ID;
    el.innerHTML = `
      <div class="line"></div>
      <div class="text">${message}</div>
    `;
    document.documentElement.appendChild(el);
  } else {
    el.querySelector(".text").textContent = message;
  }
}

function hideScanningOverlay() {
  document.getElementById(SCAN_ID)?.remove();
}

// ---------- DOUBLE CLICK TRIGGER ----------
document.addEventListener(
  "dblclick",
  () => {
    console.log("dblclick detected");
    showScanningOverlay("scanning screen…");

    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" });
  },
  true
);

// ---------- RECEIVE MESSAGES ----------
chrome.runtime.onMessage.addListener((msg) => {
  console.log("content got message:", msg);

  if (msg?.type === "SHOW_SCANNING") showScanningOverlay(msg.message);
  if (msg?.type === "HIDE_SCANNING") hideScanningOverlay();

  if (msg?.type === "ERROR") {
    hideScanningOverlay();
    console.error("scan error:", msg.error);
  }

  if (msg?.type === "DETECTIONS_RESULT") {
    hideScanningOverlay();
    console.log("detections:", msg.detections);
  }
});
