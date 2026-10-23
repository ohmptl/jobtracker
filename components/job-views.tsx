"use client";

import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobCard, JobMenu, jobLabel, stageColor, shortDate, type JobActions } from "./job-card";
import type { Job } from "@/lib/tracker/schemas";
import { formatUtc } from "@/lib/tracker/dates";

export function ApplicationRows({ jobs, deleted = false, open, ...actions }: JobActions & { jobs: Job[]; deleted?: boolean; open: (job: Job) => void }) {
  const groups = deleted ? [{ title: "Deleted", statuses: ["jobs_deleted"], accent: "bg-muted-foreground" }] : [
    { title: "To Apply", statuses: ["to_apply"], accent: "bg-amber-500" },
    { title: "Applied", statuses: ["applied", "interviewing", "offered", "accepted"], accent: "bg-blue-500" },
    { title: "Rejected", statuses: ["rejected"], accent: "bg-red-500" },
  ];
  return <div className="space-y-5">{groups.map(group => {
    const rows = jobs.filter(job => group.statuses.includes(job.status));
    if (!rows.length) return null;
    return <section key={group.title} aria-label={group.title}>
      {!deleted && <div className="mb-2 flex items-center gap-2"><span className={`size-2 rounded-full ${group.accent}`} /><h2 className="text-base font-semibold">{group.title}</h2><Badge variant="secondary" className="text-xs">{rows.length}</Badge>{group.title === "Applied" && <span className="text-xs text-muted-foreground">Including interviews and offers</span>}</div>}
      <div className="min-w-0 overflow-hidden rounded-lg border bg-card"><div className="relative overflow-x-auto" role="region" aria-label={`${group.title} jobs`} tabIndex={0}>
        <table className="w-full min-w-[1120px] table-fixed text-left text-sm [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-1">
          <caption className="sr-only">{group.title} opportunities. Select a row to view the job card.</caption>
          <colgroup><col className="w-[14%]" /><col /><col className="w-[12%]" /><col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-24" /><col className={group.title === "To Apply" ? "w-44" : "w-20"} /></colgroup>
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th>Company</th><th>Position</th><th>Location</th><th>Role type</th><th>{deleted ? "Recovery deadline (UTC)" : "Stage"}</th><th>Salary</th><th>{deleted ? "Removed" : group.title === "To Apply" ? "Added" : "Applied"}</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y">{rows.map(job => <tr key={job.id} id={job.id} tabIndex={actions.pending ? -1 : 0}
            onClick={event => { if (!actions.pending && !(event.target as HTMLElement).closest('button,a,input,select,textarea,[role="menuitem"]')) open(job); }}
            onKeyDown={event => { if (event.target === event.currentTarget && !actions.pending && ["Enter", " "].includes(event.key)) { event.preventDefault(); open(job); } }}
            className="cursor-pointer hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <td><span className="block truncate font-medium" title={job.company}>{job.company}</span></td>
            <td><button className="block w-full truncate text-left font-medium hover:underline" title={job.position} disabled={actions.pending} onClick={() => open(job)}>{job.position}</button>{job.next_action_at && <span className="block truncate text-xs text-muted-foreground">Next: {shortDate(job.next_action_at)}</span>}</td>
            <td><span className="block truncate" title={job.location || ""}>{job.location || "—"}</span></td>
            <td className="text-xs">{jobLabel(job.role_type)}</td>
            <td>{deleted ? <time className="text-xs" dateTime={job.purge_after || ""}>{job.purge_after ? formatUtc(job.purge_after) : "Unavailable"}</time> : <Badge variant="outline" className={`max-w-full truncate text-xs ${stageColor[job.status] || ""}`}>{jobLabel(job.status)}</Badge>}</td>
            <td><span className="block truncate" title={job.salary || ""}>{job.salary || "—"}</span></td>
            <td className="whitespace-nowrap text-xs text-muted-foreground">{shortDate(deleted ? job.deleted_at : job.status === "to_apply" ? job.added_date : job.applied_date)}</td>
            <td><div className="flex items-center justify-end gap-1">
              {deleted ? <Button size="sm" variant="outline" disabled={actions.pending} onClick={() => void actions.mutate("restore_job", { id: job.id })}>Restore</Button> : <>
                {job.url && <a className="inline-flex min-h-8 min-w-8 items-center justify-center" href={job.url} target="_blank" rel="noreferrer" aria-label={`Open posting for ${job.position}`}><ExternalLink className="size-4" /></a>}
                {job.status === "to_apply" && <Button size="sm" className="h-8 px-2 text-xs" disabled={actions.pending} onClick={() => void actions.mutate("update_job", { id: job.id, status: "applied" })}><Check className="size-3.5" />Applied</Button>}
                <JobMenu job={job} {...actions} />
              </>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div></div>
    </section>;
  })}</div>;
}

export function ReviewQueue({ jobs, ...actions }: JobActions & { jobs: Job[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const job = jobs.find(j => j.id === selected) || jobs[0];
  if (!job) return null;
  return <div className="min-w-0 space-y-4"><JobCard job={job} {...actions} />
    {jobs.length > 1 && <section><h3 className="mb-2 text-sm font-medium">Coming up · {jobs.length - 1} on this page</h3><div className="divide-y overflow-hidden rounded-lg border bg-card">{jobs.filter(j => j.id !== job.id).map(j => <button key={j.id} disabled={actions.pending} onClick={() => setSelected(j.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted/40"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{j.position}</span><span className="block truncate text-xs text-muted-foreground">{j.company} · {j.location || "Location not provided"}</span></span><span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{jobLabel(j.role_type)}</span></button>)}</div></section>}
  </div>;
}
