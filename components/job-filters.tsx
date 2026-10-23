"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { jobLabel } from "./job-card";
import { applicationStatuses } from "@/lib/tracker/collection";

export function JobFilters({ filters, applications, research, onChange, onReset, onRestore }: {
  filters: Record<string, unknown>;
  applications: boolean;
  research: boolean;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  onRestore: () => void;
}) {
  const value = (key: string) => String(filters[key] || "");
  const select = (key: string, title: string, options: string[], empty: string) => <label className="min-w-0 text-xs text-muted-foreground">{title}<select className="mt-1 text-sm text-foreground" aria-label={title} value={value(key)} onChange={e => onChange(key, e.target.value)}><option value="">{empty}</option>{options.map(v => <option key={v} value={v}>{jobLabel(v)}</option>)}</select></label>;
  return <div className="space-y-2 rounded-lg border bg-card p-3">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" aria-label="Search opportunities" placeholder="Search all fields: company, role, notes, salary…" maxLength={300} className="pl-9" value={value("q")} onChange={e => onChange("q", e.target.value)} /></div>
      <div className={`grid gap-2 ${applications ? "grid-cols-3" : "grid-cols-2"} lg:min-w-[360px]`}>
        {applications && select("status", "Stage", applicationStatuses, "All stages")}
        {select("role_type", "Role type", ["full_time", "internship", "co_op", "new_grad", "other"], "All types")}
        <label className="text-xs text-muted-foreground">Sort<select className="mt-1 text-sm text-foreground" aria-label="Sort" value={value("sort") || "date"} onChange={e => onChange("sort", e.target.value)}><option value="date">Newest first</option><option value="company">Company A–Z</option><option value="position">Position A–Z</option></select></label>
      </div>
    </div>
    <div className="flex items-start justify-between gap-3">
      <details className="min-w-0 flex-1"><summary className="cursor-pointer py-1 text-xs font-medium">More filters</summary><div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {select("priority", "Career priority", ["strategic", "relevant_full_time", "review", "low", "expired", "ineligible"], "Any priority")}
        {select("availability", "Posting availability", ["open", "closed", "uncertain", "not_checked"], "Any availability")}
        <label className="text-xs text-muted-foreground">Protection<select className="mt-1 text-sm text-foreground" aria-label="Protection" value={value("protected")} onChange={e => onChange("protected", e.target.value)}><option value="">Any</option><option value="true">Protected</option><option value="false">Unprotected</option></select></label>
        {[["added_after", "Added since (UTC)"], ["posted_after", "Posted since"]].map(([key,title]) => <label key={key} className="text-xs text-muted-foreground">{title}<Input className="mt-1" aria-label={title} type="date" value={value(key)} onChange={e => onChange(key, e.target.value)} /></label>)}
        <label className="text-xs text-muted-foreground">Source<Input className="mt-1" aria-label="Source" value={value("source")} onChange={e => onChange("source", e.target.value)} /></label>
      </div><Button className="mt-2" size="sm" variant="ghost" onClick={onRestore}>Use saved filters</Button></details>
      <Button size="sm" className="h-7 px-2 text-xs" variant="ghost" onClick={onReset}>Clear filters</Button>
    </div>
    {research && <p className="sr-only">Search includes all jobs in the selected review feed.</p>}
  </div>;
}
