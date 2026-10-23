import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
test("upgrade preserves legacy applications, dates and notes, maps dismissed, and creates no invented history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`set timezone='UTC';create role anon;create role authenticated;create role service_role;create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
  insert into auth.users values('11111111-1111-4111-8111-111111111111');`);
    const master = readFileSync("scripts/000_master_setup.sql", "utf8");
    const base = master.slice(
      master.indexOf("CREATE TABLE IF NOT EXISTS public.jobs ("),
      master.indexOf("-- Forward-compatible"),
    );
    await db.exec(base);
    await db.exec(`alter table public.jobs drop constraint jobs_status_check;
  insert into public.jobs(user_id,company,position,status,added_date,applied_date,notes)
  values('11111111-1111-4111-8111-111111111111','Intel','Silicon Validation','applied','2026-09-01','2026-09-02','Preserve this application note'),
  ('11111111-1111-4111-8111-111111111111','Old Company','Removed','dismissed','2026-08-01',null,'Legacy note');`);
    const sql = readFileSync(
      "supabase/migrations/202610230001_jobtracker_v2.sql",
      "utf8",
    ).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
    const rows = await db.query<{
      company: string;
      status: string;
      notes: string;
      added_date: Date;
      applied_date: Date;
      deleted_at: Date;
      purge_after: Date;
    }>("select * from public.jobs order by company");
    assert.equal(rows.rows.length, 2);
    assert.equal(rows.rows[0].status, "applied");
    assert.equal(rows.rows[0].notes, "Preserve this application note");
    assert.equal(
      new Date(rows.rows[0].added_date).toISOString(),
      "2026-09-01T00:00:00.000Z",
    );
    assert.equal(
      new Date(rows.rows[0].applied_date).toISOString(),
      "2026-09-02T00:00:00.000Z",
    );
    assert.equal(rows.rows[1].status, "jobs_deleted");
    assert.equal(
      Number(new Date(rows.rows[1].purge_after)) -
        Number(new Date(rows.rows[1].deleted_at)),
      30 * 86400000,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.activity_events",
        )
      ).rows[0].n,
      0,
    );
    await db.exec("create role supabase_auth_admin");
    for (const file of ["202610230003_resource_audience.sql", "202610230004_verification.sql", "202610230005_explicit_json_default.sql", "202610230006_retire_legacy_mcp.sql", "202610230007_search_all_job_fields.sql"])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',false);
      update public.jobs set protected=true where company='Intel';
      insert into public.tracker_clients(user_id,client_id,label,permissions) values('11111111-1111-4111-8111-111111111111','existing-client','Preserved owner label',array['read','write','remove','restore','history','protect','policy']);
      insert into public.cleanup_previews(user_id,policy_version,candidates) values('11111111-1111-4111-8111-111111111111',1,'[]');`);
    const snapshot = async () => (await db.query<{ jobs: unknown; events: unknown }>(`select
      (select jsonb_agg(to_jsonb(j) order by id) from public.jobs j) jobs,
      (select jsonb_agg(to_jsonb(e) order by id) from public.activity_events e) events`)).rows[0];
    const before = await snapshot();
    await db.exec(readFileSync("supabase/migrations/202610230008_simplify_lifecycle.sql", "utf8"));
    assert.deepEqual(await snapshot(), before, "Every stored job and historical Feed field survives simplification exactly");
    const client = (await db.query<{ label: string; permissions: string[] }>("select label,permissions from public.tracker_clients where client_id='existing-client'")).rows[0];
    assert.equal(client.label, "Preserved owner label");
    assert.deepEqual(client.permissions, ["read", "write", "remove", "restore", "history"]);
    const objects = (await db.query<{ policies: string | null; previews: string | null; aliases: string | null }>("select to_regclass('public.cleanup_policies')::text policies,to_regclass('public.cleanup_previews')::text previews,to_regclass('public.company_aliases')::text aliases")).rows[0];
    assert.equal(objects.policies, null); assert.equal(objects.previews, null); assert.equal(objects.aliases, "company_aliases");
  } finally {
    await db.close();
  }
});
