// background.js (mv3 service worker)

const DETR_API_KEY = "Bearer YOUR_HF_TOKEN_HERE";
const DETR_API_URL =
  "https://api-inference.huggingface.co/models/facebook/detr-resnet-50";

console.log("screen_reader background service worker started");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "CAPTURE_SCREEN") return;

      console.log("CAPTURE_SCREEN received", { msg, sender });

      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;

      if (!tabId || windowId == null) {
        console.error("no active tab info found");
        sendResponse({ ok: false, error: "no active tab info found" });
        return;
      }

      // show overlay (content script also shows it, but this is fine)
      await safeSend(tabId, { type: "SHOW_SCANNING", message: "scanning screen…" });

      console.log("capturing visible tab...");
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });

      if (!dataUrl) throw new Error("captureVisibleTab returned empty dataUrl");

      console.log("capture ok, calling DETR...");
      const detections = await runDetr(dataUrl);

      console.log("DETR done, detections:", detections);

      // hide overlay + send results
      await safeSend(tabId, { type: "HIDE_SCANNING" });

      // IMPORTANT: use whichever your existing code expects
      // your earlier console showed DETR_RESULT, so we send that
      await safeSend(tabId, { type: "DETR_RESULT", detections });

      sendResponse({ ok: true, detections });
    } catch (err) {
      console.error("scan failed:", err);

      const tabId = sender?.tab?.id;
      if (tabId) {
        await safeSend(tabId, { type: "HIDE_SCANNING" });
        await safeSend(tabId, { type: "ERROR", error: String(err?.message || err) });
      }

      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true;
});

// ============================
// HF DETR call with "model loading" retry
// ============================
async function runDetr(dataUrl) {
  const base64 = dataUrl.split(",")[1];

  for (let attempt = 1; attempt <= 4; attempt++) {
    const resp = await fetch(DETR_API_URL, {
      method: "POST",
      headers: {
        Authorization: DETR_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: base64 })
    });

    if (resp.ok) {
      const json = await resp.json();
      return Array.isArray(json) ? json : [];
    }

    const text = await resp.text().catch(() => "");
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {}

    // HF model loading case
    if (resp.status === 503 && parsed?.estimated_time) {
      const waitMs = Math.ceil(parsed.estimated_time * 1000) + 300;
      console.log(`HF model loading, waiting ${waitMs}ms (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    throw new Error(`detr failed: ${resp.status} ${text}`);
  }

  throw new Error("detr failed: model kept loading / retry limit hit");
}

async function safeSend(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.warn("safeSend failed:", e.message);
  }
}
