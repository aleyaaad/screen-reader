console.log("content script loaded!");

const test = document.createElement("div");
test.textContent = "INJECTION WORKING ✅";
test.style.cssText = `
  position: fixed;
  top: 40px;
  left: 40px;
  z-index: 999999999;
  background: red;
  color: white;
  padding: 20px;
  font-size: 20px;
  border-radius: 12px;
`;
document.documentElement.appendChild(test);
