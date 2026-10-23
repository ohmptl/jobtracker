# Deployment, OAuth cutover and recovery

Code and local fixtures have been validated. **No hosted migration, deployment,
OAuth login, real AI-client reconnection, or production cleanup has occurred.**
The CLI is installed (2.121.0), but `supabase projects list` reports no access
token. This checkout contains no deployment environment or Vercel credentials.
Do not enable pruning on the existing connector until the checklist below passes.

## 1. Authenticate and inspect using Supabase CLI

Use the existing project `cpwcusyinnsstcirxaom`; first rehearse on a test project
or database branch, with synthetic jobs and two test users. Never run destructive
test fixtures against production. Commands below use the repository CLI:

```sh
pnpm install --frozen-lockfile
pnpm exec supabase login
pnpm exec supabase link --project-ref <test-project-ref>
pnpm exec supabase migration list
pnpm exec supabase db query --linked "select status,count(*) from public.jobs group by status"
pnpm exec supabase db query --linked "select policyname,cmd,qual,with_check from pg_policies where schemaname='public'"
pnpm exec supabase config diff --project-ref <test-project-ref>
```

Do not print API keys, connection passwords, raw JWTs or private MCP URLs into
logs. Use your provider's managed secrets/environment UI. Do not blindly push
the sample `supabase/config.toml` to production: it contains localhost settings.
Inspect the project's existing hooks and migrate or compose them deliberately.

## 2. Backup and apply additive migrations

Take a restorable provider backup/snapshot first and retain a schema/data dump
outside source control. CLI dump requires local Postgres tooling or Docker:

```sh
pnpm exec supabase db dump --linked --file <secure-backup-path>/schema.sql
pnpm exec supabase db dump --linked --data-only --file <secure-backup-path>/data.sql
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase db lint --linked
pnpm exec supabase db advisors --linked
```

Review migration history before pushing; resolve history drift explicitly.
The four migrations add the model/RPCs, register daily pg_cron maintenance,
provide the dormant access-token hook, and add service-only verification RPCs.
No application tables are dropped. The old URL-only unique index becomes a
nonunique index because distinct requisitions may share a landing URL.
Legacy `dismissed` rows, if present, become `jobs_deleted`. Existing Deleted
rows without timestamps receive 30 days starting at migration. Their original
removal date is unknown. URLs receive a normalized identifier; notes, IDs,
application dates and added dates remain intact. No historical actors are made up.

**Never run `scripts/000_master_setup.sql` on the existing project.** It contains
a historical data reset. The migration test extracts only its CREATE TABLE
statement to verify upgrading the actual old table shape.

The scheduler migration fails visibly if pg_cron is unavailable. Resolve that
provider capability before accepting retention as configured. Jobs run at
02:15 UTC daily, purge at most 1,000 expired records per run and remove at most
100 verified closures. Larger backlogs need repeated operator runs or a more
frequent cron schedule; no early purge is permitted. Restoration expires exactly
720 hours after removal, even across DST. Physical purge follows the next
successful scheduled run. Tombstones expire after 120 days by default (30–180
configurable); audit and ingestion summaries after 180 days; run logs after 90.

Record before/after row and status counts and sample application IDs/notes.
Verify the `cron.job` entry and run `scripts/maintenance-health.sql` using the CLI.
Connect its `alert_no_recent_success` result and non-null `failure` rows to the
deployment's operator monitoring/alerts. Alert delivery is not configured in
this checkout; do not represent it as active. Vercel cron HTTP failures must also
be monitored in deployment logs.

## 3. Configure and deploy the web application

Copy `.env.example` into the deployment's secret store. Required public values:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Required canonical
application value: `APP_URL=https://<your-actual-host>` (no path or trailing slash).
Keep `MCP_OAUTH_ENABLED=false` and the legacy credentials unchanged initially.
The service-role key stays server-only for the temporary legacy bridge and
scheduled verification. OAuth requests never use it.

