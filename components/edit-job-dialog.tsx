"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

type Job = {
  id: string
  company: string
  position: string
  status: string
  url: string | null
  location: string | null
  salary: string | null
  notes: string | null
  resume_url: string | null
  applied_date: string | null
}

export function EditJobDialog({
  job,
  onClose,
  onUpdate,
}: {
  job: Job
  onClose: () => void
  onUpdate: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (error) => reject(error)
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    let resumeData = job.resume_url
    if (resumeFile) {
      try {
        resumeData = await fileToBase64(resumeFile)
      } catch (error) {
        console.error("Error converting resume to base64:", error)
      }
    }

    const updates = {
      company: formData.get("company") as string,
      position: formData.get("position") as string,
      status: formData.get("status") as string,
      url: (formData.get("url") as string) || null,
      location: (formData.get("location") as string) || null,
      salary: (formData.get("salary") as string) || null,
      notes: (formData.get("notes") as string) || null,
      applied_date: (formData.get("applied_date") as string) ? new Date(formData.get("applied_date") as string).toISOString() : null,
      updated_at: new Date().toISOString(),
      resume_url: resumeData,
    }

    const { error } = await supabase.from("jobs").update(updates).eq("id", job.id)

    if (!error) {
      onUpdate()
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
          <DialogDescription>Update job application details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Input id="company" name="company" defaultValue={job.company} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position *</Label>
              <Input id="position" name="position" defaultValue={job.position} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select name="status" defaultValue={job.status} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_apply">To Apply</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="interviewing">Interviewing</SelectItem>
                  <SelectItem value="offered">Offered</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Job URL</Label>
              <Input id="url" name="url" type="url" defaultValue={job.url || ""} placeholder="https://..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="salary">Salary</Label>
            <Input id="salary" name="salary" defaultValue={job.salary || ""} placeholder="e.g., $80k-$100k" />
          </div>

          <div className="spapplied_date">Applied Date</Label>
            <Input 
              id="applied_date" 
              name="applied_date" 
              type="date" 
              defaultValue={job.applied_date ? new Date(job.applied_date).toISOString().split('T')[0] : ""} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ace-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={job.notes || ""}
              placeholder="Any additional notes..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume">Resume (Optional)</Label>
            <Input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
            />
            {job.resume_url && !resumeFile && <p className="text-sm text-muted-foreground">Current resume attached</p>}
            {resumeFile && (
              <p className="text-sm text-muted-foreground">
                New file: {resumeFile.name} ({(resumeFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
