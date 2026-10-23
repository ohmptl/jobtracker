import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
import { sameOrigin } from "@/lib/tracker/security";
import { integrationRequest } from "@/lib/tracker/integration-diagnostics";

export async function POST(request: Request) {
  const finish = integrationRequest(request, "/api/oauth/decision");
  if (!sameOrigin(request))
    return finish(new Response("Origin not allowed", { status: 403 }), "consent", "origin_not_allowed");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return finish(new Response("Sign in first", { status: 401 }), "consent", "sign_in_required");
  const form = await request.formData();
  const id = String(form.get("authorization_id") || "");
  const { data: details, error } =
    await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !details || !("authorization_id" in details))
    return finish(new Response("Invalid authorization request", { status: 400 }), "consent", "invalid_authorization");
  const identity = { userId: user.id, clientId: details.client.id };
  if (form.get("decision") === "approve") {
    const permissions = [
      "read",
      ...form
        .getAll("permissions")
        .map(String)
        .filter((p) => ["write", "remove", "restore", "history"].includes(p)),
    ];
    // Treat client-supplied name as unverified; only the immutable signed client ID is identity.
    await execute({ db }, "grant_client", {
      client_id: details.client.id,
      label: "Unknown registered client",
      permissions,
    });
    const { data, error } = await db.auth.oauth.approveAuthorization(id, {
      skipBrowserRedirect: true,
    });
    if (error || !data)
      return finish(new Response("Authorization failed; retry the connection", {
        status: 400,
      }), "consent", "approval_failed", identity);
    return finish(Response.redirect(data.redirect_url, 303), "consent", "approved", identity);
  }
  const { data, error: denyError } = await db.auth.oauth.denyAuthorization(id, {
    skipBrowserRedirect: true,
  });
  if (denyError || !data)
    return finish(new Response("Unable to deny authorization", { status: 400 }), "consent", "denial_failed", identity);
  return finish(Response.redirect(data.redirect_url, 303), "consent", "denied", identity);
}
