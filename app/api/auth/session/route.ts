import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Endpoint for browser extension to check if user is logged in
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ authenticated: false }, { status: 200 })
    }

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }
}
