"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApplicationRows, ReviewQueue } from "@/components/job-views";
import { EditJobDialog } from "@/components/edit-job-dialog";
import { tracker } from "@/lib/tracker/browser";
import { type Job } from "@/lib/tracker/schemas";

export type JobPage = {
  jobs: Job[];
  total: number;
  has_more: boolean;
  next_cursor: { added_date: string; id: string; sort_value?: string } | null;
};
const label = (s: string) => s.replace(/^jobs_/, "").replaceAll("_", " ");
const defaultStatuses = {
  research: ["jobs_found"],
  applications: [
    "to_apply",
    "applied",
    "interviewing",
    "offered",
    "accepted",
    "rejected",
  ],
  deleted: ["jobs_deleted"],
};

export function JobBrowser({
  initialPage,
  view = "research",
  detail = false,
}: {
  initialPage: JobPage;
  view?: keyof typeof defaultStatuses;
  detail?: boolean;
}) {
  const [page, setPage] = useState(initialPage);
  const [feed, setFeed] = useState("jobs_found");
  const viewStatuses = view === "research" ? [feed] : defaultStatuses[view];
  const [filters, setFilters] = useState<Record<string, unknown>>({
    statuses: defaultStatuses[view],
    page_size: 30,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Job | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [history, setHistory] = useState<JobPage["next_cursor"][]>([]);
  const [cursor, setCursor] = useState<JobPage["next_cursor"]>(null);
  async function load(args = filters, next: typeof cursor = null) {
    setPending(true);
    setError("");
    try {
      if (detail) {
        const result = await tracker("get_job", { id: initialPage.jobs[0].id });
        setPage({ ...initialPage, jobs: [result.job] });
        return;
      }
      setPage(
        await tracker("list_jobs", {
          ...args,
          ...(next ? { cursor: next } : {}),
        }),
      );
      setCursor(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load jobs");
    } finally {
      setPending(false);
    }
  }
  async function mutate(
    operation: "update_job" | "remove_job" | "restore_job",
    args: object,
  ) {
    setPending(true);
    setError("");
    try {
      await tracker(operation, args);
      await load(filters, cursor);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update job");
      return false;
    } finally {
      setPending(false);
    }
  }
  async function filter(form: FormData) {
    const next: Record<string, unknown> = {
      page_size: 30,
      statuses: form.get("status")
        ? [form.get("status")]
        : viewStatuses,
    };
    for (const key of [
      "q",
      "company",
      "title",
      "location",
      "role_type",
      "priority",
      "availability",
      "posted_after",
      "sort",
    ])
      if (form.get(key)) next[key] = form.get(key);
    if (form.get("protected"))
      next.protected = form.get("protected") === "true";
    if (form.get("added_after"))
      next.added_after = `${form.get("added_after")}T00:00:00.000Z`;
    setFilters(next);
    setHistory([]);
    localStorage.setItem(`jobtracker-${view}-filters`, JSON.stringify(next));
    await load(next);
  }
  async function remove(job: Job) {
    const guarded =
      job.protected ||
      job.company_protected ||
      !["jobs_found", "jobs_snoozed"].includes(job.status);
    if (guarded &&
      !window.confirm(
        `${guarded ? "Intentionally override protection and move" : "Move"} ${job.position} at ${job.company} to Deleted? Recoverable for 30 days.`,
      )
    )
      return;
    const removed = await mutate("remove_job", {
      id: job.id,
      reason: "Owner removed via tracker",
      override_protection: guarded,
    });
    if (removed) setUndo(job.id);
  }
  return (
    <div className="min-w-0 space-y-3" aria-busy={pending}>
      {!detail && <form
        onSubmit={(e) => {
          e.preventDefault();
          void filter(new FormData(e.currentTarget));
        }}
        className="space-y-2 rounded-lg border bg-card p-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            name="q"
            aria-label="Search opportunities"
            placeholder="Search opportunities"
          />
          <Button disabled={pending} type="submit">
            Search / apply filters
          </Button>
        </div>
        <details>
          <summary className="cursor-pointer py-1 text-sm font-medium">
            Filters
          </summary>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["company", "title", "location"].map((name) => (
              <label key={name} className="space-y-1 capitalize">
                {name}
                <Input name={name} />
              </label>
            ))}
            {view !== "research" && <label>
              Status
              <select name="status" aria-label="Status filter">
                <option value="">All in this view</option>
                {defaultStatuses[view].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>}
            <label>
              Role type
              <select name="role_type">
                <option value="">All types</option>
                <option value="internship">Internship</option>
                <option value="co_op">Co-op</option>
                <option value="full_time">Full time</option>
                <option value="new_grad">New graduate</option>
                <option value="other">Other / review</option>
              </select>
            </label>
            <label>
              Career priority
              <select name="priority">
                <option value="">All priorities</option>
                {[
                  "strategic",
                  "relevant_full_time",
                  "review",
                  "low",
                  "expired",
                  "ineligible",
                ].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Protection
              <select name="protected">
                <option value="">Any</option>
                <option value="true">Protected</option>
                <option value="false">Unprotected</option>
              </select>
            </label>
            <label>
              Posting availability
              <select name="availability">
                <option value="">Any</option>
                {["open", "closed", "uncertain", "not_checked"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Added since (UTC)
              <Input type="date" name="added_after" />
            </label>
            <label>
              Posted since
              <Input type="date" name="posted_after" />
            </label>
            <label>
              Sort
              <select name="sort">
                <option value="date">Newest first</option>
                <option value="company">Company A–Z</option>
                <option value="position">Position A–Z</option>
              </select>
            </label>
          </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            type="reset"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const next = { statuses: viewStatuses, page_size: 30 };
              setFilters(next);
              setHistory([]);
              void load(next);
            }}
          >
            Clear filters
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              try {
                const stored = JSON.parse(
                  localStorage.getItem(`jobtracker-${view}-filters`) || "null",
                );
                if (stored) {
                  setFilters(stored);
                  setHistory([]);
                  void load(stored);
                }
              } catch {
                setError("Saved filters could not be read");
              }
            }}
          >
            Use saved filters
          </Button>
        </div>
        </details>
      </form>}
      {view === "research" && !detail && <div className="flex gap-2" aria-label="Review feeds">
        {[["jobs_found", "New jobs"], ["jobs_snoozed", "Snoozed"]].map(([status, title]) => <Button key={status} size="sm" variant={feed === status ? "default" : "outline"} disabled={pending} onClick={() => { setFeed(status); const next = { ...filters, statuses: [status] }; setFilters(next); setHistory([]); void load(next); }}>{title}</Button>)}
      </div>}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          {error}
        </p>
      )}
      {undo && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
        >
          Removed; recoverable for 30 days.
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              await mutate("restore_job", { id: undo });
              setUndo(null);
            }}
          >
            Undo removal
          </Button>
        </div>
      )}
      {!detail && <p className="text-xs text-muted-foreground">
        {page.total.toLocaleString()} matching opportunities
      </p>}
      {page.jobs.length > 0 && (view === "research" || detail
        ? <ReviewQueue jobs={page.jobs} pending={pending} edit={setEditing} remove={(job) => void remove(job)} mutate={mutate} />
        : <ApplicationRows jobs={page.jobs} deleted={view === "deleted"} pending={pending} edit={setEditing} remove={(job) => void remove(job)} mutate={mutate} />)}
      {!page.jobs.length && (
        <p className="rounded-xl border border-dashed p-8 text-center">
          No opportunities match these filters.
        </p>
      )}
      {!detail && <div className="flex items-center justify-between gap-3">
        <Button
          disabled={pending || !history.length}
          variant="outline"
          onClick={() => {
            const prev = history.at(-1) || null;
            setHistory(history.slice(0, -1));
            void load(filters, prev);
          }}
        >
          Previous
        </Button>
        <span className="text-sm">Page {history.length + 1}</span>
        <Button
          disabled={pending || !page.has_more}
          onClick={() => {
            setHistory([...history, cursor]);
            void load(filters, page.next_cursor);
          }}
        >
          Next page
        </Button>
      </div>}
      {editing && (
        <EditJobDialog
          job={{
            ...editing,
            url: editing.url || null,
            location: editing.location || null,
            salary: editing.salary || null,
            posted_date: editing.posted_date || null,
            notes: editing.notes || null,
          }}
          onClose={() => setEditing(null)}
          onUpdate={() => {
            setEditing(null);
            void load(filters, cursor);
          }}
        />
      )}
    </div>
  );
}
