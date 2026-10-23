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
- [x] Feed, mobile job cards, server filtering, settings and analytics.
- [x] Automated database/API/UI checks, deployment and recovery guide.
- [ ] Hosted migration rehearsal, pg_cron verification and production deployment.
- [ ] Provider OAuth setup, resource-audience validation and real-client sign-in.
- [ ] Monitoring/alert hookup and production cleanup readiness review.
- [ ] Successful OAuth cutover, explicit legacy retirement deadline and revocation.

## Decisions

- Preserve the current Next.js deployment; Supabase is the authorization server.
- Use application client grants plus RLS. Supabase OIDC scopes alone do not
  authorize database operations. No service role in OAuth requests.
- Verify resource audience strictly; never accept the generic `authenticated`
  audience as proof that a token was issued for this MCP resource. OAuth stays
  disabled until the project's token audience capability is confirmed.
- Keep legacy access during validation, with a configurable retirement deadline.
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
Node, pnpm, Docker or Supabase CLI was initially present. A checksum-verified
Node 24.22.1 runtime, pnpm 12.15.0, Supabase CLI 2.121.0 and Chromium were installed
for local checks. Production project configuration and OAuth sign-in require
authenticated provider access. No production records have been mutated.

## Verification record

The connected legacy MCP was inspected read-only on 2026-10-22. Its schema
advertises `dismissed`, not `jobs_deleted`, and no pagination inputs. A list of
`all` returned exactly 1,000 rows (996 Jobs Found, 2 Applied, 2 Rejected) with
`count=1000` and no cursor or has-more field. This is a capped subset, not a
confirmed complete database inventory. No individual job values/notes were
written to the repository, and no production mutation was attempted.

See `DELIVERY.md` for test boundaries and `DEPLOYMENT.md` for exact external
gates. Node tests cover real PostgreSQL-compatible migrations/RLS/triggers and
the MCP SDK; Playwright covers six widths through actual component interactions.
The Next.js production build uses public placeholder environment values; it does
not prove that the hosted database or OAuth provider is configured.

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
