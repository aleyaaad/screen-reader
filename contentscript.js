// tells you when/if the content script loads
console.log("content script loaded!");

// use the browser's real double click event (less buggy than manual click counting)
document.addEventListener("dblclick", () => {
  chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" }, (res) => {
    // this happens a lot during dev when you reload the extension
    if (chrome.runtime.lastError) {
      console.warn("extension reloaded. refresh the page:", chrome.runtime.lastError.message);
      return;
    }

    console.log("response from background:", res);

    const text = res?.description || "no description returned";

    // quick on-screen toast so you can SEE it working
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
});
