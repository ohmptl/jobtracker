// Content script to extract job information from the current page

const chrome = window.chrome

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractJobInfo") {
    const jobInfo = extractJobInformation()
    sendResponse({ success: true, data: jobInfo })
  }
  return true
})

function extractJobInformation() {
  const info = {
    company: null,
    position: null,
    location: null,
    salary: null,
  }

  // Try to extract company name
  const companySelectors = [
    'meta[property="og:site_name"]',
    '[class*="company" i][class*="name" i]',
    "[data-company]",
    ".company-name",
    ".employer-name",
  ]

  for (const selector of companySelectors) {
    const element = document.querySelector(selector)
    if (element) {
      info.company = element.getAttribute("content") || element.textContent.trim()
      if (info.company) break
    }
  }

  // Try to extract position/job title
  const positionSelectors = [
    "h1",
    '[class*="job" i][class*="title" i]',
    "[data-job-title]",
    ".job-title",
    'meta[property="og:title"]',
  ]

  for (const selector of positionSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      info.position = element.getAttribute("content") || element.textContent.trim()
      if (info.position) break
    }
  }

  // Try to extract location
  const locationSelectors = ['[class*="location" i]', "[data-location]", ".job-location"]

  for (const selector of locationSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      const text = element.textContent.trim()
      if (text && text.length < 100) {
        info.location = text
        break
      }
    }
  }

  // Try to extract salary
  const salaryPattern = /\$[\d,]+k?[-–]\$?[\d,]+k?|\$[\d,]+k?/gi
  const bodyText = document.body.innerText
  const salaryMatches = bodyText.match(salaryPattern)

  if (salaryMatches && salaryMatches.length > 0) {
    // Get the first reasonable salary match
    for (const match of salaryMatches) {
      if (match.includes("k") || match.includes(",") || Number.parseInt(match.replace(/\D/g, "")) > 1000) {
        info.salary = match
        break
      }
    }
  }

  return info
}
