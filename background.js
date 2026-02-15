// background.js (MV3 service worker)

console.log("BACKGROUND RUNNING - DETR + ELEVENLABS - feb14");

// --------------------
// Hugging Face DETR
// --------------------
const DETR_API_KEY = "Bearer hf_YOUR_HF_TOKEN_HERE";
const DETR_API_URL =
  "https://router.huggingface.co/hf-inference/models/facebook/detr-resnet-50";

// --------------------
// ElevenLabs TTS
// --------------------
const ELEVEN_API_KEY = "sk_YOUR_ELEVENLABS_KEY_HERE";
const ELEVEN_VOICE_ID = "YOUR_VOICE_ID_HERE";
const ELEVEN_MODEL_ID = "eleven_multilingual_v2";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // ---- DETR flow ----
      if (msg?.type === "CAPTURE_SCREEN") {
        const tabId = sender?.tab?.id;
        const windowId = sender?.tab?.windowId;

        if (!tabId || windowId == null) throw new Error("No active tab info found.");

        await safeSend(tabId, { type: "SHOW_SCANNING", message: "scanning screen…" });

        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
        if (!dataUrl) throw new Error("Screenshot capture failed.");

        const detections = await runDetr(dataUrl);

        // option B behavior: content script hides scan when results arrive
        await safeSend(tabId, { type: "DETR_RESULT", detections });

        sendResponse({ ok: true, detections });
        return;
      }

      // ---- ElevenLabs flow ----
      if (msg?.type === "SPEAK_TEXT") {
        const text = String(msg?.text || "").trim();
        if (!text) {
          sendResponse({ ok: false, error: "No text provided." });
          return;
        }

        const voiceId = msg.voiceId || ELEVEN_VOICE_ID;
        const audioB64 = await elevenTtsToBase64(text, { voiceId });

        sendResponse({ ok: true, audioB64 });
        return;
      }
    } catch (err) {
      console.error("background error:", err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true;
});

// --------------------
// DETR with retry for warmup
// --------------------
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

// --------------------
// ElevenLabs: text -> mp3 -> base64
// --------------------
async function elevenTtsToBase64(text, { voiceId }) {
  if (!ELEVEN_API_KEY || ELEVEN_API_KEY.includes("YOUR_ELEVEN")) {
    throw new Error("Missing ElevenLabs API key in background.js");
  }
  if (!voiceId || voiceId.includes("YOUR_VOICE")) {
    throw new Error("Missing ElevenLabs voice id in background.js");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVEN_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: ELEVEN_MODEL_ID,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`elevenlabs failed: ${resp.status} ${errText}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  return arrayBufferToBase64(arrayBuf);
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function safeSend(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {}
}
