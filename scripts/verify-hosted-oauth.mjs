// Opt-in production regression. Creates only marked synthetic users/clients.
// Admin credentials manage fixtures only; all MCP requests use native OAuth JWTs.
import assert from 'node:assert/strict';
import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync } from 'node:fs';

const site = process.env.MCP_TEST_APP_URL;
const supabase = process.env.MCP_TEST_SUPABASE_URL;
const anon = process.env.MCP_TEST_ANON_KEY;
const adminKey = process.env.MCP_TEST_ADMIN_KEY;
if (!site || !supabase || !anon || !adminKey || process.env.MCP_TEST_ALLOW_SYNTHETIC !== 'true')
  throw new Error('Set the MCP_TEST_* variables documented in docs/OAUTH-INCIDENT.md');
assert.equal(new URL(site).protocol, 'https:');
assert.equal(new URL(supabase).protocol, 'https:');
const resource = `${site}/mcp`;
const reference = JSON.parse(readFileSync(new URL('../docs/mcp-tools.json', import.meta.url)));
const admin = createClient(supabase, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const human = createClient(supabase, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const redirectUri = 'https://chatgpt.com/connector/oauth/jobtracker-synthetic-validation';
let userId, clientId, browser, mcp, stage = 'discovery', callbackObserved = false;
const fixtureIds = new Set();
const pass = (label) => console.log('PASS:', label);
const rpc = async (operation, args = {}) => {
  const result = await human.rpc('tracker_api', { operation, args });
  assert(!result.error, `Synthetic human RPC ${operation} failed`);
  return result.data;
};
const call = async (name, args = {}) => {
  stage = `MCP ${name}`;
  const result = await mcp.callTool({ name, arguments: args });
  assert(!result.isError, `MCP ${name} failed`);
  return result.structuredContent;
};
const decode = (jwt, part = 1) => JSON.parse(Buffer.from(jwt.split('.')[part], 'base64url'));
try {
  const challenge = await fetch(resource, { method: 'POST', redirect: 'manual' });
  assert.equal(challenge.status, 401);
  assert.equal(challenge.headers.get('x-job-tracker-version'), reference.version);
  assert.equal(challenge.headers.get('www-authenticate'), `Bearer resource_metadata="${site}/.well-known/oauth-protected-resource/mcp"`);
  const resourceResponse = await fetch(`${site}/.well-known/oauth-protected-resource/mcp`);
  assert.equal(resourceResponse.status, 200);
  const protectedResource = await resourceResponse.json();
  assert.equal(protectedResource.resource, resource);
  assert.deepEqual(protectedResource.authorization_servers, [`${supabase}/auth/v1`]);
  const discovered = await fetch(`${supabase}/.well-known/oauth-authorization-server/auth/v1`);
  assert.equal(discovered.status, 200);
  const metadata = await discovered.json();
  assert.equal(metadata.issuer, protectedResource.authorization_servers[0]);
  assert(metadata.code_challenge_methods_supported.includes('S256'));
  assert(metadata.grant_types_supported.includes('refresh_token'));
  pass('Public 401 challenge, resource discovery, exact issuer, S256 and refresh metadata');

  stage = 'dynamic registration';
  const registered = await fetch(metadata.registration_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Job Tracker synthetic OIDC validation', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
  });
  assert.equal(registered.status, 201);
  const registration = await registered.json();
  clientId = registration.client_id;
  assert(clientId);
  assert.deepEqual(registration.redirect_uris, [redirectUri]);
  const persisted = await admin.auth.admin.oauth.getClient(clientId);
  assert(!persisted.error && persisted.data.client_id === clientId);
  pass('Native public-client DCR persists exact callback-specific HTTPS redirect');

  stage = 'synthetic user';
  const email = `jobtracker-validation-oidc-${randomBytes(8).toString('hex')}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { hosted_validation: true } });
  assert(!created.error);
  userId = created.data.user.id;
  const login = await human.auth.signInWithPassword({ email, password });
  assert(!login.error);
  assert(['ES256', 'RS256'].includes(decode(login.data.session.access_token, 0).alg));
  pass('New user session uses asymmetric signing');

  stage = 'browser login and consent';
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('hex');
  const nonce = randomBytes(24).toString('hex');
  const authorization = new URL(metadata.authorization_endpoint);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', scope: 'openid email profile offline_access', state, nonce, resource })) authorization.searchParams.set(key, value);
  stage = 'launch hosted test browser';
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let callback;
  let resolveDecision;
  const decision = new Promise((resolve) => { resolveDecision = resolve; });
  const browserErrors = [];
  page.on('pageerror', () => browserErrors.push('uncaught JavaScript error'));
  // Intercept the form's first request, not its redirect chain. Read the real
  // native 303 without following it; never send synthetic codes to ChatGPT.
  await page.route(`${site}/api/oauth/decision`, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    resolveDecision({ status: response.status(), location: response.headers().location });
    await route.fulfill({ status: 200, body: 'Synthetic callback captured locally.' });
  });
  stage = 'navigate native authorize to login';
  await page.goto(authorization.href);
  stage = 'fill browser login';
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  stage = 'return from login to consent';
  await page.getByRole('heading', { name: 'Connect Job Tracker synthetic OIDC validation' }).waitFor();
  stage = 'submit consent';
  await page.getByRole('button', { name: 'Allow connection', exact: true }).click();
  const approved = await decision;
  assert.equal(approved.status, 303);
  stage = 'validate captured callback';
  callback = new URL(approved.location);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  callbackObserved = true;
  assert.equal(callback.searchParams.get('state'), state);
  assert(callback.searchParams.get('code'));
  if (metadata.authorization_response_iss_parameter_supported || callback.searchParams.has('iss')) assert.equal(callback.searchParams.get('iss'), metadata.issuer);
  assert.equal(browserErrors.length, 0);
  pass('Logged-out authorization preserves consent through login; approval returns exact callback and state');

  stage = 'OIDC code exchange';
  const exchange = await fetch(metadata.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code: callback.searchParams.get('code'), code_verifier: verifier, resource }),
  });
  assert.equal(exchange.status, 200);
  const tokens = await exchange.json();
  assert(tokens.access_token && tokens.refresh_token && tokens.id_token);
  const identity = decode(tokens.id_token), header = decode(tokens.id_token, 0);
  assert(['ES256', 'RS256'].includes(header.alg));
  const jwks = await (await fetch(metadata.jwks_uri)).json();
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  assert(jwk);
  const parts = tokens.id_token.split('.');
  assert(verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')));
  assert.equal(identity.iss, metadata.issuer);
  assert.equal(identity.aud, clientId);
  assert.equal(identity.sub, userId);
  assert.equal(identity.nonce, nonce);
  assert(identity.exp > Date.now() / 1000);
  const claims = decode(tokens.access_token);
  assert.equal(claims.client_id, clientId);
  assert(claims.aud.includes(resource));
  assert(claims.aud.includes('authenticated'));
  const userinfo = await fetch(metadata.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(userinfo.status, 200);
  assert.equal((await userinfo.json()).sub, userId);
  pass('ChatGPT OIDC scopes exchange successfully; ID token signature/issuer/audience/nonce and UserInfo verify');

  stage = 'authenticated transport';
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  for (const method of ['GET', 'DELETE']) {
    stage = `authenticated ${method} method handling`;
    const response = await fetch(resource, { method, headers: { ...headers, Accept: 'text/event-stream', 'MCP-Protocol-Version': '2025-11-25' } });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  }
  const exchanges = [];
  stage = 'SDK initialize';
  mcp = new Client({ name: 'jobtracker-synthetic-oidc', version: '1.0.0' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers }, fetch: async (input, init) => {
    const response = await fetch(input, init);
    exchanges.push({ method: init?.method || 'GET', status: response.status, session: response.headers.get('mcp-session-id') });
    return response;
  } }));
  stage = 'published MCP tool names';
  const tools = (await mcp.listTools()).tools;
  assert.equal(mcp.getServerVersion().version, reference.version);
  assert.deepEqual(tools.map((tool) => tool.name).sort(), reference.tools.map((tool) => tool.name).sort());
  stage = 'published MCP tool input schemas';
  // JSON Schema dialect declarations differ across SDK/Zod exporters; compare
  // the actual constraints rather than that non-validation annotation.
  const schema = (value) => JSON.parse(JSON.stringify(value, (key, item) => key === '$schema' ? undefined : item));
  for (const tool of tools) assert.deepEqual(schema(tool.inputSchema), schema(reference.tools.find((ref) => ref.name === tool.name).inputSchema));
  assert(exchanges.some((entry) => entry.status === 202));
  assert(exchanges.every((entry) => !entry.session));
  pass(`Stateless initialize, initialized notification and ${tools.length} published tool schemas; no session affinity`);
  await call('get_job_stats');
  assert.equal((await call('list_jobs', { page_size: 1 })).total, 0);
  await call('get_settings');
  await call('list_activity', { page_size: 1 });
  await call('find_existing_job', { company: 'Synthetic OAuth fixture', position: 'Validation engineer' });
  await Promise.all([call('get_job_stats'), call('get_settings')]);
  pass('get_job_stats, list_jobs, get_settings, list_activity and find_existing_job');

  for (let index = 0; index < 2; index++) {
    const added = await call('add_job_found', { company: 'Synthetic OAuth fixture', position: `Validation engineer ${index}`, url: `https://example.invalid/jobtracker-oidc/${userId}/${index}`, notes: 'Synthetic integration test only.' });
    assert(added.job?.id);
    fixtureIds.add(added.job.id);
  }
  const first = await call('list_jobs', { page_size: 1 });
  assert(first.has_more && first.next_cursor);
  const second = await call('list_jobs', { page_size: 1, cursor: first.next_cursor });
  assert.equal(second.jobs.length, 1);
  assert.notEqual(first.jobs[0].id, second.jobs[0].id);
  assert(!second.has_more);
  pass('Synthetic ingestion and cursor pagination');
  const id = first.jobs[0].id;
  assert.equal((await call('get_job', { id })).job.status, 'jobs_found');
  const duplicate = await call('find_existing_job', { url: first.jobs[0].url });
  assert(JSON.stringify(duplicate).includes(id));
  await call('remove_job', { id, reason: 'Synthetic OAuth validation only' });
  const deleted = (await call('get_job', { id })).job;
  assert.equal(deleted.status, 'jobs_deleted');
  assert.equal(Date.parse(deleted.purge_after) - Date.parse(deleted.deleted_at), 30 * 86400000);
  const feed = await call('list_activity', { action: 'removed' });
  assert(feed.events.some((event) => event.job_id === id && event.client_id === clientId && event.actor_type === 'ai_agent'));
  await call('restore_job', { id });
  assert.equal((await call('get_job', { id })).job.status, 'jobs_found');
  await call('remove_job', { id, reason: 'Remove synthetic fixture after restore test' });
  pass('Get, Deleted, exact 30-day recovery, Feed actor identity, restore to Jobs Found and re-remove');

  stage = 'refresh';
  const refreshed = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token, resource }) });
  assert.equal(refreshed.status, 200);
  const fresh = await refreshed.json();
  assert(fresh.access_token && fresh.refresh_token);
  const freshRead = await fetch(resource, { method: 'POST', headers: { Authorization: `Bearer ${fresh.access_token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 44, method: 'tools/call', params: { name: 'get_job_stats', arguments: {} } }) });
  assert.equal(freshRead.status, 200);
  assert(!(await freshRead.json()).result.isError);
  pass('OAuth refresh issues a resource-bound token that executes a read-only MCP tool');
  console.log('HOSTED OIDC / MCP REGRESSION PASSED (ChatGPT UI reconnection remains a separate check)');
} catch (error) {
  // Browser/SDK errors can embed URLs or headers. Emit only controlled stage and type.
  console.error('HOSTED REGRESSION FAILED', { stage, type: error instanceof assert.AssertionError ? 'assertion' : 'request_or_browser_failure', timeout: error.name === 'TimeoutError', missingLibrary: /shared libraries|lib.*\.so/.test(error.message), callbackObserved, browserNetworkClass: ['ERR_ABORTED', 'ERR_FAILED', 'ERR_BLOCKED_BY_CLIENT', 'ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_REFUSED'].filter((value) => error.message.includes(value)) });
  process.exitCode = 1;
} finally {
  if (mcp) await mcp.close().catch(() => {});
  if (browser) await browser.close();
  let clean = true;
  for (const id of fixtureIds) {
    try {
      await rpc('remove_job', { id, reason: 'Synthetic fixture cleanup' });
      await rpc('purge_job', { id, confirmation: `PURGE:${id}`, reason: 'Permanently remove synthetic fixture only' });
    } catch { clean = false; console.error('Synthetic fixture cleanup requires follow-up', { id }); }
  }
  if (clientId) {
    const removed = await admin.auth.admin.oauth.deleteClient(clientId);
    if (removed.error) clean = false;
  }
  if (userId && clean) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) clean = false;
  }
  if (!clean) { console.error('Synthetic cleanup incomplete; genuine users were never targeted'); process.exitCode = 1; }
  else pass('Only this run\'s synthetic jobs, user and OAuth registration removed');
}
