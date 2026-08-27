import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { hashAgentKey } from "@/lib/api/agent-auth"
import { createClient } from "@/lib/supabase/server"

const createKeySchema = z.object({ name: z.string().trim().min(1).max(100) })

async function authenticatedClient() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : data.user }
}

export async function GET() {
  const { supabase, user } = await authenticatedClient()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("agent_api_keys")
    .select("id,name,key_prefix,last_used_at,expires_at,revoked_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const { supabase, user } = await authenticatedClient()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = createKeySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "A key name is required" }, { status: 400 })

  const key = `jt_live_${randomBytes(32).toString("base64url")}`
  const { data, error } = await supabase
    .from("agent_api_keys")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      key_prefix: key.slice(0, 16),
      key_hash: hashAgentKey(key),
    })
    .select("id,name,key_prefix,created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ...data, key } }, { status: 201 })
}
