import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { extensionCors } from '@/lib/tracker/cors'

function corsHeaders(request: Request) {
  return extensionCors(request)||{}
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(request),
  })
}

// Endpoint for browser extension to check if user is logged in
export async function GET(request: Request) {
  if(!extensionCors(request)) return new NextResponse('Origin not allowed',{status:403})
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
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 200, headers: corsHeaders(request) })
  }
}