Set exact `EXTENSION_ALLOWED_ORIGINS` for the installed Chrome extension ID and
any explicitly trusted site. Arbitrary reflected credentialed CORS is disabled.
Set `MCP_ALLOWED_ORIGINS` only when a browser-based MCP client needs an additional
origin; native/server clients normally send no Origin. Do not use wildcards.

Configure a fresh `CRON_SECRET` of at least 32 random characters in Vercel.
`vercel.json` schedules verification at 03:00 UTC. Set
`VERIFICATION_ALLOWED_HOSTS` to a comma-separated list of exact authoritative
employer/ATS hostnames after reviewing the actual URLs. An empty list disables
network verification with a visible 503. No wildcard hosts, IP literals,
credentials, HTTP, non-443 ports, private/reserved DNS targets, cookies or
unapproved redirect destinations are allowed. DNS is checked on each hop and
pinned for the TLS connection; bodies, duration and redirects are bounded.
Ten eligible listings are checked per daily invocation, with host-friendly
spacing. Increase invocation frequency on a supporting plan for a larger queue;
the existing AI discovery workflow can also use `jobs_needing_verification` and
`submit_verification`. 403, timeouts, login blocks, 404/410 and server failures
alone do not prove closure. Automatic closure needs explicit posting metadata
expiration or an explicit employer heading. Ambiguous pages stay uncertain.

Deploy migrations before the new frontend/backend. Run:

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:mobile
pnpm build
```

Use your existing Vercel deployment, with a preview environment first. No new
hosting infrastructure is required. API requests are bounded to 256 KiB; pages
to 100 records; bulk operations to 100 jobs. The database tracks 120 successful
RPC calls per user/client/minute. Failed transactions do not consume that
counter. Configure the hosting firewall's IP/request limits as well, especially
for invalid-token traffic, DCR and the AI parser. No hosting firewall rules have
been installed by this implementation.

## 4. Supabase native OAuth configuration

The hosted project must be inspected after authentication; its current beta
capabilities have not been confirmed. Current official references:

- [OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)

In Authentication → URL Configuration, set Site URL to the real `APP_URL`.
In Authentication → OAuth Server, enable the native OAuth server and set its
authorization path to `/oauth/consent`. Require authorization code with PKCE
S256. Configure asymmetric signing keys according to Supabase's rotation process.
Never replace existing signing keys without checking active session impact.

Set the resource configuration using a reviewed local SQL file and CLI:

```sql
insert into public.tracker_resource_config(singleton,resource_url)
values(true,'https://<actual-app-host>/mcp')
on conflict(singleton) do update set resource_url=excluded.resource_url;
```

```sh
pnpm exec supabase db query --linked --file <reviewed-resource-config.sql>
```

In Authentication → Hooks, enable `public.tracker_access_token_hook` as the
Custom Access Token hook. It preserves regular browser tokens and adds the
specific MCP resource audience for a consented client. `authenticated` remains
in the audience array for PostgREST; **a token with only that generic audience
is rejected by `/mcp`**. Confirm the hosted hook event format, array-audience
support, PostgREST access and resource indicators with real issued test tokens.
Never weaken the resource check to make a failing provider configuration pass.

The app publishes protected-resource metadata at both
`/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-protected-resource`, and sends its URL in a 401
`WWW-Authenticate` challenge. The Supabase issuer supplies authorization-server
discovery at `https://<project-host>/.well-known/oauth-authorization-server/auth/v1`.
Check it for S256, supported client authentication methods, registration,
refresh tokens, revocation, and Client ID Metadata Document support.

Prefer CIMD only if discovery and the deployed provider actually support it.
The application does not invent a CIMD endpoint or impersonate an authorization
server. Otherwise use exact pre-registered client redirect URIs in
Authentication → OAuth Apps, or native DCR if the provider/client support it.
Public clients use token endpoint auth `none`; confidential clients use the
supported method appropriate to that client. Use the redirect URI supplied by
the actual client, not a guessed callback URL. Supabase owns redirect validation,
PKCE, token exchange and refresh-token rotation. No custom token proxy is used.

