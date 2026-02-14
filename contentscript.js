console.log("Content script loaded!");

document.addEventListener("click", function(event) {
    if (event.target.tagName === "IMG") {
        console.log("Image clicked! URL:", event.target.src);
    }
});