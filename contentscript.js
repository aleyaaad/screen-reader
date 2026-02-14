// contentscript.js

console.log("content script loaded!");

// ============================
// 1) scanner overlay (visible + not too fast)
// ============================
const SR_SCAN_ID = "sr-scan-overlay";
const SR_SCAN_STYLE_ID = "sr-scan-style";
let srScanStartedAt = 0;
const SR_MIN_SCAN_MS = 600; // keep overlay visible long enough to notice

function srShowScan(message = "scanning…") {
  srScanStartedAt = Date.now();

  if (!document.getElementById(SR_SCAN_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SR_SCAN_STYLE_ID;
    style.textContent = `
      #${SR_SCAN_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647; /* top */
        pointer-events: none;
        background: rgba(0,0,0,0.10);
      }
      #${SR_SCAN_ID} .sr-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, transparent, rgba(0, 200, 255, 0.95), transparent);
        box-shadow: 0 0 18px rgba(0, 200, 255, 0.6);
        animation: sr-scan-move 1.1s linear infinite;
      }
      #${SR_SCAN_ID} .sr-text {
        position: fixed;
        bottom: 18px;
        right: 18px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      @keyframes sr-scan-move {
        0% { top: -10%; }
        100% { top: 110%; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  let overlay = document.getElementById(SR_SCAN_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = SR_SCAN_ID;
    overlay.innerHTML = `
      <div class="sr-line"></div>
      <div class="sr-text"></div>
    `;
    document.documentElement.appendChild(overlay);
  }

  overlay.querySelector(".sr-text").textContent = message;
}

function srHideScan() {
  const elapsed = Date.now() - srScanStartedAt;
  const wait = Math.max(0, SR_MIN_SCAN_MS - elapsed);

  setTimeout(() => {
    document.getElementById(SR_SCAN_ID)?.remove();
  }, wait);
}

// ============================
// 2) detection drawing layer (red boxes)
// ============================
const SR_DRAW_ID = "sr-draw-layer";
const SR_DRAW_STYLE_ID = "sr-draw-style";

function ensureDrawLayer() {
  if (!document.getElementById(SR_DRAW_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = SR_DRAW_STYLE_ID;
    style.textContent = `
      #${SR_DRAW_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646; /* below scanner overlay */
        pointer-events: none;
      }
      .sr-box {
        position: absolute;
        border: 3px solid rgba(255, 0, 0, 0.95);
        border-radius: 6px;
        box-sizing: border-box;
      }
      .sr-label {
        position: absolute;
        left: 0;
        top: -24px;
        padding: 4px 8px;
        border-radius: 10px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        font: 700 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        white-space: nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  let layer = document.getElementById(SR_DRAW_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = SR_DRAW_ID;
    document.documentElement.appendChild(layer);
  }
  return layer;
}

function clearDetections() {
  const layer = document.getElementById(SR_DRAW_ID);
  if (layer) layer.innerHTML = "";
}

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function drawDetections(detections = []) {
  const layer = ensureDrawLayer();
  layer.innerHTML = "";

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for (const det of detections) {
    const score = det?.score ?? 0;
    if (score < 0.3) continue;

    const box = det?.box;
    if (!box) continue;

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

  // optional: auto-clear after a few seconds
  setTimeout(() => clearDetections(), 3500);
}

// ============================
// 3) bottom description pill
// ============================
const SR_PILL_ID = "sr-desc-pill";

function showDescriptionPill(text) {
  document.getElementById(SR_PILL_ID)?.remove();

  const pill = document.createElement("div");
  pill.id = SR_PILL_ID;
  pill.textContent = text;

  pill.style.cssText = `
    position: fixed;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483646;
    max-width: min(720px, calc(100vw - 40px));
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(0,0,0,0.80);
    color: #fff;
    font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  `;

  document.documentElement.appendChild(pill);
  setTimeout(() => pill.remove(), 3000);
}

function buildDescriptionFromDetections(detections = []) {
  const counts = new Map();

  for (const det of detections) {
    const score = det?.score ?? 0;
    if (score < 0.3) continue;

    const label = String(det?.label || "").trim();
    if (!label) continue;

    counts.set(label, (counts.get(label) || 0) + 1);
  }

  if (counts.size === 0) return "on screen i detect nothing confident.";

  // sort by count desc
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // format: "6 dogs, 2 chairs"
  const parts = items.slice(0, 5).map(([label, n]) => {
    const plural = n === 1 ? label : `${label}s`;
    return `${n} ${plural}`;
  });

  return `on screen i detect ${parts.join(", ")}.`;
}

// ============================
// 4) dblclick trigger (ONLY trigger)
// ============================
document.addEventListener(
  "dblclick",
  () => {
    console.log("dblclick detected -> scanning");
    srShowScan("scanning screen…");
    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" });
  },
  true
);

// ============================
// 5) message handling from background
// supports: DETR_RESULT (your current), DETECTIONS_RESULT, SHOW_SCANNING/HIDE_SCANNING
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type) return;

  // if your background uses these, we respect them
  if (msg.type === "SHOW_SCANNING") {
    srShowScan(msg.message || "scanning…");
    return;
  }

  if (msg.type === "HIDE_SCANNING") {
    srHideScan();
    return;
  }

  // your console shows DETR_RESULT
  if (msg.type === "DETR_RESULT" || msg.type === "DETECTIONS_RESULT") {
    const detections = msg.detections || [];
    console.log("received detections:", detections);

    srHideScan();
    drawDetections(detections);

    // use provided description if your background sends it, else build from detections
    const description = msg.description || buildDescriptionFromDetections(detections);
    showDescriptionPill(description);

    return;
  }

  if (msg.type === "ERROR") {
    console.error("error from background:", msg.error);
    srHideScan();
    showDescriptionPill("something went wrong while scanning.");
    return;
  }
});
