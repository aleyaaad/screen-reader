// background.js (mv3 service worker)

// put your real hf token here (hackathon ok, production no)
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
        console.error("no tab or window id available");
        sendResponse({ ok: false, error: "no active tab info found" });
        return;
      }

      // tell content script to show scanning immediately
      await safeSend(tabId, {
        type: "SHOW_SCANNING",
        message: "scanning screen…"
      });

      console.log("capturing visible tab...");

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png"
      });

      if (!dataUrl) {
        throw new Error("captureVisibleTab returned empty dataUrl");
      }

      console.log("capture successful, running DETR...");

      const detections = await runDetr(dataUrl);

      console.log("DETR finished", detections);

      // always hide scanning
      await safeSend(tabId, { type: "HIDE_SCANNING" });

      // send detections back
      await safeSend(tabId, {
        type: "DETECTIONS_RESULT",
        detections
      });

      sendResponse({ ok: true, detections });
    } catch (err) {
      console.error("scan failed:", err);

      const tabId = sender?.tab?.id;

      if (tabId) {
        await safeSend(tabId, { type: "HIDE_SCANNING" });
        await safeSend(tabId, {
          type: "ERROR",
          error: String(err?.message || err)
        });
      }

      sendResponse({
        ok: false,
        error: String(err?.message || err)
      });
    }
  })();

  return true; // required for async response
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

  if (!Array.isArray(json)) {
    console.warn("unexpected DETR response:", json);
    return [];
  }

  return json;
}

async function safeSend(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.warn("safeSend failed (likely not injected):", e.message);
  }
}
