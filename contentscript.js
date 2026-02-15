// contentscript.js (shift+i scan + shift+r read + hover image + shift+d describe)
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
  position:fixed;
  inset:0;
  z-index:2147483647;
  pointer-events:none;
  background:rgba(0,0,0,.20);
}
#${SCAN_ID} .line{
  position:absolute;
  left:0;
  right:0;
  height:6px;
  background:linear-gradient(90deg, transparent, rgba(0,255,255,.95), transparent);
  box-shadow:0 0 24px rgba(0,255,255,.7);
  animation:scanMove 1.0s linear infinite;
}
#${SCAN_ID} .label{
  position:fixed;
  bottom:20px;
  right:20px;
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
// red boxes layer (DPR fix)
// ============================
const DRAW_ID = "sr-draw-layer";
const DRAW_STYLE_ID = "sr-draw-style";

function ensureDrawLayer() {
  if (!document.getElementById(DRAW_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = DRAW_STYLE_ID;
    style.textContent = `
#${DRAW_ID}{
  position:fixed;
  inset:0;
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
  left:0;
  top:-24px;
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

// ============================
// build a short sentence to speak (from DETR boxes)
// ============================
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
// ElevenLabs playback (fallback if autoplay blocks)
// ============================
let srAudioEl = null;

function ensureAudioEl() {
  if (!srAudioEl) {
    srAudioEl = document.createElement("audio");
    srAudioEl.id = "sr-audio";
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
    try {
      await a.play();
    } catch (e) {
      console.error("play failed:", e);
    }
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
  } catch (e) {
    console.warn("autoplay blocked, showing tap-to-play");
    showTapToPlay(src);
  }
}

// ============================
// keyboard triggers
// shift+i -> capture full screen -> DETR in background
// shift+r -> read nearby text aloud
// ============================
let lastScanAt = 0;
let lastReadAt = 0;
let srLastTargetEl = null;

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

function pickTextFromTarget(targetEl) {
  const selected = window.getSelection?.().toString()?.trim();
  if (selected) return selected;

  let el = targetEl || document.activeElement || document.body;
  if (!el) return "";

  const badTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
  if (el.tagName && badTags.has(el.tagName)) return "";

  let text = "";
  if (typeof el.innerText === "string") text = el.innerText.trim();
  if (!text && typeof el.textContent === "string") text = el.textContent.trim();

  let hops = 0;
  while ((!text || text.length < 2) && el && hops < 3) {
    el = el.parentElement;
    if (!el) break;
    if (el.tagName && badTags.has(el.tagName)) break;
    if (typeof el.innerText === "string") text = el.innerText.trim();
    hops++;
  }

  if (text.length > 1200) text = text.slice(0, 1200) + "…";
  return text;
}

function triggerReadText() {
  const now = Date.now();
  if (now - lastReadAt < 700) return;
  lastReadAt = now;

  const text = pickTextFromTarget(srLastTargetEl);
  if (!text) return;
  speakWithElevenLabs(text);
}

// ============================
// hover image + shift+d -> describe THAT image with blip -> speak
// ============================
let srHoveredImageEl = null;
let srLastDescribeAt = 0;

function extractImageUrlFromElement(el) {
  if (!el) return "";

  // direct <img>
  if (el.tagName === "IMG") {
    const src = el.currentSrc || el.src || "";
    return src;
  }

  // walk up a bit in case user hovers inside a <picture> / wrapper
  let cur = el;
  for (let i = 0; i < 3 && cur; i++) {
    if (cur.tagName === "IMG") {
      const src = cur.currentSrc || cur.src || "";
      return src;
    }

    const cs = window.getComputedStyle(cur);
    const bg = cs?.backgroundImage || "";
    // background-image: url("...")
    const match = bg.match(/url\(["']?(.*?)["']?\)/i);
    if (match && match[1]) return match[1];

    cur = cur.parentElement;
  }

  return "";
}

document.addEventListener(
  "mousemove",
  (e) => {
    // store whatever element the mouse is currently over
    srHoveredImageEl = e?.target || null;
    srLastTargetEl = e?.target || srLastTargetEl;
  },
  true
);

document.addEventListener(
  "click",
  (e) => {
    srLastTargetEl = e?.target || srLastTargetEl;
  },
  true
);

document.addEventListener(
  "keydown",
  async (e) => {
    // ignore if user is typing in inputs
    const t = e?.target;
    const tag = t?.tagName;
    const typing =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      t?.isContentEditable === true;

    if (typing) return;

    // shift+i -> scan screen
    if (e.shiftKey && (e.key === "I" || e.key === "i")) {
      triggerScan();
      return;
    }

    // shift+r -> read nearby text
    if (e.shiftKey && (e.key === "R" || e.key === "r")) {
      triggerReadText();
      return;
    }

    // shift+d -> describe hovered image
    if (!(e.shiftKey && (e.key === "D" || e.key === "d"))) return;

    const now = Date.now();
    if (now - srLastDescribeAt < 800) return; // basic spam guard
    srLastDescribeAt = now;

    const url = extractImageUrlFromElement(srHoveredImageEl);
    if (!url) {
      speakWithElevenLabs("i'm not hovering an image right now.");
      return;
    }

    showScan("describing image…");
    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = setTimeout(() => hideScan(), 15000);

    chrome.runtime.sendMessage(
      { type: "DESCRIBE_IMAGE", imageUrl: url },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.error("describe sendMessage error:", chrome.runtime.lastError.message);
          hideScan();
          return;
        }
        if (resp?.ok === false) {
          console.error("describe background error:", resp.error);
          hideScan();
        }
      }
    );
  },
  true
);

// ============================
// results from background
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  // DETR results from screen scan
  if (msg.type === "DETR_RESULT" || msg.type === "DETECTIONS_RESULT") {
    const detections = msg.detections || [];
    drawDetections(detections);
    hideScan();
    speakWithElevenLabs(describeDetections(detections));
    return;
  }

  // BLIP caption result for hovered image
  if (msg.type === "IMAGE_DESC_RESULT") {
    hideScan();
    const caption = (msg.caption || "").trim();
    speakWithElevenLabs(caption || "i couldn't describe that image.");
    return;
  }
});
