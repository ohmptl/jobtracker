import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { JobsTable } from "@/components/jobs-table"
import { AddJobDialog } from "@/components/add-job-dialog"

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .not("status", "in", "(jobs_found,jobs_snoozed,jobs_deleted)")
    .order("added_date", { ascending: false })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage roles you plan to apply to and track their progress.</p>
        </div>
        <AddJobDialog />
      </div>
      <JobsTable initialJobs={jobs ?? []} />
    </div>
  )
}
