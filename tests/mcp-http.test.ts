import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serveMcp } from "../lib/tracker/mcp";

const endpoint = new URL("https://tracker.example/mcp");
const db = {
  rpc: async (_name: string, { operation }: { operation: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: { operation, jobs: [], total: 0 }, error: null };
  },
} as unknown as SupabaseClient;

test("stateless MCP declines standalone SSE and session deletion instead of opening an empty stream", async () => {
  for (const method of ["GET", "DELETE"]) {
    const response = await serveMcp(new Request(endpoint, {
      method,
      headers: { Accept: "text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
    }), { db });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "POST");
    assert.notEqual(response.headers.get("content-type"), "text/event-stream");
  }
});

test("SDK initializes, notifies, discovers and makes parallel calls across fresh stateless transports", async () => {
  const exchanges: { method: string; status: number; session: string | null }[] = [];
  const client = new Client({ name: "stateless-regression", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const response = await serveMcp(request, { db });
      exchanges.push({ method: request.method, status: response.status, session: response.headers.get("mcp-session-id") });
      return response;
    },
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    for (const name of ["get_job_stats", "list_jobs", "get_settings", "list_activity", "find_existing_job"])
      assert(tools.some((tool) => tool.name === name));
    const results = await Promise.all(["get_job_stats", "get_settings"].map((name) => client.callTool({ name, arguments: {} })));
    assert(results.every((result) => !result.isError));
    assert(exchanges.some((entry) => entry.status === 202));
    assert(exchanges.every((entry) => entry.session === null));
    assert(exchanges.filter((entry) => entry.method === "POST").every((entry) => [200, 202].includes(entry.status)));
  } finally {
    await client.close();
  }
});
