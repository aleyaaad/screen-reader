// contentscript.js (shift shortcuts + elevenlabs speak)

console.log("screen_reader contentscript loaded");

// ============================
// scanner overlay
// ============================
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

// ============================
// red boxes layer (optional but nice)
// ============================
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

function describeDetections(detections = []) {
  const counts = new Map();

  for (const det of detections) {
    const score = det?.score ?? 0;
    if (score < 0.3) continue;
    const label = String(det?.label || "").trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  if (counts.size === 0) return "i don't see anything clearly.";

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, n]) => `${n} ${n === 1 ? label : label + "s"}`);

  return `on screen i detect ${parts.join(", ")}.`;
}

// ============================
// ElevenLabs playback
// ============================
let srAudioEl = null;

function ensureAudioEl() {
  if (!srAudioEl) {
    srAudioEl = document.createElement("audio");
    srAudioEl.style.display = "none";
    document.documentElement.appendChild(srAudioEl);
  }
  return srAudioEl;
}

function showTapToPlay(src) {
  const id = "sr-tap-play";
  document.getElementById(id)?.remove();

  const btn = document.createElement("button");
  btn.id = id;
  btn.textContent = "tap to play audio";
  btn.style.cssText = `
    position: fixed;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    padding: 12px 14px;
    border-radius: 14px;
    border: 0;
    background: rgba(0,0,0,0.85);
    color: white;
    font: 800 14px system-ui;
    cursor: pointer;
  `;

  btn.onclick = async () => {
    btn.remove();
    const a = ensureAudioEl();
    a.src = src;
    try { await a.play(); } catch (e) {}
  };

  document.documentElement.appendChild(btn);
  setTimeout(() => btn.remove(), 8000);
}

async function speakWithElevenLabs(text) {
  const res = await chrome.runtime.sendMessage({ type: "SPEAK_TEXT", text });
  if (!res?.ok) {
    console.error("tts error:", res?.error);
    return;
  }

  const src = `data:audio/mpeg;base64,${res.audioB64}`;
  const a = ensureAudioEl();
  a.src = src;

  try {
    await a.play();
  } catch {
    showTapToPlay(src);
  }
}

// ============================
// scan trigger (Shift+S)
// ============================
let lastScanAt = 0;

function triggerScan() {
  const now = Date.now();
  if (now - lastScanAt < 700) return;
  lastScanAt = now;

  showScan("scanning screen…");

  if (scanTimeoutId) clearTimeout(scanTimeoutId);
  scanTimeoutId = setTimeout(() => {
    console.log("scan timed out (no response)");
    hideScan();
  }, 15000);

  chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error("sendMessage error:", chrome.runtime.lastError.message);
      hideScan();
      return;
    }
    if (resp?.ok === false) {
      console.error("background error:", resp.error);
      hideScan();
    }
  });
}

// (optional) keep dblclick scan if you still want it
document.addEventListener("dblclick", triggerScan, true);

// ============================
// hover image tracking (Shift+I)
// ============================
let hoveredImageEl = null;
let lastClickedImageUrl = "";

// track hover
document.addEventListener(
  "mousemove",
  (e) => {
    const img = e.target?.closest?.("img");
    hoveredImageEl = img || null;
  },
  true
);

// fallback: track last clicked image too
document.addEventListener(
  "click",
  (e) => {
    const img = e.target?.closest?.("img");
    if (!img) return;
    lastClickedImageUrl = img.currentSrc || img.src || "";
  },
  true
);

function getHoveredOrClickedImageUrl() {
  const hoverUrl = hoveredImageEl?.currentSrc || hoveredImageEl?.src || "";
  if (hoverUrl) return hoverUrl;
  return lastClickedImageUrl || "";
}

async function describeHoveredImage() {
  const imageUrl = getHoveredOrClickedImageUrl();
  if (!imageUrl) {
    console.warn("no image hovered (or clicked) yet");
    return;
  }

  showScan("describing image…");

  const res = await chrome.runtime.sendMessage({
    type: "DESCRIBE_IMAGE_URL",
    imageUrl
  });

  hideScan();

  if (!res?.ok) {
    console.error("describe image error:", res?.error);
    return;
  }

  const caption = String(res.caption || "").trim();
  if (!caption) return;

  speakWithElevenLabs(caption);
}

// ============================
// Shift shortcuts
// Shift+R = read selected text (highlighted)
// Shift+I = describe hovered image (blip)
// Shift+S = scan screen
// ============================
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

document.addEventListener(
  "keydown",
  (e) => {
    // only Shift + single letter (no ctrl/alt/meta)
    if (!e.shiftKey) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // don't hijack typing
    if (isTypingTarget(e.target)) return;

    const key = (e.key || "").toLowerCase();

    if (key === "r") {
      e.preventDefault();
      e.stopPropagation();
      const selected = window.getSelection?.().toString()?.trim();
      if (!selected) return;
      speakWithElevenLabs(selected);
      return;
    }

    if (key === "i") {
      e.preventDefault();
      e.stopPropagation();
      describeHoveredImage();
      return;
    }

    if (key === "s") {
      e.preventDefault();
      e.stopPropagation();
      triggerScan();
      return;
    }
  },
  true
);

// ============================
// messages from background (DETR results + scanning UI)
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type) return;

  if (msg.type === "SHOW_SCANNING") {
    showScan(msg.message || "scanning…");
    return;
  }

  if (msg.type === "ERROR") {
    console.error("scan error:", msg.error);
    hideScan();
    return;
  }

  if (msg.type === "DETR_RESULT" || msg.type === "DETECTIONS_RESULT") {
    const detections = msg.detections || [];
    drawDetections(detections);
    hideScan();
    const sentence = describeDetections(detections);
    speakWithElevenLabs(sentence);
    return;
  }
});
