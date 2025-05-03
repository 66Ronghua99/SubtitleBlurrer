// This handles the extension icon click

// Listen for extension icon click
chrome.action.onClicked.addListener((tab) => {
    // Send message to the content script in the active tab
    chrome.tabs.sendMessage(tab.id, { action: 'toggleBlurScriptUI' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
        } else if (response && response.success) {
            console.log('Successfully toggled BlurScript UI');
        }
    });
});