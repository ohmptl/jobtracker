"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Check, MapPin, Sparkles, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"

export type ResearchedJob = {
  id: string
  company: string
  position: string
  url: string | null
  location: string | null
  salary: string | null
  notes: string | null
  job_description: string | null
  source: string | null
  match_score: number | null
  match_reasons: string[] | null
  discovered_at: string | null
}

export function ResearchedJobsList({ initialJobs }: { initialJobs: ResearchedJob[] }) {
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
          <Sparkles className="mx-auto mb-4 size-9 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Your research queue is empty</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Configure your research profile and give an agent an API key. New matches will appear here for your review.
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg">{job.position}</CardTitle>
                <CardDescription className="mt-1">{job.company}</CardDescription>
              </div>
              {job.match_score !== null && (
                <Badge variant={job.match_score >= 80 ? "default" : "secondary"}>{job.match_score}% match</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {job.location && (
                <span className="flex items-center gap-1"><MapPin className="size-3" />{job.location}</span>
              )}
              {job.salary && <span>{job.salary}</span>}
              {job.source && <Badge variant="outline">{job.source}</Badge>}
            </div>

            {(job.match_reasons || []).length > 0 && (
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {job.match_reasons?.map((reason) => (
                  <li key={reason} className="flex gap-2"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />{reason}</li>
                ))}
              </ul>
            )}

            {(job.notes || job.job_description) && (
              <p className="line-clamp-3 text-sm text-muted-foreground">{job.notes || job.job_description}</p>
            )}

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
