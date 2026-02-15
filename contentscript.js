console.log("screen_reader contentscript loaded");

// --------------------
// scanner overlay
// --------------------
const SCAN_ID = "sr-scan-overlay";
const STYLE_ID = "sr-scan-style";

let scanTimeoutId = null;

function showScan(message = "scanning…") {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SCAN_ID}{
        position:fixed; inset:0;
        z-index:2147483647;
        pointer-events:none;
        background:rgba(0,0,0,.20);
      }
      #${SCAN_ID} .line{
        position:absolute; left:0; right:0;
        height:6px;
        background:linear-gradient(90deg, transparent, rgba(0,255,255,.95), transparent);
        box-shadow:0 0 24px rgba(0,255,255,.7);
        animation:scanMove 1.0s linear infinite;
      }
      #${SCAN_ID} .label{
        position:fixed; bottom:20px; right:20px;
        background:rgba(0,0,0,.85);
        color:#fff;
        padding:12px 14px;
        border-radius:14px;
        font:800 15px system-ui;
      }
      @keyframes scanMove{
        0%{ top:-10%; }
        100%{ top:110%; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  let el = document.getElementById(SCAN_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = SCAN_ID;
    el.innerHTML = `<div class="line"></div><div class="label"></div>`;
    document.documentElement.appendChild(el);
  }
  el.querySelector(".label").textContent = message;
}

function hideScan() {
  document.getElementById(SCAN_ID)?.remove();
  if (scanTimeoutId) clearTimeout(scanTimeoutId);
  scanTimeoutId = null;
}

// --------------------
// red boxes layer
// --------------------
const DRAW_ID = "sr-draw-layer";
const DRAW_STYLE_ID = "sr-draw-style";

function ensureDrawLayer() {
  if (!document.getElementById(DRAW_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = DRAW_STYLE_ID;
    style.textContent = `
      #${DRAW_ID}{
        position:fixed; inset:0;
        z-index:2147483646;
        pointer-events:none;
      }
      .sr-box{
        position:absolute;
        border:3px solid rgba(255,0,0,.95);
        border-radius:6px;
        box-sizing:border-box;
      }
      .sr-label{
        position:absolute;
        left:0; top:-24px;
        padding:4px 8px;
        border-radius:10px;
        background:rgba(0,0,0,.75);
        color:#fff;
        font:800 12px system-ui;
        white-space:nowrap;
      }
    `;
    document.documentElement.appendChild(style);
  }

  let layer = document.getElementById(DRAW_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = DRAW_ID;
    document.documentElement.appendChild(layer);
  }
  return layer;
}

function drawDetections(detections = []) {
  const layer = ensureDrawLayer();
  layer.innerHTML = "";

  const dpr = window.devicePixelRatio || 1;

  for (const det of detections) {
    const score = det?.score ?? 0;
    if (score < 0.3) continue;
    const box = det?.box;
    if (!box) continue;

    //  DPR FIX
    const xmin = box.xmin / dpr;
    const ymin = box.ymin / dpr;
    const xmax = box.xmax / dpr;
    const ymax = box.ymax / dpr;

    const el = document.createElement("div");
    el.className = "sr-box";
    el.style.left = `${xmin}px`;
    el.style.top = `${ymin}px`;
    el.style.width = `${Math.max(0, xmax - xmin)}px`;
    el.style.height = `${Math.max(0, ymax - ymin)}px`;

    const label = document.createElement("div");
    label.className = "sr-label";
    label.textContent = `${det.label} ${(score * 100).toFixed(0)}%`;

    el.appendChild(label);
    layer.appendChild(el);
  }

  setTimeout(() => {
    const l = document.getElementById(DRAW_ID);
    if (l) l.innerHTML = "";
  }, 3500);
}

// --------------------
// helper: handle results in one place
// --------------------
function handleResults(detections) {
  hideScan();           // ✅ clears timeout too
  drawDetections(detections || []);
}

// --------------------
// dblclick trigger (only trigger)
// --------------------
let lastScanAt = 0;
document.addEventListener(
  "dblclick",
  () => {
    const now = Date.now();
    if (now - lastScanAt < 700) return; // prevent double-trigger
    lastScanAt = now;

    showScan("scanning screen…");

    // fail-safe only if nothing returns
    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = setTimeout(() => {
      console.log("scan overlay timeout ⏳ (results took too long)");
      hideScan();
    }, 5000); // ✅ increase so it won't fire on normal latency

    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("sendMessage error:", chrome.runtime.lastError.message);
        hideScan();
        return;
      }
      // ✅ if background returns detections in the direct response, draw them too
      if (resp?.ok && Array.isArray(resp.detections)) {
        handleResults(resp.detections);
      }
      if (resp?.ok === false) {
        console.error("background error:", resp.error);
        hideScan();
      }
    });
  },
  true
);

// --------------------
// listen for results messages (support multiple types)
// --------------------
chrome.runtime.onMessage.addListener((msg) => {
  // scanner control messages
  if (msg?.type === "SHOW_SCANNING") showScan(msg.message || "scanning…");
  if (msg?.type === "HIDE_SCANNING") hideScan();

  // ✅ support both message types
  if (msg?.type === "DETR_RESULT" || msg?.type === "DETECTIONS_RESULT") {
    handleResults(msg.detections || []);
  }

  if (msg?.type === "ERROR") {
    console.error("scan error:", msg.error);
    hideScan();
  }
});
