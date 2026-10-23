"use client";

import { useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { statuses, type Job } from "@/lib/tracker/schemas";
import { formatUtc } from "@/lib/tracker/dates";

export const jobLabel = (value: string) => value.replace(/^jobs_/, "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
type Actions = {
  pending: boolean;
  edit: (job: Job) => void;
  remove: (job: Job) => void;
  mutate: (operation: "update_job" | "restore_job", args: object) => Promise<boolean>;
};
const date = (value?: string | null) => value ? value.slice(0, 10) : "—";

function Stage({ job, pending, mutate }: Pick<Actions, "pending" | "mutate"> & { job: Job }) {
  return <select className="min-w-32 text-xs" aria-label={`Move ${job.position} to stage`} disabled={pending} value={job.status} onChange={(e) => void mutate("update_job", { id: job.id, status: e.target.value })}>
    {statuses.filter(s => s !== "jobs_deleted").map(s => <option key={s} value={s}>{jobLabel(s)}</option>)}
  </select>;
}

export function ApplicationRows({ jobs, deleted = false, ...actions }: Actions & { jobs: Job[]; deleted?: boolean }) {
  return <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
    <div className="relative overflow-x-auto" role="region" aria-label={deleted ? "Deleted opportunities" : "Applications table"} tabIndex={0}>
      <table className="w-full min-w-[1100px] table-fixed text-left text-sm [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-1">
        <colgroup><col className="w-[14%]" /><col className="w-[23%]" /><col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[15%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-20" /></colgroup>
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th>Company</th><th>Position</th><th>Location</th><th>Role type</th><th>{deleted ? "Recovery deadline (UTC)" : "Stage"}</th><th>Salary</th><th>{deleted ? "Removed" : "Applied"}</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody className="divide-y">
          {jobs.map(job => <tr key={job.id} id={job.id} className="hover:bg-muted/30">
            <td><span className="block truncate font-medium" title={job.company}>{job.company}</span></td>
            <td><button className="block w-full truncate text-left font-medium hover:underline" title={job.position} onClick={() => actions.edit(job)} disabled={deleted || actions.pending}>{job.position}</button>{job.next_action_at && <span className="block truncate text-xs text-muted-foreground">Next: {date(job.next_action_at)}</span>}</td>
            <td><span className="block truncate" title={job.location || ""}>{job.location || "—"}</span></td>
            <td className="text-xs">{jobLabel(job.role_type)}</td>
            <td>{deleted ? <time className="text-xs" dateTime={job.purge_after || ""}>{job.purge_after ? formatUtc(job.purge_after) : "Unavailable"}</time> : <Stage job={job} {...actions} />}</td>
            <td><span className="block truncate" title={job.salary || ""}>{job.salary || "—"}</span></td>
            <td className="whitespace-nowrap text-xs text-muted-foreground">{date(deleted ? job.deleted_at : job.applied_date)}</td>
            <td><div className="flex items-center justify-end gap-1">
              {deleted ? <Button size="sm" variant="outline" disabled={actions.pending} onClick={() => void actions.mutate("restore_job", { id: job.id })}>Restore</Button> : <>
                {job.url && <a className="inline-flex min-h-8 min-w-8 items-center justify-center" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open posting for ${job.position}`}><ExternalLink className="size-4" /></a>}
                <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" className="size-8" variant="ghost" aria-label={`Actions for ${job.position}`} disabled={actions.pending}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => actions.edit(job)}>Edit details / notes</DropdownMenuItem><DropdownMenuItem onClick={() => void actions.mutate("update_job", { id: job.id, protected: !job.protected })}>{job.protected ? "Unprotect job" : "Protect job"}</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => actions.remove(job)}>Move to Deleted</DropdownMenuItem></DropdownMenuContent>
                </DropdownMenu>
              </>}
            </div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

export function ReviewQueue({ jobs, ...actions }: Actions & { jobs: Job[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const job = jobs.find(j => j.id === selected) || jobs[0];
  if (!job) return null;
  return <div className="min-w-0 space-y-4">
    <article id={job.id} className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium text-primary">{job.company}</p><h2 className="mt-1 break-words text-xl font-semibold">{job.position}</h2><p className="mt-1 text-sm text-muted-foreground">{job.location || "Location not provided"}</p></div>
        <div className="flex flex-wrap gap-1.5"><Badge variant="secondary">{jobLabel(job.role_type)}</Badge><Badge variant="outline">{jobLabel(job.status)}</Badge>{(job.protected || job.company_protected) && <Badge variant="outline">Protected</Badge>}</div>
      </header>
      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          {[['Salary', job.salary || 'Not provided'], ['Posted', date(job.posted_date)], ['Added', date(job.added_date)], ['Availability', jobLabel(job.availability)]].map(([key,value]) => <div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
        </dl>
        <div><h3 className="text-xs font-medium text-muted-foreground">Notes</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{job.notes || "No notes"}</p></div>
        <details><summary className="cursor-pointer py-1 text-sm">Full details</summary><dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          {[['Evaluation', job.evaluation_reason || 'Not evaluated'], ['Requisition', job.requisition_id || 'Unknown'], ['Review flags', job.review_flags?.join(', ') || 'None'], ['Next action', job.next_action_at ? formatUtc(job.next_action_at) : 'Not set'], ['Last verified', job.last_verified_at ? formatUtc(job.last_verified_at) : 'Not checked']].map(([key,value]) => <div className="min-w-0" key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="break-words">{value}</dd></div>)}
        </dl></details>
        {job.status === "jobs_deleted" ? <div className="space-y-2"><p className="text-sm">Restore before {job.purge_after ? formatUtc(job.purge_after) : "deadline unavailable"}.</p><Button disabled={actions.pending} onClick={() => void actions.mutate("restore_job", { id: job.id })}>Restore</Button></div> : <>
          <div className="flex flex-wrap gap-2">
            {["jobs_found", "jobs_snoozed"].includes(job.status) && <><Button disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, status: "to_apply" })}>Move to Apply</Button><Button variant="outline" disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, status: job.status === "jobs_snoozed" ? "jobs_found" : "jobs_snoozed" })}>{job.status === "jobs_snoozed" ? "Return to New" : "Snooze"}</Button></>}
            {job.url && <Button variant="outline" asChild><a href={job.url} target="_blank" rel="noreferrer">Open posting<ExternalLink className="size-3.5" /></a></Button>}
            <Button variant="outline" disabled={actions.pending} onClick={() => actions.edit(job)}>Edit details / notes</Button><Button variant="ghost" disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, protected: !job.protected })}>{job.protected ? "Unprotect job" : "Protect job"}</Button><Button variant="ghost" className="text-destructive" disabled={actions.pending} onClick={() => actions.remove(job)}>Remove</Button>
          </div>
          <details><summary className="cursor-pointer py-1 text-xs text-muted-foreground">Other stages</summary><div className="mt-2 max-w-xs"><Stage job={job} {...actions} /></div></details>
        </>}
      </div>
    </article>
    {jobs.length > 1 && <section><h3 className="mb-2 text-sm font-medium">Coming up · {jobs.length - 1} on this page</h3><div className="divide-y overflow-hidden rounded-lg border bg-card">{jobs.filter(j => j.id !== job.id).map(j => <button key={j.id} disabled={actions.pending} onClick={() => setSelected(j.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted/40"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{j.position}</span><span className="block truncate text-xs text-muted-foreground">{j.company} · {j.location || 'Location not provided'}</span></span><span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{jobLabel(j.role_type)}</span></button>)}</div></section>}
  </div>;
}
