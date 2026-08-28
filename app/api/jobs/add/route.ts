import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { z } from "zod"

const jobSchema = z.object({
  company: z.string().trim().max(200).optional(),
  position: z.string().trim().max(300).optional(),
  url: z.string().url().max(2000).nullable().optional(),
  role_type: z.enum(["internship", "full_time"]).default("full_time"),
  salary: z.string().trim().max(200).nullable().optional(),
  posted_date: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders(request) })
    }

    const parsed = jobSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Invalid job data" }, { status: 400, headers: corsHeaders(request) })
    const { company, position, url, role_type, salary, posted_date, notes } = parsed.data

    // Use default values if company or position are missing
    const finalCompany = company || "Unknown Company"
    const finalPosition = position || "Unknown Position"

    // Insert job with to_apply status
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        company: finalCompany,
        position: finalPosition,
        status: "to_apply",
        url: url || null,
        role_type,
        salary: salary || null,
        posted_date: posted_date || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders(request) })
    }

    return NextResponse.json({ success: true, data }, { status: 201, headers: corsHeaders(request) })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders(request) })
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin")
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  }
}

// Allow OPTIONS for CORS preflight
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  })
}
