import { z } from "zod";

export const statuses = [
  "jobs_found",
  "jobs_snoozed",
  "jobs_deleted",
  "to_apply",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "accepted",
] as const;
export const statusSchema = z.enum(statuses);
export const prioritySchema = z.enum([
  "strategic",
  "relevant_full_time",
  "review",
  "low",
  "expired",
  "ineligible",
]);
export const roleSchema = z.enum([
  "internship",
  "co_op",
  "full_time",
  "new_grad",
  "other",
]);
export const availabilitySchema = z.enum([
  "open",
  "closed",
  "uncertain",
  "not_checked",
]);
const text = (max: number) => z.string().trim().max(max);
const id = z.uuid();
export const safeUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  }, "Use an HTTP(S) URL without credentials");
export const newJobSchema = z.object({
  company: text(200).min(1),
  position: text(300).min(1),
  role_type: roleSchema.default("full_time"),
  url: safeUrl.nullable().optional(),
  canonical_url: safeUrl.nullable().optional(),
  requisition_id: text(200).nullable().optional(),
  location: text(300).nullable().optional(),
  idempotency_key: text(200).min(1).optional(),
  salary: text(200).nullable().optional(),
  posted_date: z.iso.date().nullable().optional(),
  notes: text(5000).nullable().optional(),
  source: text(200).nullable().optional(),
  source_confidence: text(100).nullable().optional(),
});
export const listSchema = z.object({
  list: z.enum(["all", ...statuses]).optional(),
  statuses: z.array(statusSchema).min(1).max(9).optional(),
  page_size: z.number().int().min(1).max(100).default(50),
  sort: z.enum(["date", "company", "position"]).default("date"),
  cursor: z
    .object({
      added_date: z.iso.datetime({ offset: true }),
      id,
      sort_value: z.string().max(300).optional(),
    })
    .optional(),
  company: text(200).optional(),
  title: text(300).optional(),
  q: text(300).optional(),
  location: text(300).optional(),
  role_type: roleSchema.optional(),
  priority: prioritySchema.optional(),
  protected: z.boolean().optional(),
  availability: availabilitySchema.optional(),
  source: text(200).optional(),
  added_after: z.iso.datetime({ offset: true }).optional(),
  added_before: z.iso.datetime({ offset: true }).optional(),
  posted_after: z.iso.date().optional(),
  posted_before: z.iso.date().optional(),
  verified_before: z.iso.datetime({ offset: true }).optional(),
});
export const updateSchema = newJobSchema
  .omit({ idempotency_key: true })
  .partial()
  .extend({
    id,
    role_type: roleSchema.optional(),
    status: z.enum([...statuses, "dismissed"]).optional(),
    priority: prioritySchema.optional(),
    protected: z.boolean().optional(),
    evaluation_reason: text(2000).optional(),
    review_flags: z
      .array(
        z.enum([
          "eligibility_review",
          "url_verification",
          "possible_duplicate",
          "potentially_expired",
          "apply_soon",
        ]),
      )
      .max(5)
      .optional(),
    applied_date: z.iso.datetime({ offset: true }).nullable().optional(),
    application_deadline: z.iso.date().nullable().optional(),
    next_action_at: z.iso.datetime({ offset: true }).nullable().optional(),
    interview_at: z.iso.datetime({ offset: true }).nullable().optional(),
    decision_at: z.iso.datetime({ offset: true }).nullable().optional(),
    reason: text(1000).optional(),
    override_protection: z.boolean().optional(),
  });
