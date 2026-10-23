import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
import { JobBrowser } from "@/components/job-browser";
export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const deleted = view === "deleted";
  const db = await createClient();
  const page = await execute({ db }, "list_jobs", {
    statuses: deleted ? ["jobs_deleted"] : ["jobs_found", "jobs_snoozed"],
    page_size: 30,
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">
        {deleted ? "Deleted" : "Jobs Found"}
      </h1>
      <p className="text-muted-foreground">
        {deleted
          ? "Recover removed opportunities for 30 days."
          : "Review engineering roles for your 2027 career step."}
      </p>
      <nav className="flex flex-wrap gap-4">
        <Link
          className="min-h-11 rounded-lg border px-4 py-3"
          href="/dashboard/research"
        >
          Jobs Found / Snoozed
        </Link>
        <Link
          className="min-h-11 rounded-lg border px-4 py-3"
          href="/dashboard/research?view=deleted"
        >
          Deleted
        </Link>
        <Link
          className="min-h-11 rounded-lg border px-4 py-3"
          href="/dashboard/cleanup"
        >
          Cleanup review
        </Link>
      </nav>
      <JobBrowser
        key={view || "found"}
        initialPage={page}
        view={deleted ? "deleted" : "research"}
      />
    </div>
  );
}
