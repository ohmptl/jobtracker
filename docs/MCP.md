# MCP management contract

Version: `personal-job-tracker` 3.1.0; compatible SDK 1.32.1. Canonical endpoint:
`APP_URL/mcp`, stateless Streamable HTTP, JSON responses, OAuth authentication.
No agent-supplied actor name grants identity or permission.

POST handles initialize, notifications and tool requests using a fresh server
per request, without an MCP session ID. Authenticated GET and DELETE return 405
with `Allow: POST`: this deployment does not offer standalone SSE or persistent
sessions. Responses include `X-Request-Id` and `X-Job-Tracker-Version`; safe
structured logs distinguish authentication, grant checks and transport errors.

See [OAUTH-INCIDENT.md](OAUTH-INCIDENT.md) for the October 23 OIDC signing failure,
production verification and the opt-in synthetic regression command.

Production endpoint: **https://job.ohmptl.com/mcp**. Native Supabase DCR/S256,
resource-bound access tokens, refresh and revocation passed hosted validation.
Existing OAuth connections remain valid; refresh tool discovery if needed. Legacy URL-token
access is removed, including its database RPC and grants; old token URLs return
404. See [DELIVERY.md](DELIVERY.md) for verified boundaries.

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
Refresh existing client discovery caches after deploying; no OAuth relink is required.

| Tool | Input and result | Permission |
|---|---|---|
| `list_jobs` | Optional `statuses[]`, legacy `list`, search/filters, `sort`, `page_size` 1–100 (default 50), opaque `cursor`. Returns `jobs`, page `count`, full matching `total`, `has_more`, `next_cursor`. Follow until `has_more=false`. | read |
| `get_job` | UUID `id`; returns full `job`, including deletion, verification and workflow metadata. | read |
| `get_job_stats` | Optional UTC `after`/`before`; returns full database counts, status breakdown, role counts, due actions, activity counts, actors and top companies. Actor summaries are last 30 days; job totals/statuses honor the date window. | read |
| `find_existing_job` | URL/canonical URL, requisition, company/title/location; returns `matches[]` with `match` reason and `suppressed` tombstone flag. Possible title/location matches are review suggestions. Different known requisitions stay separate. | read |
| `add_job_found` | Required company/position, role type, optional posting metadata, source and `idempotency_key`. Returns `results[0]`, `batch_id`, compatibility `job`, `duplicate`, `outcome`. Suppressed entries return no job. | read + write |
| `bulk_add_jobs` | 1–100 input jobs, optional source and stable batch `idempotency_key`. Each record needs a URL, requisition or stable job/batch key. Returns indexed per-record `added`, `duplicate`, `rejected`, or `skipped` outcomes and a batch ID when valid records were processed. Invalid inputs do not invalidate good records. | read + write |
| `get_ingestion_runs` | Optional source and `before` timestamp. Returns at most 50 `runs`, each with completed time and counts. Use the latest fully successful run as the next search lower bound; never advance past rejected records without reviewing them. | read |
| `update_job` | `id` plus supported metadata/status/priority/review flags/workflow dates. Returns compatibility `job`, `results`, `batch_id`. Unspecified role type is never defaulted during updates. | read + write |
| `remove_job` | `id`, reason, optional context; Jobs Found/Snoozed have no employer or priority restrictions. Applications require previously recorded confirmed closure. Returns `results`, `batch_id`. Repeated removal does not restart retention. | read + write + remove |
| `bulk_remove_jobs` | 1–100 explicit UUIDs and reason. Returns every ID's `ok`/`rejected` result, with explanation on failure and a batch ID. Each record is atomic; partial success is explicit. | read + write + remove |
| `restore_job` | `id`. Returns `results`, `batch_id`. Restores the exact previous stage before the recovery deadline, including a removed application, preserving its history. | read + write + restore |
| `purge_job` | Deleted `id`, reason and exact `confirmation="PURGE:<id>"`. Returns `purged` ID. Creates compact tombstones and an audit snapshot. Cannot purge an active record. | read + write + purge |
| `jobs_needing_verification` | Listing filters/cursor. Defaults to review stages and verification older than 14 days or never checked. Same paginated response as `list_jobs`. | read |
| `submit_verification` | `id`, availability, source URL, method, evidence, confidence, optional HTTP status. Returns `results`, `batch_id`. Weak/blocked/transient evidence is forced to uncertain. | read + write |
| `list_activity` | Action/actor/client/search filters, page size and cursor. Returns `events`, `has_more`, `next_cursor`; stable timestamp/UUID order. Batches can span pages. | read + history |
| `get_settings` | Empty object. Returns owner client grants and fixed Deleted retention only. | read |

Role types: `internship`, `co_op`, `full_time`, `new_grad`, `other`. Existing
internship/full-time data remains unchanged; new-graduate classification is
explicit rather than inferred from unsupported requirements.

Priority categories: `strategic`, `relevant_full_time`, `review`, `low`,
`expired`, `ineligible`. Store `evaluation_reason`; do not use citizenship,
ITAR or clearance alone to classify a role as ineligible. Review flags:
`eligibility_review`, `url_verification`, `possible_duplicate`,
`potentially_expired`, `apply_soon`.

Lifecycle eligibility is based only on stage and confirmed posting closure.
Agents determine retention value; the backend does not rank companies or roles.
See [LIFECYCLE.md](LIFECYCLE.md) for the closure/removal sequence and migration.

Listing filters include company, title, case-insensitive partial-match `q`, role type, location,
priority, availability, source, added date bounds,
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

The owner web API also supports `grant_client`, `revoke_client`, and
`clear_history`, absent from MCP discovery. Settings retain labels and meaningful
permissions. `protect`, `policy`, cleanup preview/execution and employer-rule
operations are retired. Direct REST cannot bypass guards, audit or RLS.

AI metadata edits are allowed on application records, but application dates and
stage transitions remain owner-managed. For an application that is confirmed
closed, first `submit_verification`, then remove with a reason. Restore returns
the exact original application stage. `bulk_remove_jobs` always reports every
input ID's outcome. No preview or backend career-value evaluation is involved.
