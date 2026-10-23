import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
import { sameOrigin } from "@/lib/tracker/security";

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response("Origin not allowed", { status: 403 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const form = await request.formData();
  const id = String(form.get("authorization_id") || "");
  const { data: details, error } =
    await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !details || !("authorization_id" in details))
    return new Response("Invalid authorization request", { status: 400 });
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
      return new Response("Authorization failed; retry the connection", {
        status: 400,
      });
    return Response.redirect(data.redirect_url, 303);
  }
  const { data, error: denyError } = await db.auth.oauth.denyAuthorization(id, {
    skipBrowserRedirect: true,
  });
  if (denyError || !data)
    return new Response("Unable to deny authorization", { status: 400 });
  return Response.redirect(data.redirect_url, 303);
}
