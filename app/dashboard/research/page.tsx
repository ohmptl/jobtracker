import { redirect } from "next/navigation"
import { JobsFoundList, type FoundJob } from "@/components/jobs-found-list"
import { createClient } from "@/lib/supabase/server"

export default async function ResearchPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect("/auth/login")

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id,company,position,status,url,role_type,salary,posted_date,added_date,applied_date,notes")
    .eq("user_id", data.user.id)
    .in("status", ["jobs_found", "jobs_snoozed", "jobs_deleted"])
    .order("added_date", { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">AI Jobs Found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review roles ChatGPT found before moving them into your application pipeline.
        </p>
      </div>
      <JobsFoundList initialJobs={(jobs || []) as FoundJob[]} />
    </div>
  )
}
