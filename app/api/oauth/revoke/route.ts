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
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { client_id } = await request.json();
  await execute({ db }, "revoke_client", { client_id });
  const { error } = await db.auth.oauth.revokeGrant({ clientId: client_id });
  return Response.json({ ok: true, provider_revoked: !error });
}
