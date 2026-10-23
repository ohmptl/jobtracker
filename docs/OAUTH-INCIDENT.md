# OAuth and MCP production investigation - 2026-10-23

## Confirmed cause

Supabase Auth was signing with the legacy HS256 key. ChatGPT requests OIDC
scopes (`openid email profile`) when discovery advertises them. Supabase cannot
generate an ID token using HS256, so the authorization-code exchange failed
after successful registration and consent. The earlier deployment test used
only `offline_access`, which did not exercise ID token generation.

Sanitized production evidence (UTC):

| Time | Component | Result |
| --- | --- | --- |
| 18:40:09 | Supabase native DCR | 201; persisted public ChatGPT client |
| 18:40:17 | Vercel `/api/oauth/decision` | 303 after user approval |
| 18:40:22 | Supabase `/oauth/token` | 500 `unexpected_failure` |
| 18:40:40 | Supabase `/oauth/token` | Same failure on retry |
| 18:42:05 | Supabase `/oauth/token` | Same failure on another retry |
| 19:05:37 | Isolated synthetic OIDC reproduction | Same 500 before configuration fix |

The provider's internal error matched **`HS256 is not supported for ID token
signing`**. First failing production token request ID:
`01a16a10-6674-7560-9f18-a2318df4aa0f`. No authorization codes, tokens, cookies,
client secrets or raw log payloads are included here.

Discovery, registration, login and consent were functioning. No authenticated
MCP request followed those failing code exchanges. Recreating a ChatGPT
connection could not cure this provider configuration error.

## Separate transport finding

The MCP handler creates a fresh stateless SDK transport per request and returns
materialized JSON for POST. It previously also accepted GET, opened an SSE
stream, and immediately closed that stream during cleanup. A regression test
reproduced HTTP 200 with an empty SSE response. Authenticated GET now explicitly
returns 405 with `Allow: POST`, as permitted by Streamable HTTP; DELETE also
returns 405 because there are no persistent sessions to terminate. POST retains
SDK initialization, 202 notifications, JSON responses and no session ID.

Transport exceptions also previously became HTTP 401 because one catch covered
authentication and execution. Those errors now return a JSON-RPC 500; grant
lookup failures return 503. Invalid tokens still return a proper 401 discovery
challenge, and revoked/ungranted clients still receive 403.

These are independently verified server-side defects. Historical evidence does
not establish that the original instance's exact `Session terminated` error
was caused by the empty SSE stream. Its original connection configuration was
not exposed by the tools available in this session. The available cached
three-operation Job Tracker connector returned `Unknown tool` before any
backend call; it cannot verify either supplied app ID's current installation.

## Production correction

- Confirmed frontend and MCP were both on Vercel deployment
  `dpl_39deYW618tc95Y1qUiFa2rjt6Unj`, commit
  `b7daeba1ef391764a8ef48c11ff7bb2bcf7e053c`; there is no separate Edge Function.
- Existing Supabase project: `cpwcusyinnsstcirxaom`; OAuth issuer is exactly
  `https://cpwcusyinnsstcirxaom.supabase.co/auth/v1`.
- Used Supabase's native signing-key migration and rotation. At 19:06:27 UTC,
  ES256 became `in_use`; the legacy HS256 key remains `previously_used` and
  trusted. No signing key, API key, genuine client registration, session or
  grant was revoked. A pre-rotation HS256 user session remained valid.
- Native OAuth server, DCR, authorization path `/oauth/consent`, site URL,
  resource audience hook and RLS remain enabled. No database migration was
  required; all seven existing migrations match the linked project.
- Corrected MCP/diagnostic code is release `3.0.1`, initially promoted as
  `dpl_3VMQYbmaroVP2ccgs8qnFsjBqaxy`
  (`job-ndfthyn0t-ohmptls-projects.vercel.app`) to `https://job.ohmptl.com`.
  Subsequent Git deployments may have a newer artifact ID; verify the release
  using `X-Job-Tracker-Version` and the current Vercel production target.
- Structured integration logs include generated request ID, timestamp,
  deployment/release, endpoint, method, stage, status, fixed failure reason,
  and verified user/client identity. Request bodies, query strings, errors,
  authentication headers, cookies and provider responses are never serialized.

## Registration and callback configuration

Native discovery advertises DCR, PKCE S256, code/refresh grants and public
token authentication `none`. It does not advertise CIMD or
`authorization_response_iss_parameter_supported`. Do not advertise those
features in an application proxy or invent a registration server.

The existing ChatGPT registration is client
`840513cd-bf7c-45f3-857d-b1875eefb509`, created at 18:40:09 UTC, with the exact
redirect `https://chatgpt.com/connector/oauth/Yb-OQ5BvZjKZ`. It was preserved.
The tools do not expose which of the two supplied app IDs owns that registration.

