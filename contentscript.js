// contentscript.js (option B + elevenlabs speak)

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
// unified scan trigger (reused by dblclick + shortcut)
// ============================
let lastScanAt = 0;
let suppressScanUntil = 0;

function triggerScan() {
  const now = Date.now();
  if (now < suppressScanUntil) return;
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

// dblclick trigger
document.addEventListener("dblclick", triggerScan, true);

// ============================
// triple click = text only (suppress scan starting at click #2)
// ============================
(() => {
  let clickCount = 0;
  let clickTimer = null;
  let lastTarget = null;

  function pickText(e) {
    const selected = window.getSelection?.().toString()?.trim();
    if (selected) return selected;

    let el = e?.target;
    if (!el) return "";

    let text = el.innerText?.trim() || el.textContent?.trim() || "";
    if (text.length > 1200) text = text.slice(0, 1200) + "…";
    return text;
  }

  document.addEventListener(
    "click",
    (e) => {
      if (lastTarget && e.target !== lastTarget) clickCount = 0;
      lastTarget = e.target;

      clickCount += 1;

      // key fix: suppress scan right after click #2 (before dblclick fires)
      if (clickCount === 2) {
        suppressScanUntil = Date.now() + 900;
      }

      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickCount = 0;
        clickTimer = null;
        lastTarget = null;
      }, 450);

      if (clickCount === 3) {
        clickCount = 0;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = null;

        const text = pickText(e);
        if (!text) return;

        speakWithElevenLabs(text);
      }
    },
    true
  );
})();

// ============================
// NEW: fast image describe (no screenshot)
// click an image once to "select" it, then trigger via shortcut
// ============================
let lastClickedImageUrl = "";

document.addEventListener(
  "click",
  (e) => {
    const img = e.target?.closest?.("img");
    if (!img) return;

    lastClickedImageUrl = img.currentSrc || img.src || "";
  },
  true
);

async function describeLastClickedImage() {
  if (!lastClickedImageUrl) {
    console.warn("no image clicked yet");
    return;
  }

  // reuse overlay as feedback
  showScan("describing image…");

  const res = await chrome.runtime.sendMessage({
    type: "DESCRIBE_IMAGE_URL",
    imageUrl: lastClickedImageUrl
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
// messages from background:
// - DETR results + scanning UI
// - shortcut triggers
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
    hideScan();
    const sentence = typeof describeDetections === "function"
      ? describeDetections(msg.detections || [])
      : "scan complete.";
    speakWithElevenLabs(sentence);
    return;
  }

  // shortcut triggers
  if (msg.type === "TRIGGER_SCAN") {
    triggerScan();
    return;
  }

  if (msg.type === "TRIGGER_READ_SELECTION") {
    const selected = window.getSelection?.().toString()?.trim();
    if (!selected) {
      console.warn("no text selected");
      return;
    }
    speakWithElevenLabs(selected);
    return;
  }

  if (msg.type === "TRIGGER_DESCRIBE_IMAGE") {
    describeLastClickedImage();
    return;
  }
  // ============================
// single-key controls (click -> press key)
// R = read selected text
// I = describe last clicked image
// S = scan screen
// (won't trigger while typing)
// ============================
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

document.addEventListener("keydown", (e) => {
  // ignore if user is typing in a field
  if (isTypingTarget(e.target)) return;

  // ignore if modifiers are held (so we don't fight real shortcuts)
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = (e.key || "").toLowerCase();

  if (key === "r") {
    const selected = window.getSelection?.().toString()?.trim();
    if (!selected) return;
    speakWithElevenLabs(selected);
  }

  if (key === "i") {
    // describe last clicked image (you already store lastClickedImageUrl)
    describeLastClickedImage();
  }

  if (key === "s") {
    triggerScan();
  }
}, true);

});
