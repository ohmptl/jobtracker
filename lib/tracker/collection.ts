import type { Job } from "./schemas";

export type JobPage = {
  jobs: Job[];
  total: number;
  has_more: boolean;
  next_cursor: { added_date: string; id: string; sort_value?: string } | null;
};

export const applicationStatuses = ["to_apply", "applied", "interviewing", "offered", "accepted", "rejected"];

// Keep the API bounded while presenting Applications as one complete collection.
export async function collectJobPages(fetchPage: (cursor?: NonNullable<JobPage["next_cursor"]>) => Promise<JobPage>): Promise<JobPage> {
  const jobs = new Map<string, Job>();
  const cursors = new Set<string>();
  let cursor: NonNullable<JobPage["next_cursor"]> | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const job of page.jobs) jobs.set(job.id, job);
    if (!page.has_more) return { jobs: [...jobs.values()], total: jobs.size, has_more: false, next_cursor: null };
    const key = JSON.stringify(page.next_cursor);
    if (!page.next_cursor || cursors.has(key)) throw new Error("Unable to load the complete collection; please retry.");
    cursors.add(key);
    cursor = page.next_cursor;
  }
}
