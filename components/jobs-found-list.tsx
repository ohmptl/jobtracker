"use client"

import { useMemo, useState } from "react"
import { ArrowUpRight, BriefcaseBusiness, Check, Clock3, Inbox, RotateCcw, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

export type AiJobStatus = "jobs_found" | "jobs_snoozed" | "jobs_deleted"
export type FoundJob = {
  id: string
  company: string
  position: string
  status: AiJobStatus
  url: string | null
  role_type: "internship" | "full_time"
  salary: string | null
  posted_date: string | null
  added_date: string
  applied_date: string | null
  notes: string | null
}

type FeedName = "jobs_found" | "jobs_snoozed"
const formatDate = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString() : "Not provided"

export function JobsFoundList({ initialJobs }: { initialJobs: FoundJob[] }) {
  const [jobs, setJobs] = useState(initialJobs)
  const [feed, setFeed] = useState<FeedName>("jobs_found")
  const [showDeleted, setShowDeleted] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  const feedJobs = useMemo(() => jobs.filter((job) => job.status === feed), [jobs, feed])
  const featured = feedJobs.find((job) => job.id === selectedId) || feedJobs[0]
  const upcoming = featured ? feedJobs.filter((job) => job.id !== featured.id) : []
  const deleted = jobs.filter((job) => job.status === "jobs_deleted")

  async function moveJob(id: string, status: AiJobStatus | "to_apply") {
    setPendingId(id)
    setError(null)
    const { error: updateError } = await supabase.from("jobs").update({ status }).eq("id", id)
    if (updateError) {
      setError(updateError.message)
    } else if (status === "to_apply") {
      setJobs((current) => current.filter((job) => job.id !== id))
      setSelectedId(null)
    } else {
      setJobs((current) => current.map((job) => job.id === id ? { ...job, status } : job))
      setSelectedId(null)
    }
    setPendingId(null)
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Select value={feed} onValueChange={(value) => { setFeed(value as FeedName); setShowDeleted(false); setSelectedId(null) }}>
        <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="jobs_found">New jobs ({jobs.filter((job) => job.status === "jobs_found").length})</SelectItem><SelectItem value="jobs_snoozed">Snoozed ({jobs.filter((job) => job.status === "jobs_snoozed").length})</SelectItem></SelectContent>
      </Select>
      <Button variant={showDeleted ? "default" : "outline"} onClick={() => setShowDeleted((value) => !value)}><Trash2 />Deleted ({deleted.length})</Button>
    </div>

    {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Could not move the job: {error}</div>}

    {showDeleted ? <DeletedList jobs={deleted} pendingId={pendingId} moveJob={moveJob} /> : <>
      {featured ? <Card className="overflow-hidden border-primary/30 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><CardDescription>{featured.company}</CardDescription><CardTitle className="mt-1 text-2xl">{featured.position}</CardTitle></div>
            <div className="flex gap-2"><Badge variant="secondary">{featured.role_type === "internship" ? "Internship" : "Full time"}</Badge><Badge>{feed === "jobs_found" ? "New" : "Snoozed"}</Badge></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Salary" value={featured.salary || "Not provided"} />
            <Detail label="Posted Date" value={formatDate(featured.posted_date)} />
            <Detail label="Added Date" value={formatDate(featured.added_date)} />
            <Detail label="Applied Date" value={formatDate(featured.applied_date)} />
          </dl>
          <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Job URL</p>{featured.url ? <a className="break-all text-sm text-primary hover:underline" href={featured.url} target="_blank" rel="noreferrer">{featured.url}</a> : <p className="text-sm">Not provided</p>}</div>
          <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p><p className="whitespace-pre-wrap text-sm leading-6">{featured.notes || "No notes provided."}</p></div>
          <FeedActions job={featured} feed={feed} pendingId={pendingId} moveJob={moveJob} />
        </CardContent>
      </Card> : <Card className="border-dashed py-14 text-center"><CardContent><Inbox className="mx-auto mb-3 size-9 text-muted-foreground" /><h2 className="font-semibold">{feed === "jobs_found" ? "No new jobs to review" : "No snoozed jobs"}</h2><p className="mt-1 text-sm text-muted-foreground">{feed === "jobs_found" ? "New roles added through MCP will appear here." : "Jobs you snooze from the New feed will appear here."}</p></CardContent></Card>}

      {upcoming.length > 0 && <section className="space-y-3"><div><h2 className="text-lg font-semibold">Coming up</h2><p className="text-sm text-muted-foreground">Select a role to bring it into the detail view.</p></div><div className="divide-y overflow-hidden rounded-lg border">{upcoming.map((job) => <button key={job.id} onClick={() => setSelectedId(job.id)} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"><BriefcaseBusiness className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{job.position}</span><span className="block truncate text-sm text-muted-foreground">{job.company}</span></span><Badge variant="outline">{job.role_type === "internship" ? "Internship" : "Full time"}</Badge><span className="hidden text-sm text-muted-foreground sm:block">Added {formatDate(job.added_date)}</span></button>)}</div></section>}
    </>}
  </div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>
}

function FeedActions({ job, feed, pendingId, moveJob }: { job: FoundJob; feed: FeedName; pendingId: string | null; moveJob: (id: string, status: AiJobStatus | "to_apply") => Promise<void> }) {
  return <div className="flex flex-wrap gap-2">
    <Button disabled={pendingId === job.id} onClick={() => moveJob(job.id, "to_apply")}><Check />Move to Apply</Button>
    <Button variant="destructive" disabled={pendingId === job.id} onClick={() => moveJob(job.id, "jobs_deleted")}><Trash2 />Remove</Button>
    {feed === "jobs_found" ?
      <Button variant="outline" disabled={pendingId === job.id} onClick={() => moveJob(job.id, "jobs_snoozed")}><Clock3 />Snooze</Button> :
      <Button variant="outline" disabled={pendingId === job.id} onClick={() => moveJob(job.id, "jobs_found")}><RotateCcw />Move to New</Button>}
    {job.url && <Button variant="outline" asChild><a href={job.url} target="_blank" rel="noreferrer">View Role<ArrowUpRight /></a></Button>}
  </div>
}

function DeletedList({ jobs, pendingId, moveJob }: { jobs: FoundJob[]; pendingId: string | null; moveJob: (id: string, status: AiJobStatus | "to_apply") => Promise<void> }) {
  if (jobs.length === 0) return <Card className="border-dashed py-14 text-center"><CardContent><Trash2 className="mx-auto mb-3 size-9 text-muted-foreground" /><h2 className="font-semibold">Deleted list is empty</h2><p className="mt-1 text-sm text-muted-foreground">Removed jobs remain here so AI agents can avoid suggesting them again.</p></CardContent></Card>
  return <section className="space-y-3"><div><h2 className="text-lg font-semibold">Deleted jobs</h2><p className="text-sm text-muted-foreground">These records remain available to MCP for duplicate checking.</p></div><div className="divide-y overflow-hidden rounded-lg border">{jobs.map((job) => <div key={job.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><p className="truncate font-medium">{job.position} <span className="font-normal text-muted-foreground">at {job.company}</span></p><p className="text-sm text-muted-foreground">{job.role_type === "internship" ? "Internship" : "Full time"} · Added {formatDate(job.added_date)}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pendingId === job.id} onClick={() => moveJob(job.id, "jobs_found")}><RotateCcw />New</Button><Button size="sm" variant="outline" disabled={pendingId === job.id} onClick={() => moveJob(job.id, "jobs_snoozed")}><Clock3 />Snooze</Button><Button size="sm" disabled={pendingId === job.id} onClick={() => moveJob(job.id, "to_apply")}><Check />Move to Apply</Button>{job.url && <Button size="sm" variant="ghost" asChild><a href={job.url} target="_blank" rel="noreferrer">View<ArrowUpRight /></a></Button>}</div></div>)}</div></section>
}
