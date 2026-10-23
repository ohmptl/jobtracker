import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { toolSchemas, type Operation } from "./schemas";
import { execute, type TrackerContext } from "./service";
import { z } from "zod";
import { boundedRequest } from "./security";
import { INTEGRATION_VERSION } from "./integration-diagnostics";

export const descriptions: Partial<Record<Operation, string>> = {
  list_jobs:
    "Page through jobs with server filters. Follow next_cursor while has_more. Includes Deleted when no status filter is given.",
  find_existing_job:
    "Check canonical URL, requisition, employer aliases, title/location and bounded purge tombstones before adding. Different requisitions remain distinct.",
  add_job_found:
    "Idempotently ingest a discovered role into Jobs Found. Supply the official URL and requisition ID when known.",
  bulk_add_jobs:
    "Ingest at most 100 jobs with per-record added, duplicate, skipped or rejected outcomes.",
  get_ingestion_runs:
    "Get up to 50 recent ingestion run summaries by source and before timestamp. Use the last successful completed_at as the next discovery lower bound.",
  update_job:
    "Update metadata. dismissed is a deprecated alias of jobs_deleted. AI clients cannot alter application history or active pipeline stages.",
  remove_job:
    "Move an eligible job to Deleted for exactly 30 days. Authorized autonomous removal is allowed; protected open roles and application stages are guarded.",
  bulk_remove_jobs:
    "Recoverably remove at most 100 explicit IDs; returns every individual outcome and batch ID.",
  restore_job: "Restore a Deleted job before its 30-day recovery deadline.",
  purge_job:
    "Permanently purge a Deleted job only with separate purge permission and confirmation PURGE:<ID>. Irreversible.",
  preview_cleanup:
    "Create a 15-minute versioned preview of at most 100 eligible jobs with evidence. Does not change jobs.",
  execute_cleanup:
    "Execute a preview atomically after validating actor, policy version, expiry and each job revision. Retry-safe.",
  submit_verification:
    "Record posting evidence. Blocks, timeouts, login requirements and transient errors remain uncertain. Closure requires explicit employer/ATS evidence and high confidence.",
  list_activity:
    "Page through persisted audit events by action, actor and search. Actor labels derive from authenticated client grants.",
};
const humanOnly = new Set<Operation>([
  "grant_client",
  "revoke_client",
  "save_company",
  "delete_company",
  "save_policy",
  "clear_history",
]);
const readOnly = new Set<Operation>([
  "list_jobs",
  "get_job",
  "get_job_stats",
  "find_existing_job",
  "jobs_needing_verification",
  "list_activity",
  "get_settings",
  "preview_cleanup",
  "get_ingestion_runs",
]);
export function createTrackerServer(ctx: TrackerContext) {
  const server = new McpServer(
    { name: "personal-job-tracker", version: INTEGRATION_VERSION },
    {
      instructions:
        "Use find_existing_job before ingestion. Listings are paginated. Authorized cleanup is recoverable for 30 days. Preserve strategic employers, specialized hardware roles and all application-stage records. Never infer closed from a block or timeout. Actor names in job input are not identity evidence.",
    },
  );
  for (const operation of Object.keys(toolSchemas) as Operation[]) {
    if (humanOnly.has(operation)) continue;
    server.registerTool(
      operation,
      {
        description: descriptions[operation] || operation.replaceAll("_", " "),
        inputSchema: toolSchemas[operation],
        outputSchema: z.object({}).catchall(z.unknown()),
        annotations: {
          readOnlyHint: readOnly.has(operation),
          destructiveHint: operation === "purge_job",
          idempotentHint: !["preview_cleanup", "add_job_found"].includes(
            operation,
          ),
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await execute(ctx, operation, args);
          return {
            structuredContent: result,
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text:
                  error instanceof Error ? error.message : "Operation failed",
              },
            ],
          };
        }
      },
    );
  }
  return server;
}
export async function serveMcp(request: Request, ctx: TrackerContext) {
  // This server has no persistent sessions or server-to-client messages. A GET
  // stream would be closed as soon as this serverless request finishes. Decline
  // it explicitly so clients do not mistake an empty SSE stream for a session.
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    request = await boundedRequest(request);
  } catch {
    return new Response("Request too large", { status: 413 });
  }
  const server = createTrackerServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    // JSON responses are fully materialized by the stateless transport.
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
