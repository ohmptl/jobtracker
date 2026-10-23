/* eslint-disable @typescript-eslint/no-explicit-any -- JSON RPC fixture assertions use heterogeneous result objects. */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
async function identity(user = owner, client?: string) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: user,
      role: "authenticated",
      ...(client ? { client_id: client } : {}),
    }),
  ]);
}
async function api(operation: string, args: object = {}) {
  const result = await db.query<{ result: any }>(
    "select public.tracker_api($1,$2::jsonb) result",
    [operation, JSON.stringify(args)],
  );
  return result.rows[0].result;
}
async function add(
  company = "Hardware Labs",
  position = "Silicon Engineer",
  extra: object = {},
) {
  const r = await api("add_job_found", {
    company,
    position,
    role_type: "full_time",
    ...extra,
  });
  assert.equal(r.results[0].outcome, "added", JSON.stringify(r));
  return r.results[0].job;
}
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
 grant usage on schema auth to authenticated,anon,service_role;
 grant execute on all functions in schema auth to authenticated,anon,service_role;
 insert into auth.users values('${owner}'),('${other}');`);
  const sql = readFileSync(
    "supabase/migrations/202610230001_jobtracker_v2.sql",
    "utf8",
  ).replace("create extension if not exists pgcrypto;", "");
  try {
    await db.exec(sql);
  } catch (e) {
    const error = e as Error & { position?: string };
    throw new Error(
      `${error.message}: ${sql.slice(Number(error.position) - 160, Number(error.position) + 160)}`,
    );
  }
  await db.exec(
    readFileSync(
      "supabase/migrations/202610230003_resource_audience.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610230004_verification.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/202610230005_explicit_json_default.sql", "utf8"),
  );
  await db.exec(`insert into public.tracker_clients(user_id,client_id,label,permissions)
    values('${owner}','legacy-url-token','Old connection',array['read','write']);`);
  await db.exec(
    readFileSync("supabase/migrations/202610230006_retire_legacy_mcp.sql", "utf8"),
  );
  await db.exec(readFileSync("supabase/migrations/202610230007_search_all_job_fields.sql", "utf8"));
  await identity();
  await db.exec(`insert into public.jobs(user_id,company,position,status,protected,notes)
    values('${owner}','Legacy Manual Flag','SYNTHETIC legacy flag fixture','jobs_found',true,'Preserve this inert legacy flag');`);
  await db.exec(readFileSync("supabase/migrations/202610230008_simplify_lifecycle.sql", "utf8"));
  await identity();
});
beforeEach(async () => {
  await identity();
  await db.exec("truncate private.request_budgets");
});
after(async () => db.close());

test("live search finds partial company names and all job fields without wildcard expansion", async () => {
  const job = await add("Lunaris Electronics", "Microwave Engineer", { notes: "Zeta resonator design", salary: "$127,890", source: "CampusConnector", requisition_id: "REQ-MW-447", role_type: "new_grad", posted_date: "2027-02-17" });
  for (const q of ["Lunari", "resonat", "$127,890", "CampusCon", "MW-447", "2027-02-17", "new grad", "lunari resonat"]) {
    const result = await api("list_jobs", { q });
    assert(result.jobs.some((j: { id: string }) => j.id === job.id), q);
  }
  assert.equal((await api("list_jobs", { q: "Lunari missingphrase" })).total, 0);
  assert.equal((await api("list_jobs", { q: "%" })).total, 0);
  await identity(other);
  assert.equal((await api("list_jobs", { q: "resonat" })).total, 0);
  await identity();
});

test("legacy retirement drops the bridge and grants and rejects unidentified service writes", async () => {
  const removed = await db.query<{ rpc: string | null; grants: number }>(`select
    to_regprocedure('public.tracker_legacy(uuid,text,jsonb)')::text rpc,
    (select count(*)::int from public.tracker_clients where client_id='legacy-url-token') grants`);
  assert.equal(removed.rows[0].rpc, null);
  assert.equal(removed.rows[0].grants, 0);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: "service_role" })]);
  await assert.rejects(db.query(`insert into public.jobs(user_id,company,position,status) values($1,'Retired bridge','Synthetic validation','jobs_found')`, [owner]), /Owner identity mismatch/);
  await identity();
});

test("server filters compose and alphabetical cursors preserve order", async () => {
  const b = await add("Sort B", "FPGA New Graduate", {
    source: "employer",
    location: "Remote US",
    role_type: "new_grad",
    posted_date: "2026-10-01",
  });
  await add("Sort A", "ASIC Engineer");
  await api("update_job", { id: b.id, priority: "strategic" });
  const filtered = await api("list_jobs", {
    company: "Sort",
    title: "FPGA",
    role_type: "new_grad",
    location: "Remote",
    priority: "strategic",
    source: "employer",
    posted_after: "2026-09-01",
    availability: "not_checked",
  });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.jobs[0].id, b.id);
  const first = await api("list_jobs", {
    company: "Sort ",
    sort: "company",
    page_size: 1,
  });
  assert.equal(first.jobs[0].company, "Sort A");
  const second = await api("list_jobs", {
    company: "Sort ",
    sort: "company",
    page_size: 1,
    cursor: first.next_cursor,
  });
  assert.equal(second.jobs[0].company, "Sort B");
  assert.equal(second.has_more, false);
  await assert.rejects(
    api("bulk_remove_jobs", {
      ids: Array(101).fill(b.id),
      reason: "oversized",
    }),
    /1 to 100/,
  );
});

test("possible title matches do not suppress different jobs; IDs, alias requisitions and retry keys do", async () => {
  const a = await add("Shared Landing Labs", "ASIC Engineer", {
    url: "https://careers.example/shared",
    requisition_id: "REQ-A",
  });
  const b = await add("Shared Landing Labs", "ASIC Engineer", {
    url: "https://careers.example/shared",
    requisition_id: "REQ-B",
  });
  assert.notEqual(a.id, b.id);
  const noId = await add("Ambiguous Labs", "Hardware Internship");
  const noId2 = await add("Ambiguous Labs", "Hardware Internship");
  assert.notEqual(noId.id, noId2.id);
  assert(noId2.review_flags.includes("possible_duplicate"));
  const retry = await add("Retry Labs", "Firmware", {
    idempotency_key: "source-run-unique-123",
  });
  const dup = await api("add_job_found", {
    company: "Retry Labs",
    position: "Firmware",
    idempotency_key: "source-run-unique-123",
  });
  assert.equal(dup.results[0].outcome, "duplicate");
  assert.equal(dup.results[0].matches[0].id, retry.id);
  const alias = await add("Raytheon", "Embedded Engineer", {
    requisition_id: "Alias-123",
  });
  const aliasDup = await api("add_job_found", {
    company: "RTX",
    position: "Embedded Engineer",
    requisition_id: "ALIAS-123",
  });
  assert.equal(aliasDup.results[0].outcome, "duplicate");
  assert.equal(aliasDup.results[0].matches[0].id, alias.id);
});

test("verification queue and recording are service-only, revision checked and audited", async () => {
  const j = await add("Scheduled Verify Labs", "Firmware Engineer", {
    url: "https://careers.example/firmware",
  });
  const queue = await db.query<{ r: { id: string }[] }>(
    "select public.tracker_verification_queue($1::text[]) r",
    [["careers.example"]],
  );
  assert(queue.rows[0].r.some((item) => item.id === j.id));
  const evidence = {
    availability: "closed",
    confidence: "high",
    method: "employer_explicit",
    source: j.url,
    evidence: "Employer explicitly states that this position has been filled.",
  };
  const result = await db.query<{ r: boolean }>(
    "select public.tracker_record_verification($1,$2,$3::jsonb) r",
    [j.id, j.revision, JSON.stringify(evidence)],
  );
  assert.equal(result.rows[0].r, true);
  assert.equal(
    (
      await db.query<{ r: boolean }>(
        "select public.tracker_record_verification($1,$2,$3::jsonb) r",
        [j.id, j.revision, JSON.stringify(evidence)],
      )
    ).rows[0].r,
    false,
  );
  const feed = await api("list_activity", { action: "verified_closed" });
  assert(
    feed.events.some(
      (e: { job_id: string; actor_type: string }) =>
        e.job_id === j.id && e.actor_type === "automation",
    ),
  );
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query("select public.tracker_verification_queue($1::text[])", [
        ["careers.example"],
      ]),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
  // Keep subsequent retention assertions independent of the verification fixture.
  await api("update_job", { id: j.id, status: "to_apply" });
});

test("10,000-record tracker returns bounded pages and accurate database statistics", async () => {
  await db.query(
    `insert into public.jobs(user_id,company,position,status,role_type,added_date)
 select $1,'Scale Labs','Hardware Engineer '||i,'jobs_found','full_time','2024-01-01T00:00:00Z' from generate_series(1,10000) i`,
    [owner],
  );
  const page = await api("list_jobs", { company: "Scale Labs", page_size: 30 });
  assert.equal(page.jobs.length, 30);
  assert.equal(page.total, 10000);
  assert.equal(page.has_more, true);
  const stats = await api("get_job_stats", { before: "2025-01-01T00:00:00Z" });
  assert.equal(stats.total, 10000);
  const next = await api("list_jobs", {
    company: "Scale Labs",
    page_size: 30,
    cursor: page.next_cursor,
  });
  assert(
    !next.jobs.some((j: { id: string }) =>
      page.jobs.some((p: { id: string }) => j.id === p.id),
    ),
  );
});

test("paginate 1,105 records with tied timestamps, stable IDs, full count, and filters", async () => {
  await db.query(
    `insert into public.jobs(user_id,company,position,status,role_type,added_date)
 select $1,'Page Company','FPGA Engineer '||i,'jobs_found','full_time','2025-01-01' from generate_series(1,1105) i`,
    [owner],
  );
  let cursor: object | undefined;
  const ids = new Set<string>();
  do {
    const page = await api("list_jobs", {
      page_size: 100,
      company: "Page Company",
      ...(cursor ? { cursor } : {}),
    });
    assert.equal(page.total, 1105);
    for (const j of page.jobs) {
      assert(!ids.has(j.id));
      ids.add(j.id);
    }
    cursor = page.next_cursor || undefined;
    assert.equal(page.has_more, !!cursor);
  } while (cursor);
  assert.equal(ids.size, 1105);
  const search = await api("list_jobs", {
    q: "FPGA",
    company: "Page Company",
    page_size: 2,
  });
  assert.equal(search.jobs.length, 2);
  assert.equal(search.total, 1105);
});
test("soft deletion regression, immutable dates, audit reference, restore and repeated remove", async () => {
  const j = await add("Remove Labs");
  const removed = (await api("update_job", { id: j.id, status: "dismissed" }))
    .results[0].job;
  assert.equal(removed.status, "jobs_deleted");
  assert.equal(
    Date.parse(removed.purge_after) - Date.parse(removed.deleted_at),
    30 * 86400000,
  );
  assert.equal(removed.added_date, j.added_date);
  const second = (await api("remove_job", { id: j.id, reason: "retry" }))
    .results[0].job;
  assert.equal(second.deleted_at, removed.deleted_at);
  const restored = (await api("restore_job", { id: j.id })).results[0].job;
  assert.equal(restored.status, "jobs_found");
  assert.equal(restored.deleted_at, null);
  const feed = await api("list_activity", { action: "removed" });
  assert(
    feed.events.some(
      (e: any) => e.id === removed.removal_event_id && e.actor_type === "human",
    ),
  );
});
test("duplicate URL/requisition checks include Deleted and preserve distinct requisitions", async () => {
  const j = await add("Req Labs", "ASIC", {
    canonical_url: "https://example.com/job?id=A",
    requisition_id: "A",
  });
  await api("remove_job", { id: j.id, reason: "Not a fit" });
  const dup = await api("find_existing_job", {
    canonical_url: j.canonical_url,
    company: "Req Labs",
    requisition_id: "A",
  });
  assert.equal(dup.matches[0].id, j.id);
  const different = await add("Req Labs", "ASIC", {
    canonical_url: "https://example.com/job?id=B",
    requisition_id: "B",
  });
  assert.notEqual(different.id, j.id);
  const batch = await api("bulk_add_jobs", {
    jobs: [
      { company: "Req Labs", position: "ASIC", requisition_id: "B" },
      { company: "", position: "" },
      {
        company: "Fresh Labs",
        position: "Firmware",
        role_type: "full_time",
        idempotency_key: "fresh-fixture",
      },
    ],
  });
  assert.deepEqual(
    batch.results.map((r: any) => r.outcome),
    ["duplicate", "rejected", "added"],
  );
});
test("client permissions, owner isolation, employer-neutral edits, application history and revocation", async () => {
  const j = await add("Guard Labs");
  const protectedJob = await add("NVIDIA");
  await api("grant_client", {
    client_id: "client-a",
    label: "Owner-selected label",
    permissions: ["read", "write", "remove", "restore", "history"],
  });
  await identity(owner, "client-a");
  await api("update_job", { id: protectedJob.id, company: "Renamed employer", priority: "strategic" });
  await api("remove_job", { id: protectedJob.id, reason: "Owner instructed direct removal" });
  assert.equal((await api("get_job", { id: protectedJob.id })).job.status, "jobs_deleted");
  await assert.rejects(api("update_job", { id: j.id, protected: true }), /retired/);
  await assert.rejects(
    api("update_job", { id: j.id, status: "applied" }),
    /human owner|owner-managed/,
  );
  await assert.rejects(
    api("save_policy", { ai_deletion: false }),
    /Unknown operation/,
  );
  await api("remove_job", {
    id: j.id,
    reason: "Eligible ordinary opportunity",
  });
  const feed = await api("list_activity", { action: "removed" });
  assert(
    feed.events.some(
      (e: any) =>
        e.client_id === "client-a" && e.actor_label === "Owner-selected label",
    ),
  );
  await identity(other);
  await assert.rejects(api("get_job", { id: j.id }), /not found/);
  const list = await api("list_jobs", {});
  assert.equal(list.total, 0);
  await identity();
  await api("revoke_client", { client_id: "client-a" });
  await identity(owner, "client-a");
  await assert.rejects(api("list_jobs", {}), /Permission denied/);
  await identity();
});
test("bulk removal reports partial failures and preserves active applications", async () => {
  const j = await add("Bulk Labs");
  const app = await add("Application Labs");
  await api("update_job", { id: app.id, status: "applied" });
  await api("grant_client", { client_id: "bulk-lifecycle", label: "Bulk client", permissions: ["read", "write", "remove"] });
  await identity(owner, "bulk-lifecycle");
  const result = await api("bulk_remove_jobs", {
    ids: [j.id, app.id],
    reason: "batch cleanup",
  });
  assert.deepEqual(
    result.results.map((r: any) => r.outcome),
    ["ok", "rejected"],
  );
  assert.equal((await api("get_job", { id: app.id })).job.status, "applied");
});
test("retired cleanup engine cannot recommend or remove jobs; maintenance only purges Deleted", async () => {
  const low = await add("Apple", "Generic Internship", { role_type: "internship" });
  const closed = await add("SpaceX", "Closed posting");
  await api("update_job", { id: low.id, priority: "low", evaluation_reason: "Agent-selected priority, without backend career rules." });
  await api("submit_verification", { id: closed.id, availability: "closed", source: "https://example.com/closed", method: "employer_explicit", confidence: "high", evidence: "Employer explicitly states this position has been filled." });
  for (const operation of ["preview_cleanup", "execute_cleanup", "save_policy", "save_company", "delete_company"])
    await assert.rejects(api(operation), /Unknown operation/);
  const settings = await api("get_settings");
  assert(!("policy" in settings)); assert(!("companies" in settings));
  const run = await db.query<{ r: any }>("select public.tracker_maintenance() r");
  assert.equal(run.rows[0].r.expired_removed, 0);
  assert.equal((await api("get_job", { id: low.id })).job.status, "jobs_found");
  assert.equal((await api("get_job", { id: closed.id })).job.status, "jobs_found");
  const removed = await db.query<{ previews: string | null; policies: string | null }>("select to_regclass('public.cleanup_previews')::text previews, to_regclass('public.cleanup_policies')::text policies");
  assert.equal(removed.rows[0].previews, null); assert.equal(removed.rows[0].policies, null);
});

test("AI bulk removal ignores employer and priority and restores exact review stages", async () => {
  const jobs = [(await api("list_jobs", { company: "Legacy Manual Flag" })).jobs[0]];
  assert.equal((await db.query<{ protected: boolean }>("select protected from public.jobs where id=$1", [jobs[0].id])).rows[0].protected, true);
  for (const [i, company] of ["Apple", "NVIDIA", "SpaceX", "Intel", "Ordinary Company"].entries()) {
    const job = await add(company, `Lifecycle fixture ${i}`, { role_type: i % 2 ? "internship" : "full_time" });
    await api("update_job", { id: job.id, priority: i % 2 ? "low" : "strategic", status: i % 2 ? "jobs_snoozed" : "jobs_found" });
    jobs.push(job);
  }
  await api("grant_client", { client_id: "free-lifecycle", label: "Owner-selected label", permissions: ["read", "write", "remove", "restore", "history"] });
  await identity(owner, "free-lifecycle");
  const bulk = await api("bulk_remove_jobs", { ids: jobs.map(j => j.id), reason: "Agent selected these exact records" });
  assert(bulk.results.every((r: any) => r.outcome === "ok"));
  for (const job of jobs) {
    const deleted = (await api("get_job", { id: job.id })).job;
    assert.equal(deleted.status, "jobs_deleted");
    assert.equal(Date.parse(deleted.purge_after) - Date.parse(deleted.deleted_at), 30 * 86400000);
    assert(!("protected" in deleted)); assert(!("company_protected" in deleted));
    await api("restore_job", { id: job.id });
    assert.equal((await api("get_job", { id: job.id })).job.status, deleted.previous_status);
  }
});

test("all application stages reject ordinary AI cleanup and generic/direct status bypasses", async () => {
  const jobs = [];
  for (const status of ["to_apply", "applied", "interviewing", "offered", "accepted", "rejected"]) {
    const job = await add("Application lifecycle", status, { notes: `Preserve ${status} notes` });
    await api("update_job", { id: job.id, status });
    jobs.push({ ...job, status });
  }
  await api("grant_client", { client_id: "application-lifecycle", label: "Application client", permissions: ["read", "write", "remove", "restore", "history"] });
  await identity(owner, "application-lifecycle");
  for (const job of jobs) {
    await api("update_job", { id: job.id, priority: "low" });
    await assert.rejects(api("remove_job", { id: job.id, reason: "Ordinary evaluation" }), /Application-stage/);
    for (const status of ["jobs_deleted", "dismissed"])
      await assert.rejects(api("update_job", { id: job.id, status, reason: "Generic bypass" }), /Application-stage/);
    await assert.rejects(api("update_job", { id: job.id, status: "jobs_found" }), /human owner/);
    const current = (await api("get_job", { id: job.id })).job;
    assert.equal(current.status, job.status); assert.equal(current.notes, job.notes);
  }
  const batch = await api("bulk_remove_jobs", { ids: jobs.map(j => j.id), reason: "Ordinary batch" });
  assert(batch.results.every((r: any) => r.outcome === "rejected" && r.reason.includes("Application-stage")));
  await db.exec("set role authenticated");
  try {
    await assert.rejects(db.query("update public.jobs set status='jobs_deleted',removal_reason='Direct bypass' where id=$1", [jobs[0].id]), /Application-stage/);
  } finally { await db.exec("reset role"); }
  for (const job of jobs) {
    await api("submit_verification", { id: job.id, availability: "closed", method: "ats_explicit", confidence: "high", source: "https://careers.example/closed", http_status: 200, evidence: "Official ATS explicitly reports this position is closed." });
    await api("remove_job", { id: job.id, reason: "Verified posting closure" });
    assert.equal((await api("get_job", { id: job.id })).job.previous_status, job.status);
    await api("restore_job", { id: job.id });
    assert.equal((await api("get_job", { id: job.id })).job.status, job.status);
  }
});

test("explicit closure permits AI application removal, retains history and restores the application stage", async () => {
  const app = await add("NVIDIA", "Applied closure fixture", { notes: "Application notes must survive" });
  const dates = { applied_date: "2026-09-02T12:00:00.000Z", interview_at: "2026-10-20T12:00:00.000Z", decision_at: "2026-10-21T12:00:00.000Z" };
  await api("update_job", { id: app.id, status: "applied", ...dates });
  await api("grant_client", { client_id: "closure-lifecycle", label: "Owner-selected closure client", permissions: ["read", "write", "remove", "restore", "history"] });
  await identity(owner, "closure-lifecycle");
  const evidence = { availability: "closed", source: "https://careers.example/closed-role", method: "employer_explicit", confidence: "high", http_status: 200, evidence: "Employer explicitly states that this position has been filled." };
  for (const patch of [{ method: "timeout" }, { method: "blocked", http_status: 403 }, { http_status: 403 }, { http_status: 500 }, { confidence: "low" }, { evidence: "Old posting" }, { source: "" }]) {
    await api("submit_verification", { id: app.id, ...evidence, ...patch });
    assert.equal((await api("get_job", { id: app.id })).job.availability, "uncertain");
    await assert.rejects(api("remove_job", { id: app.id, reason: "Uncertain closure" }), /Application-stage/);
  }
  await db.exec("set role authenticated");
  try {
    await assert.rejects(db.query("update public.jobs set status='jobs_deleted',availability='closed',verification=$2::jsonb,removal_reason='Combined bypass' where id=$1", [app.id, JSON.stringify(evidence)]), /Application-stage/);
  } finally { await db.exec("reset role"); }
  await api("submit_verification", { id: app.id, ...evidence });
  assert.equal((await api("get_job", { id: app.id })).job.status, "applied");
  const batch = await api("bulk_remove_jobs", { ids: [app.id], reason: "Employer explicitly closed this posting" });
  assert.equal(batch.results[0].outcome, "ok");
  const deleted = (await api("get_job", { id: app.id })).job;
  assert.equal(deleted.previous_status, "applied"); assert.equal(deleted.notes, app.notes);
  for (const [field, date] of Object.entries(dates)) assert.equal(new Date(deleted[field]).toISOString(), date);
  assert.equal(deleted.verification.evidence, evidence.evidence);
  const event = (await api("list_activity", { action: "removed", client_id: "closure-lifecycle" })).events.find((e: any) => e.job_id === app.id);
  assert.equal(event.previous_status, "applied"); assert.equal(event.new_status, "jobs_deleted");
  assert.equal(event.reason, "Employer explicitly closed this posting"); assert.equal(event.batch_id, batch.batch_id);
  assert.equal(event.actor_type, "ai_agent"); assert.equal(event.actor_label, "Owner-selected closure client");
  await assert.rejects(api("update_job", { id: app.id, status: "jobs_found" }), /previous status/);
  await api("restore_job", { id: app.id });
  assert.equal((await api("get_job", { id: app.id })).job.status, "applied");
  await api("update_job", { id: app.id, status: "jobs_deleted", reason: "Verified closure through generic status path" });
  await api("restore_job", { id: app.id });
  await identity();
  await api("submit_verification", { id: app.id, ...evidence, availability: "open" });
  await api("remove_job", { id: app.id, reason: "Owner explicitly removes an open application" });
  assert.equal((await api("get_job", { id: app.id })).job.previous_status, "applied");
});

test("403, timeout, weak evidence cannot establish closure", async () => {
  const j = await add("Verification Labs");
  for (const args of [
    { method: "http", http_status: 403, confidence: "high" },
    { method: "timeout", confidence: "high" },
    { method: "employer_explicit", confidence: "low" },
  ]) {
    await api("submit_verification", {
      id: j.id,
      availability: "closed",
      source: "https://example.com/jobs",
      evidence: "The employer careers page cannot currently be checked.",
      ...args,
    });
    assert.equal(
      (await api("get_job", { id: j.id })).job.availability,
      "uncertain",
    );
  }
});
test("30-day retention boundary, purge retry, tombstones, audit minimization and restored safety", async () => {
  const old = await add("Retention Labs", "Expired Role", {
    canonical_url: "https://example.com/closed",
  });
  const restored = await add("Restore Safe Labs");
  await api("remove_job", { id: old.id, reason: "Closed" });
  await api("remove_job", { id: restored.id, reason: "Mistake" });
  await api("restore_job", { id: restored.id });
  // Fixture-only time control: bypass guard to model the exact timestamp boundary.
  await db.exec(
    "alter table public.jobs disable trigger jobs_guard; alter table public.jobs disable trigger jobs_audit;",
  );
  await db.query(
    `update public.jobs set deleted_at=now()-interval '30 days',purge_after=now() where id=$1`,
    [old.id],
  );
  await db.exec(
    "alter table public.jobs enable trigger jobs_guard; alter table public.jobs enable trigger jobs_audit;",
  );
  await assert.rejects(api("restore_job", { id: old.id }), /expired/);
  const run = await db.query<{ r: any }>(
    "select public.tracker_maintenance() r",
  );
  assert.equal(run.rows[0].r.ok, true, JSON.stringify(run.rows[0].r));
  assert.equal(run.rows[0].r.purged, 1);
  await assert.rejects(api("get_job", { id: old.id }), /not found/);
  assert.equal(
    (await api("get_job", { id: restored.id })).job.status,
    "jobs_found",
  );
  const tomb = await api("find_existing_job", {
    canonical_url: old.canonical_url,
  });
  assert.equal(tomb.suppressed, true);
  const retry = await db.query<{ r: any }>(
    "select public.tracker_maintenance() r",
  );
  assert.equal(retry.rows[0].r.purged, 0);
  const events = await api("list_activity", { action: "purged" });
  assert(!JSON.stringify(events).includes("https://example.com/closed"));
});
test("real RLS/table privileges reject other owners and direct permanent deletion", async () => {
  await identity();
  await db.exec("set role authenticated");
  try {
    const result = await db.query<{ n: number }>(
      "select count(*)::int n from public.jobs where user_id=$1",
      [other],
    );
    assert.equal(result.rows[0].n, 0);
    await assert.rejects(
      db.query("delete from public.jobs where user_id=$1", [owner]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        `insert into public.jobs(user_id,company,position) values($1,'Cross-user','Invalid')`,
        [other],
      ),
      /Owner identity|row-level security/,
    );
  } finally {
    await db.exec("reset role");
  }
});
test("resource audience hook preserves human tokens and binds granted OAuth clients", async () => {
  await identity();
  await api("grant_client", {
    client_id: "hook-client",
    label: "Unknown registered client",
    permissions: ["read"],
  });
  await db.exec(
    "insert into public.tracker_resource_config(resource_url) values('https://tracker.example/mcp')",
  );
  const result = await db.query<{ r: { claims: { aud: unknown } } }>(
    "select public.tracker_access_token_hook($1::jsonb) r",
    [
      JSON.stringify({
        user_id: owner,
        client_id: "hook-client",
        claims: { aud: "authenticated", sub: owner },
      }),
    ],
  );
  assert.deepEqual(result.rows[0].r.claims.aud, [
    "authenticated",
    "https://tracker.example/mcp",
  ]);
  const human = await db.query<{ r: { claims: { aud: unknown } } }>(
    "select public.tracker_access_token_hook($1::jsonb) r",
    [
      JSON.stringify({
        user_id: owner,
        claims: { aud: "authenticated", sub: owner },
      }),
    ],
  );
  assert.equal(human.rows[0].r.claims.aud, "authenticated");
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      db.query("select public.tracker_access_token_hook($1::jsonb)", [
        JSON.stringify({ user_id: owner, claims: {} }),
      ]),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});

test("restore at day 29, failed purge rollback/retry and expired tombstone cleanup", async () => {
  await identity();
  const recoverable = await add("Day29 Labs");
  const doomed = await add("Retry Purge Labs", "Closed Firmware", {
    canonical_url: "https://careers.example/retry-purge",
  });
  await api("remove_job", { id: recoverable.id, reason: "Fixture recovery" });
  await api("remove_job", { id: doomed.id, reason: "Fixture retention" });
  await db.exec(
    "alter table public.jobs disable trigger jobs_guard;alter table public.jobs disable trigger jobs_audit;",
  );
  await db.query(
    `update public.jobs set deleted_at=clock_timestamp()-interval '719 hours',purge_after=clock_timestamp()+interval '1 hour' where id=$1`,
    [recoverable.id],
  );
  await db.query(
    `update public.jobs set deleted_at=clock_timestamp()-interval '721 hours',purge_after=clock_timestamp()-interval '1 hour' where id=$1`,
    [doomed.id],
  );
  await db.exec(
    "alter table public.jobs enable trigger jobs_guard;alter table public.jobs enable trigger jobs_audit;",
  );
  await api("restore_job", { id: recoverable.id });
  await db.exec(`create function private.fixture_purge_failure() returns trigger language plpgsql as $$begin if old.company='Retry Purge Labs' then raise exception 'Injected purge failure'; end if;return old;end$$;
 create trigger fixture_purge_failure before delete on public.jobs for each row execute function private.fixture_purge_failure();`);
  const failed = await db.query<{ r: { ok: boolean } }>(
    "select public.tracker_maintenance() r",
  );
  assert.equal(failed.rows[0].r.ok, false);
  assert.equal(
    (await api("get_job", { id: doomed.id })).job.status,
    "jobs_deleted",
  );
  await db.exec(
    "drop trigger fixture_purge_failure on public.jobs;drop function private.fixture_purge_failure();",
  );
  const retried = await db.query<{ r: { ok: boolean; purged: number } }>(
    "select public.tracker_maintenance() r",
  );
  assert.equal(retried.rows[0].r.ok, true);
  assert.equal(retried.rows[0].r.purged, 1);
  assert.equal(
    (await api("find_existing_job", { canonical_url: doomed.canonical_url }))
      .suppressed,
    true,
  );
  await db.exec(
    "update public.job_tombstones set expires_at=now()-interval '1 hour'",
  );
  await db.exec("select public.tracker_maintenance()");
  assert.equal(
    (await api("find_existing_job", { canonical_url: doomed.canonical_url }))
      .suppressed,
    false,
  );
});
