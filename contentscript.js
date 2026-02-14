console.log("content script loaded!");

document.addEventListener("dblclick", () => {
  try {
    chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("extension reloaded. refresh the page:", chrome.runtime.lastError.message);
        return;
      }

      const text = res?.description || "no description returned";
      console.log("response from background:", res);

      const box = document.createElement("div");
      box.textContent = text;
      box.style.position = "fixed";
      box.style.bottom = "20px";
      box.style.left = "20px";
      box.style.zIndex = "999999";
      box.style.padding = "12px 14px";
      box.style.borderRadius = "10px";
      box.style.background = "rgba(0,0,0,0.85)";
      box.style.color = "white";
      box.style.maxWidth = "420px";
      box.style.fontSize = "14px";
      box.style.lineHeight = "1.3";
      document.body.appendChild(box);

      setTimeout(() => box.remove(), 6000);
    });
  } catch (e) {
    console.warn("content script context died. refresh the page.");
  }
});
