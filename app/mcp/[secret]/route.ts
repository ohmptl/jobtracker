import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serveMcp } from "@/lib/tracker/mcp";
import { validateTransport } from "@/lib/tracker/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const expected = process.env.MCP_SECRET;
  const { secret } = await params;
  const deadline = process.env.MCP_LEGACY_DISABLE_AFTER;
  if (
    process.env.MCP_LEGACY_ENABLED === "false" ||
    (deadline && Date.now() >= Date.parse(deadline))
  )
    return new Response("Legacy connection retired", { status: 410 });
  const a = Buffer.from(secret),
    b = Buffer.from(expected || "");
  if (
    !expected ||
    expected.length < 32 ||
    a.length !== b.length ||
    !timingSafeEqual(a, b)
  )
    return new Response("Not found", { status: 404 });
  const invalid = validateTransport(request);
  if (invalid) return invalid;
  const owner = z.uuid().safeParse(process.env.MCP_USER_ID);
  if (!owner.success)
    return Response.json(
      { error: "Legacy owner not configured" },
      { status: 503 },
    );
  try {
    return await serveMcp(request, {
      db: createAdminClient(),
      legacyOwner: owner.data,
    });
  } catch {
    return Response.json({ error: "MCP request failed" }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export { OPTIONS } from "../route";
