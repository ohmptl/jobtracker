# Job Tracker v2 delivery report

## Deployment status — 2026-10-23

**Live: https://job.ohmptl.com. OAuth MCP: https://job.ohmptl.com/mcp.**
The production build is promoted to the existing custom domain. Supabase project
`cpwcusyinnsstcirxaom` has seven migrations applied. Older token-bearing deployment
snapshots were removed; use the current OAuth-only artifact for rollback.
Native OAuth, S256 PKCE, public-client dynamic registration, the resource-audience
hook and refresh/revocation work. No signing keys or account credentials rotated.

MCP now uses OAuth exclusively; the new server returns 50 bounded rows, full
`total=1130`, `has_more=true` and a cursor. The original `dismissed`
input now reaches recoverable Deleted through the production SDK endpoint.

**User action:** reconnect each actual AI client and daily workflow using OAuth,
confirm selected permissions, and refresh tool discovery. At the owner's request,
the old token route, database bridge, stored grants, four hosting configuration
variables and six historical token-bearing deployments were removed. Owner
consent/workflow changes were not performed or simulated.

## Implemented behavior

| Area | Result |
|---|---|
| Management | Shared validated schemas; paginated filters/search/sorting; get/stats/duplicate lookup; bulk ingestion/removal; Deleted/restore; confirmed administrative purge. |
| OAuth | Native registration, consent, codes, PKCE and tokens. Signed client IDs, strict issuer/resource/expiry validation, granular grants and immediate resource revocation. OAuth uses user tokens, never an admin key. |
| Cleanup | Versioned policies, protected companies/aliases/jobs, revision-bound 15-minute previews, atomic execution, exact 720-hour recovery and compact suppression tombstones. Application stages excluded from automation. |
| Verification | Bounded scheduled checks of six exact authoritative ATS hosts; pinned public DNS/TLS, HTTPS/redirect/time/size limits. Blocked, timeout and weak evidence remain uncertain. |
| Feed | Transactional audit, immutable client identity, owner labels, minimal snapshots, batch grouping, filtering, pagination and stable links. Historical actors are not invented. |
| Web | One full application collection in To Apply/Applied/Rejected groups, one-click Applied, automatic full-field search, clickable rows/read-only cards, separate editing; single-job approval with Coming up queue; New/Snoozed feeds; Deleted recovery, Feed and analytics. Settings contains only connections and activity privacy. |
| Operations | Additive migrations, CI checks, generated MCP schemas, rollback guide, active retention cron and operator health command. |

The existing Next.js/Vercel/Supabase architecture remains. Browsers use Auth cookies
and the same-origin API. MCP uses the official SDK and shared service/schemas.
RLS, grants, mutation guards, row locks and revision checks protect direct REST
and application requests. See [MCP.md](MCP.md) and [mcp-tools.json](mcp-tools.json).

## Original data preservation

A private export captured all jobs, original schema catalogs and setup state in
`.tools/hosted/pre-upgrade-backup.json` (ignored by Git). SHA-256:
`d63d14fa8cfa7712cc8d675816bf1db3d04e46b6f11c3527f8ccd17dee142638`.
This is an application-data/catalog recovery export, not a provider-wide backup
of Auth secrets or a claim of enabled PITR. Keep it private and copy it to your
normal secure backup location.

The first four migrations were rehearsed against the linked database inside
rolled-back transactions before CLI application. The fifth explicitly casts a
JSON default to clear a lint warning, preserving function permissions/behavior.
The old MCP service-role deployment received a guarded, audited compatibility
path during cutover. Add a new migration for further SQL changes.
Migration six removes that compatibility path and the service-only bridge; audit
history is retained. Employer/policy forms are removed from Settings; backend
protection and retention safeguards continue to enforce lifecycle rules.
Migration seven replaces whole-word search with literal case-insensitive partial
matches across user-facing job fields (including company, notes, salary, source
and dates). Multiple terms can match different fields. IDs and internal search/
audit bookkeeping are excluded. No job rows or timestamps are rewritten.

Applications follows bounded 100-row API cursors to collect every matching job,
then renders one collection without page controls. Research and Deleted retain
bounded pages. Search is automatic after a 250ms typing pause; obsolete requests
are aborted and their results ignored. Row actions do not trigger card opening;
Enter/Space opens a focused row. Cards prioritize stage actions, posting, notes
and upcoming dates, with secondary metadata and edit fields collapsed.

Final comparison confirmed **1,130 original IDs and original field values**:
owners, stages, notes, company/title, URLs, added/applied dates. Only `updated_at`
was excluded because URL backfill deliberately refreshes it.

| Status | Before and after |
|---|---:|
| Jobs Found | 1,069 |
| Snoozed | 35 |
| Deleted | 11 |
| To Apply | 9 |
| Applied | 4 |
| Rejected | 2 |

All 15 application-stage records remain intact. The 11 existing Deleted jobs had
unknown removal times and received a fresh full 720 hours; earliest purge
eligibility is `2026-11-22T04:22:37.136219Z`. No original job was removed,
restored or purged during development. All temporary users, jobs and OAuth
registrations were removed; one original Auth user remains.

