// Content script to extract job information from the current page

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
    role_type: null,
    posted_date: null,
    salary: null,
    description: null,
    pageTitle: document.title,
  }

  // Prefer the structured JobPosting data published by the job board.
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent)
      const entries = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed]
      const posting = entries.find((entry) => entry?.["@type"] === "JobPosting")
      if (!posting) continue
      info.company ||= posting.hiringOrganization?.name || null
      info.position ||= posting.title || null
      const employmentType = Array.isArray(posting.employmentType) ? posting.employmentType.join(" ") : posting.employmentType
      if (/intern/i.test(employmentType || "")) info.role_type = "internship"
      else if (employmentType) info.role_type = "full_time"
      info.posted_date ||= typeof posting.datePosted === "string" ? posting.datePosted.slice(0, 10) : null
      info.description ||= htmlToText(posting.description || "").slice(0, 12000) || null
      break
    } catch {
      // Ignore malformed structured data and continue with DOM selectors.
    }
  }

  // Try to extract company name
  const companySelectors = [
    'meta[property="og:site_name"]',
    '[class*="company" i][class*="name" i]',
    "[data-company]",
    ".company-name",
    ".employer-name",
    ".topcard__org-name-link", // LinkedIn
    ".job-details-jobs-header__company-url", // LinkedIn
    '[data-test="employer-name"]', // Glassdoor
    '[data-testid="company-name"]', // Indeed
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
    ".top-card-layout__title", // LinkedIn
    ".job-details-jobs-header__job-title", // LinkedIn
    '[data-test="job-title"]', // Glassdoor
    '[data-testid="job-title"]', // Indeed
  ]

  for (const selector of positionSelectors) {
    const element = document.querySelector(selector)
    if (element) {
      info.position = element.getAttribute("content") || element.textContent.trim()
      if (info.position) break
    }
  }

  // Fallback for position if nothing found: use document title
  if (!info.position) {
    const title = document.title
    // Often titles are "Position at Company" or "Position | Company"
    const separators = [" at ", " | ", " - ", " – "]
    for (const sep of separators) {
      if (title.includes(sep)) {
        info.position = title.split(sep)[0].trim()
        break
      }
    }
    if (!info.position) {
      info.position = title // Last resort
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

  if (!info.description) {
    const description = document.querySelector(
      '[class*="job-description" i], [id*="job-description" i], [data-testid*="job-description" i], .description__text',
    )
    info.description = description?.textContent?.trim().slice(0, 12000) || null
  }

  return info
}

function htmlToText(value) {
  const element = document.createElement("div")
  element.innerHTML = value
  return element.textContent?.trim() || ""
}
