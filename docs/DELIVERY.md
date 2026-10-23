# Job Tracker v2 delivery report

## Actual status

Implemented in this checkout and locally tested. Production is unchanged.
Hosted migration, OAuth settings, real-client login, token refresh/revocation,
cron execution, deployment and production pruning remain blocked on provider
credentials and sign-in. The installed Supabase CLI explicitly reports no access
token; no `.env.local` or Vercel configuration was supplied.

## Implementation by phase

| Phase | Implemented | Verification boundary |
|---|---|---|
| 0 | Repository audit, checked-in roadmap, architecture decisions, identification of unbounded queries and unsafe deletion. | Connected legacy schema confirmed `dismissed` without `jobs_deleted`; listing returned a capped 1,000 rows with no pagination metadata. |
| 1 | Shared status/validation model, deprecated `dismissed` adapter, paginated search, get/stats/duplicate checks, bulk ingestion/removal, restore/purge, canonical URLs and ingestion summaries. | Local Postgres-compatible database and actual MCP SDK discovery/calls. |
| 2 | Supabase OAuth resource endpoint/discovery/challenges, strict issuer/resource/expiry/client validation, native consent UI, granular client grants, immediate app revocation, audience hook, staged legacy bridge. | Code and claim/grant/hook tests; provider code+PKCE exchange and real clients need hosted validation. |
| 3 | Employer/alias registry, individual protection, versioned policies, 15-minute previews, atomic cleanup execution, exactly 720-hour recovery, purge/tombstones/audit retention, pg_cron migration, bounded scheduled verifier. | Database logic and classifier/SSRF unit tests; actual scheduler and external employer network checks need deployment. |
| 4 | Transactional audit triggers, immutable client IDs, owner labels/unknown actors, safe job snapshots, batches, search/filter/pagination, Feed and stable job links. | Database audit and mobile interaction tests. |
| 5 | Server-filtered job cards, responsive navigation/dialogs, touch targets, mobile filters, edit/stage/protect/remove/undo/restore controls, Deleted deadlines, Feed/settings. | Chromium interactions at six widths; no real iOS device or Android device tested. |
| 6 | Career-priority explanations, expanded role classification, review flags, deadlines/next actions/interviews/decisions, due-action badges, source/agent analytics and efficient full-tracker stats. | API/database tests and component interactions. |
| 7 | Automated local checks, CI workflow, generated tool schemas, deployment/rollback/reconnection/monitoring instructions. | Local checks pass as recorded below; CI has not run remotely. |

## Architecture

The existing Next.js/Vercel app remains the frontend and backend. Browsers use
Supabase Auth cookies and a same-origin `/api/tracker` route; existing extension
routes retain their function with exact-origin CORS controls. MCP uses the
official TypeScript SDK with the same Zod schemas and service. Native Supabase
Auth owns authorization codes, PKCE, client registration, tokens and refresh.
OAuth requests forward the user's access token to Supabase rather than an admin
key. RLS, per-client grants, and database mutation guards enforce isolation and
permissions even when a client calls REST directly.

The database owns concurrency-sensitive operations: every mutation and audit
event commits together; deletion and restoration lock rows; cleanup binds to
row revisions and policy versions; ingestion serializes per owner. Permanent
deletion is inaccessible through ordinary table grants. Cron performs bounded
retention work; a secret-authenticated Vercel route verifies only allowlisted
employer/ATS hosts. The verifier pins validated DNS addresses, rejects private
networks and bounds redirects, body size and time. Transient failures stay
uncertain. No AI identity is inferred from historical jobs or free text.

## Migration and retention

Four CLI migrations are provided under `supabase/migrations`. Existing jobs,
application stages, dates, notes and user IDs survive. Legacy status aliases are
mapped deliberately. Existing removed jobs with unknown deletion times get a
new full recovery window. URL identifiers are backfilled without deleting
duplicates. URL-only uniqueness is removed to preserve distinct requisitions;
idempotency keys and serialized ingestion provide retry safety.

