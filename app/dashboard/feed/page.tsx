import { ActivityFeed } from "@/components/activity-feed";
import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
export default async function FeedPage() {
  const page = await execute({ db: await createClient() }, "list_activity", {});
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Feed</h1>
      <p className="text-muted-foreground">
        Changes by you, connected clients, and scheduled maintenance. Batches
        may continue on later pages.
      </p>
      <ActivityFeed initialPage={page} />
    </div>
  );
}
