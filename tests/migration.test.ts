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
  } finally {
    await db.close();
  }
});
