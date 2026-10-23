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
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings & connections</h1>
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Connect an AI client</h2>
        <p>
          OAuth endpoint:{" "}
          <code className="break-all">{oauthUrl || "Configure APP_URL"}</code>
        </p>
        <p className="text-sm text-muted-foreground">
          Use this URL with OAuth and sign in to your tracker account. Tell your
          agent your job preferences in conversation. Manage connected clients
          below.
        </p>
      </section>
      <TrackerSettings initialSettings={settings} />
    </div>
  );
}
