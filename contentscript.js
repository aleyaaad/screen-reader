// contentScript.js

// ---------- scanning overlay ----------
const SCAN_OVERLAY_ID = "sr-scan-overlay";
const SCAN_STYLE_ID = "sr-scan-style";

function showScanningOverlay(message = "scanning…") {
  if (document.getElementById(SCAN_OVERLAY_ID)) return;

  // style (only inject once)
  if (!document.getElementById(SCAN_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SCAN_STYLE_ID;
    style.textContent = `
      #${SCAN_OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
        background: rgba(0,0,0,0.08);
        backdrop-filter: blur(0.5px);
      }

      #${SCAN_OVERLAY_ID} .sr-scan-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, transparent, rgba(0, 200, 255, 0.9), transparent);
        box-shadow: 0 0 18px rgba(0, 200, 255, 0.6);
        animation: sr-scan-move 1.2s linear infinite;
        opacity: 0.9;
      }

      #${SCAN_OVERLAY_ID} .sr-scan-text {
        position: fixed;
        bottom: 18px;
        right: 18px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.65);
        color: white;
        font: 500 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        letter-spacing: 0.2px;
      }

      @keyframes sr-scan-move {
        0% { top: -10%; }
        100% { top: 110%; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.id = SCAN_OVERLAY_ID;

  overlay.innerHTML = `
    <div class="sr-scan-line"></div>
    <div class="sr-scan-text">${escapeHtml(message)}</div>
  `;

  document.documentElement.appendChild(overlay);
}

function hideScanningOverlay() {
  const overlay = document.getElementById(SCAN_OVERLAY_ID);
  if (overlay) overlay.remove();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- detection drawing overlay ----------
const DRAW_LAYER_ID = "sr-draw-layer";
const DRAW_STYLE_ID = "sr-draw-style";

function ensureDrawLayer() {
  if (!document.getElementById(DRAW_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = DRAW_STYLE_ID;
    style.textContent = `
      #${DRAW_LAYER_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
      }
      .sr-box {
        position: absolute;
        border: 2px solid rgba(0, 200, 255, 0.95);
        border-radius: 8px;
        box-shadow: 0 0 14px rgba(0, 200, 255, 0.35);
      }
      .sr-label {
        position: absolute;
        top: -22px;
        left: 0;
        padding: 4px 7px;
        border-radius: 8px;
        background: rgba(0,0,0,0.7);
        color: #fff;
        font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        white-space: nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  let layer = document.getElementById(DRAW_LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = DRAW_LAYER_ID;
    document.documentElement.appendChild(layer);
  }
  return layer;
}

function clearBoxes() {
  const layer = document.getElementById(DRAW_LAYER_ID);
  if (layer) layer.innerHTML = "";
}

function drawDetections(detections) {
  const layer = ensureDrawLayer();
  layer.innerHTML = "";

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for (const det of detections || []) {
    const score = det?.score ?? 0;
    if (score < 0.3) continue;

    const box = det?.box;
    if (!box) continue;

    // DETR box coords are in pixels of the input image (screenshot).
    // captureVisibleTab uses the visible viewport size, so these map well to window.innerWidth/innerHeight.
    const xmin = clamp(box.xmin, 0, vw);
    const ymin = clamp(box.ymin, 0, vh);
    const xmax = clamp(box.xmax, 0, vw);
    const ymax = clamp(box.ymax, 0, vh);

    const w = Math.max(0, xmax - xmin);
    const h = Math.max(0, ymax - ymin);

    const el = document.createElement("div");
    el.className = "sr-box";
    el.style.left = `${xmin}px`;
    el.style.top = `${ymin}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    const label = document.createElement("div");
    label.className = "sr-label";
    label.textContent = `${det.label} ${(score * 100).toFixed(0)}%`;

    el.appendChild(label);
    layer.appendChild(el);
  }

  // auto clear after a bit so it doesn’t stay forever
  setTimeout(() => clearBoxes(), 2500);
}

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ---------- trigger: double click to scan ----------
document.addEventListener(
  "dblclick",
  () => {
    // start scan request
    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" });
  },
  true
);

// ---------- receive messages ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SHOW_SCANNING") showScanningOverlay(msg.message);
  if (msg?.type === "HIDE_SCANNING") hideScanningOverlay();

  if (msg?.type === "DETECTIONS_RESULT") {
    hideScanningOverlay();
    drawDetections(msg.detections || []);
  }

  if (msg?.type === "ERROR") {
    hideScanningOverlay();
    // optional: show error toast instead of alert
    console.error("scan error:", msg.error);
  }
});
