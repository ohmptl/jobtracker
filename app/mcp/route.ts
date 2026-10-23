import { createClient } from "@supabase/supabase-js";
import { serveMcp } from "@/lib/tracker/mcp";
import { integrationRequest } from "@/lib/tracker/integration-diagnostics";
import {
  appOrigin,
  validateClaims,
  validateTransport,
} from "@/lib/tracker/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const finish = integrationRequest(request, "/mcp");
  if (process.env.MCP_OAUTH_ENABLED !== "true")
    return finish(
      Response.json(
        { error: "OAuth is awaiting project configuration and resource audience validation" },
        { status: 503 },
      ),
      "configuration",
      "oauth_disabled",
    );
  const invalid = validateTransport(request);
  if (invalid) return finish(invalid, "transport", "invalid_transport");
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
  if (!match) return finish(challenge(), "authentication", "missing_bearer");
  const token = match[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let claims: Record<string, unknown>;
  try {
    const { data, error } = await db.auth.getClaims(token);
    if (error || !data)
      return finish(challenge(), "authentication", "invalid_token");
    if (!validateClaims(data.claims, resource, `${url}/auth/v1`))
      return finish(challenge(), "authentication", "invalid_claims");
    claims = data.claims;
  } catch {
    return finish(challenge(), "authentication", "token_verification_failed");
  }
  const identity = {
    userId: String(claims.sub),
    clientId: String(claims.client_id),
  };
  try {
    const { data: grant, error: grantError } = await db
      .from("tracker_clients")
      .select("permissions,revoked_at")
      .eq("user_id", identity.userId)
      .eq("client_id", identity.clientId)
      .maybeSingle();
    if (grantError)
      return finish(
        new Response("Unable to check client access", { status: 503 }),
        "grant", "grant_lookup_failed", identity,
      );
    if (!grant || grant.revoked_at || !grant.permissions.includes("read"))
      return finish(
        new Response("Client access revoked or not granted", { status: 403 }),
        "grant", "access_not_granted", identity,
      );
  } catch {
    return finish(
      new Response("Unable to check client access", { status: 503 }),
      "grant", "grant_lookup_failed", identity,
    );
  }
  try {
    return finish(
      await serveMcp(request, { db }), "transport", undefined, identity,
    );
  } catch {
    // A runtime/transport failure must not masquerade as an expired OAuth token.
    return finish(
      Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32603, message: "MCP request failed" } },
        { status: 500 },
      ),
      "transport", "transport_failed", identity,
    );
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