Use the callback-specific URI supplied by that ChatGPT connection. The stable
`https://chatgpt.com/connector_platform_oauth_redirect` requires issuer-response
support that this provider does not advertise. Do not substitute it manually
or weaken redirect validation. New connections can register a different exact
callback through DCR; that is expected.

## Verification matrix

| Check | Result |
| --- | --- |
| Public protected-resource discovery | 200, canonical `/mcp` resource, exact Supabase issuer |
| Unauthenticated MCP GET/POST | 401, correct `WWW-Authenticate`, no interactive redirect |
| Native server discovery | 200; S256, DCR, public client auth and refresh supported |
| Public DCR | 201; exact HTTPS callback persisted and retrieved |
| Logged-out browser authorization | Login preserves pending consent; native approval returns 303 |
| Callback validation | Exact registered address and original state; test captures redirect without following it |
| Code exchange with OIDC scopes | 200 after ES256 correction; previously reproducibly 500 |
| OIDC ID token | Asymmetric signature verified using public JWKS; issuer, client audience, expiry, subject and nonce checked |
| UserInfo | 200; expected synthetic user subject |
| PKCE negative case | Wrong verifier rejected by native Auth |
| Resource-bound access token | Signed client identity and both MCP/PostgREST audiences verified |
| SDK Streamable HTTP | Initialize, initialized notification, parallel independent requests, JSON results, no session affinity |
| Published tools | All 18 names and input constraints match generated reference |
| Read-only tools | `get_job_stats`, `list_jobs`, `get_settings`, `list_activity`, `find_existing_job` pass |
| Pagination | Two synthetic jobs returned on distinct cursor pages |
| Controlled synthetic lifecycle | Add/get, Deleted, exact 30-day retention, Feed client/actor, restore to Jobs Found, remove again |
| Refresh and revocation | Refreshed token executes tool; isolated permission downgrade/revocation and refresh rejection pass |
| Isolation and cleanup | Two-user isolation passes; all synthetic users, jobs and registrations removed |
| Genuine data | 1,130 jobs, 15 application-stage jobs preserved; RLS enabled |
| Local checks | Lint, typecheck, build; 30 Node/database tests; 15 browser tests pass |
| ChatGPT account linking/invocation | Passed: user confirmed the newer instance connected and both `get_job_stats` and `list_jobs` work |

The standards-compliant SDK and browser tests prove the hosted backend path.
Separately, the user completed the real ChatGPT reconnect for
`asdk_app_6adbaa0714e88191b4c8c736eafe893a` and reported: "Connected; both tools
work." This externally confirms account linking and the requested read-only
invocations. No remaining production-use blocker was reported. The original
instance's historical session-termination cause remains unproven; verification
of that obsolete duplicate is not required for the working newer connection.

## Repeatable hosted regression

`npm run test:hosted-oauth` is explicit opt-in and requires Chromium installed
for Playwright. Supply these variables securely through the local environment,
never by pasting values into chat or committing an environment file:

- `MCP_TEST_ALLOW_SYNTHETIC=true`
- `MCP_TEST_APP_URL` (the HTTPS app origin)
- `MCP_TEST_SUPABASE_URL` (the linked project's HTTPS URL)
- `MCP_TEST_ANON_KEY` (project public key)
- `MCP_TEST_ADMIN_KEY` (server-only fixture administration credential)

The admin credential only creates/deletes the marked synthetic user and its own
OAuth registration. Browser consent grants normal application permissions, and
every MCP request uses the resulting native OAuth access token. Cleanup removes
only IDs created in this run, using the synthetic user's own human RPC for final
purge before deleting that user. It never invokes bulk cleanup or touches
genuine jobs. Any cleanup failure is reported for targeted follow-up.

## ChatGPT reconnect

1. Open the newer Job Tracker instance
   `asdk_app_6adbaa0714e88191b4c8c736eafe893a` in ChatGPT's Apps/connection UI.
2. Confirm its MCP server URL is exactly `https://job.ohmptl.com/mcp` and it uses
   OAuth. Select Connect/Reconnect. Do not enter legacy URL tokens or manually
   replace the DCR client credentials/callback.
3. Sign in and allow the connection. A currently approved native client may
   return directly to ChatGPT without showing consent again.
4. Start a fresh chat, enable that app, and run `get_job_stats` and `list_jobs`.
5. If it fails, report the displayed error, app ID and approximate UTC time.
   Match that attempt against safe Vercel integration events and native Auth
   status/error records. Do not share a code, token or full callback URL.

No new app instance or Supabase dashboard change is required by the confirmed
fix. Keep existing instances/registrations until the newer one links and invokes
successfully. Retire the obsolete duplicate only after that confirmation.

## References

- [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth)
- [OpenAI connection troubleshooting](https://developers.openai.com/plugins/deploy/troubleshooting)
- [Supabase OAuth setup and asymmetric ID-token requirement](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase signing keys and rotation trust](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase MCP hosting guide](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
