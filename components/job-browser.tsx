"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApplicationRows, ReviewQueue } from "@/components/job-views";
import { JobDetailDialog, type JobActions } from "@/components/job-card";
import { JobFilters } from "@/components/job-filters";
import { EditJobDialog } from "@/components/edit-job-dialog";
import { tracker } from "@/lib/tracker/browser";
import { applicationStatuses, collectJobPages, type JobPage } from "@/lib/tracker/collection";
import type { Job } from "@/lib/tracker/schemas";

export type { JobPage } from "@/lib/tracker/collection";
const defaultStatuses = { research: ["jobs_found"], applications: applicationStatuses, deleted: ["jobs_deleted"] };

export function JobBrowser({ initialPage, view = "research", detail = false }: { initialPage: JobPage; view?: keyof typeof defaultStatuses; detail?: boolean }) {
  const [page, setPage] = useState(initialPage);
  const [feed, setFeed] = useState("jobs_found");
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const latestFilters = useRef(filters);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Job | null>(null);
  const [opened, setOpened] = useState<Job | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [history, setHistory] = useState<JobPage["next_cursor"][]>([]);
  const [cursor, setCursor] = useState<JobPage["next_cursor"]>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const initialId = detail ? initialPage.jobs[0]?.id : undefined;

  const load = useCallback(async (selected: Record<string, unknown>, next: JobPage["next_cursor"] = null) => {
    const ticket = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      let result: JobPage;
      if (detail) {
        const data = await tracker("get_job", { id: initialId }, controller.signal);
        result = { jobs: [data.job], total: 1, has_more: false, next_cursor: null };
      } else {
        const { status, added_after: added, ...rest } = selected;
        const args = { ...rest, statuses: status ? [status] : view === "research" ? [feed] : defaultStatuses[view],
          ...(added ? { added_after: `${added}T00:00:00.000Z` } : {}) };
        result = view === "applications"
          ? await collectJobPages(after => tracker("list_jobs", { ...args, page_size: 100, ...(after ? { cursor: after } : {}) }, controller.signal))
          : await tracker("list_jobs", { ...args, page_size: 30, ...(next ? { cursor: next } : {}) }, controller.signal);
      }
      if (ticket !== sequence.current) return false;
      setPage(result);
      setCursor(next);
      return true;
    } catch (e) {
      if (!controller.signal.aborted && ticket === sequence.current) setError(e instanceof Error ? e.message : "Unable to load jobs");
      return false;
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, [detail, initialId, view, feed]);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const timer = setTimeout(() => { void load(filters); }, 250);
    return () => clearTimeout(timer);
  }, [filters, load]);
  useEffect(() => () => request.current?.abort(), []);

  function updateFilters(next: Record<string, unknown>) {
    ++sequence.current;
    request.current?.abort();
    latestFilters.current = next;
    setFilters(next);
    setHistory([]);
    setCursor(null);
    try { localStorage.setItem(`jobtracker-${view}-filters`, JSON.stringify(next)); } catch { /* Optional saved view. */ }
  }

  async function mutate(operation: "update_job" | "remove_job" | "restore_job", args: object) {
    setMutating(true);
    setError("");
    try {
      const result = await tracker(operation, args);
      const changed = result.job || result.results?.[0]?.job;
      if (changed) setOpened(current => current?.id === changed.id ? changed : current);
      await load(latestFilters.current, view === "applications" ? null : cursor);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update job");
      return false;
    } finally { setMutating(false); }
  }

  async function remove(job: Job) {
    const guarded = !["jobs_found", "jobs_snoozed"].includes(job.status);
    if (guarded && !window.confirm(`Move ${job.position} at ${job.company} to Deleted, preserving its application history? Recoverable for 30 days.`)) return;
    if (await mutate("remove_job", { id: job.id, reason: "Owner removed via tracker" })) {
      setUndo(job.id);
      setOpened(null);
    }
  }
  const actions: JobActions = { pending: mutating || loading, edit: job => { setOpened(null); setEditing(job); }, remove: job => void remove(job), mutate };

  return <div className="min-w-0 space-y-3" aria-busy={loading || mutating}>
    {!detail && <JobFilters filters={filters} applications={view === "applications"} research={view === "research"}
      onChange={(key,value) => { const next = { ...filters }; if (value) next[key] = value; else delete next[key]; updateFilters(next); }}
      onReset={() => updateFilters({})}
      onRestore={() => { try { const stored = JSON.parse(localStorage.getItem(`jobtracker-${view}-filters`) || "{}"); delete stored.protected; updateFilters(stored); } catch { setError("Saved filters could not be read"); } }} />}
    {view === "research" && !detail && <div className="flex gap-2" aria-label="Review feeds">{[["jobs_found", "New jobs"], ["jobs_snoozed", "Snoozed"]].map(([status,title]) => <Button key={status} size="sm" variant={feed === status ? "default" : "outline"} disabled={mutating} onClick={() => { if (status === feed) return; ++sequence.current; request.current?.abort(); setFeed(status); setHistory([]); setCursor(null); }}>{title}</Button>)}</div>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {undo && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">Removed; recoverable for 30 days.<Button variant="outline" size="sm" disabled={mutating} onClick={async () => { if (await mutate("restore_job", { id: undo })) setUndo(null); }}>Undo removal</Button></div>}
    {!detail && <p className="text-xs text-muted-foreground" role="status">{loading ? "Searching…" : `${page.total.toLocaleString()} matching opportunities`}</p>}
    {page.jobs.length > 0 && (view === "research" || detail ? <ReviewQueue jobs={page.jobs} {...actions} /> : <ApplicationRows jobs={page.jobs} deleted={view === "deleted"} open={setOpened} {...actions} />)}
    {!page.jobs.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No opportunities match these filters.</p>}
    {!detail && view !== "applications" && <div className="flex items-center justify-between gap-3"><Button disabled={loading || mutating || !history.length} variant="outline" onClick={() => { const prev = history.at(-1) || null; setHistory(history.slice(0, -1)); void load(filters, prev); }}>Previous</Button><span className="text-sm">Page {history.length + 1}</span><Button disabled={loading || mutating || !page.has_more} onClick={() => { setHistory([...history, cursor]); void load(filters, page.next_cursor); }}>Next page</Button></div>}
    {opened && <JobDetailDialog job={opened} onClose={() => setOpened(null)} {...actions} />}
    {editing && <EditJobDialog job={{ ...editing, url: editing.url || null, location: editing.location || null, salary: editing.salary || null, posted_date: editing.posted_date || null, notes: editing.notes || null }} onClose={() => setEditing(null)} onUpdate={() => { setEditing(null); void load(filters, cursor); }} />}
  </div>;
}
