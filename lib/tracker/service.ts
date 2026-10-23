import type { SupabaseClient } from "@supabase/supabase-js";
import {
  newJobSchema,
  normalizeJob,
  toolSchemas,
  type Operation,
} from "./schemas";

export type TrackerContext = { db: SupabaseClient };
export async function execute(
  ctx: TrackerContext,
  operation: Operation,
  raw: unknown,
) {
  let args = toolSchemas[operation].parse(raw) as Record<string, unknown>;
  if (operation === "list_jobs" || operation === "jobs_needing_verification") {
    const { list, ...rest } = args;
    args = rest;
    if (list && list !== "all" && !args.statuses)
      args.statuses =
        list === "applied"
          ? ["applied", "interviewing", "offered", "accepted"]
          : [list];
    if (operation === "jobs_needing_verification") {
      operation = "list_jobs";
      args.verified_before ||= new Date(
        Date.now() - 14 * 86400000,
      ).toISOString();
      args.statuses ||= ["jobs_found", "jobs_snoozed"];
    }
  }
  if (["add_job_found", "find_existing_job", "update_job"].includes(operation))
    args = normalizeJob(args);
  if (operation === "update_job" && args.status === "dismissed")
    args.status = "jobs_deleted";
  const invalid: { index: number; outcome: string; reason: string }[] = [];
  const validIndices: number[] = [];
  if (operation === "bulk_add_jobs") {
    const jobs: unknown[] = [];
    (args.jobs as unknown[]).forEach((job, index) => {
      const result = newJobSchema.safeParse(job);
      if (result.success) {
        const normalized = normalizeJob(result.data);
        if (
          !normalized.idempotency_key &&
          typeof args.idempotency_key === "string"
        )
          normalized.idempotency_key = `${args.idempotency_key}:${index}`;
        if (
          !normalized.canonical_url &&
          !normalized.requisition_id &&
          !normalized.idempotency_key
        ) {
          invalid.push({
            index,
            outcome: "rejected",
            reason:
              "Bulk ingestion requires a URL, requisition ID, or stable job/batch idempotency key",
          });
          return;
        }
        jobs.push(normalized);
        validIndices.push(index);
      } else
        invalid.push({
          index,
          outcome: "rejected",
          reason: result.error.issues.map((i) => i.message).join("; "),
        });
    });
    args = { ...args, jobs };
    if (!jobs.length) return { results: invalid };
  }
  const { data, error } = await ctx.db.rpc("tracker_api", { operation, args });
  if (error) throw new Error(error.message);
  if (operation === "list_jobs") return { ...data, count: data.jobs.length };
  if (operation === "add_job_found") {
    const first = data.results[0];
    let job = first.job || null;
    if (first.outcome === "duplicate" && first.matches?.[0]?.id) {
      const strong =
        first.matches.find(
          (match: { match: string }) =>
            match.match !== "possible_title_location",
        ) || first.matches[0];
      job = (await execute(ctx, "get_job", { id: strong.id })).job;
    }
    return {
      ...data,
      job,
      duplicate: first.outcome === "duplicate",
      outcome: first.outcome,
    };
  }
  if (operation === "update_job") return { ...data, job: data.results[0].job };
  if (operation === "bulk_add_jobs")
    return {
      ...data,
      results: [
        ...data.results.map((r: object, i: number) => ({
          ...r,
          index: validIndices[i],
        })),
        ...invalid,
      ].sort((a, b) => a.index - b.index),
    };
  if (operation === "list_activity") {
    const events = data.events as { id: string; occurred_at: string }[];
    const size = (args.page_size as number) || 50;
    const visible = events.slice(0, size);
    return {
      events: visible,
      has_more: events.length > size,
      next_cursor:
        events.length > size
          ? { id: visible.at(-1)!.id, occurred_at: visible.at(-1)!.occurred_at }
          : null,
    };
  }
  return data;
}
