chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url) return;

  const isLeetCode =
    tab.url.startsWith("https://leetcode.com") ||
    tab.url.startsWith("http://leetcode.com");

  if (!isLeetCode) {
    // Only show the side panel when the user is on a LeetCode tab.
    return;
  }

  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "ui/sidepanel.html",
    enabled: true,
  });

  await chrome.sidePanel.open({ tabId: tab.id });
});


