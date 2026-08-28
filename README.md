# Job Tracker Web App

A personal job application tracker with a small MCP server for ChatGPT.

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
- **Jobs Found**: Keep ChatGPT-discovered roles separate until you approve them
- **MCP Server**: Let ChatGPT list, add, and update jobs directly
- **AI Parsing**: Optional server-side Gemini parsing for the browser extension
- **Responsive Sidebar**: Unified navigation across applications, research, statistics, and settings

## Setup Instructions

### 1. Database Setup

Run `scripts/000_master_setup.sql` in the Supabase SQL editor.

The first successful run deletes old Job Tracker data and obsolete application tables, then creates the current schema. Your Supabase Auth user is preserved. A persistent migration marker makes later runs non-destructive: rerunning the same script only adds missing schema and refreshes indexes, policies, and triggers.

### 2. Environment Variables

The following environment variables need to be configured in your project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by MCP)
- `MCP_USER_ID` (your Supabase Auth user UUID)
- `MCP_SECRET` (a random secret of at least 32 characters)
- `GEMINI_API_KEY` (server-only, optional, enables extension AI parsing)
- `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)

Copy `.env.example` to `.env.local` and fill in the values. Never expose the service-role or Gemini keys through `NEXT_PUBLIC_` variables.

### 3. ChatGPT MCP Connection

1. Deploy the application to a public HTTPS URL.
2. Open **MCP connection** in the dashboard and copy the private MCP URL.
3. In ChatGPT, enable developer mode and create an MCP connection using that URL.
4. Confirm that ChatGPT discovers `list_jobs`, `add_job_found`, and `update_job`.
5. Test your research prompt manually, then schedule it in ChatGPT with the MCP connection enabled.

The application stores no research filters, agent prompts, or schedules. Those remain in ChatGPT. The private URL is a single-user capability URL; rotate `MCP_SECRET` to revoke it. For a shared or public application, replace this with OAuth 2.1.

The endpoint implements MCP Streamable HTTP through the official TypeScript SDK. Test it locally with MCP Inspector using `http://localhost:3000/mcp/<your-secret>`.

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
│   ├── api/               # Internal routes used by the browser extension
│   └── mcp/               # ChatGPT MCP endpoint
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