export const toolSchemas = {
  list_jobs: listSchema,
  get_job: z.object({ id }),
  get_job_stats: z.object({
    after: z.iso.datetime({ offset: true }).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
  }),
  find_existing_job: newJobSchema
    .partial()
    .refine(
      (v) =>
        !!(
          v.url ||
          v.canonical_url ||
          v.requisition_id ||
          (v.company && v.position)
        ),
      "Supply a URL, requisition, or company/title",
    ),
  add_job_found: newJobSchema,
  // Records validate separately, allowing a useful per-record rejection response.
  bulk_add_jobs: z.object({
    jobs: z.array(z.unknown()).min(1).max(100),
    idempotency_key: text(150).min(1).optional(),
    source: text(200).optional(),
  }),
  get_ingestion_runs: z.object({
    source: text(200).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
  }),
  update_job: updateSchema,
  remove_job: z.object({
    id,
    reason: text(1000).min(1),
    context: text(1000).optional(),
    override_protection: z.boolean().optional(),
  }),
  bulk_remove_jobs: z.object({
    ids: z.array(id).min(1).max(100),
    reason: text(1000).min(1),
  }),
  restore_job: z.object({ id }),
  purge_job: z.object({
    id,
    confirmation: text(100),
    reason: text(1000).min(1),
  }),
  preview_cleanup: z.object({}),
  execute_cleanup: z.object({ preview_id: id }),
  jobs_needing_verification: listSchema,
  submit_verification: z.object({
    id,
    availability: availabilitySchema,
    source: safeUrl,
    method: z.enum([
      "employer_explicit",
      "ats_explicit",
      "http",
      "timeout",
      "blocked",
      "login_required",
    ]),
    evidence: text(2000).min(1),
    confidence: z.enum(["high", "medium", "low"]),
    http_status: z.number().int().min(100).max(599).optional(),
  }),
  list_activity: z.object({
    action: text(50).optional(),
    actor_type: z.enum(["human", "ai_agent", "automation"]).optional(),
    client_id: text(500).optional(),
    q: text(300).optional(),
    page_size: z.number().int().min(1).max(100).default(50),
    cursor: z
      .object({ occurred_at: z.iso.datetime({ offset: true }), id })
      .optional(),
  }),
  get_settings: z.object({}),
  save_policy: z.object({
    ai_deletion: z.boolean().optional(),
    automatic_expiration: z.boolean().optional(),
    tombstone_days: z.number().int().min(30).max(180).optional(),
    technical_domains: z.array(text(200)).max(50).optional(),
    internship_standard: text(2000).optional(),
  }),
  save_company: z.object({
    name: text(200).min(1),
    aliases: z.array(text(200).min(1)).max(50).default([]),
    protected: z.boolean().default(true),
  }),
  delete_company: z.object({ id }),
  grant_client: z.object({
    client_id: text(500).min(1),
    label: text(200).min(1),
    permissions: z
      .array(
        z.enum([
          "read",
          "write",
          "remove",
          "restore",
          "purge",
          "history",
          "protect",
          "policy",
        ]),
      )
      .min(1)
      .max(8),
  }),
  revoke_client: z.object({ client_id: text(500).min(1) }),
  clear_history: z.object({ before: z.iso.datetime({ offset: true }) }),
};
export type Operation = keyof typeof toolSchemas;

export function canonicalizeUrl(raw: string) {
  const u = new URL(safeUrl.parse(raw));
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (
      /^(utm_|fbclid$|gclid$|msclkid$|ref$|referrer$|source$|trackingId$)/i.test(
        key,
      )
    )
      u.searchParams.delete(key);
  }
  u.searchParams.sort();
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");
  return u.toString();
}

export function normalizeJob<T extends Record<string, unknown>>(input: T): T {
  if (input.url === null && input.canonical_url === undefined)
    return { ...input, canonical_url: null };
  const canonical = input.canonical_url || input.url;
  return {
    ...input,
    ...(typeof canonical === "string"
      ? { canonical_url: canonicalizeUrl(canonical) }
      : {}),
  };
}

export type Job = z.infer<typeof newJobSchema> & {
  id: string;
  status: (typeof statuses)[number];
  added_date: string;
  updated_at: string;
  priority: z.infer<typeof prioritySchema>;
  protected: boolean;
  company_protected?: boolean;
  availability: z.infer<typeof availabilitySchema>;
  evaluation_reason: string | null;
  deleted_at: string | null;
  purge_after: string | null;
  previous_status: string | null;
  review_flags: string[];
  last_verified_at: string | null;
  applied_date: string | null;
  application_deadline: string | null;
  next_action_at: string | null;
  interview_at?: string | null;
  decision_at?: string | null;
};
