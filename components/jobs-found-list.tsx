"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Check, MapPin, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"

export type FoundJob = {
  id: string
  company: string
  position: string
  url: string | null
  location: string | null
  salary: string | null
  notes: string | null
}

export function JobsFoundList({ initialJobs }: { initialJobs: FoundJob[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function moveJob(id: string, status: "to_apply" | "dismissed") {
    setPendingId(id)
    const { error } = await supabase
      .from("jobs")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
    setPendingId(null)
    if (!error) router.refresh()
  }

  if (initialJobs.length === 0) {
    return (
      <Card className="border-dashed py-16 text-center">
        <CardContent>
          <Search className="mx-auto mb-4 size-9 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No jobs found yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Jobs added by ChatGPT through the MCP server will appear here for review.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {initialJobs.map((job) => (
        <Card key={job.id} className="gap-4">
          <CardHeader>
            <CardTitle className="text-lg">{job.position}</CardTitle>
            <CardDescription>{job.company}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {job.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{job.location}</span>}
              {job.salary && <span>{job.salary}</span>}
            </div>
            {job.notes && <p className="line-clamp-3 text-sm text-muted-foreground">{job.notes}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => moveJob(job.id, "to_apply")} disabled={pendingId === job.id}>
                <Check /> Move to To Apply
              </Button>
              <Button variant="outline" onClick={() => moveJob(job.id, "dismissed")} disabled={pendingId === job.id}>
                <X /> Dismiss
              </Button>
              {job.url && (
                <Button variant="ghost" asChild>
                  <a href={job.url} target="_blank" rel="noreferrer">View role <ArrowUpRight /></a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
