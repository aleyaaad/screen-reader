//tells you when/if the content script loads
console.log("Content script loaded!");
//variable for counting clicks
let clickCount = 0;
//resets clickCount if user doesn'y click fast enough
let clickTimer = null;

/**
 * document.addEventListener("click", callback) tells the 
 * page to run this func whenever the user clicks anywhere
 * event reps the click
 * 
 * sets logic to reset clickCount after 
 * the 1st click if the user doesn't tap fast enough
 * 
 */
document.addEventListener("click", function(event) {
    clickCount++;

    if (clickCount === 1) {
        clickTimer = setTimeout(function() {
            clickCount = 0;
        }, 400);
    }
//clicks reach 2 before 400ms = double click.

    if (clickCount === 2) {
        clearTimeout(clickTimer);
        clickCount = 0;

      //sends message to background.js to capture the screen once a double tap is detected
        chrome.runtime.sendMessage({ type: "CAPTURE_SCREEN" });
    }
});
