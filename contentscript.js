// contentscript.js

console.log("screen_reader contentscript loaded");

// ============================
// tiny debug toast
// ============================
function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;top:16px;left:16px;z-index:2147483647;background:#000;color:#fff;padding:8px 10px;border-radius:10px;font:700 12px system-ui;pointer-events:none;opacity:.9;";
  document.documentElement.appendChild(t);
  setTimeout(() => t.remove(), 900);
}

// ============================
// scanner overlay (very visible)
// ============================
const SCAN_ID = "sr-scan-overlay";
const STYLE_ID = "sr-scan-style";

function showScan(message = "scanning…") {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SCAN_ID}{
        position:fixed; inset:0;
        z-index:2147483647;
        pointer-events:none;
        background:rgba(0,0,0,.25);
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
}

// ============================
// dblclick trigger (ONLY trigger)
// ============================
let scanTimeoutId = null;

document.addEventListener(
  "dblclick",
  () => {
    toast("dblclick ✅");
    showScan("scanning screen…");

    // fail-safe only if nothing returns
    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = setTimeout(() => {
      toast("scan overlay timeout ⏳");
      hideScan();
      scanTimeoutId = null;
    }, 2500);

    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("sendMessage lastError:", chrome.runtime.lastError.message);
        toast("sendMessage error ❌");
        hideScan();
        if (scanTimeoutId) clearTimeout(scanTimeoutId);
        scanTimeoutId = null;
        return;
      }

      // if background responds with ok:false, show why
      if (resp?.ok === false) {
        console.error("background error:", resp.error);
        toast(`error: ${String(resp.error).slice(0, 40)}`);
        hideScan();
        if (scanTimeoutId) clearTimeout(scanTimeoutId);
        scanTimeoutId = null;
      }
    });
  },
  true
);

// ============================
// receive messages from background
// supports DETR_RESULT, DETECTIONS_RESULT, ERROR, HIDE_SCANNING
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  console.log("content got message:", msg);

  if (msg?.type === "DETR_RESULT" || msg?.type === "DETECTIONS_RESULT") {
    toast("results ✅");
    hideScan();
    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
  }

  if (msg?.type === "HIDE_SCANNING") {
    hideScan();
    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
  }

  if (msg?.type === "ERROR") {
    console.error("scan error:", msg.error);
    toast(`error: ${String(msg.error).slice(0, 40)}`);
    hideScan();
    if (scanTimeoutId) clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
  }
});
