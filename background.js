// Enable side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url) return;

  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "ui/sidepanel.html",
    enabled: true,
  });

  await chrome.sidePanel.open({ tabId: tab.id });
});