The consent screen grants `read` and separately selectable `write`, `remove`,
`restore`, and `history`. Protection management and permanent purge are off by
default. Settings can adjust client grants and owner-selected display labels.
Client IDs are taken from signed tokens and Supabase authorization details;
unverified registered names are labeled unknown, not attributed to ChatGPT.
Revocation blocks new resource requests immediately and attempts to revoke the
Supabase provider grant/refresh sessions. In-flight transactions may finish.

Set `MCP_OAUTH_ENABLED=true` in the test deployment only after issuer/audience
behavior is confirmed. Verify two users cannot read each other's records via
MCP, direct REST, functions or Feed. Verify a read-only grant cannot mutate,
missing delete permission fails, protection cannot be bypassed by renaming a
company, and revoked/expired tokens fail.

## 5. Real-client reconnection and legacy retirement

1. In ChatGPT's connector/app creation UI, create a separate test MCP connection
   to `https://<actual-app-host>/mcp` with OAuth. Complete sign-in and consent.
   If discovery cannot register a client, pre-register the callback URI shown by
   ChatGPT and supply that client ID/secret through the connector's supported UI.
2. Refresh tool discovery or recreate the connection; cached schemas on the old
   connector cannot be changed merely by editing server code. Confirm
   `remove_job`, `bulk_remove_jobs`, `restore_job` and `jobs_deleted` are exposed.
3. With a synthetic record, test list → add → update → remove → query Deleted →
   restore, then pagination and Feed attribution. Keep production jobs untouched.
4. In Claude's integrations/connectors UI, add the same HTTPS MCP endpoint with
   OAuth and complete independent consent. For Claude Code, Codex or Cursor,
   use that client's current HTTP MCP registration UI/CLI with the same endpoint;
   follow native OAuth login. No permanent bearer token belongs in its URL.
5. Test refresh, provider revocation and reconnect. Record which real clients
   and provider features passed. These tests cannot be substituted by unit tests.
6. Repeat the verified configuration in production. Repoint daily discovery
   workflows to the new connection. Confirm scheduled tools still work.
7. Set a short explicit UTC `MCP_LEGACY_DISABLE_AFTER` deadline (for example,
   seven days after successful validation). At cutover set
   `MCP_LEGACY_ENABLED=false`, remove/rotate `MCP_SECRET` and remove old client
   connection URLs. Revoke the `legacy-url-token` client grant. Remove
   `MCP_USER_ID` when retiring the bridge. Do not leave dual authentication
   running without a recorded deadline. Retain the service role only if the
   scheduled verifier is enabled.

Client configuration labels vary over time. The stable reconnection contract is
the `/mcp` HTTPS endpoint, OAuth discovery, native consent, and explicit app grants.

## 6. Rollback and cleanup readiness

Before irreversible purging begins, disable the scheduler with:

```sql
select cron.unschedule(jobid) from cron.job where jobname='jobtracker-daily-maintenance';
```

Disable Vercel verification cron and set `MCP_OAUTH_ENABLED=false` if OAuth fails.
Restore legacy access only while its secret is still valid and within the
documented migration window. Prefer a forward fix; do not run the old reset
script or drop added tables. Do not roll back to the old frontend's permanent
delete behavior; database grants intentionally block it. Before downgrading
roles/status schemas, inspect new data for values older code cannot handle.
Preserve added metadata and audit records when rolling application code back.
Restore a provider snapshot into a separate recovery project first for an actual
data-loss incident. Full records already purged require backup recovery, not
`restore_job`; suppression tombstones cannot reconstruct a job.

Production pruning is **not yet verified safe to start**. Required gates:
tested hosted migration and backups; cron enabled and monitored; a real MCP
OAuth connection with correct user identity/grants; deletion/restore tested on
synthetic data; protected registry reviewed; and a current policy preview.
Once these pass, authorized agents can autonomously remove batches of eligible
Jobs Found/Snoozed roles. Each cleanup preview lasts 15 minutes, binds to its
client, policy version and row revisions, and executes atomically. Ordinary
`remove_job`/`bulk_remove_jobs` do not require a manual approval per job.
