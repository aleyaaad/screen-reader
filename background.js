// background.js (MV3 service worker)

console.log("BACKGROUND RUNNING - DETR VERSION - feb14");

const DETR_API_KEY = "Bearer hf_YOUR_NEW_TOKEN_HERE";
const DETR_API_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "CAPTURE_SCREEN") return;

      console.log("background got message:", msg);

      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;

      if (!tabId || windowId == null) {
        throw new Error("No active tab info found.");
      }

      await safeSend(tabId, { type: "SHOW_SCANNING", message: "scanning screen…" });

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png"
      });

      if (!dataUrl) throw new Error("Screenshot capture failed.");

      const detections = await runDetr(dataUrl);

      await safeSend(tabId, { type: "HIDE_SCANNING" });

      await safeSend(tabId, {
        type: "DETR_RESULT",
        detections
      });

      sendResponse({ ok: true, detections });
    } catch (err) {
      console.error("background error:", err);

      const tabId = sender?.tab?.id;

      if (tabId) {
        await safeSend(tabId, { type: "HIDE_SCANNING" });
        await safeSend(tabId, {
          type: "ERROR",
          error: String(err?.message || err)
        });
      }

      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true;
});

async function runDetr(dataUrl) {
  const base64 = dataUrl.split(",")[1];

  console.log("auth header prefix:", DETR_API_KEY.slice(0, 18));

  const resp = await fetch(DETR_API_URL, {
    method: "POST",
    headers: {
      Authorization: DETR_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: base64 })
  });

  const text = await resp.text();

  if (!resp.ok) {
    throw new Error(`detr failed: ${resp.status} ${text}`);
  }

  const json = JSON.parse(text);

  return Array.isArray(json) ? json : [];
}

async function safeSend(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.warn("safeSend failed:", e.message);
  }
}
