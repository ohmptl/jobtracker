# MCP management contract

Version: `personal-job-tracker` 3.0.0; compatible SDK 1.32.1. Canonical endpoint:
`APP_URL/mcp`, stateless Streamable HTTP, JSON responses. The temporary
`/mcp/<secret>` bridge shares the same tools and retires via environment settings.
No agent-supplied actor name grants identity or permission.

Production endpoint: **https://job.ohmptl.com/mcp**. Native Supabase DCR/S256,
resource-bound access tokens, refresh and revocation passed hosted validation.
Reconnect actual AI clients and refresh their discovery cache. The legacy bridge
expires **2026-10-31 00:00 UTC**; owner reconnection and secret retirement remain
manual cutover steps. See [DELIVERY.md](DELIVERY.md) for verified boundaries.

The installed SDK negotiates protocol revisions through `2025-11-25`; this
implementation does not advertise support for a newer revision the SDK cannot
negotiate. Current authorization guidance was reviewed separately. Verify
version negotiation with each actual client during the hosted connection test.

[`mcp-tools.json`](mcp-tools.json) contains generated, complete input JSON Schemas.
Regenerate with `pnpm exec tsx scripts/export-mcp-reference.ts`. Those schemas and
the web API use `lib/tracker/schemas.ts`; there is no separate stale OpenAPI enum.
MCP tool errors have `isError: true` and an explanatory text item. Successful
results contain both `structuredContent` and a JSON text content item. The output
schema permits an object; the per-operation fields below are the stable contract.

Canonical statuses:
`jobs_found`, `jobs_snoozed`, `jobs_deleted`, `to_apply`, `applied`,
`interviewing`, `offered`, `rejected`, `accepted`.
`dismissed` is accepted only as a deprecated `update_job` input and routes through
the exact same guarded deletion behavior. It is never written to the database.
Refresh/recreate existing client discovery caches after deploying.

| Tool | Input and result | Permission |
|---|---|---|
| `list_jobs` | Optional `statuses[]`, legacy `list`, search/filters, `sort`, `page_size` 1–100 (default 50), opaque `cursor`. Returns `jobs`, page `count`, full matching `total`, `has_more`, `next_cursor`. Follow until `has_more=false`. | read |
| `get_job` | UUID `id`; returns full `job`, including deletion, verification, protection and workflow metadata. | read |
| `get_job_stats` | Optional UTC `after`/`before`; returns full database counts, status breakdown, role counts, due actions, activity counts, actors and top companies. Actor summaries are last 30 days; job totals/statuses honor the date window. | read |
| `find_existing_job` | URL/canonical URL, requisition, company/title/location; returns `matches[]` with `match` reason and `suppressed` tombstone flag. Possible title/location matches are review suggestions. Different known requisitions stay separate. | read |
| `add_job_found` | Required company/position, role type, optional posting metadata, source and `idempotency_key`. Returns `results[0]`, `batch_id`, compatibility `job`, `duplicate`, `outcome`. Suppressed entries return no job. | read + write |
| `bulk_add_jobs` | 1–100 input jobs, optional source and stable batch `idempotency_key`. Each record needs a URL, requisition or stable job/batch key. Returns indexed per-record `added`, `duplicate`, `rejected`, or `skipped` outcomes and a batch ID when valid records were processed. Invalid inputs do not invalidate good records. | read + write |
| `get_ingestion_runs` | Optional source and `before` timestamp. Returns at most 50 `runs`, each with completed time and counts. Use the latest fully successful run as the next search lower bound; never advance past rejected records without reviewing them. | read |
| `update_job` | `id` plus supported metadata/status/priority/protection/review flags/workflow dates. Returns compatibility `job`, `results`, `batch_id`. Unspecified role type is never defaulted during updates. | read + write; protection changes need protect |
| `remove_job` | `id`, reason, optional context; `override_protection` is honored only for the human owner. Returns `results`, `batch_id`. Repeated removal does not restart retention. | read + write + remove |
| `bulk_remove_jobs` | 1–100 explicit UUIDs and reason. Returns every ID's `ok`/`rejected` result, with explanation on failure and a batch ID. Each record is atomic; partial success is explicit. | read + write + remove |
| `restore_job` | `id`. Returns `results`, `batch_id`. Restores prior valid stage before the exact recovery deadline; otherwise safe review fallback or a clear guard error. AI clients cannot restore application-stage history. | read + write + restore |
| `purge_job` | Deleted `id`, reason and exact `confirmation="PURGE:<id>"`. Returns `purged` ID. Creates compact tombstones and an audit snapshot. Cannot purge an active record. | read + write + purge |
| `preview_cleanup` | Empty object. Returns candidate IDs, title/company/location, reason, evidence/confidence, protection, expected count, policy version, preview ID and expiration. At most 100 candidates; no job mutations. | read + remove |
| `execute_cleanup` | `preview_id`. Returns `removed` count and `batch_id`. All-or-nothing; validates actor, policy, 15-minute deadline and row revisions. Repeated execution returns the saved result. | read + write + remove |
| `jobs_needing_verification` | Listing filters/cursor. Defaults to review stages and verification older than 14 days or never checked. Same paginated response as `list_jobs`. | read |
| `submit_verification` | `id`, availability, source URL, method, evidence, confidence, optional HTTP status. Returns `results`, `batch_id`. Weak/blocked/transient evidence is forced to uncertain. | read + write |
| `list_activity` | Action/actor/client/search filters, page size and cursor. Returns `events`, `has_more`, `next_cursor`; stable timestamp/UUID order. Batches can span pages. | read + history |
| `get_settings` | Empty object. Returns policy, employer/alias registry, owner client grants and fixed deleted retention. | read |

