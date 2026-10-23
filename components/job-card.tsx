"use client";

import { Check, ExternalLink, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { statuses, type Job } from "@/lib/tracker/schemas";
import { formatUtc } from "@/lib/tracker/dates";

export const jobLabel = (value: string) => ({ jobs_found: "New", jobs_snoozed: "Snoozed", jobs_deleted: "Deleted", full_time: "Full time", co_op: "Co-op", new_grad: "New graduate", to_apply: "To Apply" }[value] || value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()));
export const stageColor: Record<string, string> = {
  to_apply: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  applied: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  interviewing: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  offered: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};
export type JobActions = {
  pending: boolean;
  edit: (job: Job) => void;
  remove: (job: Job) => void;
  mutate: (operation: "update_job" | "restore_job", args: object) => Promise<boolean>;
};
export const shortDate = (value?: string | null) => value ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

export function JobMenu({ job, ...actions }: JobActions & { job: Job }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" className="size-8 shrink-0" variant="ghost" aria-label={`Actions for ${job.position}`} disabled={actions.pending}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {job.status !== "jobs_deleted" && <><DropdownMenuItem onClick={() => actions.edit(job)}>Edit details / notes</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuLabel>Move to stage</DropdownMenuLabel>{statuses.filter(s => s !== "jobs_deleted" && s !== job.status).map(s => <DropdownMenuItem key={s} onClick={() => void actions.mutate("update_job", { id: job.id, status: s })}>{jobLabel(s)}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onClick={() => actions.remove(job)}>Move to Deleted</DropdownMenuItem></>}
      {job.status === "jobs_deleted" && <DropdownMenuItem onClick={() => void actions.mutate("restore_job", { id: job.id })}>Restore</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function JobCard({ job, ...actions }: JobActions & { job: Job }) {
  const research = ["jobs_found", "jobs_snoozed"].includes(job.status);
  const metadata = [["Role type", jobLabel(job.role_type)], ["Salary", job.salary], ["Added", shortDate(job.added_date)], ["Applied", job.applied_date ? shortDate(job.applied_date) : null]];
  const upcoming = [["Apply by", job.application_deadline ? shortDate(job.application_deadline) : null], ["Next action", job.next_action_at ? formatUtc(job.next_action_at) : null], ["Interview", job.interview_at ? formatUtc(job.interview_at) : null], ["Decision", job.decision_at ? formatUtc(job.decision_at) : null]];
  const other = [["Posted", job.posted_date ? shortDate(job.posted_date) : null], ["Source", job.source], ["Requisition", job.requisition_id], ["Career priority", jobLabel(job.priority)], ["Evaluation", job.evaluation_reason], ["Review flags", job.review_flags?.map(jobLabel).join(", ")], ["Availability", jobLabel(job.availability)], ["Last checked", job.last_verified_at ? formatUtc(job.last_verified_at) : null]];
  return <article id={job.id} className="min-w-0 overflow-hidden rounded-lg border bg-card">
    <header className="space-y-2 p-4 pr-10 sm:p-5 sm:pr-12">
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-muted-foreground">{job.company}</span><Badge variant="outline" className={stageColor[job.status]}>{jobLabel(job.status)}</Badge></div>
      <h2 className="break-words text-xl font-semibold leading-snug sm:text-2xl">{job.position}</h2>
      {job.location && <p className="text-sm text-muted-foreground">{job.location}</p>}
    </header>
    <div className="flex flex-wrap items-center gap-2 border-y bg-muted/20 px-4 py-3 sm:px-5">
      {job.status === "to_apply" && <Button size="sm" disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, status: "applied" })}><Check className="size-4" />Mark applied</Button>}
      {research && <><Button size="sm" disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, status: "to_apply" })}>Move to Apply</Button><Button size="sm" variant="outline" disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, status: job.status === "jobs_snoozed" ? "jobs_found" : "jobs_snoozed" })}>{job.status === "jobs_snoozed" ? "Return to New" : "Snooze"}</Button></>}
      {job.status === "jobs_deleted" && <Button size="sm" disabled={actions.pending} onClick={() => void actions.mutate("restore_job", { id: job.id })}>Restore</Button>}
      {job.url && <Button size="sm" variant="outline" asChild><a href={job.url} target="_blank" rel="noreferrer">Open posting<ExternalLink className="size-3.5" /></a></Button>}
      {job.status !== "jobs_deleted" && <Button size="sm" variant="outline" disabled={actions.pending} onClick={() => actions.edit(job)}>Edit details / notes</Button>}
      <div className="ml-auto"><JobMenu job={job} {...actions} /></div>
    </div>
    <div className="space-y-5 p-4 sm:p-5">
      {job.status === "jobs_deleted" && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Recoverable until {job.purge_after ? formatUtc(job.purge_after) : "the recovery deadline"}.</p>}
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">{metadata.filter(([,v]) => v).map(([key,value]) => <div className="min-w-0" key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      {upcoming.some(([,v]) => v) && <section className="rounded-md border bg-muted/20 p-3"><h3 className="mb-2 text-sm font-semibold">Upcoming dates</h3><dl className="grid gap-3 text-sm sm:grid-cols-2">{upcoming.filter(([,v]) => v).map(([key,value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1">{value}</dd></div>)}</dl></section>}
      <section><h3 className="mb-2 text-sm font-semibold">Notes</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{job.notes || "No notes yet."}</p></section>
      <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">More details</summary><dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">{other.filter(([,v]) => v).map(([key,value]) => <div className="min-w-0" key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl></details>
    </div>
  </article>;
}

export function JobDetailDialog({ job, onClose, ...actions }: JobActions & { job: Job; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="gap-0 overflow-y-auto p-0 sm:max-w-3xl"><DialogTitle className="sr-only">Job details</DialogTitle><DialogDescription className="sr-only">{job.position} at {job.company}</DialogDescription><JobCard job={job} {...actions} /></DialogContent></Dialog>;
}
