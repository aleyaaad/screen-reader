// contentscript.js
console.log("screen_reader contentscript loaded");

// ============================
// scanner overlay (objects)
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

// ============================
// ElevenLabs playback
// ============================
let srAudioEl = null;
let srSpeaking = false;

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
    try { await a.play(); } catch (e) { console.error("play failed:", e); }
  };

  document.documentElement.appendChild(btn);
  setTimeout(() => btn.remove(), 10000);
}

async function speakWithElevenLabs(text) {
  if (!text || !text.trim()) return;

  // stop current audio if speaking
  const a = ensureAudioEl();
  try { a.pause(); a.currentTime = 0; } catch (_) {}

  srSpeaking = true;

  const res = await chrome.runtime.sendMessage({ type: "SPEAK_TEXT", text });

  if (!res?.ok) {
    console.error("tts error:", res?.error);
    srSpeaking = false;
    return;
  }

  const src = `data:audio/mpeg;base64,${res.audioB64}`;
  a.src = src;

  try {
    await a.play();
  } catch (e) {
    console.warn("autoplay blocked, showing tap-to-play");
    showTapToPlay(src);
  } finally {
    srSpeaking = false;
  }
}

// ============================
// NEW FEATURE: read visible text (triple click)
// ============================
function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

function cleanText(s) {
  return s
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function getVisibleText({ maxChars = 2200 } = {}) {
  // prefer main/article if present
  const root =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.body;

  // gather common readable elements
  const nodes = root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption");

  const chunks = [];
  const seen = new Set();

  for (const el of nodes) {
    if (!isElementVisible(el)) continue;

    // skip obvious nav/footer/sidebar-ish regions
    const tag = el.closest("nav,footer,header,aside");
    if (tag) continue;

    const t = cleanText(el.innerText || el.textContent || "");
    if (!t) continue;
    if (t.length < 20) continue; // ignore tiny bits

    // de-dupe identical lines
    if (seen.has(t)) continue;
    seen.add(t);

    chunks.push(t);
    if (chunks.join(" ").length >= maxChars) break;
  }

  const text = cleanText(chunks.join(" "));
  return text.slice(0, maxChars);
}

function chunkForTTS(text, chunkSize = 900) {
  // chunk by sentences-ish to keep speech smooth
  const parts = [];
  let current = "";

  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const s of sentences) {
    if ((current + " " + s).trim().length > chunkSize) {
      if (current.trim()) parts.push(current.trim());
      current = s;
    } else {
      current = (current + " " + s).trim();
    }
  }
  if (current.trim()) parts.push(current.trim());

  // fallback if no punctuation
  if (parts.length === 0 && text.trim()) parts.push(text.trim().slice(0, chunkSize));

  return parts;
}

async function readVisibleTextAloud() {
  const text = getVisibleText({ maxChars: 2400 });
  if (!text) {
    await speakWithElevenLabs("i couldn't find readable text on the visible part of this page.");
    return;
  }

  // speak in chunks so ElevenLabs doesn’t choke on long text
  const chunks = chunkForTTS(text, 900);

  // small intro helps users know what’s happening
  await speakWithElevenLabs("reading visible text.");

  for (const chunk of chunks) {
    await speakWithElevenLabs(chunk);
  }
}

// ============================
// triggers
// dblclick = objects scan
// triple click = read visible text
// ============================
let lastScanAt = 0;

document.addEventListener(
  "dblclick",
  () => {
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
      }
      if (resp?.ok === false) {
        console.error("background error:", resp.error);
        hideScan();
      }
    });
  },
  true
);

document.addEventListener(
  "click",
  (e) => {
    // triple click
    if (e.detail === 3) {
      // stop the dblclick handler from also firing extra
      e.preventDefault();
      e.stopPropagation();
      readVisibleTextAloud();
    }
  },
  true
);

// ============================
// results from background (option B)
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
    // keep your existing object-speaking here if you already do it
  }
});
