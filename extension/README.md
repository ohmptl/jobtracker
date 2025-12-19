# Job Tracker Browser Extension

A browser extension to quickly add job postings to your job tracker application.

## Features

- Quick job addition from any webpage
- Auto-fill job details from the current page
- Manual entry for complete control
- Supports custom API URL configuration
- Works with Chrome, Edge, and other Chromium-based browsers

## Installation

### Development Mode

1. Download or clone the extension folder
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `extension` folder
6. The extension icon should appear in your toolbar

### Configuration

1. Click the extension icon in your toolbar
2. Click "Configure API URL" 
3. Enter your Job Tracker URL (default: `http://localhost:3000`)
4. Make sure you're logged into your Job Tracker account

## Usage

### Quick Add

1. Navigate to a job posting page
2. Click the extension icon
3. Click "Auto-fill" to extract job details from the page
4. Review and edit the information
5. Click "Add to Tracker"

### Manual Add

1. Click the extension icon
2. Fill in the job details manually
3. Click "Add to Tracker"

## Supported Job Sites

The extension works on any website, but auto-fill works best on popular job boards like:

- LinkedIn
- Indeed
- Glassdoor
- AngelList
- Company career pages

## Troubleshooting

### Extension can't connect

- Make sure your Job Tracker app is running
- Check that the API URL is correct in settings
- Ensure you're logged into your Job Tracker account

### Auto-fill not working

- Try clicking "Auto-fill" after the page fully loads
- Some sites may not support auto-detection
- You can always fill in details manually

## Privacy

This extension:
- Only sends data to your configured Job Tracker URL
- Does not collect or share any personal information
- Runs entirely locally with your own backend
- Requires explicit permission to access page content

## Support

For issues or feature requests, please contact the Job Tracker app developer.
