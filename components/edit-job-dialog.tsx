"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

export type EditableJob = {
  id: string; company: string; position: string; status: string; url: string | null; location: string | null
  role_type: "internship" | "full_time"; salary: string | null; posted_date: string | null
  added_date: string; applied_date: string | null; notes: string | null
}

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

export function EditJobDialog({ job, onClose, onUpdate }: { job: EditableJob; onClose: () => void; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    const formData = new FormData(event.currentTarget)
    const status = formData.get("status") as string
    const appliedDate = formData.get("applied_date") as string
    const { error } = await supabase.from("jobs").update({
      company: formData.get("company") as string,
      position: formData.get("position") as string,
      status,
      url: (formData.get("url") as string) || null,
      location: (formData.get("location") as string) || null,
      role_type: formData.get("role_type") as string,
      salary: (formData.get("salary") as string) || null,
      posted_date: (formData.get("posted_date") as string) || null,
      applied_date: appliedDate ? new Date(`${appliedDate}T12:00:00`).toISOString() : status === "applied" && !job.applied_date ? new Date().toISOString() : null,
      notes: (formData.get("notes") as string) || null,
    }).eq("id", job.id)
    if (!error) { onUpdate(); router.refresh() }
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Job</DialogTitle><DialogDescription>Update job application details. Added Date is preserved automatically.</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="company">Company *</Label><Input id="company" name="company" defaultValue={job.company} required /></div>
            <div className="space-y-2"><Label htmlFor="position">Position *</Label><Input id="position" name="position" defaultValue={job.position} required /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select name="status" defaultValue={job.status} required><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="to_apply">To Apply</SelectItem><SelectItem value="applied">Applied</SelectItem><SelectItem value="interviewing">Interviewing</SelectItem>
                <SelectItem value="offered">Offered</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="accepted">Accepted</SelectItem>
              </SelectContent></Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role_type">Role Type *</Label>
              <Select name="role_type" defaultValue={job.role_type} required><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="full_time">Full time</SelectItem><SelectItem value="internship">Internship</SelectItem>
              </SelectContent></Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="url">Job URL</Label><Input id="url" name="url" type="url" defaultValue={job.url || ""} /></div>
            <div className="space-y-2"><Label htmlFor="location">Location</Label><Input id="location" name="location" defaultValue={job.location || ""} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="salary">Salary</Label><Input id="salary" name="salary" defaultValue={job.salary || ""} /></div>
            <div className="space-y-2"><Label htmlFor="posted_date">Posted Date</Label><Input id="posted_date" name="posted_date" type="date" defaultValue={dateValue(job.posted_date)} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Added Date</Label><Input value={new Date(job.added_date).toLocaleDateString()} disabled /></div>
            <div className="space-y-2"><Label htmlFor="applied_date">Applied Date</Label><Input id="applied_date" name="applied_date" type="date" defaultValue={dateValue(job.applied_date)} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={4} defaultValue={job.notes || ""} /></div>
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
