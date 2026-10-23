import { createClient } from "@supabase/supabase-js";
import { serveMcp } from "@/lib/tracker/mcp";
import {
  appOrigin,
  validateClaims,
  validateTransport,
} from "@/lib/tracker/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  if (process.env.MCP_OAUTH_ENABLED !== "true")
    return Response.json(
      {
        error:
          "OAuth is awaiting project configuration and resource audience validation",
      },
      { status: 503 },
    );
  const invalid = validateTransport(request);
  if (invalid) return invalid;
  const resource = `${appOrigin()}/mcp`;
  const challenge = () =>
    new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource/mcp"`,
        "Cache-Control": "no-store",
      },
    });
  const match = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("authorization") || "",
  );
  if (!match) return challenge();
  const token = match[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data, error } = await db.auth.getClaims(token);
    if (
      error ||
      !data ||
      !validateClaims(data.claims, resource, `${url}/auth/v1`)
    )
      return challenge();
    const { data: grant, error: grantError } = await db
      .from("tracker_clients")
      .select("permissions,revoked_at")
      .eq("user_id", data.claims.sub)
      .eq("client_id", String(data.claims.client_id))
      .maybeSingle();
    if (
      grantError ||
      !grant ||
      grant.revoked_at ||
      !grant.permissions.includes("read")
    )
      return new Response("Client access revoked or not granted", {
        status: 403,
      });
    return await serveMcp(request, { db });
  } catch {
    return challenge();
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export function OPTIONS(request: Request) {
  const invalid = validateTransport(request);
  if (invalid) return invalid;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":
        request.headers.get("origin") || appOrigin(),
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, mcp-protocol-version, mcp-session-id, Last-Event-ID",
      "Access-Control-Expose-Headers":
        "WWW-Authenticate, mcp-session-id, mcp-protocol-version",
    },
  });
}