Role types: `internship`, `co_op`, `full_time`, `new_grad`, `other`. Existing
internship/full-time data remains unchanged; new-graduate classification is
explicit rather than inferred from unsupported requirements.

Priority categories: `strategic`, `relevant_full_time`, `review`, `low`,
`expired`, `ineligible`. Store `evaluation_reason`; do not use citizenship,
ITAR or clearance alone to classify a role as ineligible. Review flags:
`eligibility_review`, `url_verification`, `possible_duplicate`,
`potentially_expired`, `apply_soon`.

Cleanup previews preserve open internships whose titles match the configured
high-value technical domains, even if they were marked low. Domain edits bump
the policy version and invalidate outstanding previews. Evidence-backed closed
roles follow the separate expiration rule.

Listing filters include company, title, full-text `q`, role type, location,
priority, effective protection, availability, source, added date bounds,
posted date bounds and `verified_before` (including never verified).
Sorts are newest first, company A–Z, and position A–Z; each cursor includes
tie breakers. A paginated walk is not a snapshot of concurrent edits: refresh
from page one to include newly added rows or renamed sorted entries.

Ingestion never guesses an update to an existing job. Strong identifiers produce
`duplicate`; metadata merging is an explicit `update_job`. Similar titles alone
do not suppress insertion; the new job receives `possible_duplicate`. For safe
retries, supply a canonical URL, normalized employer/requisition pair, or stable
`idempotency_key`. Records lacking all three cannot be reliably distinguished
from genuinely separate postings and require caller review before retrying.
Bulk records without a stable identifier/key are rejected so a retry cannot
silently insert them twice. A batch key derives stable per-index keys; keep job
order unchanged on retries. Per-record schema rejections are returned to the caller; ingestion run totals
describe database-processed valid inputs. An all-invalid batch creates no run.

The owner web API also supports `save_policy`, `save_company`, `delete_company`,
`grant_client`, `revoke_client`, and `clear_history`. They are deliberately absent
from MCP discovery and require a human token without an OAuth client claim.
Direct REST cannot bypass server guards, audit triggers or RLS. AI writes cannot
change existing application-stage records or move review roles into applications;
the owner controls that pipeline. Protect permission is required to rename an
employer away from a protected identity. No ordinary tool can forge client claims.

For a typical cleanup, use stats and paginated search, explicitly evaluate roles,
then preview/execute a bounded batch. Preserve major employers and specialized
hardware roles, retain plausible 2027 full-time opportunities, and only mark a
smaller-employer internship low when its technical/career-value explanation
supports that choice. Never hard-purge to bypass the 30-day recovery workflow.
