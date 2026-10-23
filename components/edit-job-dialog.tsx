"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tracker } from "@/lib/tracker/browser";

export type EditableJob = {
  id: string;
  company: string;
  position: string;
  status: string;
  url: string | null;
  location: string | null;
  role_type: "internship" | "co_op" | "full_time" | "new_grad" | "other";
  salary: string | null;
  posted_date: string | null;
  added_date: string;
  applied_date: string | null;
  notes: string | null;
  priority?: string;
  evaluation_reason?: string | null;
  application_deadline?: string | null;
  next_action_at?: string | null;
  interview_at?: string | null;
  decision_at?: string | null;
  requisition_id?: string | null;
  source?: string | null;
  review_flags?: string[];
};

function dateValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function EditJobDialog({
  job,
  onClose,
  onUpdate,
}: {
  job: EditableJob;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const status = formData.get("status") as string;
    const appliedDate = formData.get("applied_date") as string;
    try {
      await tracker("update_job", {
        id: job.id,
        company: formData.get("company") as string,
        position: formData.get("position") as string,
        status,
        url: (formData.get("url") as string) || null,
        location: (formData.get("location") as string) || null,
        role_type: formData.get("role_type") as string,
        salary: (formData.get("salary") as string) || null,
        posted_date: (formData.get("posted_date") as string) || null,
        applied_date: appliedDate
          ? appliedDate === dateValue(job.applied_date)
            ? job.applied_date
            : new Date(`${appliedDate}T12:00:00`).toISOString()
          : status === "applied" && !job.applied_date
            ? new Date().toISOString()
            : null,
        notes: (formData.get("notes") as string) || null,
        priority: formData.get("priority") as string,
        evaluation_reason: formData.get("evaluation_reason") as string,
        application_deadline:
          (formData.get("application_deadline") as string) || null,
        next_action_at: formData.get("next_action_at")
          ? new Date(formData.get("next_action_at") as string).toISOString()
          : null,
        interview_at: formData.get("interview_at")
          ? new Date(formData.get("interview_at") as string).toISOString()
          : null,
        decision_at: formData.get("decision_at")
          ? new Date(formData.get("decision_at") as string).toISOString()
          : null,
        requisition_id: (formData.get("requisition_id") as string) || null,
        source: (formData.get("source") as string) || null,
        review_flags: formData.getAll("review_flags"),
      });
      onUpdate();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    }
    setLoading(false);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
          <DialogDescription>
            {job.position} at {job.company}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Input
                id="company"
                name="company"
                defaultValue={job.company}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position *</Label>
              <Input
                id="position"
                name="position"
                defaultValue={job.position}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select name="status" defaultValue={job.status} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jobs_found">Jobs Found</SelectItem>
                  <SelectItem value="jobs_snoozed">Snoozed</SelectItem>
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
              <Label htmlFor="role_type">Role Type *</Label>
              <Select name="role_type" defaultValue={job.role_type} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full time</SelectItem>
                  <SelectItem value="internship">Internship</SelectItem>
                  <SelectItem value="co_op">Co-op</SelectItem>
                  <SelectItem value="new_grad">New graduate</SelectItem>
                  <SelectItem value="other">Other / review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="url">Job URL</Label>
              <Input
                id="url"
                name="url"
                type="url"
                defaultValue={job.url || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                defaultValue={job.location || ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="salary">Salary</Label>
              <Input
                id="salary"
                name="salary"
                defaultValue={job.salary || ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="posted_date">Posted Date</Label>
              <Input
                id="posted_date"
                name="posted_date"
                type="date"
                defaultValue={dateValue(job.posted_date)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Added Date</Label>
              <Input
                value={new Date(job.added_date).toLocaleDateString()}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applied_date">Applied Date</Label>
              <Input
                id="applied_date"
                name="applied_date"
                type="date"
                defaultValue={dateValue(job.applied_date)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={job.notes || ""}
            />
          </div>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Evaluation, source & workflow dates</summary>
            <div className="mt-3 space-y-4">
          <label>
            Career priority
            <select name="priority" defaultValue={job.priority || "review"}>
              {[
                "strategic",
                "relevant_full_time",
                "review",
                "low",
                "expired",
                "ineligible",
              ].map((p) => (
                <option key={p} value={p}>
                  {p.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Career-value explanation
            <Textarea
              name="evaluation_reason"
              defaultValue={job.evaluation_reason || ""}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Application deadline
              <Input
                type="date"
                name="application_deadline"
                defaultValue={job.application_deadline || ""}
              />
            </label>
            <label>
              Next action (local time)
              <Input
                type="datetime-local"
                name="next_action_at"
                defaultValue={
                  job.next_action_at
                    ? new Date(
                        Date.parse(job.next_action_at) -
                          new Date(job.next_action_at).getTimezoneOffset() *
                            60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Requisition ID
              <Input
                name="requisition_id"
                defaultValue={job.requisition_id || ""}
              />
            </label>
            <label>
              Discovery source
              <Input name="source" defaultValue={job.source || ""} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["interview_at", "decision_at"] as const).map((field) => (
              <label key={field}>
                {field === "interview_at" ? "Interview" : "Decision"} (local
                time)
                <Input
                  name={field}
                  type="datetime-local"
                  defaultValue={
                    job[field]
                      ? new Date(
                          Date.parse(job[field]!) -
                            new Date(job[field]!).getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                />
              </label>
            ))}
          </div>
          <fieldset className="space-y-2">
            <legend>Review flags</legend>
            {[
              "eligibility_review",
              "url_verification",
              "possible_duplicate",
              "potentially_expired",
              "apply_soon",
            ].map((flag) => (
              <label key={flag} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="review_flags"
                  value={flag}
                  defaultChecked={job.review_flags?.includes(flag)}
                />
                {flag.replaceAll("_", " ")}
              </label>
            ))}
          </fieldset>
            </div>
          </details>
          {message && (
            <p role="alert" className="text-destructive">
              {message}
            </p>
          )}
          <div className="sticky -bottom-6 flex justify-end gap-3 border-t bg-background py-3">
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
  );
}
