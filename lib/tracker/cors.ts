export function extensionCors(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = (process.env.EXTENSION_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ownOrigin = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (origin && origin !== ownOrigin && !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin || ownOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}
