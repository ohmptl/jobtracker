# Job Tracker

A Supabase-backed engineering opportunity tracker with a paginated web UI and
MCP management API. This upgrade preserves the existing Next.js/Vercel stack.

- Jobs Found, Snoozed, Deleted and the existing application pipeline.
- Recoverable deletion for exactly 30 days, protected companies/jobs and versioned cleanup.
- Paginated search, bulk ingestion/removal, duplicate checks and database-side analytics.
- Supabase-native OAuth consent and per-client permissions, with a staged legacy bridge.
- Persistent activity Feed, source summaries and mobile job cards.
- Daily retention and allowlisted, conservative posting verification.

## Status and documentation

Implemented and locally tested; **not deployed or production-verified**. OAuth
cutover requires authenticated Supabase/Vercel access and a real client sign-in.

- [Implementation and validation report](docs/DELIVERY.md)
- [Deployment, OAuth setup, reconnection and rollback](docs/DEPLOYMENT.md)
- [MCP tools and contracts](docs/MCP.md)
- [Generated input schemas](docs/mcp-tools.json)
- [Implementation checklist and decisions](docs/IMPLEMENTATION.md)

## Local development

Use Node 24 and the pinned pnpm version. Copy `.env.example` to `.env.local` and
configure your test Supabase project and `APP_URL=http://localhost:3000`.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm exec playwright install chromium
pnpm test:mobile
pnpm build
```

The SQL/permission tests use synthetic data in an isolated PostgreSQL engine.
Browser tests use the actual components in a fixture harness with a simulated
API; hosted OAuth and full authenticated end-to-end checks remain separate.

Apply `supabase/migrations` with the authenticated Supabase CLI after backing up
and rehearsing on a test project. **Do not run `scripts/000_master_setup.sql`
against an existing database**: it is a historical setup script with a data reset.
Never expose service-role keys or provider credentials through `NEXT_PUBLIC_`.

The Chrome extension still lives in `extension/`. Load it unpacked in Chrome,
set its deployed app URL, and configure its exact origin in
`EXTENSION_ALLOWED_ORIGINS`. Existing scheduled searches remain in the AI client;
reconnect them only after validating OAuth and the new discovery schema.
