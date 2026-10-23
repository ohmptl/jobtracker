"use client";
import { useState } from "react";
import { tracker } from "@/lib/tracker/browser";
import { Button } from "@/components/ui/button";
type Preview = {
  preview_id: string;
  expires_at: string;
  expected_count: number;
  policy_version: number;
  candidates: {
    id: string;
    company: string;
    position: string;
    location: string;
    reason: string;
    confidence: string;
    protected: boolean;
  }[];
};
export function CleanupReview() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-5">
      <p>
        Preview eligible low-priority internships with explicit evaluations and
        confidently verified closures. Application stages and protected open
        roles are excluded. Removal is recoverable for 30 days.
      </p>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            setPreview(await tracker("preview_cleanup"));
            setMessage("");
          } catch (e) {
            setMessage(String(e));
          } finally {
            setPending(false);
          }
        }}
      >
        Preview cleanup
      </Button>
      {message && <p role="status">{message}</p>}
      {preview && (
        <>
          <p>
            {preview.expected_count} candidates · policy v
            {preview.policy_version} · expires{" "}
            {new Date(preview.expires_at).toLocaleTimeString()}
          </p>
          {preview.candidates.map((c) => (
            <article className="space-y-2 rounded-xl border p-4" key={c.id}>
              <h2 className="font-semibold">
                {c.company} — {c.position}
              </h2>
              <p>{c.location}</p>
              <p>{c.reason}</p>
              <p className="text-sm text-muted-foreground">
                {c.confidence}
                {c.protected ? " · Protected company; verified closure" : ""}
              </p>
            </article>
          ))}
          <Button
            disabled={pending || !preview.expected_count}
            onClick={async () => {
              setPending(true);
              try {
                const result = await tracker("execute_cleanup", {
                  preview_id: preview.preview_id,
                });
                setMessage(`Moved ${result.removed} jobs to Deleted.`);
                setPreview(null);
              } catch (e) {
                setMessage(String(e));
              } finally {
                setPending(false);
              }
            }}
          >
            Move previewed jobs to Deleted
          </Button>
        </>
      )}
    </div>
  );
}
