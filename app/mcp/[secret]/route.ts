import { timingSafeEqual } from "node:crypto"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const jobStatus = z.enum([
  "jobs_found",
  "to_apply",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "accepted",
  "dismissed",
])

const jobSchema = z.object({
  id: z.string(),
  company: z.string(),
  position: z.string(),
  status: jobStatus,
  url: z.string().nullable(),
  location: z.string().nullable(),
  salary: z.string().nullable(),
  notes: z.string().nullable(),
  applied_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
})

type Job = z.infer<typeof jobSchema>

function getOwnerId() {
  const userId = process.env.MCP_USER_ID
  if (!userId || !z.string().uuid().safeParse(userId).success) {
    throw new Error("MCP_USER_ID is not configured with your Supabase user ID")
  }
  return userId
}

function createJobTrackerServer() {
  const server = new McpServer(
    { name: "personal-job-tracker", version: "1.0.0" },
    {
      instructions:
        "This is a single-user job tracker. Jobs Found are AI-discovered roles awaiting review. List jobs before adding roles to avoid duplicates. Only move or edit jobs when the user or scheduled workflow requests it.",
    },
  )

  server.registerTool(
    "list_jobs",
    {
      title: "List jobs",
      description:
        "List jobs from Jobs Found, To Apply, Applied, Rejected, or the complete active tracker. The Applied list includes applied, interviewing, offered, and accepted roles.",
      inputSchema: {
        list: z.enum(["jobs_found", "to_apply", "applied", "rejected", "all"]).default("all"),
      },
      outputSchema: { jobs: z.array(jobSchema), count: z.number().int() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ list }) => {
      const admin = createAdminClient()
      let query = admin
        .from("jobs")
        .select("id,company,position,status,url,location,salary,notes,applied_date,created_at,updated_at")
        .eq("user_id", getOwnerId())
        .order("created_at", { ascending: false })

      if (list === "applied") {
        query = query.in("status", ["applied", "interviewing", "offered", "accepted"])
      } else if (list === "all") {
        query = query.neq("status", "dismissed")
      } else {
        query = query.eq("status", list)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      const jobs = (data || []) as Job[]
      const result = { jobs, count: jobs.length }
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result) }],
      }
    },
  )

  server.registerTool(
    "add_job_found",
    {
      title: "Add a job to Jobs Found",
      description:
        "Add one AI-discovered role to Jobs Found for later review. List existing jobs first and provide the canonical posting URL whenever available.",
      inputSchema: {
        company: z.string().trim().min(1).max(200),
        position: z.string().trim().min(1).max(300),
        url: z.string().url().max(2000).nullable().optional(),
        location: z.string().trim().max(300).nullable().optional(),
        salary: z.string().trim().max(200).nullable().optional(),
        notes: z.string().trim().max(5000).nullable().optional(),
      },
      outputSchema: { job: jobSchema, duplicate: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const admin = createAdminClient()
      const userId = getOwnerId()

      if (input.url) {
        const { data: existing, error: lookupError } = await admin
          .from("jobs")
          .select("id,company,position,status,url,location,salary,notes,applied_date,created_at,updated_at")
          .eq("user_id", userId)
          .eq("url", input.url)
          .maybeSingle()
        if (lookupError) throw new Error(lookupError.message)
        if (existing) {
          const result = { job: existing as Job, duplicate: true }
          return { structuredContent: result, content: [{ type: "text", text: "That job URL already exists in the tracker." }] }
        }
      }

      const { data, error } = await admin
        .from("jobs")
        .insert({
          user_id: userId,
          company: input.company,
          position: input.position,
          status: "jobs_found",
          url: input.url || null,
          location: input.location || null,
          salary: input.salary || null,
          notes: input.notes || null,
        })
        .select("id,company,position,status,url,location,salary,notes,applied_date,created_at,updated_at")
        .single()

      if (error) throw new Error(error.message)
      const result = { job: data as Job, duplicate: false }
      return { structuredContent: result, content: [{ type: "text", text: `Added ${data.position} at ${data.company} to Jobs Found.` }] }
    },
  )

  server.registerTool(
    "update_job",
    {
      title: "Update a job",
      description:
        "Update fields or status for an existing job. Use the stable job ID returned by list_jobs. Moving a role to To Apply uses status to_apply.",
      inputSchema: {
        id: z.string().uuid(),
        company: z.string().trim().min(1).max(200).optional(),
        position: z.string().trim().min(1).max(300).optional(),
        status: jobStatus.optional(),
        url: z.string().url().max(2000).nullable().optional(),
        location: z.string().trim().max(300).nullable().optional(),
        salary: z.string().trim().max(200).nullable().optional(),
        notes: z.string().trim().max(5000).nullable().optional(),
        applied_date: z.string().datetime().nullable().optional(),
      },
      outputSchema: { job: jobSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, ...fields }) => {
      const updates = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
      if (Object.keys(updates).length === 0) throw new Error("Provide at least one field to update")
      if (updates.status === "applied" && updates.applied_date === undefined) {
        updates.applied_date = new Date().toISOString()
      }
      updates.updated_at = new Date().toISOString()

      const admin = createAdminClient()
      const { data, error } = await admin
        .from("jobs")
        .update(updates)
        .eq("id", id)
        .eq("user_id", getOwnerId())
        .select("id,company,position,status,url,location,salary,notes,applied_date,created_at,updated_at")
        .maybeSingle()

      if (error) throw new Error(error.message)
      if (!data) throw new Error("Job not found")
      const result = { job: data as Job }
      return { structuredContent: result, content: [{ type: "text", text: `Updated ${data.position} at ${data.company}.` }] }
    },
  )

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

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, mcp-protocol-version, Last-Event-ID",
      "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
    },
  })
}
