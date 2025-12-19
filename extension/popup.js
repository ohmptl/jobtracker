// Import the chrome variable

const API_URL_KEY = "jobTrackerApiUrl"
const DEFAULT_API_URL = "http://localhost:3000"

let apiUrl = DEFAULT_API_URL

// Load API URL from storage
chrome.storage.sync.get([API_URL_KEY], (result) => {
  apiUrl = result[API_URL_KEY] || DEFAULT_API_URL
})

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch(`${apiUrl}/api/auth/session`, {
      credentials: "include",
    })
    const data = await response.json()

    if (data.authenticated) {
      document.getElementById("loginPrompt").style.display = "none"
      document.getElementById("jobForm").style.display = "block"
      autofill()
      return true
    } else {
      document.getElementById("loginPrompt").style.display = "block"
      document.getElementById("jobForm").style.display = "none"
      return false
    }
  } catch (error) {
    showStatus("error", "Cannot connect to job tracker. Please check API URL.")
    document.getElementById("loginPrompt").style.display = "block"
    document.getElementById("jobForm").style.display = "none"
    return false
  }
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
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    // Get current URL
    document.getElementById("url").value = tab.url

    // Try to extract job info from page
    chrome.tabs.sendMessage(tab.id, { action: "extractJobInfo" }, (response) => {
      if (response && response.success) {
        if (response.data.company) {
          document.getElementById("company").value = response.data.company
        }
        if (response.data.position) {
          document.getElementById("position").value = response.data.position
        }
        if (response.data.location) {
          document.getElementById("location").value = response.data.location
        }
        if (response.data.salary) {
          document.getElementById("salary").value = response.data.salary
        }
        showStatus("success", "Auto-filled from page!")
      } else {
        // Just fill the URL if extraction failed
        showStatus("info", "Could not auto-detect job details. URL filled.")
      }
    })
  } catch (error) {
    showStatus("error", "Could not auto-fill from this page")
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
    } else {
      if (response.status === 401) {
        showStatus("error", "Session expired. Please log in again.")
        // Optional: trigger re-auth check
        // checkAuth() 
      } else {
        showStatus("error", data.error || "Failed to add job")
      }
    }
  } catch (error) {
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
      checkAuth()
    })
  }
})

// Check auth on load
checkAuth()
