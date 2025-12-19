import { Badge } from "@/components/ui/badge"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Briefcase, TrendingUp, XCircle, CheckCircle, Clock, Target } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { LogoutButton } from "@/components/logout-button"

type Job = {
  id: string
  status: string
  applied_date: string | null
  created_at: string
  company: string
}

export default async function StatisticsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: jobs = [] } = (await supabase.from("jobs").select("*").eq("user_id", user.id)) as { data: Job[] }

  // Calculate statistics
  const totalJobs = jobs.length
  const toApply = jobs.filter((j) => j.status === "to_apply").length
  const applied = jobs.filter((j) => j.status === "applied").length
  const interviewing = jobs.filter((j) => j.status === "interviewing").length
  const offered = jobs.filter((j) => j.status === "offered").length
  const rejected = jobs.filter((j) => j.status === "rejected").length
  const accepted = jobs.filter((j) => j.status === "accepted").length

  const applicationRate = totalJobs > 0 ? ((applied + interviewing + offered + accepted) / totalJobs) * 100 : 0
  const successRate = applied > 0 ? ((interviewing + offered + accepted) / applied) * 100 : 0
  const rejectionRate = applied > 0 ? (rejected / applied) * 100 : 0

  // Find most recent application
  const recentApplications = jobs
    .filter((j) => j.applied_date)
    .sort((a, b) => new Date(b.applied_date!).getTime() - new Date(a.applied_date!).getTime())
  const mostRecentApplication = recentApplications[0]

  // Calculate average time between applications
  const appliedJobs = jobs
    .filter((j) => j.applied_date)
    .sort((a, b) => new Date(a.applied_date!).getTime() - new Date(b.applied_date!).getTime())

  let avgDaysBetweenApplications = 0
  if (appliedJobs.length > 1) {
    const timeDiffs = []
    for (let i = 1; i < appliedJobs.length; i++) {
      const diff =
        new Date(appliedJobs[i].applied_date!).getTime() - new Date(appliedJobs[i - 1].applied_date!).getTime()
      timeDiffs.push(diff / (1000 * 60 * 60 * 24))
    }
    avgDaysBetweenApplications = Math.round(timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length)
  }

  // Find companies applied to most
  const companyCounts = jobs.reduce(
    (acc, job) => {
      acc[job.company] = (acc[job.company] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const topCompanies = Object.entries(companyCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold">Statistics</h1>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Total Applications Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalJobs}</div>
              <p className="text-xs text-muted-foreground">{toApply} still to apply</p>
            </CardContent>
          </Card>

          {/* Application Rate Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Application Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{applicationRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {applied + interviewing + offered + accepted} of {totalJobs} jobs applied
              </p>
            </CardContent>
          </Card>

          {/* Success Rate Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {interviewing + offered + accepted} moved past application
              </p>
            </CardContent>
          </Card>

          {/* Active Applications Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Applications</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{applied + interviewing}</div>
              <p className="text-xs text-muted-foreground">
                {applied} applied, {interviewing} interviewing
              </p>
            </CardContent>
          </Card>

          {/* Rejections Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejections</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rejected}</div>
              <p className="text-xs text-muted-foreground">{rejectionRate.toFixed(1)}% rejection rate</p>
            </CardContent>
          </Card>

          {/* Offers Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offers</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{offered + accepted}</div>
              <p className="text-xs text-muted-foreground">
                {accepted} accepted, {offered} pending
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Insights Section */}
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Application Insights</CardTitle>
              <CardDescription>Interesting facts about your job search</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mostRecentApplication && (
                <div>
                  <p className="text-sm font-medium">Most Recent Application</p>
                  <p className="text-2xl font-bold">{mostRecentApplication.company}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(mostRecentApplication.applied_date!).toLocaleDateString()}
                  </p>
                </div>
              )}
              {avgDaysBetweenApplications > 0 && (
                <div>
                  <p className="text-sm font-medium">Average Application Frequency</p>
                  <p className="text-2xl font-bold">Every {avgDaysBetweenApplications} days</p>
                  <p className="text-xs text-muted-foreground">
                    {avgDaysBetweenApplications < 3
                      ? "You're applying frequently!"
                      : avgDaysBetweenApplications < 7
                        ? "Good consistent pace"
                        : "Consider applying more often"}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">Application Momentum</p>
                <p className="text-2xl font-bold">{toApply > applied ? "Building Pipeline" : "Active Hunting"}</p>
                <p className="text-xs text-muted-foreground">
                  {toApply > applied
                    ? "More jobs to apply to than applied"
                    : "More applications submitted than pipeline"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Companies</CardTitle>
              <CardDescription>Companies you've applied to most</CardDescription>
            </CardHeader>
            <CardContent>
              {topCompanies.length > 0 ? (
                <div className="space-y-4">
                  {topCompanies.map(([company, count], index) => (
                    <div key={company} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                          {index + 1}
                        </div>
                        <p className="font-medium">{company}</p>
                      </div>
                      <Badge variant="secondary">
                        {count} {count === 1 ? "application" : "applications"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No applications yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
            <CardDescription>Distribution of your applications by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "To Apply", count: toApply, color: "bg-muted" },
                { label: "Applied", count: applied, color: "bg-blue-500" },
                { label: "Interviewing", count: interviewing, color: "bg-purple-500" },
                { label: "Offered", count: offered, color: "bg-green-500" },
                { label: "Rejected", count: rejected, color: "bg-red-500" },
                { label: "Accepted", count: accepted, color: "bg-emerald-500" },
              ].map((status) => (
                <div key={status.label} className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${status.color}`} />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-sm font-medium">{status.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{status.count}</span>
                      <div className="w-32 bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${status.color}`}
                          style={{ width: `${totalJobs > 0 ? (status.count / totalJobs) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
