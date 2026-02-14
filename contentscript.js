console.log("content script loaded!");

let isScanning = false;

// ===============================
// DOUBLE CLICK → REQUEST SCREEN
// ===============================
document.addEventListener("dblclick", () => {
  try {
    if (isScanning) return;

    isScanning = true;
    showPopup("scanning screen...");

    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "extension reloaded. refresh the page:",
          chrome.runtime.lastError.message
        );
        isScanning = false;
        showPopup("something reloaded. refresh the page and try again.");
        return;
      }

      console.log("response from background:", res);

      // fallback (real result comes via DETR_RESULT)
      if (res?.description) {
        showPopup(res.description);
      }
    });
  } catch (e) {
    console.warn("content script context died. refresh the page.");
    isScanning = false;
  }
});

// ===================================
// LISTEN FOR RESULT FROM BACKGROUND
// ===================================
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "DETR_RESULT") return;

  console.log("received DETR_RESULT:", message);

  isScanning = false;

  const description = message.description || "no description returned";
  showPopup(description);

  if (Array.isArray(message.detections)) {
    drawBoxes(message.detections, message.screenshotDataUrl);
  }
});

// ===============================
// POPUP UI
// ===============================
function showPopup(text) {
  const old = document.getElementById("ai-detection-popup");
  if (old) old.remove();

  const box = document.createElement("div");
  box.id = "ai-detection-popup";
  box.textContent = text;

  box.style.position = "fixed";
  box.style.bottom = "20px";
  box.style.right = "20px";
  box.style.zIndex = "999999";
  box.style.padding = "12px 14px";
  box.style.borderRadius = "10px";
  box.style.background = "rgba(0,0,0,0.9)";
  box.style.color = "white";
  box.style.maxWidth = "420px";
  box.style.fontSize = "14px";
  box.style.lineHeight = "1.4";
  box.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";

  document.body.appendChild(box);

  setTimeout(() => box.remove(), 6000);
}

// ===============================
// SCALE HELPERS (more accurate than devicePixelRatio)
// ===============================
function getScreenshotScale(screenshotDataUrl) {
  return new Promise((resolve) => {
    if (!screenshotDataUrl) {
      const fallback = window.devicePixelRatio || 1;
      resolve({ scaleX: fallback, scaleY: fallback });
      return;
    }

    const img = new Image();
    img.onload = () => {
      const scaleX = img.width / window.innerWidth;
      const scaleY = img.height / window.innerHeight;
      resolve({ scaleX, scaleY });
    };
    img.onerror = () => {
      const fallback = window.devicePixelRatio || 1;
      resolve({ scaleX: fallback, scaleY: fallback });
    };
    img.src = screenshotDataUrl;
  });
}

// ===============================
// DRAW DETECTION BOXES
// ===============================
async function drawBoxes(detections, screenshotDataUrl) {
  // remove old boxes
  document.querySelectorAll(".ai-detection-box").forEach((el) => el.remove());

  const { scaleX, scaleY } = await getScreenshotScale(screenshotDataUrl);

  detections
    .filter((d) => (d?.score ?? 0) >= 0.25 && d?.box) // lowered from 0.4
    .forEach((d) => {
      const { xmin, ymin, xmax, ymax } = d.box;

      const box = document.createElement("div");
      box.className = "ai-detection-box";

      box.style.position = "fixed";
      box.style.left = xmin / scaleX + "px";
      box.style.top = ymin / scaleY + "px";
      box.style.width = (xmax - xmin) / scaleX + "px";
      box.style.height = (ymax - ymin) / scaleY + "px";
      box.style.border = "3px solid red";
      box.style.zIndex = "999998";
      box.style.pointerEvents = "none";
      box.style.boxSizing = "border-box";

      // little label so you can see what it thought it was (optional but helpful)
      const tag = document.createElement("div");
      const label = (d?.label || "object").toLowerCase();
      const score = ((d?.score ?? 0) * 100).toFixed(1);
      tag.textContent = `${label} ${score}%`;
      tag.style.position = "absolute";
      tag.style.left = "0px";
      tag.style.top = "-22px";
      tag.style.padding = "2px 6px";
      tag.style.fontSize = "12px";
      tag.style.background = "rgba(255,0,0,0.9)";
      tag.style.color = "white";
      tag.style.borderRadius = "6px";
      tag.style.whiteSpace = "nowrap";

      box.appendChild(tag);
      document.body.appendChild(box);

      setTimeout(() => box.remove(), 6000);
    });
}