Full removed records remain recoverable for exactly 30 elapsed UTC days.
Restoration then fails, and the next successful daily purge removes them. Only
compact URL/requisition fingerprints survive for the configured suppression
window (default 120 days). Feed snapshots contain company/title/status/reason
and minimal lifecycle metadata, not notes, credentials, headers or entire job
objects; they expire after 180 days and can be cleared by the owner. No events
are backfilled under fabricated actors. See [deployment and recovery](DEPLOYMENT.md)
for backup requirements, validation, schedule limits and rollback.

## Validation

Local checks include ESLint, TypeScript, the production Next.js build with
nonsecret placeholder configuration, Node test suites using PGlite's actual
PostgreSQL engine, real MCP SDK discovery and tool calls, and Playwright Chromium
interaction tests. The database fixtures stub Supabase's `auth` functions and
roles; they are not a hosted Supabase instance. PGlite tests omit the optional
pgcrypto extension registration (modern PostgreSQL supplies `gen_random_uuid`).
The pg_cron extension itself is not available in PGlite and must be verified
on Supabase. The audience hook and service-only verification functions are
executed by the database tests.

Final local result: **23 Node tests and 6 Playwright tests passed; lint,
typecheck and production build passed.** Read-only inspection of the existing
connected MCP also confirmed the stale enum and unpaginated 1,000-row response.
That response is a subset and does not prove the total record count or status
distribution of the complete production database.

Coverage includes a 10,000-record tracker, a full 1,105-record tied-date cursor
walk, search, original status mismatch, ingestion/duplicates, deletion/restore,
protection permissions and company-rename guard, active-application safety,
cleanup revision/policy invalidation and retry, UTC retention boundary,
real table RLS/grants, revocation, audit attribution, token claim rejection,
audience hook, legacy migration preservation, verification queue revision
checks, and conservative posting/SSRF classification.

Browser tests interact with the actual components and CSS in an isolated harness
at **320, 375, 390, 430, 768 and 1440 px**. The harness uses a simulated API and
navigation adapters; database behavior is separately tested. It is not a claim
of full hosted authenticated end-to-end coverage. Tests cover filter submission,
details, protection, stage change, note edit/dialog, removal/undo, Deleted
restore, Feed, navigation keyboard closing and horizontal overflow. Testing
found and fixed an Escape/focus bug in the old mobile drawer. No simulator
results are represented as real iOS Safari or Android Chrome testing.

Remaining external checks are listed in [DEPLOYMENT.md](DEPLOYMENT.md): native
PKCE sign-in, token exchange/refresh, deployed audience behavior, native client
registration/CIMD availability, real ChatGPT/Claude reconnection, multi-connection
Postgres restore/purge races, live cron runs, outbound verifier DNS/TLS behavior,
production RLS/advisors, hosting firewall rules and alert delivery. Row locking
and revision safeguards are implemented; simultaneous hosted connection tests
remain necessary before enabling production cleanup.

## MCP and cleanup readiness

See [MCP.md](MCP.md) for every exposed tool, permission and result contract, and
[mcp-tools.json](mcp-tools.json) for generated input schemas. The expanded role
classifications are explicit; legacy values remain supported. No automatic
scoring claims an employer's prestige or the user's competitiveness. Low-value
internship cleanup requires a stored career-value explanation. Strategic
companies and protected open jobs survive internship cleanup; an explicitly
verified closure may permit removal under policy. The human owner retains
intentional overrides. AI cleanup never modifies any existing application stage.

**Do not yet prune the production 1,000+ records.** The local capability is in
place; deployment, scheduler/monitoring and a real authorized MCP connection
must be validated first. No production pruning was attempted. After those gates,
agents may remove eligible records autonomously with recoverable deletion and
bounded batches; no per-job manual approval is required.

Required next actions are limited to provider access/configuration, staging
verification, deployment and the documented OAuth cutover. Legacy tokens must
be revoked after that succeeds; their removal has intentionally not been faked.
