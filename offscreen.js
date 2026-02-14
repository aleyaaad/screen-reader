// background.js cant make sound so this file recieves a message from background.js to play and audio

/**
 * this will allow for the script to wait for messages sent by other parts of the extension (background.js)
 * message is the variable that holds the actual data - audio file/ instructions
 * async makes the script not rush and wait for audio to play
 * 
 */
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') {
    return;
  }

  /**
   * if the message the script gets is to play audio, 
   * then it will have a list of steps to follow
   */
  if (message.type === 'PLAY_AUDIO') {
    const audio = new Audio(message.data);
    await audio.play();
  }
});