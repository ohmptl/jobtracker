import { createRoot } from "react-dom/client";
import { useState } from "react";
import { JobBrowser, type JobPage } from "../../components/job-browser";
import { ActivityFeed } from "../../components/activity-feed";
import { TrackerSettings } from "../../components/tracker-settings";
import { DashboardSidebar } from "../../components/dashboard-sidebar";
import { ThemeProvider } from "../../components/theme-provider";
import type { Job } from "../../lib/tracker/schemas";

const job: Job = {
  id: "11111111-1111-4111-8111-111111111111",
  company: "Advanced Hardware Labs",
  position: "2027 New Graduate Silicon Validation Engineer",
  status: "jobs_found",
  role_type: "full_time",
  location: "Austin, TX",
  url: "https://example.com/job?id=1",
  added_date: "2026-10-22T12:00:00Z",
  updated_at: "2026-10-22T12:00:00Z",
  notes: "Technical hardware work.",
  priority: "strategic",
  protected: false,
  availability: "not_checked",
  evaluation_reason: "Relevant early-career engineering opportunity.",
  deleted_at: null,
  purge_after: null,
  previous_status: null,
  review_flags: [],
  last_verified_at: null,
  applied_date: null,
  application_deadline: null,
  next_action_at: null,
};
const initialPage: JobPage = {
  jobs: [job],
  total: 1,
  has_more: false,
  next_cursor: null,
};
function Harness() {
  const [tab, setTab] = useState<"jobs" | "deleted" | "feed" | "settings">(
    "jobs",
  );
  const [deleted] = useState(() => ({
    ...job,
    status: "jobs_deleted" as const,
    deleted_at: new Date().toISOString(),
    purge_after: new Date(Date.now() + 30 * 86400000).toISOString(),
  }));
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <div className="min-h-svh bg-muted/20">
        <DashboardSidebar email="fixture@example.com" />
        <main className="pt-16 md:pl-64">
          <div className="mx-auto max-w-[1600px] space-y-5 p-4">
            <h1 className="text-3xl font-semibold">Job Tracker</h1>
            <nav className="flex flex-wrap gap-2">
              {(["jobs", "deleted", "feed", "settings"] as const).map((t) => (
                <button
                  className="min-h-11 rounded-lg border px-4"
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            {tab === "jobs" && (
              <JobBrowser key="jobs" initialPage={initialPage} />
            )}
            {tab === "deleted" && (
              <JobBrowser
                key="deleted"
                initialPage={{ ...initialPage, jobs: [deleted] }}
                view="deleted"
              />
            )}
            {tab === "feed" && (
              <ActivityFeed
                initialPage={{
                  events: [
                    {
                      id: "event1",
                      occurred_at: "2026-10-22T12:00:00Z",
                      actor_type: "ai_agent",
                      actor_label: "Unknown registered client",
                      client_id: "client-id",
                      action: "added",
                      job_id: job.id,
                      company: job.company,
                      position: job.position,
                      reason: null,
                      batch_id: "batch1",
                      previous_status: null,
                      new_status: "jobs_found",
                    },
                  ],
                  has_more: false,
                  next_cursor: null,
                }}
              />
            )}
            {tab === "settings" && (
              <TrackerSettings
                initialSettings={{
                  policy: {
                    version: 1,
                    ai_deletion: true,
                    automatic_expiration: true,
                    tombstone_days: 120,
                    technical_domains: ["ASIC", "FPGA"],
                    internship_standard:
                      "Preserve strategic hardware internships",
                  },
                  companies: [
                    {
                      id: "registry1",
                      name: "NVIDIA",
                      aliases: ["Nvidia Corporation"],
                      protected: true,
                    },
                  ],
                  clients: [],
                }}
              />
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
