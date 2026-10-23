import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
export default async function StatisticsPage() {
  const stats = await execute(
    { db: await createClient() },
    "get_job_stats",
    {},
  );
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Statistics</h1>
      <p className="text-muted-foreground">
        Counts cover the full tracker, including all pages.
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Object.entries({ ...stats, ...stats.statuses })
          .filter(([, v]) => typeof v === "number")
          .map(([key, value]) => (
            <div className="rounded-xl border bg-card p-5" key={key}>
              <p className="text-sm capitalize text-muted-foreground">
                {key.replace(/^jobs_/, "").replaceAll("_", " ")}
              </p>
              <p className="mt-3 text-3xl font-semibold">{String(value)}</p>
            </div>
          ))}
      </div>
      <h2 className="text-xl font-semibold">Recent activity</h2>
      <p className="text-sm text-muted-foreground">
        {stats.applications_submitted
          ? Math.round(
              (100 * ((stats.interviews || 0) + (stats.offers || 0))) /
                stats.applications_submitted,
            )
          : 0}
        % of submitted applications are currently at interview or offer stages.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Object.entries(stats.activity).map(([key, value]) => (
          <div className="rounded-xl border p-4" key={key}>
            {key}: {String(value)}
          </div>
        ))}
      </div>
      <h2 className="text-xl font-semibold">
        Activity by actor · last 30 days
      </h2>
      <ul className="space-y-2">
        {stats.actors.map(
          (actor: {
            client_id: string | null;
            actor_label: string;
            actions: number;
          }) => (
            <li
              className="break-words rounded-lg border p-4"
              key={`${actor.client_id}-${actor.actor_label}`}
            >
              {actor.actor_label}: {actor.actions} actions
            </li>
          ),
        )}
      </ul>
      <h2 className="text-xl font-semibold">
        Companies in your active tracker
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {stats.top_companies.map(
          (company: { company: string; opportunities: number }) => (
            <li key={company.company} className="rounded-lg border p-4">
              {company.company}: {company.opportunities}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
