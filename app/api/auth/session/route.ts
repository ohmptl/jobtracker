import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin")
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  })
}

// Endpoint for browser extension to check if user is logged in
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ authenticated: false }, { status: 200, headers: corsHeaders(request) })
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
        },
      },
      { status: 200, headers: corsHeaders(request) },
    )
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 200, headers: corsHeaders(request) })
  }
}
