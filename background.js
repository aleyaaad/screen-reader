// background.js (mv3 service worker)

// put your real hf token here (keep it secret in real life, but for hackathon ok)
const DETR_API_KEY = "Bearer YOUR_HF_TOKEN_HERE";

// pick the model you’re actually using
const DETR_API_URL =
  "https://api-inference.huggingface.co/models/facebook/detr-resnet-50";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // we will respond async
  (async () => {
    try {
      if (msg?.type !== "CAPTURE_SCREEN") return;

      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;

      if (!tabId || windowId == null) {
        sendResponse({ ok: false, error: "no active tab info found" });
        return;
      }

      // tell content script to show scanning overlay right away
      await safeSend(tabId, { type: "SHOW_SCANNING", message: "scanning screen…" });

      // capture screenshot
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png"
      });

      // run detr
      const detections = await runDetr(dataUrl);

      // hide scanning overlay
      await safeSend(tabId, { type: "HIDE_SCANNING" });

      // send results to content script to draw
      await safeSend(tabId, { type: "DETECTIONS_RESULT", detections });

      sendResponse({ ok: true, detections });
    } catch (err) {
      try {
        const tabId = sender?.tab?.id;
        if (tabId) await safeSend(tabId, { type: "HIDE_SCANNING" });
        if (tabId) await safeSend(tabId, { type: "ERROR", error: String(err?.message || err) });
      } catch (_) {}

      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true; // keep message channel open for async sendResponse
});

async function runDetr(dataUrl) {
  const base64 = dataUrl.split(",")[1];

  const resp = await fetch(DETR_API_URL, {
    method: "POST",
    headers: {
      Authorization: DETR_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: base64
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`detr failed: ${resp.status} ${text}`);
  }

  const json = await resp.json();

  // expected shape (like what you showed):
  // [{ score, label, box: { xmin,ymin,xmax,ymax } }, ...]
  if (!Array.isArray(json)) return [];
  return json;
}

async function safeSend(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // content script might not be ready on chrome pages etc.
  }
}
