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
    statuses: deleted ? ["jobs_deleted"] : ["jobs_found"],
    page_size: 30,
  });
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">
        {deleted ? "Deleted" : "Jobs Found"}
      </h1>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          className="rounded-md border px-3 py-2"
          href="/dashboard/research"
        >
          Review opportunities
        </Link>
        <Link
          className="rounded-md border px-3 py-2"
          href="/dashboard/research?view=deleted"
        >
          Deleted
        </Link>
        <Link
          className="rounded-md border px-3 py-2"
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
