import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/api/agent-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { jobPatchSchema } from "@/lib/validation/jobs"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = jobPatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const admin = createAdminClient()
  const updates = { ...parsed.data, updated_at: new Date().toISOString() }
  const { data, error } = await admin
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.identity.userId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Job not found" }, { status: 404 })

  return NextResponse.json({ data })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { error, count } = await admin
    .from("jobs")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.identity.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: "Job not found" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