## Verification results

- **Local:** 27 Node and 15 Playwright tests pass; ESLint, TypeScript and Vercel
  production build pass. Coverage includes 10,000 jobs, a complete 1,105-record
  tied-date cursor walk, status compatibility, ingestion retries, audit, RLS/grants,
  protection, policy/revision races, verification and exact retention boundaries.
- **Hosted browser:** real sign-in, search/filter, details, notes, protection,
  remove/undo, Deleted deadline/restore, owner stage change, Feed, settings and
  analytics pass. Pages fit 320, 375, 390, 430, 768 and 1440 px; mobile navigation
  closes with Escape. No uncaught JavaScript errors. No physical iOS/Android tests.
  The compact application table was verified with synthetic rows,
  real stage/note edits and guarded remove/undo. Review approval advances the
  featured job, Snooze/New switches correctly, and Deleted restores correctly.
  Table/review/settings fit all six widths. Old token URLs return 404.
  The grouped collection was subsequently verified with 135 synthetic applications
  spanning multiple API cursor pages. Live typing matched company fragments,
  notes, salary, source and combined terms without Enter. Applied shortcuts set
  dates and moved rows between groups. Mouse/keyboard row opening, separate note
  editing, shared review cards and final opaque mobile/desktop card layouts passed.
- **Hosted OAuth:** public DCR, wrong-verifier rejection, real browser consent/303
  redirect and code exchange, signed client/resource claims, PostgREST access,
  refresh and native grant/refresh revocation pass. The actual consent response's
  redirect code was exchanged directly; Chromium's synthetic localhost callback
  navigation was not the proof. DCR is advertised; CIMD is not advertised.
- **Hosted MCP:** real SDK discovery and synthetic add/get/update/remove/restore
  pass on production; `dismissed` maps to Deleted. Read-only clients cannot remove;
  revoked grants reject unexpired tokens. A second user cannot access the first
  user's or original owner's jobs.
- **Extension API:** the owner's exact installed origin passes preflights for
  session/add/parse. Unlisted origins fail. With a signed-in synthetic browser,
  session access and extension job insertion succeed under owner identity; bad
  parse input is rejected before a model request. The installed Chrome popup
  and a billable model parsing request were not automated.
- **Concurrency:** two live connections overlap while holding row locks.
  Restore-first makes a waiting purge reject the now-active synthetic job;
  explicit-purge-first makes a waiting restore reject the missing synthetic job.
  Scheduled expired eligibility is covered by database tests and guarded
  zero-change hosted maintenance, not by expiring original jobs.
- **Operations:** production DB lint has no warnings. Retention cron is active;
  both direct and actual pg_cron execution of a guarded transaction removed/purged
  zero jobs with no failed run. The one-off validation schedule was removed.
  The regular daily run remains to be observed. Resource metadata/401 challenge
  work; unauthenticated verification is 401. One read-only pinned ATS request
  returned HTTP 200 and conservatively remained uncertain. The scheduled verifier
  has not been manually run on original jobs.

Security/performance advisors returned no errors. Remaining warnings: eight
authenticated GraphQL-schema visibility notices for RLS-protected tables, two
intentional authenticated SECURITY DEFINER RPCs with explicit identity/grant
checks, and existing disabled leaked-password protection. This is not a clean
security report. No anonymous/public table exposure warning returned. Provider
firewall rules and paid Auth features were unchanged. See the repository's Actions
tab for the validation workflow on the synchronized commit.

## Scheduling, monitoring and cleanup readiness

Retention is active at **02:15 UTC daily**, bounded to 1,000 purges and 100 verified
closures/run. Vercel verification is configured at **03:00 UTC** with a generated
server-only secret and six exact ATS hosts. Full removed records expire after
30 elapsed UTC days; physical purge follows a successful scheduled run.
Tombstones default to 120 days, minimal audit/ingestion summaries to 180 days,
maintenance logs to 90 days.

The installed unpacked Chrome extension origin is explicitly allowlisted:
`chrome-extension://fbpbdbepncdjgofdginagebeggpkkpdk`. Arbitrary extension/site
origins are rejected. Changing the installed extension ID requires updating this
production configuration.

Run `node scripts/maintenance-health.mjs` in the authenticated CLI environment.
It reports history/schedule/staleness, exits 1 for stale/failed/inactive maintenance
and 2 for a query/response failure. Current health is green. Vercel cron failures
are visible in deployment logs. **External alert delivery is not connected** to
an email, webhook or monitoring account; no destination was supplied or invented.

Do not launch broad production pruning yet. Complete actual owner AI-client
OAuth reconnection, review protected companies/current policy preview, and observe
the first scheduled runs. Ordinary authorized recoverable removals need no
per-job approval. All application stages remain guarded from automated cleanup.

Automatic approval review rejected broad environment download and unguarded
maintenance. Approved alternatives used narrow per-variable access in memory
and a locked transaction that aborts if any original row could be removed.
No provider credentials were committed or logged.

See [DEPLOYMENT.md](DEPLOYMENT.md) for operations and recovery steps.
