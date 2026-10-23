import { notFound } from "next/navigation";
import { z } from "zod";
import { JobBrowser } from "@/components/job-browser";
import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createClient();
  const { data } = await db
    .from("jobs")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const { job } = await execute({ db }, "get_job", { id });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Opportunity details</h1>
      <JobBrowser
        initialPage={{
          jobs: [job],
          total: 1,
          has_more: false,
          next_cursor: null,
        }}
        view={
          job.status === "jobs_deleted"
            ? "deleted"
            : ["jobs_found", "jobs_snoozed"].includes(job.status)
              ? "research"
              : "applications"
        }
      />
    </div>
  );
}
