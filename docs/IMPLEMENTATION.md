# Job Tracker v2 implementation record

## Baseline and roadmap

Repository: Next.js App Router, Supabase Auth/Postgres, Vercel, MCP SDK 1.x.
The checked-in MCP status enum already includes `jobs_deleted`; the connected
production discovery schema was confirmed to expose the older `dismissed` enum
without `jobs_deleted`. Listing has no range
and is subject to PostgREST's default row cap. UI queries share that defect.
Applications currently permit direct permanent deletion. No tests or migrations
directory existed. The old master setup can DROP application tables: **do not
run it against an existing database**.

Milestones (updated as work is verified):

- [x] Additive database migration, centralized permissions, audit and retention.
- [x] Shared paginated management API and MCP schemas, compatibility alias.
- [x] Supabase OAuth resource server, consent, client grants and revocation code.
- [x] Versioned cleanup, protected employers, verification and maintenance code.
- [x] Feed, dense application table, single-job review queue, filtering and analytics.
- [x] Automated database/API/UI checks, deployment and recovery guide.
- [x] Hosted migration rehearsal, active pg_cron and production deployment.
- [x] Native OAuth setup, audience validation, browser consent, SDK refresh/revocation.
- [x] Hosted browser workflows at six widths and concurrent fixture restore/purge.
- [x] Operator health probe and removal of legacy token infrastructure.
- [ ] Actual owner AI-client/daily-workflow OAuth reconnection.
- [ ] First natural scheduled runs, external alert delivery and broad cleanup review.

## Decisions

- Preserve the current Next.js deployment; Supabase is the authorization server.
- Use application client grants plus RLS. Supabase OIDC scopes alone do not
  authorize database operations. No service role in OAuth requests.
- Verify resource audience strictly; never accept the generic `authenticated`
  audience as proof that a token was issued for this MCP resource. OAuth stays
  disabled until the project's token audience capability is confirmed.
- OAuth-only MCP. Legacy routes, service-role bridge, hosting secrets and stored
  grants were retired at the owner's request after hosted OAuth verification.
- Settings exposes connection permissions and activity privacy. Employer/policy
  configuration forms are removed; backend lifecycle safeguards remain.
- Exactly 30 days of recovery. Tombstones default to 120 days, audit snapshots
  to 180 days. Settings cannot extend full deleted record retention.
- Automated removal only touches Jobs Found/Snoozed. Protected open roles and
  every application stage are excluded. Small-company internship classification
  requires an explicit low-priority evaluation with an explanation.
- Verification submission and a scheduled exact-host allowlist verifier are
  implemented. DNS validation/pinning, HTTPS, redirect, byte and time limits
  restrict outbound fetches; blocked/timeout results remain uncertain.
- No historical actor attribution will be fabricated.

## Environment and external checks

No `.env.local`, Supabase access token, linked project, Vercel credentials,
Node, pnpm, Docker or Supabase CLI was initially present. Local tooling was
installed for checks. Authenticated WSL access later supplied Node 24.21.0,
pnpm 12.15.0, Supabase CLI 2.121.0 and Vercel CLI 65.2.0. Six migrations are
applied and production deployed. All original job fields except intentionally
refreshed `updated_at` remain unchanged. No original job was removed or purged.

## Verification record

The connected legacy MCP was inspected read-only on 2026-10-22. Its schema
advertises `dismissed`, not `jobs_deleted`, and no pagination inputs. A list of
`all` returned exactly 1,000 rows (996 Jobs Found, 2 Applied, 2 Rejected) with
`count=1000` and no cursor or has-more field. This is a capped subset, not a
confirmed complete database inventory. No individual job values/notes were
written to the repository, and no production mutation was attempted.

On 2026-10-23 the upgraded existing connection returned 50 rows with full
`total=1130`, a cursor and `has_more=true`. The original `dismissed` bug passes
against the production OAuth endpoint with a real SDK client. Hosted synthetic
tests verified native PKCE, resource claims, refresh/revocation, browser consent,
two-user isolation, responsive workflows and concurrent restore/purge. Final
count is 1,130, with all 15 application-stage jobs preserved and no synthetic
users left. All 24 Node and 12 component browser tests pass, along with lint,
typecheck, the actual Vercel production build and hosted database lint.
See `DELIVERY.md` for limitations and `DEPLOYMENT.md` for remaining owner steps.

Sources consulted 2026-10-22:

- https://supabase.com/docs/guides/auth/oauth-server
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://supabase.com/docs/guides/ai-tools/byo-mcp
- https://modelcontextprotocol.io/specification/latest/basic/authorization
- https://github.com/supabase/agent-skills

SDK registry reports stable 1.32.1 for the existing `@modelcontextprotocol/sdk`
package. Remain on that compatible package rather than rewrite transports.
