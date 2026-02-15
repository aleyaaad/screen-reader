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
  if (!res?.ok) return;

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
// dblclick trigger (scan)
// ============================
let lastScanAt = 0;
let suppressScanUntil = 0;

document.addEventListener(
  "dblclick",
  () => {
    const now = Date.now();
    if (now < suppressScanUntil) return;
    if (now - lastScanAt < 700) return;
    lastScanAt = now;

    showScan("scanning screen…");

    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = setTimeout(() => {
      hideScan();
    }, 15000);

    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" });
  },
  true
);

// ============================
// triple click = text only
// ============================
(() => {
  let clickCount = 0;
  let clickTimer = null;
  let lastTarget = null;

  function pickText(e) {
    const selected = window.getSelection()?.toString()?.trim();
    if (selected) return selected;

    let el = e.target;
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

      clickCount++;

      // 🔥 suppress scan as soon as second click happens
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

        const text = pickText(e);
        if (!text) return;

        speakWithElevenLabs(text);
      }
    },
    true
  );
})();

// ============================
// listen for DETR results
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type) return;

  if (msg.type === "SHOW_SCANNING") {
    showScan(msg.message || "scanning…");
    return;
  }

  if (msg.type === "ERROR") {
    hideScan();
    return;
  }

  if (msg.type === "DETR_RESULT" || msg.type === "DETECTIONS_RESULT") {
    hideScan();
    const sentence = describeDetections(msg.detections || []);
    speakWithElevenLabs(sentence);
  }
  // ============================
// shortcut triggers (messages from background.js)
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg?.type) return;

  if (msg.type === "TRIGGER_SCAN") {
    const now = Date.now();
    if (now < suppressScanUntil) return; // respect your triple-click suppression
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
<<<<<<< HEAD
});

=======
  // ============================
// triple click anywhere -> read text aloud (elevenlabs)
// uses selected text first (triple click usually selects a paragraph)
// falls back to clicked element text
// ============================
(() => {
  let clickCount = 0;
  let clickTimer = null;
  let lastTarget = null;

  function pickTextFromEvent(e) {
    // 1) selected text is best
    const selected = window.getSelection?.().toString()?.trim();
    if (selected) return selected;

    // 2) fallback: clicked element's visible text
    let el = e?.target;
    if (!el) return "";

    const badTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
    if (el.tagName && badTags.has(el.tagName)) return "";

    let text = "";
    if (typeof el.innerText === "string") text = el.innerText.trim();
    if (!text && typeof el.textContent === "string") text = el.textContent.trim();

    // walk up a few parents if the clicked node has no meaningful text
    let hops = 0;
    while ((!text || text.length < 2) && el && hops < 3) {
      el = el.parentElement;
      if (!el) break;
      if (el.tagName && badTags.has(el.tagName)) break;
      if (typeof el.innerText === "string") text = el.innerText.trim();
      hops++;
    }

    // keep it readable + not insanely long
    if (text.length > 1200) text = text.slice(0, 1200) + "…";
    return text;
  }

  document.addEventListener(
    "click",
    (e) => {
      // keep triple-clicks to same target; reset if user clicks elsewhere
      if (lastTarget && e.target !== lastTarget) clickCount = 0;
      lastTarget = e.target;

      clickCount += 1;

      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickCount = 0;
        clickTimer = null;
        lastTarget = null;
      }, 450);

      if (clickCount === 3) {
        // prevent your dblclick scan from firing on click #2/#3
        suppressScanUntil = Date.now() + 600;

        // stop counting
        clickCount = 0;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = null;

        const text = pickTextFromEvent(e);
        if (!text) return;

        // use your existing elevenlabs pipeline
        speakWithElevenLabs(text);
      }
    },
    true // capture so we still get the click even if the site stops propagation
  );
})();


  if (msg.type === "DETR_RESULT" || msg.type === "DETECTIONS_RESULT") {
    const detections = msg.detections || [];

    drawDetections(detections); // boxes first
    hideScan();                 // scan stops once boxes appear

    const sentence = describeDetections(detections);
    speakWithElevenLabs(sentence); // then speak
  }
>>>>>>> 72cbb1d85ab0201dd855d95f02b480eb8383fc3b
});
