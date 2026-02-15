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
// ElevenLabs playback (queue + wait until ended)
// ============================
let srAudioEl = null;
let srSpeakChain = Promise.resolve();

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

  document.documentElement.appendChild(btn);

  return new Promise((resolve) => {
    btn.onclick = async () => {
      btn.remove();
      const a = ensureAudioEl();
      a.src = src;
      try {
        await a.play();
        resolve(true);
      } catch (e) {
        console.error("play failed:", e);
        resolve(false);
      }
    };

    setTimeout(() => {
      btn.remove();
      resolve(false);
    }, 12000);
  });
}

function waitForEnded(audioEl) {
  return new Promise((resolve) => {
    const done = () => {
      audioEl.removeEventListener("ended", done);
      audioEl.removeEventListener("error", done);
      resolve();
    };
    audioEl.addEventListener("ended", done, { once: true });
    audioEl.addEventListener("error", done, { once: true });
  });
}

async function playSrcAndWait(src) {
  const a = ensureAudioEl();

  // stop anything currently playing
  try {
    a.pause();
    a.currentTime = 0;
  } catch (_) {}

  a.src = src;

  try {
    await a.play();
  } catch (_) {
    const ok = await showTapToPlay(src);
    if (!ok) return;
  }

  await waitForEnded(a);
}

function speakWithElevenLabs(text) {
  const t = String(text || "").trim();
  if (!t) return Promise.resolve();

  // chain all speech so chunks don’t overlap
  srSpeakChain = srSpeakChain.then(async () => {
    const res = await chrome.runtime.sendMessage({ type: "SPEAK_TEXT", text: t });
    if (!res?.ok) {
      console.error("tts error:", res?.error);
      return;
    }
    const src = `data:audio/mpeg;base64,${res.audioB64}`;
    await playSrcAndWait(src);
  });

  return srSpeakChain;
}

// ============================
// object summary speech
// ============================
function summarizeDetections(detections = []) {
  const good = detections
    .filter((d) => (d?.score ?? 0) >= 0.4 && d?.label)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 6);

  if (!good.length) return "i couldn't confidently detect any objects.";

  // count labels
  const counts = new Map();
  for (const d of good) {
    const label = String(d.label).toLowerCase();
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const parts = [];
  for (const [label, n] of counts.entries()) {
    parts.push(n === 1 ? label : `${n} ${label}s`);
  }

  return `i see ${parts.join(", ")}.`;
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
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function getVisibleText({ maxChars = 2200 } = {}) {
  const root = document.querySelector("main") || document.querySelector("article") || document.body;
  const nodes = root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption");

  const chunks = [];
  const seen = new Set();

  for (const el of nodes) {
    if (!isElementVisible(el)) continue;
    if (el.closest("nav,footer,header,aside")) continue;

    const t = cleanText(el.innerText || el.textContent || "");
    if (!t) continue;
    if (t.length < 20) continue;

    if (seen.has(t)) continue;
    seen.add(t);

    chunks.push(t);
    if (chunks.join(" ").length >= maxChars) break;
  }

  const text = cleanText(chunks.join(" "));
  return text.slice(0, maxChars);
}

function chunkForTTS(text, chunkSize = 900) {
  const parts = [];
  let current = "";

  const sentences = String(text).split(/(?<=[.!?])\s+/);

  for (const s of sentences) {
    const next = (current + " " + s).trim();
    if (next.length > chunkSize) {
      if (current.trim()) parts.push(current.trim());
      current = s.trim();
    } else {
      current = next;
    }
  }
  if (current.trim()) parts.push(current.trim());

  if (parts.length === 0 && String(text).trim()) parts.push(String(text).trim().slice(0, chunkSize));
  return parts;
}

async function readVisibleTextAloud() {
  const text = getVisibleText({ maxChars: 2400 });
  if (!text) {
    await speakWithElevenLabs("i couldn't find readable text on the visible part of this page.");
    return;
  }

  const chunks = chunkForTTS(text, 900);

  await speakWithElevenLabs("reading visible text.");
  for (const chunk of chunks) {
    await speakWithElevenLabs(chunk);
  }
}

// ============================
// CLICK TRIGGERS (FIXED)
// 2 clicks = scan objects
// 3 clicks = read visible text
// ============================
let clickCount = 0;
let clickTimer = null;

function handleDoubleClickAction() {
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

document.addEventListener(
  "click",
  (e) => {
    // count clicks ourselves so triple-click DOESN’T fire the double-click feature
    clickCount += 1;

    if (clickTimer) clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
      const n = clickCount;
      clickCount = 0;

      if (n === 2) {
        handleDoubleClickAction();
      } else if (n >= 3) {
        readVisibleTextAloud();
      }
    }, 320);
  },
  true
);

// ============================
// results from background
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
    speakWithElevenLabs("something went wrong while scanning.");
    return;
  }

  if (msg.type === "DETR_RESULT" || msg.type === "DETECTIONS_RESULT") {
    const detections = msg.detections || [];
    drawDetections(detections);
    hideScan();

    // speak object summary (short + helpful)
    const summary = summarizeDetections(detections);
    speakWithElevenLabs(summary);
  }
});
