
//the key helps prove who we are while the url is where the image is getting sent
const BLIP_API_KEY = "Bearer YOUR_HF_TOKEN_HERE";
const API_URL =
  "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large";

// this converts the screenshot (dataURL format) into a real image file (Blob)
// so we can send it properly to the BLIP API
function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*);base64/)?.[1] || "image/png";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

//asks blip to describe the image and returns text descrip
async function askBlipToDescribe(imageDataUrl) {
  try {
    const blob = dataUrlToBlob(imageDataUrl);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: BLIP_API_KEY,
        
      },
      body: blob,
    });

    // if HF returns an error, it often still returns JSON
    const result = await response.json();

    // common success shape: [{ generated_text: "..." }]
    if (Array.isArray(result) && result[0]?.generated_text) {
      return result[0].generated_text;
    }

    // common error shape: { error: "...", estimated_time: ... }
    if (result?.error) {
      console.error("HF error response:", result);
      return `blip error: ${result.error}`;
    }

    return "BLIP did not return a description.";
  } catch (error) {
    console.error("BLIP API Error:", error);
    return "Sorry, i had trouble seeing that.";
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type !== "CAPTURE_SCREEN") return;

  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    try {
      if (!dataUrl) {
        sendResponse({ description: "failed to capture screenshot." });
        return;
      }

      const description = await askBlipToDescribe(dataUrl);
      sendResponse({ description });
    } catch (err) {
      console.error("capture/describe error:", err);
      sendResponse({ description: "error capturing or describing screen." });
    }
  });

  return true; // keep channel open for async sendResponse
});
