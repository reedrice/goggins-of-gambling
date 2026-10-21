// Only a human toolbar click opens the panel. No alarms, startup or network jobs.
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('panel.html')}));
