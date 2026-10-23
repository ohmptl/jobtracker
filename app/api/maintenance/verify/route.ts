import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPosting, type Verification } from "@/lib/tracker/verification";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  const hosts = (process.env.VERIFICATION_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!hosts.length)
    return Response.json(
      { error: "Configure exact authoritative employer/ATS hosts first" },
      { status: 503 },
    );
  const db = createAdminClient();
  const { data: jobs, error } = await db.rpc("tracker_verification_queue", {
    hosts,
  });
  if (error)
    return Response.json(
      { error: "Verification queue unavailable" },
      { status: 503 },
    );
  let checked = 0,
    uncertain = 0,
    conflicts = 0,
    failures = 0;
  for (const job of jobs) {
    let result: Verification;
    try {
      result = await fetchPosting(job.url, hosts);
    } catch {
      result = {
        source: job.url,
        availability: "uncertain",
        confidence: "low",
        method: "timeout",
        evidence:
          "The posting could not be safely checked; network, policy or request failure. No closure inferred.",
      };
    }
    const { data, error } = await db.rpc("tracker_record_verification", {
      job_id: job.id,
      expected_revision: job.revision,
      evidence: result,
    });
    if (error) failures++;
    else if (!data) conflicts++;
    else {
      checked++;
      if (result.availability === "uncertain") uncertain++;
    }
    // Sequential requests with spacing avoid hammering an individual ATS.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return Response.json(
    { checked, uncertain, conflicts, failures },
    { status: failures ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
