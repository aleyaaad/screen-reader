// background.js (manifest v3 service worker)

// NOTE: do NOT commit a real token to github
// locally, replace YOUR_HF_TOKEN_HERE with your real token
const BLIP_API_KEY = "Bearer YOUR_HF_TOKEN_HERE";

const BLIP_URL =
  "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

// dataURL -> Blob (works in service worker, no Image(), no document)
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// sends screenshot to BLIP and returns a text description
async function askBlipToDescribe(dataUrl) {
  try {
    const blob = await dataUrlToBlob(dataUrl);

    const response = await fetch(BLIP_URL, {
      method: "POST",
      headers: {
        Authorization: BLIP_API_KEY,
      },
      body: blob,
    });

    // read raw text first so we can debug any non-json responses
    const rawText = await response.text();
    console.log("BLIP status:", response.status);
    console.log("BLIP raw response:", rawText);

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      return "blip returned a non-json response.";
    }

    // handle non-200 responses (auth errors, model loading, etc)
    if (!response.ok) {
      const msg = result?.error || `http ${response.status}`;
      return `blip failed: ${msg}`;
    }

    // success shape: [{ generated_text: "..." }]
    if (Array.isArray(result) && result[0]?.generated_text) {
      return result[0].generated_text;
    }

    // sometimes error shape still appears even with ok
    if (result?.error) {
      return `blip error: ${result.error}`;
    }

    return "blip did not return a description.";
  } catch (err) {
    console.error("askBlipToDescribe crashed:", err);
    return `blip failed: ${err?.message || err}`;
  }
}

// listens for messages from contentscript.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "CAPTURE_SCREEN") return;

  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    try {
      if (!dataUrl) {
        sendResponse({ ok: false, description: "failed to capture screenshot." });
        return;
      }

      const description = await askBlipToDescribe(dataUrl);
      sendResponse({ ok: true, description });
    } catch (err) {
      console.error("capture/describe failed:", err);
      sendResponse({
        ok: false,
        description: "error capturing or describing screen.",
      });
    }
  });

  return true; // keeps the message channel open for async sendResponse
});
