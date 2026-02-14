//actively waits for messages from cs.
//reque: obj., sender:tab info, sendR:allows a reply back
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    //ensures message is a screen capture
    if (request.type === "CAPTURE_SCREEN") {
        
        /**
         * "chrome.tabs.captureVisibleTab" is part of chrome's tabs api
         * only works for chrome - screenshots the tab, returns image 
         * as data URL: long string reps the pic
         * 
         * currently formats the pic as a png, could be changed to jpeg (only 2 blip accepts)
         * 
         * after chrome gets photo, then converts it 
         * into text(base64) and stores this into dataurl.
         * 
         */
        chrome.tabs.captureVisibleTab(null, { format: "png" }, function(dataUrl) {
            //confirms ss and logs the ss data
            console.log("Screenshot captured!");
            console.log(dataUrl);

            //later - send dataurl to blip/another api to be described (current placeholder)
        });
    }
});


