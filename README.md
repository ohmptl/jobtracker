# Job Tracker Web App

A job application and research pipeline built for both people and AI agents.

## Features

- **Authentication**: Secure sign up and login with Supabase Auth
- **Dark Mode**: Toggle between light and dark themes
- **Three Categories**: 
  - To Apply: Jobs you're planning to apply to
  - Applications: Jobs you've applied to and are in progress
  - Rejections: Track rejected applications
- **Search & Filter**: Search by company/position and filter by status
- **Sorting**: Sort by date, company, or position
- **Resume Upload**: Attach your resume to each application (PDF, DOC, DOCX)
- **Statistics Page**: Track your application metrics and insights
- **Browser Extension**: Quickly add jobs while browsing (Chrome)
- **Research Queue**: Keep agent-discovered roles separate until you approve them
- **Agent API**: Revocable API keys, bulk ingestion, deduplication, saved filters, and OpenAPI discovery
- **AI Parsing**: Optional server-side Gemini parsing for the browser extension
- **Responsive Sidebar**: Unified navigation across applications, research, statistics, and settings

## Setup Instructions

### 1. Database Setup

Run the SQL scripts in order in your Supabase project:

1. `scripts/001_create_tables.sql` - Creates the jobs table with RLS policies
2. `scripts/002_add_resume_column.sql` - Adds resume storage column
3. `scripts/003_setup_storage.sql` - Sets up Supabase Storage bucket for resumes
4. `scripts/004_agent_research.sql` - Adds the research queue metadata, filters, and agent API keys

You can run these directly in your Supabase SQL editor.

### 2. Environment Variables

The following environment variables need to be configured in your project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, required for the agent API)
- `GEMINI_API_KEY` (server-only, optional, enables extension AI parsing)
- `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)

Copy `.env.example` to `.env.local` and fill in the values. Never expose the service-role or Gemini keys through `NEXT_PUBLIC_` variables.

### 3. Agent API

1. Open **Agent settings** in the dashboard.
2. Save your research filters.
3. Create an API key and copy it immediately; only its hash is stored.
4. Give the agent the OpenAPI URL shown on the page (`/api/v1/openapi`) and the key.

Agent requests use `Authorization: Bearer jt_live_...`. A typical research run first calls `GET /api/v1/research-profile`, researches matching roles, then sends up to 100 roles to `POST /api/v1/jobs`. Duplicate URLs are skipped and new roles enter the `researched` queue.

### 4. Browser Extension Setup

To use the Chrome extension:

1. Download the extension folder from your project
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension` folder
5. The extension icon will appear in your toolbar
6. Click the icon to add jobs while browsing job sites

The extension will auto-detect job information from common job boards and allow you to quickly add them to your tracker.

## Usage

### Main Dashboard

- **Add Job**: Click the "Add Job" button to manually add a new job application
- **Search**: Use the search bar to find specific companies or positions
- **Filter**: Filter by application status
- **Sort**: Sort by date (newest first), company name, or position

### Job Actions

Right-click or click the menu button on any job to:
- Open the job posting URL
- Edit job details
- Upload/replace resume
- View attached resume
- Change application status
- Delete the job

### Statistics

Click "Statistics" in the header to view:
- Total applications and conversion rates
- Success and rejection rates
- Application frequency insights
- Top companies you've applied to
- Visual status breakdown

### Resume Storage

You can upload resumes for each application. Files are stored securely in Supabase Storage and are accessible only to you. This helps you quickly reference which version of your resume you used for each application, especially useful for interview preparation.

**Storage Considerations:**
- Supabase free tier includes 1GB of storage
- Typical resume PDFs are 100-500KB
- You can store approximately 2,000-10,000 resumes in the free tier
- Consider deleting old resumes from rejected applications to save space

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Deployment**: Vercel

## Project Structure

```
├── app/
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main dashboard and statistics
│   └── api/              # API routes for browser extension
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   ├── jobs-table.tsx   # Main jobs table with filtering
│   ├── add-job-dialog.tsx
│   ├── edit-job-dialog.tsx
│   ├── theme-toggle.tsx
│   └── logout-button.tsx
├── lib/
│   └── supabase/        # Supabase client configuration
├── scripts/             # Database migration scripts
└── extension/           # Chrome browser extension
```

## Browser Extension Features

The extension includes:
- AI-assisted normalization through a server-side Gemini integration
- Privacy-scoped extraction of JobPosting JSON-LD and known description elements
- Quick add button with pre-filled information
- Manual entry option for any job posting
- Direct integration with your job tracker

Supported job sites with auto-detection:
- LinkedIn
- Indeed
- Glassdoor
- And more (extensible)

## Tips for Best Results

1. **Regular Updates**: Update job statuses as they change
2. **Add Notes**: Include interview dates, contact names, and other relevant info
3. **Upload Resumes**: Attach the resume you used for quick reference before interviews
4. **Review Statistics**: Check your stats weekly to stay motivated and adjust your strategy
5. **Use the Extension**: Add jobs as you find them to build your pipeline

## Support

For issues or questions, please refer to the Vercel support at vercel.com/help.
