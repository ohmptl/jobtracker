import { NextResponse } from "next/server"

export function GET(request: Request) {
  const origin = new URL(request.url).origin
  return NextResponse.json({
    name: "Job Tracker Agent API",
    version: "1.0.0",
    authentication: "Bearer jt_live_...",
    openapi: `${origin}/api/v1/openapi`,
    resources: {
      jobs: `${origin}/api/v1/jobs`,
      research_profile: `${origin}/api/v1/research-profile`,
    },
  })
}
