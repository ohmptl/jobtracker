"use client";
import { useState } from "react";
import Link from "next/link";
import { tracker } from "@/lib/tracker/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUtc, relativeTime } from "@/lib/tracker/dates";

type Event = {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_label: string;
  client_id: string | null;
  action: string;
  job_id: string | null;
  company: string | null;
  position: string | null;
  reason: string | null;
  batch_id: string | null;
  previous_status: string | null;
  new_status: string | null;
};
type Page = {
  events: Event[];
  has_more: boolean;
  next_cursor: { occurred_at: string; id: string } | null;
};
export function ActivityFeed({ initialPage }: { initialPage: Page }) {
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState(initialPage);
  const [events, setEvents] = useState(initialPage.events);
  const [filters, setFilters] = useState({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const key = `${event.batch_id || event.id}:${event.action}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  async function load(args: object, more = false) {
    setPending(true);
    setError("");
    try {
      const data = await tracker("list_activity", args);
      setPage(data);
      setEvents(more ? [...events, ...data.events] : data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load feed");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const next = Object.fromEntries([...form].filter(([, v]) => v));
          setFilters(next);
          void load(next);
        }}
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
      >
        <Input
          name="q"
          placeholder="Search activity"
          aria-label="Search activity"
        />
        <select name="action" aria-label="Filter activity action">
          <option value="">All actions</option>
          {[
            "added",
            "removed",
            "restored",
            "status_changed",
            "edited",
            "verified",
            "verified_closed",
            "purged",
          ].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select name="actor_type" aria-label="Filter actor type">
          <option value="">All actors</option>
          <option value="human">You</option>
          <option value="ai_agent">AI clients</option>
          <option value="automation">Scheduled maintenance</option>
        </select>
        <Input
          name="client_id"
          aria-label="Client ID"
          placeholder="Exact client ID (optional)"
        />
        <Button disabled={pending}>Filter feed</Button>
        <Button
          type="reset"
          variant="outline"
          onClick={() => {
            setFilters({});
            void load({});
          }}
        >
          Clear filters
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {[...groups].map(([key, group]) => {
        const first = group[0];
        return (
          <article
            key={key}
            className="space-y-3 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">{first.actor_label}</h2>
              <time
                className="text-sm text-muted-foreground"
                dateTime={first.occurred_at}
                title={formatUtc(first.occurred_at)}
                suppressHydrationWarning
              >
                {relativeTime(first.occurred_at, now)} ·{" "}
                {formatUtc(first.occurred_at)}
              </time>
            </div>
            <p className="capitalize">
              {first.action.replaceAll("_", " ")} {group.length}{" "}
              {group.length === 1 ? "opportunity" : "opportunities"}
              {first.batch_id ? " in this batch" : ""}
            </p>
            {first.reason && (
              <p className="break-words text-sm text-muted-foreground">
                {first.reason}
              </p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3">
                View affected jobs
              </summary>
              <ul className="space-y-3">
                {group.map((e) => (
                  <li key={e.id} className="break-words border-t pt-3">
                    {e.action === "purged" ? (
                      <span>
                        {e.company} — {e.position} (purged)
                      </span>
                    ) : (
                      <Link
                        className="underline"
                        href={`/dashboard/jobs/${e.job_id}`}
                      >
                        {e.company} — {e.position}
                      </Link>
                    )}
                    {e.previous_status && e.new_status && (
                      <p className="text-sm text-muted-foreground">
                        {e.previous_status} → {e.new_status}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 break-all text-xs text-muted-foreground">
                Actor: {first.actor_type}
                {first.client_id ? ` · Client ${first.client_id}` : ""}
              </p>
            </details>
          </article>
        );
      })}
      {!events.length && (
        <p className="rounded-lg border border-dashed p-8 text-center">
          No activity yet. New changes will appear here; historical actors have
          not been inferred.
        </p>
      )}
      {page.has_more && (
        <Button
          disabled={pending}
          onClick={() => load({ ...filters, cursor: page.next_cursor }, true)}
        >
          Load more activity
        </Button>
      )}
    </div>
  );
}
