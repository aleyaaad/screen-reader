const tokenEl = document.getElementById("token");
const statusEl = document.getElementById("status");

chrome.storage.local.get(["hfToken"], ({ hfToken }) => {
  if (hfToken) tokenEl.value = hfToken;
});

document.getElementById("save").addEventListener("click", async () => {
  const hfToken = tokenEl.value.trim();
  await chrome.storage.local.set({ hfToken });
  statusEl.textContent = "saved!";
});
