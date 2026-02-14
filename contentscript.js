console.log("content script loaded!");

// DOUBLE CLICK → REQUEST SCREEN
document.addEventListener("dblclick", () => {
  try {
    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "extension reloaded. refresh the page:",
          chrome.runtime.lastError.message
        );
        return;
      }

      console.log("response from background:", res);

      // fallback popup (in case message listener fails)
      if (res?.description) {
        showPopup(res.description);
      }
    });
  } catch (e) {
    console.warn("content script context died. refresh the page.");
  }
});

// LISTEN FOR RESULT FROM BACKGROUND
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "DETR_RESULT") return;

  console.log("received DETR_RESULT:", message);

  const description = message.description || "no description returned";

  showPopup(description);

  // draw bounding boxes if we have detections
  if (Array.isArray(message.detections)) {
    drawBoxes(message.detections);
  }
});

// POPUP UI
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

// 
// DRAW DETECTION BOXES
// 
function drawBoxes(detections) {
  // remove old boxes
  document.querySelectorAll(".ai-detection-box").forEach((el) => el.remove());

  const scale = window.devicePixelRatio || 1;

  detections
    .filter((d) => (d?.score ?? 0) >= 0.4 && d?.box)
    .forEach((d) => {
      const { xmin, ymin, xmax, ymax } = d.box;

      const box = document.createElement("div");
      box.className = "ai-detection-box";

      box.style.position = "fixed";
      box.style.left = xmin / scale + "px";
      box.style.top = ymin / scale + "px";
      box.style.width = (xmax - xmin) / scale + "px";
      box.style.height = (ymax - ymin) / scale + "px";
      box.style.border = "3px solid red";
      box.style.zIndex = "999998";
      box.style.pointerEvents = "none";

      document.body.appendChild(box);

      // auto remove after 6 seconds
      setTimeout(() => box.remove(), 6000);
    });
}
