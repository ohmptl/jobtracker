import { redirect } from "next/navigation"
import { JobsFoundList, type FoundJob } from "@/components/jobs-found-list"
import { createClient } from "@/lib/supabase/server"

export default async function ResearchPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect("/auth/login")

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id,company,position,url,location,salary,notes")
    .eq("user_id", data.user.id)
    .eq("status", "jobs_found")
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Jobs Found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review roles ChatGPT found before moving them into your application pipeline.
        </p>
      </div>
      <JobsFoundList initialJobs={(jobs || []) as FoundJob[]} />
    </div>
  )
}
