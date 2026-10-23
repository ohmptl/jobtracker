"use client";
import { useState } from "react";
import { tracker } from "@/lib/tracker/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
type Settings = {
  policy: {
    version: number;
    ai_deletion: boolean;
    automatic_expiration: boolean;
    tombstone_days: number;
    technical_domains: string[];
    internship_standard: string;
  };
  companies: {
    id: string;
    name: string;
    aliases: string[];
    protected: boolean;
  }[];
  clients: {
    client_id: string;
    label: string;
    permissions: string[];
    revoked_at: string | null;
  }[];
};
export function TrackerSettings({
  initialSettings,
}: {
  initialSettings: Settings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function save(operation: Parameters<typeof tracker>[0], args: object) {
    setPending(true);
    setMessage("");
    try {
      await tracker(operation, args);
      setSettings(await tracker("get_settings"));
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className="rounded-xl border p-4">
          {message}
        </p>
      )}
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">
          Cleanup policy · v{settings.policy.version}
        </h2>
        <p className="text-sm text-muted-foreground">
          AI cleanup only affects Jobs Found and Snoozed. Applied, To Apply,
          Interviewing, Offered, Accepted and Rejected are protected.
          Citizenship, ITAR and clearance requirements are review signals, never
          automatic disqualifiers.
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void save("save_policy", {
              ai_deletion: form.has("ai_deletion"),
              automatic_expiration: form.has("automatic_expiration"),
              tombstone_days: Number(form.get("tombstone_days")),
              technical_domains: String(form.get("technical_domains"))
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              internship_standard: form.get("internship_standard"),
            });
          }}
        >
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="ai_deletion"
              defaultChecked={settings.policy.ai_deletion}
            />
            Allow authorized AI deletion
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="automatic_expiration"
              defaultChecked={settings.policy.automatic_expiration}
            />
            Automatically remove confidently verified closed roles
          </label>
          <label>
            Deleted recovery
            <Input value="Exactly 30 days" readOnly />
          </label>
          <label>
            Tombstone suppression (30–180 days)
            <Input
              type="number"
              min={30}
              max={180}
              name="tombstone_days"
              defaultValue={settings.policy.tombstone_days}
            />
          </label>
          <label>
            High-value technical domains (comma separated)
            <Textarea
              name="technical_domains"
              defaultValue={settings.policy.technical_domains.join(", ")}
            />
          </label>
          <label>
            Internship retention standards
            <Textarea
              name="internship_standard"
              defaultValue={settings.policy.internship_standard}
            />
          </label>
          <Button disabled={pending}>Save policy</Button>
        </form>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Protected companies & aliases</h2>
        <p className="text-sm">
          Open roles at these employers survive automatic internship cleanup.
          Explicit high-confidence employer closure may permit removal. Original
          employer names remain on jobs.
        </p>
        {settings.companies.map((c) => (
          <details className="rounded-lg border p-3" key={c.id}>
            <summary className="min-h-11 cursor-pointer py-2">
              {c.name}
              {c.protected ? " · Protected" : " · Alias only"}
            </summary>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save("save_company", {
                  name: c.name,
                  aliases: String(f.get("aliases"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  protected: f.has("protected"),
                });
              }}
            >
              <label>
                Aliases
                <Input name="aliases" defaultValue={c.aliases.join(", ")} />
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="protected"
                  defaultChecked={c.protected}
                />
                Protect company
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending}>Save company</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => save("delete_company", { id: c.id })}
                >
                  Remove from registry
                </Button>
              </div>
            </form>
          </details>
        ))}
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("save_company", {
              name: f.get("name"),
              aliases: String(f.get("aliases"))
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              protected: true,
            });
          }}
        >
          <label>
            Company name
            <Input name="name" required />
          </label>
          <label>
            Aliases (comma separated)
            <Input name="aliases" />
          </label>
          <Button disabled={pending}>Add protected company</Button>
        </form>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Connected client permissions</h2>
        <p className="text-sm text-muted-foreground">
          Labels are owner-selected, not verified product identities. The client
          ID is immutable. Revocation immediately blocks new requests and
          attempts to revoke the provider grant and refresh tokens.
        </p>
        {settings.clients.map((c) => (
          <details className="rounded-lg border p-3" key={c.client_id}>
            <summary className="min-h-11 break-all py-2">
              {c.label}
              {c.revoked_at ? " · Revoked" : ""}
            </summary>
            <p className="break-all text-xs">{c.client_id}</p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save("grant_client", {
                  client_id: c.client_id,
                  label: f.get("label"),
                  permissions: ["read", ...f.getAll("permissions")],
                });
              }}
            >
              <label>
                Friendly label
                <Input name="label" defaultValue={c.label} />
              </label>
              {[
                "write",
                "remove",
                "restore",
                "history",
                "protect",
                "purge",
              ].map((p) => (
                <label className="flex min-h-11 items-center gap-3" key={p}>
                  <input
                    name="permissions"
                    type="checkbox"
                    value={p}
                    defaultChecked={c.permissions.includes(p)}
                  />
                  {p}
                </label>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending}>Save / re-enable permissions</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || !!c.revoked_at}
                  onClick={async () => {
                    setPending(true);
                    try {
                      const r = await fetch("/api/oauth/revoke", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ client_id: c.client_id }),
                      });
                      const data = await r.json();
                      if (!r.ok)
                        throw new Error(data.error || "Revocation failed");
                      setSettings(await tracker("get_settings"));
                      setMessage(
                        data.provider_revoked
                          ? "Client and provider grant revoked."
                          : "Client blocked immediately. Provider revocation failed; revoke its grant in Supabase too.",
                      );
                    } catch (e) {
                      setMessage(String(e));
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Revoke access
                </Button>
              </div>
            </form>
          </details>
        ))}
        {!settings.clients.length && <p>No connected client grants yet.</p>}
      </section>
      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-xl font-semibold">Activity privacy</h2>
        <p>
          Job snapshots in the Feed expire after 180 days. Deleted job records
          expire after 30 days; compact suppression identifiers expire
          separately.
        </p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                "Clear all existing activity history? This cannot be undone.",
              )
            )
              void save("clear_history", { before: new Date().toISOString() });
          }}
        >
          Clear existing activity history
        </Button>
      </section>
    </div>
  );
}
