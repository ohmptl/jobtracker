import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: id } = await searchParams;
  if (!id)
    return (
      <main className="mx-auto max-w-lg p-6">
        Missing authorization request.
      </main>
    );
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    redirect(
      `/auth/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`)}`,
    );
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !data)
    return (
      <main className="mx-auto max-w-lg p-6">
        This authorization request is invalid or expired. Start the connection
        again.
      </main>
    );
  if (!("authorization_id" in data)) redirect(data.redirect_url);
  return (
    <main className="mx-auto my-8 max-w-lg space-y-5 rounded-xl border bg-card p-6">
      <h1 className="text-2xl font-semibold">Connect {data.client.name}</h1>
      <p>
        Client ID: <code className="break-all">{data.client.id}</code>
      </p>
      <p className="break-all">Return address: {data.redirect_uri}</p>
      <p>
        Identity scopes: {data.scope || "None"}. Job permissions below are
        enforced separately.
      </p>
      <form action="/api/oauth/decision" method="POST" className="space-y-4">
        <input type="hidden" name="authorization_id" value={id} />
        <p>
          Allow this client to read your jobs. Select any additional
          permissions:
        </p>
        {["write", "remove", "restore", "history"].map((permission) => (
          <label key={permission} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="permissions"
              value={permission}
              defaultChecked
            />
            {permission === "remove"
              ? "Remove eligible jobs autonomously (30-day recovery)"
              : permission}
          </label>
        ))}
        <p className="text-sm text-muted-foreground">
          Protected open roles and application stages remain guarded. You can
          revoke access in Settings. The displayed client name is supplied by
          its registration; verify the client ID and return address.
        </p>
        <div className="flex gap-3">
          <button
            className="min-h-11 rounded-lg bg-primary px-5 text-primary-foreground"
            name="decision"
            value="approve"
          >
            Allow connection
          </button>
          <button
            className="min-h-11 rounded-lg border px-5"
            name="decision"
            value="deny"
          >
            Deny
          </button>
        </div>
      </form>
    </main>
  );
}
