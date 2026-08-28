"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

export function AddJobDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    const status = formData.get("status") as string
    const { error } = await supabase.from("jobs").insert({
      user_id: user.id,
      company: formData.get("company") as string,
      position: formData.get("position") as string,
      status,
      url: (formData.get("url") as string) || null,
      role_type: formData.get("role_type") as string,
      salary: (formData.get("salary") as string) || null,
      posted_date: (formData.get("posted_date") as string) || null,
      applied_date: status === "applied" ? new Date().toISOString() : null,
      notes: (formData.get("notes") as string) || null,
    })

    if (!error) {
      setOpen(false)
      form.reset()
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Add Job</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Job</DialogTitle>
          <DialogDescription>Add a new job application to track.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="company">Company *</Label><Input id="company" name="company" required /></div>
            <div className="space-y-2"><Label htmlFor="position">Position *</Label><Input id="position" name="position" required /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select name="status" defaultValue="to_apply" required>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_apply">To Apply</SelectItem><SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="interviewing">Interviewing</SelectItem><SelectItem value="offered">Offered</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem><SelectItem value="accepted">Accepted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role_type">Role Type *</Label>
              <Select name="role_type" defaultValue="full_time" required>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="full_time">Full time</SelectItem><SelectItem value="internship">Internship</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label htmlFor="url">Job URL</Label><Input id="url" name="url" type="url" placeholder="https://..." /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="salary">Salary</Label><Input id="salary" name="salary" placeholder="e.g., $80k–$100k" /></div>
            <div className="space-y-2"><Label htmlFor="posted_date">Posted Date</Label><Input id="posted_date" name="posted_date" type="date" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={4} placeholder="Any additional notes..." /></div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Adding..." : "Add Job"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
