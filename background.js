// background.js (manifest v3 service worker)

const BLIP_URL =
  "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

// get token from chrome storage
async function getHfToken() {
  const { hfToken } = await chrome.storage.local.get(["hfToken"]);
  return hfToken; // should look like "hf_xxxxx"
}

// convert screenshot dataURL -> Blob (service worker safe)
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

// send image to BLIP and return description
async function askBlipToDescribe(dataUrl) {
  try {
    const hfToken = await getHfToken();

    if (!hfToken) {
      return "no huggingface token saved. open extension options and add one.";
    }

    const blob = await dataUrlToBlob(dataUrl);

    const response = await fetch(BLIP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
      },
      body: blob,
    });

    const rawText = await response.text();
    console.log("BLIP status:", response.status);
    console.log("BLIP raw response:", rawText);

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      return "blip returned a non-json response.";
    }

    if (!response.ok) {
      const msg = result?.error || `http ${response.status}`;
      return `blip failed: ${msg}`;
    }

    if (Array.isArray(result) && result[0]?.generated_text) {
      return result[0].generated_text;
    }

    if (result?.error) {
      return `blip error: ${result.error}`;
    }

    return "blip did not return a description.";
  } catch (err) {
    console.error("askBlipToDescribe crashed:", err);
    return `blip failed: ${err?.message || err}`;
  }
}

// listen for content script messages
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

  return true; // IMPORTANT: keeps async response channel open
});
