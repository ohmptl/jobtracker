import { createHash } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

export type AgentIdentity = {
  keyId: string
  userId: string
}

export type AgentAuthResult =
  | { ok: true; identity: AgentIdentity }
  | { ok: false; status: number; error: string }

export function hashAgentKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

export async function authenticateAgent(request: Request): Promise<AgentAuthResult> {
  const authorization = request.headers.get("authorization")
  const key = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""

  if (!key.startsWith("jt_live_")) {
    return { ok: false, status: 401, error: "A valid bearer API key is required" }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("agent_api_keys")
    .select("id,user_id,expires_at,revoked_at")
    .eq("key_hash", hashAgentKey(key))
    .maybeSingle()

  if (error || !data || data.revoked_at || (data.expires_at && new Date(data.expires_at) <= new Date())) {
    return { ok: false, status: 401, error: "API key is invalid, expired, or revoked" }
  }

  await admin.from("agent_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)

  return { ok: true, identity: { keyId: data.id, userId: data.user_id } }
}
