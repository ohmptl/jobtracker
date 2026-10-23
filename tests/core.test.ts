import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeUrl,
  newJobSchema,
  updateSchema,
  toolSchemas,
} from "../lib/tracker/schemas";
import { validateClaims, validateTransport } from "../lib/tracker/security";
import { execute } from "../lib/tracker/service";
import { createTrackerServer } from "../lib/tracker/mcp";
import { serveMcp } from "../lib/tracker/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";

test("canonical URLs remove tracking but preserve distinct requisitions and reject unsafe schemes", () => {
  assert.equal(
    canonicalizeUrl(
      "https://EXAMPLE.com/jobs/?utm_source=x&jobId=123&gh_jid=456#apply",
    ),
    "https://example.com/jobs?gh_jid=456&jobId=123",
  );
  assert.notEqual(
    canonicalizeUrl("https://example.com/jobs?id=1"),
    canonicalizeUrl("https://example.com/jobs?id=2"),
  );
  assert.throws(() => canonicalizeUrl("javascript:alert(1)"));
  assert(
    !newJobSchema.safeParse({
      company: "X",
      position: "Y",
      url: "https://user:pass@example.com",
    }).success,
  );
  assert(
    toolSchemas.update_job.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      status: "jobs_deleted",
    }).success,
  );
  assert(
    updateSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      status: "dismissed",
    }).success,
  );
  assert.equal(
    updateSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      status: "jobs_deleted",
    }).role_type,
    undefined,
  );
});

test("stateless HTTP transport produces valid MCP discovery after response cleanup", async () => {
  const db = {
    rpc: async () => ({ data: {}, error: null }),
  } as unknown as SupabaseClient;
  const response = await serveMcp(
    new Request("https://tracker.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    }),
    { db },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert(
    payload.result.tools.some(
      (tool: { name: string }) => tool.name === "remove_job",
    ),
  );
});
test("OAuth claim policy rejects expiry, wrong issuer/resource, missing client and generic database audience", () => {
  const resource = "https://tracker.example/mcp",
    issuer = "https://project.supabase.co/auth/v1";
  const claims = {
    iss: issuer,
    aud: ["authenticated", resource],
    exp: 2000,
    sub: "owner",
    client_id: "client",
    role: "authenticated",
  };
  assert(validateClaims(claims, resource, issuer, 1000));
  for (const patch of [
    { exp: 999 },
    { iss: "https://evil.example" },
    { aud: "authenticated" },
    { aud: "https://other.example/mcp" },
    { client_id: undefined },
    { role: "service_role" },
    { nbf: 1001 },
  ])
    assert(!validateClaims({ ...claims, ...patch }, resource, issuer, 1000));
  assert.equal(
    validateTransport(
      new Request("https://tracker.example/mcp", {
        headers: { Origin: "https://evil.example" },
      }),
    )?.status,
    403,
  );
  assert.equal(
    validateTransport(
      new Request("https://tracker.example/mcp", {
        method: "POST",
        headers: { "Content-Length": "999999" },
      }),
    )?.status,
    413,
  );
});
test("shared service normalizes legacy status, URLs and individual bulk validation outcomes", async () => {
  const calls: { operation: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (
      _name: string,
      input: { operation: string; args: Record<string, unknown> },
    ) => {
      calls.push(input);
      return {
        data:
          input.operation === "bulk_add_jobs"
            ? { results: [{ outcome: "added" }, { outcome: "duplicate" }] }
            : input.operation === "update_job"
              ? { results: [{ job: input.args }] }
              : { jobs: [] },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  await execute({ db }, "update_job", {
    id: "11111111-1111-4111-8111-111111111111",
    status: "dismissed",
    url: "https://example.com/job?id=1&utm_campaign=x",
  });
  assert.equal(calls[0].args.status, "jobs_deleted");
  assert.equal(calls[0].args.canonical_url, "https://example.com/job?id=1");
  const result = await execute({ db }, "bulk_add_jobs", {
    idempotency_key: "test-batch",
    jobs: [
      { company: "A", position: "B" },
      null,
      { company: "C", position: "D" },
    ],
  });
  assert.deepEqual(
    result.results.map((r: { index: number; outcome: string }) => [
      r.index,
      r.outcome,
    ]),
    [
      [0, "added"],
      [1, "rejected"],
      [2, "duplicate"],
    ],
  );
  await execute({ db }, "list_jobs", { list: "applied", page_size: 2 });
  assert.deepEqual(calls.at(-1)?.args.statuses, [
    "applied",
    "interviewing",
    "offered",
    "accepted",
  ]);
});
test("actual MCP discovery and calls expose matching deletion schemas and all management tools", async () => {
  const db = {
    rpc: async (_name: string, input: { operation: string; args: object }) => ({
      data: {
        operation: input.operation,
        ...input.args,
        results: [{ job: input.args }],
      },
      error: null,
    }),
  } as unknown as SupabaseClient;
  const server = createTrackerServer({ db });
  const client = new Client({ name: "regression-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const list = await client.listTools();
    const names = list.tools.map((t) => t.name);
    for (const name of [
      "list_jobs",
      "get_job",
      "get_job_stats",
      "find_existing_job",
      "add_job_found",
      "bulk_add_jobs",
      "update_job",
      "remove_job",
      "bulk_remove_jobs",
      "restore_job",
      "purge_job",
      "preview_cleanup",
      "execute_cleanup",
      "list_activity",
      "submit_verification",
    ])
      assert(names.includes(name));
    assert(!names.includes("grant_client"));
    const schema = JSON.stringify(
      list.tools.find((t) => t.name === "update_job")!.inputSchema,
    );
    assert(schema.includes("jobs_deleted"));
    assert(schema.includes("dismissed"));
    const result = await client.callTool({
      name: "update_job",
      arguments: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "jobs_deleted",
      },
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      (result.structuredContent as { status: string }).status,
      "jobs_deleted",
    );
  } finally {
    await client.close();
    await server.close();
  }
});
