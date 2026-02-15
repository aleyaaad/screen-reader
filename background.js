// background.js (MV3 service worker)

console.log("BACKGROUND RUNNING - DETR VERSION - feb14");

const DETR_API_KEY = "Bearer hf_YOUR_REAL_TOKEN_HERE";
const DETR_API_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "CAPTURE_SCREEN") return;

      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;

      if (!tabId || windowId == null) {
        throw new Error("No active tab info found.");
      }

      // start scanning UI (content script also starts it, harmless)
      await safeSend(tabId, { type: "SHOW_SCANNING", message: "scanning screen…" });

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      if (!dataUrl) throw new Error("Screenshot capture failed.");

      const detections = await runDetr(dataUrl);

      // IMPORTANT for option B:
      // do NOT send HIDE_SCANNING here.
      // content script will stop scanning when it receives results.
      await safeSend(tabId, { type: "DETR_RESULT", detections });

      sendResponse({ ok: true, detections });
    } catch (err) {
      console.error("background error:", err);

      const tabId = sender?.tab?.id;
      if (tabId) {
        await safeSend(tabId, { type: "ERROR", error: String(err?.message || err) });
      }

      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true;
});

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
    try { parsed = JSON.parse(text); } catch (_) {}

    if (resp.status === 503 && parsed?.estimated_time) {
      const waitMs = Math.ceil(parsed.estimated_time * 1000) + 300;
      console.log(`HF model loading, waiting ${waitMs}ms (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    throw new Error(`detr failed: ${resp.status} ${text}`);
  }

  throw new Error("detr failed: retry limit hit");
}

async function safeSend(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // ignore if content script isn't available (restricted pages)
  }
}
