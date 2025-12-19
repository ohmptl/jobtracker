import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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

    const body = await request.json()
    const { company, position, url, location, salary, notes } = body

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
        location: location || null,
        salary: salary || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders(request) })
    }

    return NextResponse.json({ success: true, data }, { status: 201, headers: corsHeaders(request) })
  } catch (error) {
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
