import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/api/agent-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { researchProfileSchema } from "@/lib/validation/jobs"

export async function GET(request: Request) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("research_profiles")
    .select(
      "role_keywords,locations,remote_preference,employment_types,minimum_salary,excluded_companies,notes,updated_at",
    )
    .eq("user_id", auth.identity.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PUT(request: Request) {
  const auth = await authenticateAgent(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const parsed = researchProfileSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("research_profiles")
    .upsert(
      { ...parsed.data, user_id: auth.identity.userId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
