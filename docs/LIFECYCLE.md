# Job Tracker lifecycle - release 3.1.0

The backend stores and mutates records. Agents decide career value from the
owner's instructions. Employer, role type, priority, age and evaluation notes
never determine removal eligibility. No cleanup preview or policy is required.

| Current stage | Authorized AI behavior |
| --- | --- |
| Jobs Found / Snoozed | Edit metadata/priority, switch between these review stages, remove directly or in explicit-ID batches |
| To Apply / Applied / Interviewing / Offered / Accepted / Rejected | Edit metadata/priority; preserve stage and application dates; ordinary removal is blocked |
| Confirmed-closed application | Explicit recoverable removal is allowed after submitting closure evidence |
| Deleted | Restore to the exact previous stage before the recovery deadline; no editing until restored |

The human owner controls application stage changes and can explicitly remove
their own records through the UI. The UI confirms application removal. Agents
cannot escape the application guard by moving a record back to Jobs Found or by
using `update_job(status="jobs_deleted")` / the legacy `dismissed` alias. The
same database trigger guards direct RLS writes and all RPC removal paths.

## Removing a closed application

1. Inspect the actual posting and call `submit_verification` with `availability:
   "closed"`, `method: "employer_explicit"` or `"ats_explicit"`, `confidence:
   "high"`, a valid HTTP(S) source URL and explicit evidence (at least 20
   characters). An HTTP status, when supplied, must be successful or 404/410
   accompanied by explicit employer/ATS evidence; the status alone is not proof.
2. Weak evidence, a block, login requirement, timeout or temporary error is
   recorded as `uncertain` and cannot authorize application removal. Age is not
   closure evidence. Verification itself never removes a job.
3. Call `remove_job` or `bulk_remove_jobs` with explicit IDs and a reason. The
   guard requires closure already recorded on the row; a combined direct patch
   claiming closure and deletion cannot bypass that requirement.
4. Inspect per-record batch results and explain any failures. `update_job` with
   a Deleted status uses the same guard and requires a reason for AI removal.

Removal preserves the previous stage, notes, dates and verification information,
sets `deleted_at` and `purge_after` exactly 720 hours apart, and records the
reason, previous/new statuses, authenticated actor and batch ID in the Feed.
Restoration returns to that precise previous stage, including applications.
Only a separately authorized, explicitly confirmed purge can bypass waiting
for normal Deleted retention. Ordinary cleanup should use recoverable removal.

## Infrastructure that remains

- Server-side cursor pagination, literal full-field search and mechanical
  status/company/title/location/role/priority/date filtering.
- Canonical URLs, requisitions, ingestion keys and duplicate checks.
- OAuth, signed resource/client identity, per-user RLS and permissions `read`,
  `write`, `remove`, `restore`, `history`, and separate `purge`.
- Existing client labels and attribution; no label migration or reinterpretation.
- Daily maintenance purges only records already in Deleted for 30 days, expires
  bounded suppression identifiers (120 days) and existing audit/budget ledgers.
  It does not move any active posting into Deleted, even when verified closed.
- The existing bounded posting verifier records evidence only; it does not
  make career-value decisions or delete records.

## Migration 202610230008

The migration does not update any jobs or Feed events. Existing application
statuses, notes, dates and historical audit versions remain unchanged.

- Drops cleanup previews, policies, candidate generation, company protection
  matching and seeding. The old Cleanup page redirects to Jobs Found.
- Removes `protect` and `policy` permissions while retaining every meaningful
  permission, label, client ID, creation time and revocation state.
- Renames the existing company registry to `company_aliases`, drops its protection
  flag and retains spelling aliases solely to preserve deduplication identity
  and existing requisition tombstones. No new company prestige list is seeded.
- Keeps `jobs.protected` as an inert, deprecated storage column to preserve
  existing row data. It is omitted from management responses, filters, schemas
  and UI, cannot be changed on an existing row, and has no lifecycle effect.
  Historical Feed `policy_version` and maintenance `expired_removed` counters
  remain for history/compatibility; new events use no policy and the counter is
  zero. These are not active rule-engine settings.

An incompatible old application build must not be restored after this schema
change: it advertised retired tools. Prefer a forward fix; preserve the database
and OAuth configuration. No account relinking is required. Clients may refresh
tool discovery to pick up the 16-tool contract without recreating OAuth clients.

## Validation and data boundary

Regression coverage includes every application stage, generic/direct-write
bypasses, closure/403/timeout cases, mixed bulk results, exact-stage restoration,
30-day retention, tombstones, owner isolation, existing grants and migration
preservation. The hosted synthetic OAuth test additionally exercises browser
login/consent, signed OIDC tokens, MCP listing/pagination, metadata edits, direct
and bulk removal, application closure/restoration and Feed attribution.

All destructive smoke tests use a separate marked synthetic user and only IDs
created by that run. No genuine records are evaluated, backfilled, verified or
cleaned up. The preflight baseline contains 1,131 existing jobs and is compared
field-for-field after migration and hosted testing, including original notes,
application stages and Feed history.

Production verification passed on the canonical domain with release 3.1.0
(initial deployment `dpl_ARxMw9gtEa5EnmYLTUJgRjT5sbd7`). All 33 Node/database
tests and 15 browser tests passed, as did lint, typecheck, build and the extended
hosted OAuth/lifecycle regression. The post-test comparison preserved all
1,131 original jobs, five original Feed events and the existing client grant
exactly. No synthetic users remained; the retention cron and RLS were active,
and no active function referenced the retired rule-engine objects.
