import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
import { TrackerSettings } from "@/components/tracker-settings";
export default async function SettingsPage() {
  const settings = await execute(
    { db: await createClient() },
    "get_settings",
    {},
  );
  const oauthUrl = process.env.APP_URL
    ? new URL("/mcp", process.env.APP_URL).toString()
    : null;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Settings & connections</h1>
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">MCP connection</h2>
        <p>
          OAuth endpoint:{" "}
          <code className="break-all">{oauthUrl || "Configure APP_URL"}</code>
        </p>
        <p>
          {process.env.MCP_OAUTH_ENABLED === "true"
            ? "OAuth resource server enabled; client connection must still be verified."
            : "OAuth is awaiting provider configuration and verification. The existing connection remains available during migration."}
        </p>
        <p className="text-sm text-muted-foreground">
          Connect using OAuth in your AI client and sign in with your tracker
          account. Review the client ID, return address and permissions at
          consent. Revoke clients below. Legacy private URLs are no longer
          displayed; existing connections continue until the configured cutover
          deadline.
        </p>
      </section>
      <TrackerSettings initialSettings={settings} />
    </div>
  );
}
