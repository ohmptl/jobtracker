import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { JobsTable } from "@/components/jobs-table"
import { AddJobDialog } from "@/components/add-job-dialog"
import { LogoutButton } from "@/components/logout-button"
import { ThemeToggle } from "@/components/theme-toggle"
import Link from "next/link"
import { BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: jobs = [] } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Job Tracker</h1>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/statistics">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Statistics
              </Button>
            </Link>
            <AddJobDialog />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <JobsTable initialJobs={jobs} />
      </main>
    </div>
  )
}
