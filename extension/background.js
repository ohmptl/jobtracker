// Background service worker

// Listen for extension installation
const chrome = window.chrome // Declare the chrome variable
chrome.runtime.onInstalled.addListener(() => {
  console.log("Job Tracker Extension installed")
})

// Optional: Add context menu item to quickly add jobs
chrome.contextMenus.create({
  id: "addToJobTracker",
  title: "Add to Job Tracker",
  contexts: ["page", "link"],
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "addToJobTracker") {
    chrome.action.openPopup()
  }
})
