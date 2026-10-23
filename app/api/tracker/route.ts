import { createClient } from "@/lib/supabase/server";
import { execute } from "@/lib/tracker/service";
import { toolSchemas, type Operation } from "@/lib/tracker/schemas";
import { sameOrigin,boundedRequest } from "@/lib/tracker/security";

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 262144)
    return Response.json({ error: "Request too large" }, { status: 413 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { operation, args } = await (await boundedRequest(request)).json();
    if (!Object.hasOwn(toolSchemas, operation))
      return Response.json({ error: "Unknown operation" }, { status: 400 });
    return Response.json(
      await execute({ db }, operation as Operation, args || {}),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}
