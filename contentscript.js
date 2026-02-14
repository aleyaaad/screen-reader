console.log("content script loaded!");

// ============================
// 1) tiny debug toast
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
// 2) scanner overlay (very visible)
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
// 3) dblclick trigger (only trigger)
// ============================
document.addEventListener(
  "dblclick",
  () => {
    toast("dblclick ✅");
    showScan("scanning screen…");

    // keep it visible for 2s no matter what (proof)
    setTimeout(() => {
      toast("scan overlay timeout ⏳");
      hideScan();
    }, 2000);

    // send to background
    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        toast("sendMessage error ❌");
        hideScan();
        return;
      }
      console.log("background resp:", resp);
    });
  },
  true
);

// ============================
// 4) hide overlay when results arrive
// (supports DETR_RESULT and DETECTIONS_RESULT)
// ============================
chrome.runtime.onMessage.addListener((msg) => {
  console.log("content got message:", msg);

  if (msg?.type === "DETR_RESULT" || msg?.type === "DETECTIONS_RESULT") {
    toast("results ✅");
    hideScan();
  }

  if (msg?.type === "ERROR") {
    toast("error ❌");
    hideScan();
  }

  if (msg?.type === "HIDE_SCANNING") {
    hideScan();
  }
});
