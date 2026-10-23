import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
import { JobBrowser } from "@/components/job-browser";
import { AddJobDialog } from "@/components/add-job-dialog";
export default async function DashboardPage() {
  const db = await createClient();
  const page = await execute({ db }, "list_jobs", {
    statuses: [
      "to_apply",
      "applied",
      "interviewing",
      "offered",
      "rejected",
      "accepted",
    ],
    page_size: 30,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
        </div>
        <AddJobDialog />
      </div>
      <JobBrowser
        key={page.total + String(page.jobs[0]?.updated_at)}
        initialPage={page}
        view="applications"
      />
    </div>
  );
}
