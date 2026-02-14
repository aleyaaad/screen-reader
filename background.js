console.log("BACKGROUND RUNNING - DETR VERSION - feb14");

// manifest v3 service worker

const DETR_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50";

// get token from chrome storage (saved from your options page)
async function getHfToken() {
  const { hfToken } = await chrome.storage.local.get(["hfToken"]);
  return hfToken; // "hf_xxxxx"
}

// convert screenshot dataURL -> Blob (service worker safe)
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// turn DETR detections into a simple sentence
function detectionsToSentence(detections) {
  if (!Array.isArray(detections) || detections.length === 0) {
    return "i couldn't detect any objects on screen.";
  }

  const good = detections
    .filter((d) => (d?.score ?? 0) >= 0.25 && d?.label) // lowered from 0.4
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);

  if (good.length === 0) {
    return "i saw some shapes but nothing confident enough to name.";
  }

  const counts = {};
  for (const d of good) {
    const label = d.label.toLowerCase();
    counts[label] = (counts[label] || 0) + 1;
  }

  const parts = Object.entries(counts).map(([label, n]) =>
    n === 1 ? `a ${label}` : `${n} ${label}s`
  );

  return `on screen i detect ${parts.join(", ")}.`;
}

// send screenshot to DETR and return detections + sentence
async function askDetr(dataUrl) {
  try {
    const hfToken = await getHfToken();
    if (!hfToken) {
      return {
        ok: false,
        detections: [],
        description: "no huggingface token saved. open extension options and add one.",
      };
    }

    const blob = await dataUrlToBlob(dataUrl);

    const response = await fetch(DETR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
      },
      body: blob,
    });

    const rawText = await response.text();
    console.log("DETR status:", response.status);
    console.log("DETR raw response:", rawText);

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        detections: [],
        description: "detr returned a non-json response.",
      };
    }

    if (!response.ok) {
      const msg = result?.error || `http ${response.status}`;
      return {
        ok: false,
        detections: [],
        description: `detr failed: ${msg}`,
      };
    }

    const detections = Array.isArray(result) ? result : [];
    const description = detectionsToSentence(detections);

    return { ok: true, detections, description };
  } catch (err) {
    console.error("askDetr crashed:", err);
    return {
      ok: false,
      detections: [],
      description: `detr failed: ${err?.message || err}`,
    };
  }
}

// helper: send result to content script so user sees it immediately
async function sendResultToTab(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch (err) {
    console.warn("couldn't send message to content script:", err);
  }
}

// listen for content script messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "CAPTURE_SCREEN") return;

  console.log("background got message:", request);

  const tabId = sender?.tab?.id;

  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    try {
      console.log("captureVisibleTab ran. has dataUrl:", !!dataUrl);

      if (!dataUrl) {
        const payload = {
          type: "DETR_RESULT",
          ok: false,
          detections: [],
          description: "failed to capture screenshot.",
          screenshotDataUrl: null,
        };

        if (tabId) await sendResultToTab(tabId, payload);
        sendResponse({ ok: false, description: "failed to capture screenshot." });
        return;
      }

      const detr = await askDetr(dataUrl);

      const payload = {
        type: "DETR_RESULT",
        ok: detr.ok,
        detections: detr.detections,
        description: detr.description,
        screenshotDataUrl: dataUrl, // ✅ send screenshot back for accurate scaling
      };

      if (tabId) await sendResultToTab(tabId, payload);

      // keep old behavior too
      sendResponse({ ok: detr.ok, description: detr.description });
    } catch (err) {
      console.error("capture/describe failed:", err);

      const payload = {
        type: "DETR_RESULT",
        ok: false,
        detections: [],
        description: "error capturing or describing screen.",
        screenshotDataUrl: null,
      };

      if (tabId) await sendResultToTab(tabId, payload);

      sendResponse({
        ok: false,
        description: "error capturing or describing screen.",
      });
    }
  });

  return true; // keeps async response channel open
});
