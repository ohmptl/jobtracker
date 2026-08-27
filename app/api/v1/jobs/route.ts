import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/api/agent-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { bulkJobsSchema, jobStatusSchema } from "@/lib/validation/jobs"

export async function GET(request: Request) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const statusResult = jobStatusSchema.safeParse(searchParams.get("status") || "researched")
  if (!statusResult.success) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 })
  }

  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100)
  const cursor = searchParams.get("cursor")
  const admin = createAdminClient()
  let query = admin
    .from("jobs")
    .select(
      "id,company,position,status,url,location,salary,notes,job_description,source,source_id,match_score,match_reasons,discovered_at,expires_at,applied_date,created_at,updated_at",
    )
    .eq("user_id", auth.identity.userId)
    .eq("status", statusResult.data)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (cursor) query = query.lt("created_at", cursor)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const nextCursor = data.length === limit ? data.at(-1)?.created_at : null
  return NextResponse.json({ data, next_cursor: nextCursor })
}

export async function POST(request: Request) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = bulkJobsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const uniqueJobs = [...new Map(parsed.data.jobs.map((job) => [job.url, job])).values()]
  const urls = uniqueJobs.map((job) => job.url)
  const admin = createAdminClient()
  const { data: existing, error: lookupError } = await admin
    .from("jobs")
    .select("url")
    .eq("user_id", auth.identity.userId)
    .in("url", urls)

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const existingUrls = new Set((existing || []).map((job) => job.url))
  const now = new Date().toISOString()
  const newJobs = uniqueJobs
    .filter((job) => !existingUrls.has(job.url))
    .map((job) => ({
      ...job,
      user_id: auth.identity.userId,
      status: "researched",
      discovered_at: now,
    }))

  if (newJobs.length === 0) {
    return NextResponse.json({ data: [], inserted: 0, skipped_duplicates: uniqueJobs.length }, { status: 200 })
  }

  const { data, error } = await admin.from("jobs").insert(newJobs).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { data, inserted: data.length, skipped_duplicates: uniqueJobs.length - data.length },
    { status: 201 },
  )
}
