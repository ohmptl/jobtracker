import { test } from "node:test";
import assert from "node:assert/strict";
import { collectJobPages } from "../lib/tracker/collection";
import type { Job } from "../lib/tracker/schemas";

test("Applications collects every bounded page beyond the row cap", async () => {
  const jobs = Array.from({ length: 1105 }, (_,i) => ({ id: String(i) } as Job));
  let calls = 0;
  const result = await collectJobPages(async cursor => {
    calls++;
    const start = cursor ? Number(cursor.id) : 0;
    const end = Math.min(start + 100, jobs.length);
    return { jobs: jobs.slice(start, end), total: jobs.length, has_more: end < jobs.length, next_cursor: end < jobs.length ? { id: String(end), added_date: "2026-10-23T00:00:00Z" } : null };
  });
  assert.equal(result.jobs.length, 1105);
  assert.equal(new Set(result.jobs.map(j => j.id)).size, 1105);
  assert.equal(result.has_more, false);
  assert.equal(calls, 12);
});

test("Applications fails visibly if a cursor stops advancing instead of showing a partial collection", async () => {
  await assert.rejects(collectJobPages(async () => ({ jobs: [], total: 10, has_more: true, next_cursor: null })), /complete collection/);
  await assert.rejects(collectJobPages(async () => ({ jobs: [], total: 10, has_more: true, next_cursor: { id: "same", added_date: "2026-10-23T00:00:00Z" } })), /complete collection/);
});
