"use client"

import { useState, useMemo, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, ExternalLink, Search, Download } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { EditJobDialog } from "./edit-job-dialog"

type Job = {
  id: string
  company: string
  position: string
  status: string
  url: string | null
  location: string | null
  salary: string | null
  notes: string | null
  applied_date: string | null
  created_at: string
  resume_url: string | null
}

const STATUS_COLORS: Record<string, string> = {
  to_apply: "bg-muted text-muted-foreground",
  applied: "bg-blue-500/10 text-blue-500",
  interviewing: "bg-purple-500/10 text-purple-500",
  offered: "bg-green-500/10 text-green-500",
  rejected: "bg-red-500/10 text-red-500",
  accepted: "bg-emerald-500/10 text-emerald-500",
}

const STATUS_LABELS: Record<string, string> = {
  to_apply: "To Apply",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  accepted: "Accepted",
}

export function JobsTable({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs, setJobs] = useState(initialJobs)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"date" | "company" | "position">("date")
  const router = useRouter()
  const supabase = createClient()

  // Sync jobs with initialJobs when it changes (e.g. after router.refresh())
  useEffect(() => {
    setJobs(initialJobs)
  }, [initialJobs])

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel("realtime-jobs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        (payload) => {
          router.refresh()
          
          if (payload.eventType === "INSERT") {
            setJobs((current) => [payload.new as Job, ...current])
          } else if (payload.eventType === "UPDATE") {
            setJobs((current) =>
              current.map((job) => (job.id === payload.new.id ? (payload.new as Job) : job))
            )
          } else if (payload.eventType === "DELETE") {
            setJobs((current) => current.filter((job) => job.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, router])

  const deleteJob = async (id: string) => {
    const { error } = await supabase.from("jobs").delete().eq("id", id)
    if (!error) {
      setJobs(jobs.filter((job) => job.id !== id))
    }
  }

  const updateStatus = async (id: string, newStatus: string) => {
    const updates: { status: string; applied_date?: string } = { status: newStatus }
    if (newStatus === "applied" && !jobs.find((j) => j.id === id)?.applied_date) {
      updates.applied_date = new Date().toISOString()
    }

    const { error } = await supabase.from("jobs").update(updates).eq("id", id)
    if (!error) {
      router.refresh()
      const { data } = await supabase.from("jobs").select("*").eq("id", id).single()
      if (data) {
        setJobs(jobs.map((job) => (job.id === id ? data : job)))
      }
    }
  }

  const downloadResume = (job: Job) => {
    if (!job.resume_url) return

    // Create a link element and trigger download
    const link = document.createElement("a")
    link.href = job.resume_url
    link.download = `${job.company}-${job.position}-resume.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredAndSortedJobs = useMemo(() => {
    const filtered = jobs.filter((job) => {
      const matchesSearch =
        searchQuery === "" ||
        job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.position.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === "all" || job.status === statusFilter

      return matchesSearch && matchesStatus
    })

    filtered.sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      } else if (sortBy === "company") {
        return a.company.localeCompare(b.company)
      } else {
        return a.position.localeCompare(b.position)
      }
    })

    return filtered
  }, [jobs, searchQuery, statusFilter, sortBy])

  const groupedJobs = {
    to_apply: filteredAndSortedJobs.filter((job) => job.status === "to_apply"),
    applications: filteredAndSortedJobs.filter((job) => job.status !== "to_apply" && job.status !== "rejected"),
    rejections: filteredAndSortedJobs.filter((job) => job.status === "rejected"),
  }

  const renderJobRow = (job: Job, showAppliedDate = false) => (
    <TableRow key={job.id}>
      <TableCell className="font-medium">{job.company}</TableCell>
      <TableCell>{job.position}</TableCell>
      <TableCell>
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline truncate max-w-[200px] block"
          >
            {job.url}
          </a>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{job.salary || "—"}</TableCell>
      <TableCell>
        <Badge variant="secondary" className={STATUS_COLORS[job.status]}>
          {STATUS_LABELS[job.status]}
        </Badge>
      </TableCell>
      {showAppliedDate && (
        <TableCell className="text-muted-foreground">
          {job.applied_date ? new Date(job.applied_date).toLocaleDateString() : "—"}
        </TableCell>
      )}
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {job.url && (
              <DropdownMenuItem asChild>
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open URL
                </a>
              </DropdownMenuItem>
            )}
            {job.resume_url && (
              <DropdownMenuItem onClick={() => downloadResume(job)} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download Resume
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setEditingJob(job)}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Change Status</DropdownMenuLabel>
            {job.status !== "applied" && (
              <DropdownMenuItem onClick={() => updateStatus(job.id, "applied")}>Applied</DropdownMenuItem>
            )}
            {job.status !== "interviewing" && (
              <DropdownMenuItem onClick={() => updateStatus(job.id, "interviewing")}>Interviewing</DropdownMenuItem>
            )}
            {job.status !== "offered" && (
              <DropdownMenuItem onClick={() => updateStatus(job.id, "offered")}>Offered</DropdownMenuItem>
            )}
            {job.status !== "rejected" && (
              <DropdownMenuItem onClick={() => updateStatus(job.id, "rejected")}>Rejected</DropdownMenuItem>
            )}
            {job.status !== "accepted" && (
              <DropdownMenuItem onClick={() => updateStatus(job.id, "accepted")}>Accepted</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => deleteJob(job.id)} className="text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company or position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="to_apply">To Apply</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="interviewing">Interviewing</SelectItem>
            <SelectItem value="offered">Offered</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "date" | "company" | "position")}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date (Newest)</SelectItem>
            <SelectItem value="company">Company (A-Z)</SelectItem>
            <SelectItem value="position">Position (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* To Apply Section */}
      {groupedJobs.to_apply.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            To Apply <span className="text-muted-foreground text-base">({groupedJobs.to_apply.length})</span>
          </h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{groupedJobs.to_apply.map((job) => renderJobRow(job, false))}</TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Applications Section */}
      {groupedJobs.applications.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Applications <span className="text-muted-foreground text-base">({groupedJobs.applications.length})</span>
          </h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{groupedJobs.applications.map((job) => renderJobRow(job, true))}</TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Rejections Section */}
      {groupedJobs.rejections.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Rejections <span className="text-muted-foreground text-base">({groupedJobs.rejections.length})</span>
          </h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{groupedJobs.rejections.map((job) => renderJobRow(job, true))}</TableBody>
            </Table>
          </div>
        </div>
      )}

      {filteredAndSortedJobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">
            {jobs.length === 0 ? "No jobs yet. Add your first application!" : "No jobs match your search criteria."}
          </p>
        </div>
      )}

      {editingJob && (
        <EditJobDialog
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onUpdate={() => {
            router.refresh()
            setEditingJob(null)
          }}
        />
      )}
    </div>
  )
}
