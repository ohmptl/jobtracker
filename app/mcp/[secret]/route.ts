import { timingSafeEqual } from "node:crypto"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const jobStatus = z.enum(["jobs_found", "jobs_snoozed", "jobs_deleted", "to_apply", "applied", "interviewing", "offered", "rejected", "accepted"])
const roleType = z.enum(["internship", "full_time"])
const jobSchema = z.object({
  id: z.string(), company: z.string(), position: z.string(), status: jobStatus,
  url: z.string().nullable(), role_type: roleType, salary: z.string().nullable(),
  posted_date: z.string().nullable(), added_date: z.string(), applied_date: z.string().nullable(),
  notes: z.string().nullable(), updated_at: z.string().nullable(),
})
type Job = z.infer<typeof jobSchema>
const JOB_FIELDS = "id,company,position,status,url,role_type,salary,posted_date,added_date,applied_date,notes,updated_at"

function getOwnerId() {
  const userId = process.env.MCP_USER_ID
  if (!userId || !z.string().uuid().safeParse(userId).success) throw new Error("MCP_USER_ID is not configured with your Supabase user ID")
  return userId
}

function createJobTrackerServer() {
  const server = new McpServer(
    { name: "personal-job-tracker", version: "2.0.0" },
    { instructions: "This is a single-user job tracker. AI Jobs Found contains New, Snoozed, and Deleted review lists. Always list all jobs before adding research results; Deleted jobs intentionally remain visible so they are never suggested again. Added Date is immutable. Only move or edit jobs when the user or scheduled workflow requests it." },
  )

  server.registerTool("list_jobs", {
    title: "List jobs",
    description: "List New AI jobs, Snoozed AI jobs, Deleted AI jobs, To Apply, Applied, Rejected, or every job. Use all before adding jobs so deleted roles are also deduplicated. Applied includes applied, interviewing, offered, and accepted.",
    inputSchema: { list: z.enum(["jobs_found", "jobs_snoozed", "jobs_deleted", "to_apply", "applied", "rejected", "all"]).default("all") },
    outputSchema: { jobs: z.array(jobSchema), count: z.number().int() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ list }) => {
    const admin = createAdminClient()
    let query = admin.from("jobs").select(JOB_FIELDS).eq("user_id", getOwnerId()).order("added_date", { ascending: false })
    if (list === "applied") query = query.in("status", ["applied", "interviewing", "offered", "accepted"])
    else if (list !== "all") query = query.eq("status", list)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const result = { jobs: (data || []) as Job[], count: data?.length || 0 }
    return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] }
  })

  server.registerTool("add_job_found", {
    title: "Add a job to AI Jobs Found",
    description: "Add one researched role to the New AI jobs feed. First list all jobs, including Deleted, and provide the canonical posting URL whenever available.",
    inputSchema: {
      company: z.string().trim().min(1).max(200), position: z.string().trim().min(1).max(300),
      role_type: roleType, url: z.string().url().max(2000).nullable().optional(),
      salary: z.string().trim().max(200).nullable().optional(), posted_date: z.iso.date().nullable().optional(),
      notes: z.string().trim().max(5000).nullable().optional(),
    },
    outputSchema: { job: jobSchema, duplicate: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const admin = createAdminClient()
    const userId = getOwnerId()
    if (input.url) {
      const { data: existing, error } = await admin.from("jobs").select(JOB_FIELDS).eq("user_id", userId).eq("url", input.url).maybeSingle()
      if (error) throw new Error(error.message)
      if (existing) {
        const result = { job: existing as Job, duplicate: true }
        return { structuredContent: result, content: [{ type: "text", text: "That job URL already exists in the tracker, including its current list and status." }] }
      }
    }
    const { data, error } = await admin.from("jobs").insert({
      user_id: userId, company: input.company, position: input.position, status: "jobs_found",
      url: input.url || null, role_type: input.role_type, salary: input.salary || null,
      posted_date: input.posted_date || null, notes: input.notes || null,
    }).select(JOB_FIELDS).single()
    if (error) throw new Error(error.message)
    const result = { job: data as Job, duplicate: false }
    return { structuredContent: result, content: [{ type: "text", text: `Added ${data.position} at ${data.company} to the New AI jobs feed.` }] }
  })

  server.registerTool("update_job", {
    title: "Update a job",
    description: "Update job fields or move it between lists with status. Use jobs_found, jobs_snoozed, or jobs_deleted for AI review lists; to_apply moves it to Applications. Added Date cannot be changed.",
    inputSchema: {
      id: z.string().uuid(), company: z.string().trim().min(1).max(200).optional(), position: z.string().trim().min(1).max(300).optional(),
      status: jobStatus.optional(), url: z.string().url().max(2000).nullable().optional(), role_type: roleType.optional(),
      salary: z.string().trim().max(200).nullable().optional(), posted_date: z.iso.date().nullable().optional(),
      applied_date: z.string().datetime().nullable().optional(), notes: z.string().trim().max(5000).nullable().optional(),
    },
    outputSchema: { job: jobSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ id, ...fields }) => {
    const updates: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
    if (!Object.keys(updates).length) throw new Error("Provide at least one field to update")
    if (updates.status === "applied" && updates.applied_date === undefined) updates.applied_date = new Date().toISOString()
    const admin = createAdminClient()
    const { data, error } = await admin.from("jobs").update(updates).eq("id", id).eq("user_id", getOwnerId()).select(JOB_FIELDS).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error("Job not found")
    const result = { job: data as Job }
    return { structuredContent: result, content: [{ type: "text", text: `Updated ${data.position} at ${data.company}.` }] }
  })
  return server
}

function secretMatches(candidate: string) {
  const expected = process.env.MCP_SECRET
  if (!expected || expected.length < 32 || candidate.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
}

async function handleMcp(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params
  if (!secretMatches(secret)) return new Response("Not found", { status: 404 })
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const server = createJobTrackerServer()
    await server.connect(transport)
    return await transport.handleRequest(request)
  } catch (error) {
    console.error("MCP request failed", error)
    return Response.json({ error: "MCP request failed" }, { status: 500 })
  }
}

export const GET = handleMcp
export const POST = handleMcp
export const DELETE = handleMcp
export function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, mcp-protocol-version, Last-Event-ID", "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version" } }) }
