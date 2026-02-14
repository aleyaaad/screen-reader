console.log("BACKGROUND RUNNING - DETR VERSION - feb14");

// manifest v3 service worker

// IMPORTANT:
// hf-inference does NOT support BLIP image captioning, so we use DETR object detection instead.
// this endpoint IS supported on hf-inference.
const DETR_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50";

// get token from chrome storage (saved from your options page)
async function getHfToken() {
  const { hfToken } = await chrome.storage.local.get(["hfToken"]);
  return hfToken; // should look like "hf_xxxxx"
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

  // keep only decent-confidence detections
  const good = detections
    .filter((d) => (d?.score ?? 0) >= 0.4 && d?.label)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);

  if (good.length === 0) {
    return "i saw some shapes but nothing confident enough to name.";
  }

  // count labels
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

// send screenshot to DETR and return description
async function askDetrToDescribe(dataUrl) {
  try {
    const hfToken = await getHfToken();
    if (!hfToken) {
      return "no huggingface token saved. open extension options and add one.";
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
      return "detr returned a non-json response.";
    }

    if (!response.ok) {
      const msg = result?.error || `http ${response.status}`;
      return `detr failed: ${msg}`;
    }

    // success shape for object detection is usually an array of detections:
    // [{ score: 0.98, label: "person", box: {xmin, ymin, xmax, ymax}}, ...]
    return detectionsToSentence(result);
  } catch (err) {
    console.error("askDetrToDescribe crashed:", err);
    return `detr failed: ${err?.message || err}`;
  }
}

// listen for content script messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "CAPTURE_SCREEN") return;

  console.log("background got message:", request);

  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    try {
      console.log("captureVisibleTab ran. has dataUrl:", !!dataUrl);

      if (!dataUrl) {
        sendResponse({ ok: false, description: "failed to capture screenshot." });
        return;
      }

      const description = await askDetrToDescribe(dataUrl);
      sendResponse({ ok: true, description });
    } catch (err) {
      console.error("capture/describe failed:", err);
      sendResponse({
        ok: false,
        description: "error capturing or describing screen.",
      });
    }
  });

  return true; // keeps async response channel open
});
