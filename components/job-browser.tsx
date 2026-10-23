"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EditJobDialog } from "@/components/edit-job-dialog";
import { tracker } from "@/lib/tracker/browser";
import { statuses, type Job } from "@/lib/tracker/schemas";
import { formatUtc } from "@/lib/tracker/dates";

export type JobPage = {
  jobs: Job[];
  total: number;
  has_more: boolean;
  next_cursor: { added_date: string; id: string; sort_value?: string } | null;
};
const label = (s: string) => s.replace(/^jobs_/, "").replaceAll("_", " ");
const defaultStatuses = {
  research: ["jobs_found", "jobs_snoozed"],
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
}: {
  initialPage: JobPage;
  view?: keyof typeof defaultStatuses;
}) {
  const [page, setPage] = useState(initialPage);
  const [now] = useState(() => Date.now());
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update job");
    } finally {
      setPending(false);
    }
  }
  async function filter(form: FormData) {
    const next: Record<string, unknown> = {
      page_size: 30,
      statuses: form.get("status")
        ? [form.get("status")]
        : defaultStatuses[view],
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
    if (
      !window.confirm(
        `${guarded ? "Intentionally override protection and move" : "Move"} ${job.position} at ${job.company} to Deleted? Recoverable for 30 days.`,
      )
    )
      return;
    await mutate("remove_job", {
      id: job.id,
      reason: "Owner removed via job card",
      override_protection: guarded,
    });
    setUndo(job.id);
  }
  return (
    <div className="space-y-5" aria-busy={pending}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void filter(new FormData(e.currentTarget));
        }}
        className="space-y-3 rounded-xl border bg-card p-4"
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
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Filters
          </summary>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["company", "title", "location"].map((name) => (
              <label key={name} className="space-y-1 capitalize">
                {name}
                <Input name={name} />
              </label>
            ))}
            <label>
              Status
              <select name="status" aria-label="Status filter">
                <option value="">All in this view</option>
                {defaultStatuses[view].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
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
        </details>
        <div className="flex flex-wrap gap-3">
          <Button
            type="reset"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const next = { statuses: defaultStatuses[view], page_size: 30 };
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
      </form>
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
      <p className="text-sm text-muted-foreground">
        {page.total.toLocaleString()} matching opportunities · newest first
      </p>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {page.jobs.map((job) => (
          <article
            key={job.id}
            id={job.id}
            className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
          >
            <div className="space-y-1">
              <p className="font-medium text-muted-foreground">{job.company}</p>
              <h2 className="break-words text-lg font-semibold">
                {job.position}
              </h2>
              <p className="text-sm">
                {job.location || "Location not provided"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{label(job.status)}</Badge>
              <Badge variant="outline">{label(job.role_type)}</Badge>
              <Badge variant="outline">{label(job.priority)}</Badge>
              <Badge variant="outline">{label(job.availability)}</Badge>
              {job.next_action_at && Date.parse(job.next_action_at) <= now && (
                <Badge>Next action due</Badge>
              )}
              {(job.protected || job.company_protected) && (
                <Badge>
                  Protected{job.company_protected ? " company" : ""}
                </Badge>
              )}
            </div>
            {job.status === "jobs_deleted" && (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Restore before{" "}
                <time dateTime={job.purge_after || ""}>
                  {job.purge_after
                    ? formatUtc(job.purge_after)
                    : "retention date unavailable"}
                </time>
                .{" "}
                {job.purge_after
                  ? `${Math.max(0, Math.ceil((Date.parse(job.purge_after) - now) / 86400000))} days remaining.`
                  : ""}
              </p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                Full details
              </summary>
              <dl className="space-y-2 break-words text-sm">
                <dt>Notes</dt>
                <dd className="whitespace-pre-wrap text-muted-foreground">
                  {job.notes || "No notes"}
                </dd>
                <dt>Salary</dt>
                <dd>{job.salary || "Not provided"}</dd>
                <dt>Evaluation</dt>
                <dd>{job.evaluation_reason || "Not evaluated"}</dd>
                <dt>Added</dt>
                <dd>{formatUtc(job.added_date)}</dd>
                <dt>Requisition</dt>
                <dd>{job.requisition_id || "Unknown"}</dd>
                <dt>Last verified</dt>
                <dd>
                  {job.last_verified_at
                    ? formatUtc(job.last_verified_at)
                    : "Not checked"}
                </dd>
                <dt>Review flags</dt>
                <dd>{job.review_flags?.join(", ") || "None"}</dd>
                <dt>Next action</dt>
                <dd>
                  {job.next_action_at
                    ? formatUtc(job.next_action_at)
                    : "Not set"}
                </dd>
              </dl>
            </details>
            <div className="flex flex-wrap gap-2">
              {job.url && /^https?:\/\//i.test(job.url) && (
                <Button variant="outline" asChild>
                  <a href={job.url} target="_blank" rel="noreferrer">
                    Open posting
                  </a>
                </Button>
              )}
              {job.status === "jobs_deleted" ? (
                <Button
                  disabled={pending}
                  onClick={() => mutate("restore_job", { id: job.id })}
                >
                  Restore
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => setEditing(job)}
                  >
                    Edit details / notes
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      mutate("update_job", {
                        id: job.id,
                        protected: !job.protected,
                      })
                    }
                  >
                    {job.protected ? "Unprotect job" : "Protect job"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => remove(job)}
                  >
                    Remove
                  </Button>
                  <label className="w-full text-sm">
                    Move to stage
                    <select
                      aria-label={`Move ${job.position} to stage`}
                      disabled={pending}
                      value={job.status}
                      onChange={(e) =>
                        mutate("update_job", {
                          id: job.id,
                          status: e.target.value,
                        })
                      }
                    >
                      {statuses
                        .filter((s) => s !== "jobs_deleted")
                        .map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!page.jobs.length && (
        <p className="rounded-xl border border-dashed p-8 text-center">
          No opportunities match these filters.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
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
      </div>
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
