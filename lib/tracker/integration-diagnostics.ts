export const INTEGRATION_VERSION = "3.1.0";

type Stage = "configuration" | "transport" | "authentication" | "grant" | "consent";
type Reason =
  | "oauth_disabled" | "invalid_transport" | "missing_bearer"
  | "invalid_token" | "invalid_claims" | "token_verification_failed"
  | "grant_lookup_failed" | "access_not_granted" | "transport_failed"
  | "origin_not_allowed" | "sign_in_required" | "invalid_authorization"
  | "approval_failed" | "denial_failed" | "approved" | "denied";

// Accept fixed diagnostic fields only. Never serialize a Request, Error,
// provider response, URL query, cookies, headers, token, or RPC arguments.
export function integrationRequest(request: Request, endpoint: "/mcp" | "/api/oauth/decision") {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  return (response: Response, stage: Stage, reason?: Reason, identity?: { userId: string; clientId: string }) => {
    console.info(JSON.stringify({
      event: "jobtracker.integration",
      timestamp: new Date().toISOString(),
      request_id: requestId,
      version: INTEGRATION_VERSION,
      deployment: process.env.VERCEL_URL,
      commit: process.env.VERCEL_GIT_COMMIT_SHA,
      endpoint,
      method: request.method,
      stage,
      status: response.status,
      reason,
      user_id: identity?.userId,
      client_id: identity?.clientId,
      duration_ms: Date.now() - start,
    }));
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    headers.set("X-Job-Tracker-Version", INTEGRATION_VERSION);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
