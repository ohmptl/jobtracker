import { redirect } from "next/navigation"
import { ResearchedJobsList, type ResearchedJob } from "@/components/researched-jobs-list"
import { createClient } from "@/lib/supabase/server"

export default async function ResearchPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) redirect("/auth/login")

  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      "id,company,position,url,location,salary,notes,job_description,source,match_score,match_reasons,discovered_at",
    )
    .eq("user_id", data.user.id)
    .eq("status", "researched")
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Research queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review roles discovered by your agents before adding them to your application pipeline.
        </p>
      </div>
      <ResearchedJobsList initialJobs={(jobs || []) as ResearchedJob[]} />
    </div>
  )
}
