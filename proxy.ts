import { updateSession } from "@/lib/supabase/proxy"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/mcp/")) return NextResponse.next()
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
