// Import the chrome variable

const API_URL_KEY = "jobTrackerApiUrl"
const DEFAULT_API_URL = "http://localhost:3000"

let apiUrl = DEFAULT_API_URL

// Load the saved URL before checking authentication. This avoids an initial
// request to localhost when Chrome storage has not finished loading yet.
chrome.storage.sync.get([API_URL_KEY], (result) => {
  apiUrl = result[API_URL_KEY] || DEFAULT_API_URL
  checkAuth()
})

// Check authentication status
async function checkAuth() {
  const loginPrompt = document.getElementById("loginPrompt")
  const jobForm = document.getElementById("jobForm")
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl}/api/auth/session`, { credentials: "include" })
      if (!response.ok) throw new Error(`Server returned ${response.status}`)
      const data = await response.json()
      if (data.authenticated) {
        loginPrompt.style.display = "none"
        jobForm.style.display = "block"
        autofill()
        return true
      }
      lastError = new Error("Not signed in")
    } catch (error) {
      lastError = error
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 350))
  }

  loginPrompt.style.display = "block"
  jobForm.style.display = "none"
  const message = lastError?.message === "Not signed in"
    ? "Sign in to your Job Tracker, then reopen this popup."
    : "Could not connect after three attempts. Check the Site URL."
  showStatus("error", message)
  return false
}

// Show status message
function showStatus(type, message) {
  const statusEl = document.getElementById("status")
  statusEl.className = `status ${type}`
  statusEl.textContent = message
  statusEl.style.display = "block"

  if (type === "success") {
    setTimeout(() => {
      statusEl.style.display = "none"
    }, 3000)
  }
}

async function autofill() {
  const autofillBtn = document.getElementById("autofillBtn")
  try {
    autofillBtn.disabled = true
    autofillBtn.textContent = "Analyzing page…"
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    document.getElementById("url").value = tab.url

    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: "extractJobInfo" }, (result) => {
        if (chrome.runtime.lastError) return resolve(null)
        resolve(result)
      })
    })

    if (!response?.success) {
      showStatus("info", "This page could not be read. URL filled.")
      return
    }

    fillFields(response.data)
    const aiResponse = await fetch(`${apiUrl}/api/jobs/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        url: tab.url,
        title: response.data.pageTitle,
        extracted: {
          company: response.data.company,
          position: response.data.position,
          location: response.data.location,
          role_type: response.data.role_type,
          posted_date: response.data.posted_date,
          salary: response.data.salary,
          description: response.data.description,
        },
      }),
    })

    if (aiResponse.ok) {
      const result = await aiResponse.json()
      fillFields(result.data)
      showStatus("success", "Job details parsed with AI")
    } else {
      const result = await aiResponse.json().catch(() => ({}))
      let message = result.error || `AI parsing failed (${aiResponse.status})`
      if (aiResponse.status === 401) {
        message = `Sign in at ${apiUrl} in Chrome, then try AI auto-fill again.`
      } else if (aiResponse.status === 503) {
        message = "GEMINI_API_KEY is unavailable on the deployed server. Check the Vercel environment and redeploy."
      }
      showStatus("error", message)
    }
  } catch {
    showStatus("error", "Could not auto-fill from this page")
  } finally {
    autofillBtn.disabled = false
    autofillBtn.textContent = "Analyze page"
  }
}

function fillFields(data) {
  const mapping = { company: "company", position: "position", location: "location", role_type: "role_type", posted_date: "posted_date", salary: "salary", summary: "notes" }
  for (const [field, elementId] of Object.entries(mapping)) {
    if (data?.[field]) {
      const element = document.getElementById(elementId)
      element.value = data[field]
      element.classList.add("is-filled")
    }
  }
}

// Auto-fill form from current page
document.getElementById("autofillBtn").addEventListener("click", autofill)

// Handle form submission
document.getElementById("addJobForm").addEventListener("submit", async (e) => {
  e.preventDefault()

  const submitBtn = document.getElementById("submitBtn")
  submitBtn.disabled = true
  submitBtn.textContent = "Adding..."

  const formData = {
    company: document.getElementById("company").value,
    position: document.getElementById("position").value,
    url: document.getElementById("url").value || null,
    location: document.getElementById("location").value || null,
    role_type: document.getElementById("role_type").value,
    posted_date: document.getElementById("posted_date").value || null,
    salary: document.getElementById("salary").value || null,
    notes: document.getElementById("notes").value || null,
  }

  try {
    const response = await fetch(`${apiUrl}/api/jobs/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(formData),
    })

    const data = await response.json()

    if (response.ok) {
      showStatus("success", "Job added to tracker!")
      document.getElementById("addJobForm").reset()
      document.querySelectorAll(".is-filled").forEach((element) => element.classList.remove("is-filled"))
    } else {
      if (response.status === 401) {
        showStatus("error", "Please log in to your job tracker")
        document.getElementById("loginPrompt").style.display = "block"
        document.getElementById("jobForm").style.display = "none"
      } else {
        showStatus("error", data.error || "Failed to add job")
      }
    }
  } catch {
    showStatus("error", "Failed to connect to job tracker")
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = "Add to Tracker"
  }
})

// Open dashboard button
document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: `${apiUrl}/dashboard` })
})

// Settings link
document.getElementById("settingsLink").addEventListener("click", (e) => {
  e.preventDefault()
  const newUrl = prompt("Enter your Job Tracker URL:", apiUrl)
  if (newUrl) {
    apiUrl = newUrl
chrome.storage.sync.set({ [API_URL_KEY]: newUrl }, () => {
      showStatus("success", "API URL updated!")
      document.getElementById("loginPrompt").style.display = "none"
      document.getElementById("jobForm").style.display = "block"
      checkAuth()
    })
  }
})
