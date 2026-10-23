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
    "Edit job metadata and priority without automatic cleanup. AI stage moves are limited to Jobs Found/Snoozed, removal, and restoration. Application dates/stages are owner-managed. dismissed aliases jobs_deleted and uses the same removal guard; supply a reason.",
  remove_job:
    "Directly move Jobs Found/Snoozed to Deleted for 30 days, regardless of employer or priority. Applications require confirmed closure recorded first with submit_verification. Supply a removal reason. No cleanup preview is required.",
  bulk_remove_jobs:
    "Recoverably remove at most 100 explicit IDs; returns every individual outcome and batch ID.",
  restore_job: "Restore a Deleted job to its exact previous status before the 30-day recovery deadline, preserving application history.",
  purge_job:
    "Permanently purge a Deleted job only with separate purge permission and confirmation PURGE:<ID>. Irreversible.",
  submit_verification:
    "Record explicit employer/ATS posting evidence with source URL and high confidence to confirm closure. Blocks, timeouts and transient errors remain uncertain. This never removes a job; call remove_job or bulk_remove_jobs afterward, including for a confirmed-closed application.",
  list_activity:
    "Page through persisted audit events by action, actor and search. Actor labels derive from authenticated client grants.",
};
const humanOnly = new Set<Operation>([
  "grant_client",
  "revoke_client",
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
  "get_ingestion_runs",
]);
export function createTrackerServer(ctx: TrackerContext) {
  const server = new McpServer(
    { name: "personal-job-tracker", version: INTEGRATION_VERSION },
    {
      instructions:
        "Use find_existing_job before ingestion and follow pagination cursors. You determine career value and cleanup choices from the user's instructions; the backend does not score employers or roles. Direct authorized removals are recoverable for 30 days. Application-stage removal requires previously submitted explicit closure evidence; never infer closure from age, a block or timeout. Actor names in job input are not identity evidence.",
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
          idempotentHint: operation !== "add_job_found",
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
