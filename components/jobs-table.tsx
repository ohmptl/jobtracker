"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ExternalLink, MoreHorizontal, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { EditJobDialog, type EditableJob } from "./edit-job-dialog"

type Job = EditableJob

const STATUS_COLORS: Record<string, string> = {
  to_apply: "bg-muted text-muted-foreground", applied: "bg-blue-500/10 text-blue-500",
  interviewing: "bg-purple-500/10 text-purple-500", offered: "bg-green-500/10 text-green-500",
  rejected: "bg-red-500/10 text-red-500", accepted: "bg-emerald-500/10 text-emerald-500",
}
const STATUS_LABELS: Record<string, string> = {
  to_apply: "To Apply", applied: "Applied", interviewing: "Interviewing", offered: "Offered", rejected: "Rejected", accepted: "Accepted",
}
const APP_STATUSES = ["to_apply", "applied", "interviewing", "offered", "rejected", "accepted"]
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—"

function TruncatedText({ children, className = "" }: { children: string; className?: string }) {
  return <span title={children} className={`block truncate ${className}`}>{children}</span>
}

export function JobsTable({ initialJobs: jobs }: { initialJobs: Job[] }) {
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"date" | "company" | "position">("date")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const channel = supabase.channel("realtime-jobs").on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => router.refresh()).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [supabase, router])

  async function deleteJob(id: string) {
    const { error } = await supabase.from("jobs").delete().eq("id", id)
    if (!error) router.refresh()
  }

  async function updateStatus(id: string, status: string) {
    setPendingId(id)
    const current = jobs.find((job) => job.id === id)
    const updates: { status: string; applied_date?: string } = { status }
    if (status === "applied" && !current?.applied_date) updates.applied_date = new Date().toISOString()
    const { error } = await supabase.from("jobs").update(updates).eq("id", id)
    if (!error) router.refresh()
    setPendingId(null)
  }

  const filteredJobs = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return jobs.filter((job) =>
      (!query || job.company.toLowerCase().includes(query) || job.position.toLowerCase().includes(query)) &&
      (statusFilter === "all" || job.status === statusFilter),
    ).sort((a, b) => sortBy === "date"
      ? new Date(b.added_date).getTime() - new Date(a.added_date).getTime()
      : sortBy === "company" ? a.company.localeCompare(b.company) : a.position.localeCompare(b.position))
  }, [jobs, searchQuery, statusFilter, sortBy])

  const groups = [
    { title: "To Apply", jobs: filteredJobs.filter((job) => job.status === "to_apply") },
    { title: "Applications", jobs: filteredJobs.filter((job) => !["to_apply", "rejected"].includes(job.status)) },
    { title: "Rejections", jobs: filteredJobs.filter((job) => job.status === "rejected") },
  ]

  function renderRows(groupJobs: Job[], isToApply: boolean) {
    return groupJobs.map((job) => (
      <TableRow key={job.id}>
        <TableCell className="font-medium"><button title={job.company} className="block w-full truncate text-left hover:underline" onClick={() => setEditingJob(job)}>{job.company}</button></TableCell>
        <TableCell><button title={job.position} className="block w-full truncate text-left hover:underline" onClick={() => setEditingJob(job)}>{job.position}</button></TableCell>
        <TableCell><TruncatedText>{job.location || "—"}</TruncatedText></TableCell>
        <TableCell>{job.role_type === "internship" ? "Internship" : "Full time"}</TableCell>
        <TableCell><Badge variant="secondary" className={STATUS_COLORS[job.status]}>{STATUS_LABELS[job.status]}</Badge></TableCell>
        <TableCell><TruncatedText>{job.salary || "—"}</TruncatedText></TableCell>
        <TableCell className="text-muted-foreground">{formatDate(job.posted_date)}</TableCell>
        {!isToApply && <TableCell className="text-muted-foreground">{formatDate(job.applied_date)}</TableCell>}
        <TableCell><div className="flex items-center gap-1.5">
          {job.url ? <Button size="sm" variant="outline" asChild><a href={job.url} target="_blank" rel="noreferrer" aria-label={`View ${job.position} at ${job.company}`}><ExternalLink /></a></Button> : <Button size="sm" variant="outline" disabled aria-label="No job posting URL"><ExternalLink /></Button>}
          {isToApply && <Button size="sm" disabled={pendingId === job.id} onClick={() => updateStatus(job.id, "applied")}><Check />Applied</Button>}
        </div></TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setEditingJob(job)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator /><DropdownMenuLabel>Change status</DropdownMenuLabel>
              {APP_STATUSES.filter((status) => status !== job.status).map((status) => <DropdownMenuItem key={status} onClick={() => updateStatus(job.id, status)}>{STATUS_LABELS[status]}</DropdownMenuItem>)}
              <DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => deleteJob(job.id)}>Delete permanently</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    ))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search by company or position..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{APP_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date">Added (newest)</SelectItem><SelectItem value="company">Company (A–Z)</SelectItem><SelectItem value="position">Position (A–Z)</SelectItem></SelectContent></Select>
      </div>

      {groups.map((group) => group.jobs.length > 0 && <section key={group.title}>
        <h2 className="mb-4 text-xl font-semibold">{group.title} <span className="text-base text-muted-foreground">({group.jobs.length})</span></h2>
        <div className="overflow-hidden rounded-lg border"><Table className="w-full table-fixed"><TableHeader><TableRow>
          <TableHead className="w-[14%]">Company</TableHead><TableHead className="w-[16%]">Position</TableHead><TableHead className="w-[11%]">Location</TableHead><TableHead className="w-[8%]">Role type</TableHead><TableHead className="w-[9%]">Status</TableHead>
          <TableHead className="w-[10%]">Salary</TableHead><TableHead className="w-[8%]">Posted</TableHead>{group.title !== "To Apply" && <TableHead className="w-[8%]">Applied</TableHead>}<TableHead className="w-[120px]">Job posting</TableHead><TableHead className="w-10" />
        </TableRow></TableHeader><TableBody>{renderRows(group.jobs, group.title === "To Apply")}</TableBody></Table></div>
      </section>)}
      {filteredJobs.length === 0 && <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">No jobs match this view.</div>}
      {editingJob && <EditJobDialog job={editingJob} onClose={() => setEditingJob(null)} onUpdate={() => setEditingJob(null)} />}
    </div>
  )
}
