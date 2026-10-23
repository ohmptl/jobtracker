export function appOrigin() {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("APP_URL must be configured");
  const url = new URL(configured);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("APP_URL must use HTTPS in production");
  return url.origin;
}
export function validateTransport(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = (process.env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .filter(Boolean);
  if (
    origin &&
    origin !==
      (process.env.APP_URL
        ? new URL(process.env.APP_URL).origin
        : new URL(request.url).origin) &&
    !allowed.includes(origin)
  )
    return new Response("Origin not allowed", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 262144)
    return new Response("Request too large", { status: 413 });
  return null;
}
export async function boundedRequest(request: Request, maxBytes = 262144) {
  if (request.method !== "POST" || !request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    chunks.push(value);
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === appOrigin();
}
export function validateClaims(
  claims: Record<string, unknown>,
  resource: string,
  issuer: string,
  now = Date.now() / 1000,
) {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    claims.iss === issuer &&
    audience.includes(resource) &&
    typeof claims.exp === "number" &&
    claims.exp > now &&
    (claims.nbf === undefined ||
      (typeof claims.nbf === "number" && claims.nbf <= now)) &&
    typeof claims.sub === "string" &&
    typeof claims.client_id === "string" &&
    claims.client_id.length > 0 &&
    claims.role === "authenticated"
  );
}
